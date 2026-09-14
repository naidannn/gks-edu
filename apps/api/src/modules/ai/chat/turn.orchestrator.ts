import { Injectable, Logger } from '@nestjs/common';
import { AccessLevel, ChatSessionStatus, Prisma, type ChatSession } from '../../../prisma/client.js';
import { AiConfigService } from '../ai-config.service.js';
import { RetrievalService } from '../knowledge/retrieval.service.js';
import { LlmService } from '../llm/llm.service.js';
import type { LlmMessage, LlmToolCall } from '../llm/llm.types.js';
import { BudgetService } from './budget.service.js';
import { ChatSessionService } from './chat-session.service.js';
import { GuardService, LONG_ANSWER_CHARS, NO_QUOTE_INSTRUCTION } from './guard.service.js';
import { buildSystemPrompt, type SourceRef } from './prompt.builder.js';
import { ToolRegistry, type ToolRun } from './tools/tool-registry.service.js';
import type { ChatCard, ToolContext } from './tools/tool.types.js';

/** What the SSE endpoint forwards to the browser (§5.6). */
export type TurnEvent =
  | { type: 'token'; text: string }
  | { type: 'tool'; name: string; status: 'running' | 'done'; label: string }
  | { type: 'card'; card: ChatCard }
  | { type: 'sources'; sources: PublicSource[] }
  | { type: 'done'; messageId: string; grounded: boolean; truncated: boolean }
  | { type: 'error'; code: string; message: string; fallback: 'messenger' | 'consultation' };

/** A citation as the widget shows it — never the chunk id, never the level. */
export interface PublicSource {
  ref: string;
  title: string;
  heading: string | null;
  /** A document from the knowledge base, or a live lookup in our own data. */
  kind: 'knowledge' | 'tool';
}

/**
 * Model calls allowed in one turn (2B-06: "≤4 давталт").
 *
 * The last one is made with no tools attached, so a turn always ends in prose.
 * Left able to call again on its final go, a model that has been looping asks
 * for one more lookup and the turn ends on a request nobody will answer — a
 * blank reply, which is the one failure mode worse than an incomplete one.
 */
const MAX_MODEL_CALLS = 4;

/**
 * One turn: question in, answer out (2B-04, AI-ASSISTANT.md §3).
 *
 * ```
 * kill switch + budget → history → retrieve → prompt → [model ⇄ tools] → guard → store
 * ```
 *
 * The order is the design. Retrieval happens before the model is called, so the
 * model never chooses what it is allowed to see; the guard runs after it has
 * spoken but before anything is stored or counted, so a leaked answer is never
 * a stored answer.
 *
 * Tools sit in the middle of that, and they are what keep the numbers honest:
 * the knowledge base holds advice and procedure, while every price, deadline and
 * exchange rate is read live from the tables the office already maintains
 * (§5.3). The model asks; it never remembers. What comes back also goes to the
 * browser as a **card** — the figures travel from the database to the screen
 * without passing through the model's hands, so the worst a bad answer can do is
 * describe a correct number badly (§5.4).
 *
 * The assistant is silent in three cases, and says so rather than improvising:
 * the switch is off, the day's budget is spent, or the session has been handed
 * to a human. The widget turns each of those into a route to a person.
 */
@Injectable()
export class TurnOrchestrator {
  private readonly logger = new Logger(TurnOrchestrator.name);

  constructor(
    private readonly aiConfig: AiConfigService,
    private readonly sessions: ChatSessionService,
    private readonly retrieval: RetrievalService,
    private readonly llm: LlmService,
    private readonly guard: GuardService,
    private readonly budget: BudgetService,
    private readonly tools: ToolRegistry,
  ) {}

  async *run(params: {
    session: ChatSession;
    level: AccessLevel;
    message: string;
    signal?: AbortSignal;
  }): AsyncGenerator<TurnEvent> {
    const config = await this.aiConfig.get();

    if (!config.enabled) {
      yield offline('AI туслах түр унтраалттай байна. Зөвлөхтэй шууд холбогдоно уу.', 'messenger');
      return;
    }

    if (params.session.status === ChatSessionStatus.HANDED_OFF) {
      yield offline('Энэ яриаг зөвлөх аваад байгаа тул туслах хариулахаа больсон.', 'messenger');
      return;
    }

    if (params.session.messageCount >= config.sessionMessageLimit) {
      yield offline('Энэ яриа хэтэрхий урт боллоо. Зөвлөхтэй ярих нь илүү хурдан байх болно.', 'messenger');
      return;
    }

    const sessionTokens = params.session.promptTokens + params.session.completionTokens;
    if (sessionTokens >= config.sessionTokenBudget) {
      yield offline('Энэ ярианы хязгаарт хүрлээ. Зөвлөгөө авах хүсэлт үлдээвэл бид залгая.', 'consultation');
      return;
    }

    // The ceiling is a business decision ($60/month, §15-31), so hitting it is
    // not an error: it is the assistant going quiet until tomorrow, and the
    // office hearing about it at 80% rather than at 100%.
    if ((await this.budget.check()).exhausted) {
      yield offline('Өнөөдрийн хариултын хязгаарт хүрлээ. Зөвлөгөө авах хүсэлт үлдээнэ үү.', 'consultation');
      return;
    }

    const question = this.guard.sanitiseInput(params.message);
    const startedAt = Date.now();

    await this.sessions.recordUserMessage(params.session.id, question);

    // Retrieval first, and always at the caller's level: the model is handed a
    // context it could not have chosen (AI-ASSISTANT.md principle 3).
    const hits = await this.retrieval.search({
      query: question,
      level: params.level,
      limit: config.retrievalTopK,
      minSimilarity: config.minSimilarity,
    });
    const playbooks = await this.retrieval.playbooks(params.level);

    const toolDefinitions = this.tools.definitions(params.level);

    const history = await this.sessions.history(params.session.id);
    const profile = (params.session.profile as Record<string, unknown>) ?? {};
    const { system, sources } = buildSystemPrompt({
      persona: config.persona,
      level: params.level,
      hits,
      playbooks,
      profile,
      history: params.session.summary,
      toolNames: toolDefinitions.map((tool) => tool.name),
      capture: {
        // `messageCount` counts both sides, and the user's message for this
        // turn is already in it — so it is halved and rounded up to get the
        // number of times this visitor has actually spoken.
        turns: Math.ceil((params.session.messageCount + 1) / 2),
        askAfter: config.leadCaptureAfterMessages,
        contactSettled: Boolean(profile.phone) || profile.contactDeclined === true,
      },
    });

    // `history` already ends with the question, because it was stored above.
    const messages: LlmMessage[] = history.length > 0 ? history : [{ role: 'user', content: question }];

    // Whether tokens may go to the browser as they arrive.
    //
    // Streaming and the leak check disagree by nature: the guard can only read a
    // finished answer, and by then a streamed one has already been on screen.
    // Retrieval never returns a chunk above the caller's level, so an ordinary
    // client turn has nothing in its context that could leak and streams freely.
    // A turn carrying playbooks does — that text is in the prompt by design — so
    // it is buffered and shown only after the guard has cleared it. In practice
    // that means visitors get a live answer and the staff copilot gets a whole
    // one, which is the right way round.
    const mayStream = playbooks.length === 0;

    const toolContext: ToolContext = {
      level: params.level,
      session: params.session,
      userId: params.session.userId,
      now: new Date(),
    };

    let answer = '';
    const runs: ToolRun[] = [];
    const usage = new UsageMeter(config.chatModel);

    try {
      for (let round = 0; round < MAX_MODEL_CALLS; round += 1) {
        const offerTools = toolDefinitions.length > 0 && round < MAX_MODEL_CALLS - 1;
        const calls: LlmToolCall[] = [];
        let spoken = '';

        for await (const event of this.llm.stream(
          {
            system,
            messages,
            ...(offerTools ? { tools: toolDefinitions } : {}),
            signal: params.signal,
          },
          (result) => usage.add(result),
        )) {
          if (event.type === 'text') {
            spoken += event.delta;
            // Text before a tool call is a preamble — "Хугацааг шалгаад хэлье"
            // — and it is left on screen rather than swallowed: it is what the
            // visitor is reading while the lookup runs, and it is part of the
            // stored answer, so what was shown is what was checked.
            if (mayStream) yield { type: 'token', text: event.delta };
          }
          if (event.type === 'tool-call') calls.push(event.call);
        }

        answer += spoken;
        if (calls.length === 0) break;

        messages.push({ role: 'assistant', content: spoken, toolCalls: calls });

        for (const call of calls) {
          yield { type: 'tool', name: call.name, status: 'running', label: this.tools.labelFor(call.name) };

          const run = await this.tools.run({
            call,
            context: toolContext,
            ref: `T${runs.length + 1}`,
          });
          runs.push(run);

          yield { type: 'tool', name: call.name, status: 'done', label: run.title };
          if (run.card) yield { type: 'card', card: run.card };

          messages.push({
            role: 'tool',
            content: run.content,
            toolCallId: call.id,
            name: call.name,
          });
        }
      }
    } catch (error) {
      this.logger.error(`Хариулт үүсгэж чадсангүй: ${error instanceof Error ? error.message : String(error)}`);
      yield offline('Одоогоор хариулт өгч чадахгүй байна. Зөвлөхтэй холбогдоно уу.', 'messenger');
      return;
    }

    const knownRefs = [...sources.map((source) => source.ref), ...runs.map((run) => run.ref)];

    let verdict = this.guard.review({
      answer,
      level: params.level,
      contextHits: hits,
      playbooks,
      knownRefs,
    });

    if (verdict.leaked) {
      // One more attempt, with the rule restated as an instruction. What the
      // visitor saw so far is discarded by the client on `retry`.
      const retry = await this.regenerate({ system, messages, signal: params.signal });
      verdict = this.guard.review({
        answer: retry,
        level: params.level,
        contextHits: hits,
        playbooks,
        knownRefs,
      });

      if (verdict.leaked) {
        this.logger.error('Дахин үүсгэсэн хариулт ч дотоод баримтаас хуулсан — хариултыг хаялаа');
        yield offline('Энэ асуултад найдвартай хариулт өгч чадсангүй. Зөвлөхтэй холбогдоно уу.', 'messenger');
        return;
      }

      // Nothing was streamed on a turn that could leak, so the cleared
      // replacement is simply the answer.
      yield { type: 'token', text: verdict.text };
    } else if (!mayStream) {
      yield { type: 'token', text: verdict.text };
    }

    const used = usedSources(verdict.text, sources, runs);
    if (used.length > 0) yield { type: 'sources', sources: used };

    const cards = runs.filter((run) => run.card).map((run) => run.card);
    const stored = await this.sessions.recordAnswer({
      sessionId: params.session.id,
      content: verdict.text,
      model: usage.model,
      grounded: verdict.grounded,
      citations: used as unknown as Prisma.InputJsonValue,
      ...(cards.length > 0 ? { cards: cards as unknown as Prisma.InputJsonValue } : {}),
      ...(runs.length > 0 ? { toolCalls: toolLog(runs) as unknown as Prisma.InputJsonValue } : {}),
      promptTokens: usage.promptTokens,
      completionTokens: usage.completionTokens,
      costMicros: usage.costMicros,
      latencyMs: Date.now() - startedAt,
    });

    yield {
      type: 'done',
      messageId: stored.id,
      grounded: verdict.grounded,
      truncated: verdict.text.length > LONG_ANSWER_CHARS,
    };
  }

  /** The second attempt after a leak — not streamed, because it replaces text. */
  private async regenerate(params: {
    system: string;
    messages: LlmMessage[];
    signal?: AbortSignal;
  }): Promise<string> {
    let text = '';

    for await (const event of this.llm.stream({
      system: `${params.system}\n\n${NO_QUOTE_INSTRUCTION}`,
      messages: params.messages,
      signal: params.signal,
    })) {
      if (event.type === 'text') text += event.delta;
    }

    return text;
  }
}

/**
 * The turn's bill.
 *
 * A turn is several model calls once tools are in play, and each one reports its
 * own usage. Keeping only the last would bill a four-call turn as a one-call
 * turn — and the daily ceiling is the only thing standing between a tool loop
 * and a month's spend, so it has to see all of it.
 */
class UsageMeter {
  promptTokens = 0;
  completionTokens = 0;
  costMicros = 0;

  constructor(public model: string) {}

  add(result: { model: string; promptTokens: number; completionTokens: number; costMicros: number }): void {
    this.promptTokens += result.promptTokens;
    this.completionTokens += result.completionTokens;
    this.costMicros += result.costMicros;
    // The model that answered last is the one the message is attributed to —
    // it is the one whose words were kept.
    this.model = result.model;
  }
}

function offline(message: string, fallback: 'messenger' | 'consultation'): TurnEvent {
  return { type: 'error', code: 'assistant_unavailable', message, fallback };
}

/** `[K1]`, `[T2]` … as they appear in the answer. */
function citedRefs(answer: string): string[] {
  return [...new Set([...answer.matchAll(/\[([KT]\d+)\]/g)].map((match) => match[1]!))];
}

/**
 * The sources the answer actually cited, in the shape the widget shows.
 *
 * Only cited ones: listing everything retrieved would credit the answer with
 * material it did not use, which is the opposite of what a citation is for. A
 * tool result is listed too — "энэ тоог хаанаас авав" is the same question
 * whether the answer came from a document or from the price table.
 */
function usedSources(answer: string, sources: SourceRef[], runs: ToolRun[]): PublicSource[] {
  const cited = new Set(citedRefs(answer));

  const knowledge: PublicSource[] = sources
    .filter((source) => cited.has(source.ref))
    .map((source) => ({
      ref: source.ref,
      title: source.title,
      heading: source.heading,
      kind: 'knowledge' as const,
    }));

  const tools: PublicSource[] = runs
    .filter((run) => run.ok && cited.has(run.ref))
    .map((run) => ({ ref: run.ref, title: run.title, heading: null, kind: 'tool' as const }));

  return [...knowledge, ...tools];
}

/** What the transcript keeps about a tool call — the call, not its payload. */
function toolLog(runs: ToolRun[]) {
  return runs.map((run) => ({
    ref: run.ref,
    name: run.name,
    title: run.title,
    arguments: run.arguments,
    ok: run.ok,
    durationMs: run.durationMs,
  }));
}
