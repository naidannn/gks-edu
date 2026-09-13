import { Injectable, Logger } from '@nestjs/common';
import { AccessLevel, ChatSessionStatus, Prisma, type ChatSession } from '../../../prisma/client.js';
import { AiConfigService } from '../ai-config.service.js';
import { RetrievalService, type RetrievalHit } from '../knowledge/retrieval.service.js';
import { LlmService } from '../llm/llm.service.js';
import type { LlmMessage } from '../llm/llm.types.js';
import { BudgetService } from './budget.service.js';
import { ChatSessionService } from './chat-session.service.js';
import { GuardService, LONG_ANSWER_CHARS, NO_QUOTE_INSTRUCTION } from './guard.service.js';
import { buildSystemPrompt, type SourceRef } from './prompt.builder.js';

/** What the SSE endpoint forwards to the browser (§5.6). */
export type TurnEvent =
  | { type: 'token'; text: string }
  | { type: 'sources'; sources: PublicSource[] }
  | { type: 'done'; messageId: string; grounded: boolean; truncated: boolean }
  | { type: 'error'; code: string; message: string; fallback: 'messenger' | 'consultation' };

/** A citation as the widget shows it — never the chunk id, never the level. */
export interface PublicSource {
  ref: string;
  title: string;
  heading: string | null;
}

/**
 * One turn: question in, answer out (2B-04, AI-ASSISTANT.md §3).
 *
 * ```
 * kill switch + budget → history → retrieve → prompt → stream → guard → store
 * ```
 *
 * The order is the design. Retrieval happens before the model is called, so the
 * model never chooses what it is allowed to see; the guard runs after it has
 * spoken but before anything is stored or counted, so a leaked answer is never
 * a stored answer. Tools slot in between the prompt and the stream (2B-06) and
 * change none of this.
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

    const history = await this.sessions.history(params.session.id);
    const { system, sources } = buildSystemPrompt({
      persona: config.persona,
      level: params.level,
      hits,
      playbooks,
      profile: (params.session.profile as Record<string, unknown>) ?? {},
      history: params.session.summary,
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

    let answer = '';
    let usage = { promptTokens: 0, completionTokens: 0, costMicros: 0, model: config.chatModel };

    try {
      for await (const event of this.llm.stream(
        { system, messages, signal: params.signal },
        (result) => {
          usage = {
            promptTokens: result.promptTokens,
            completionTokens: result.completionTokens,
            costMicros: result.costMicros,
            model: result.model,
          };
        },
      )) {
        if (event.type === 'text') {
          answer += event.delta;
          if (mayStream) yield { type: 'token', text: event.delta };
        }
      }
    } catch (error) {
      this.logger.error(`Хариулт үүсгэж чадсангүй: ${error instanceof Error ? error.message : String(error)}`);
      yield offline('Одоогоор хариулт өгч чадахгүй байна. Зөвлөхтэй холбогдоно уу.', 'messenger');
      return;
    }

    const knownRefs = sources.map((source) => source.ref);

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

    const used = usedSources(verdict.text, sources, hits);
    if (used.length > 0) yield { type: 'sources', sources: used };

    const stored = await this.sessions.recordAnswer({
      sessionId: params.session.id,
      content: verdict.text,
      model: usage.model,
      grounded: verdict.grounded,
      citations: sources.filter((source) =>
        verdict.text.includes(`[${source.ref}]`),
      ) as unknown as Prisma.InputJsonValue,
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
 * material it did not use, which is the opposite of what a citation is for.
 */
function usedSources(answer: string, sources: SourceRef[], hits: RetrievalHit[]): PublicSource[] {
  const cited = new Set(citedRefs(answer));

  return sources
    .filter((source) => cited.has(source.ref))
    .map((source, index) => ({
      ref: source.ref,
      title: source.title,
      heading: hits[index]?.heading ?? source.heading,
    }));
}
