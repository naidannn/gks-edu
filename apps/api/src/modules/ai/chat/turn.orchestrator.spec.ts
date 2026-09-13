import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  AccessLevel,
  ChatChannel,
  ChatSessionStatus,
  KnowledgeKind,
  type ChatSession,
} from '../../../prisma/client.js';
import type { AiConfigService } from '../ai-config.service.js';
import type { RetrievalHit, RetrievalService } from '../knowledge/retrieval.service.js';
import type { LlmService } from '../llm/llm.service.js';
import type { LlmEvent } from '../llm/llm.types.js';
import type { BudgetService } from './budget.service.js';
import type { ChatSessionService } from './chat-session.service.js';
import { GuardService } from './guard.service.js';
import { TurnOrchestrator, type TurnEvent } from './turn.orchestrator.js';

const CONFIG = {
  enabled: true,
  chatModel: 'gemini-3.1-flash-lite',
  persona: 'Чи GKS EDU-ийн туслах. Товч, монголоор хариул.',
  temperature: 0.2,
  maxOutputTokens: 700,
  retrievalTopK: 8,
  minSimilarity: 0.66,
  sessionMessageLimit: 40,
  sessionTokenBudget: 60_000,
  dailyTokenBudget: 3_000_000,
};

function session(overrides: Partial<ChatSession> = {}): ChatSession {
  return {
    id: 'session-1',
    code: 'AI-2026-0001',
    channel: ChatChannel.WEB_WIDGET,
    status: ChatSessionStatus.ACTIVE,
    messageCount: 2,
    promptTokens: 100,
    completionTokens: 50,
    profile: {},
    summary: null,
    ...overrides,
  } as ChatSession;
}

function hit(overrides: Partial<RetrievalHit> = {}): RetrievalHit {
  return {
    chunkId: 'c1',
    documentId: 'd1',
    title: 'Тэтгэлгийн хугацаа',
    kind: KnowledgeKind.ENTRY,
    category: 'SCHOLARSHIP' as RetrievalHit['category'],
    accessLevel: AccessLevel.PUBLIC,
    heading: 'Хэзээ эхлэх вэ',
    content: 'Материалаа эрт бэлдэх нь зөв.',
    similarity: 0.78,
    score: 0.03,
    matchedBy: ['semantic'],
    sourceRef: null,
    ...overrides,
  };
}

function harness(options: {
  config?: Partial<typeof CONFIG>;
  hits?: RetrievalHit[];
  answer?: string;
  spentToday?: number;
  playbooks?: { title: string; body: string }[];
} = {}) {
  const aiConfig = { get: async () => ({ ...CONFIG, ...options.config }) } as unknown as AiConfigService;

  const sessions = {
    tokensSpentToday: vi.fn().mockResolvedValue(options.spentToday ?? 0),
    recordUserMessage: vi.fn().mockResolvedValue({ id: 'm-user' }),
    recordAnswer: vi.fn().mockResolvedValue({ id: 'm-assistant' }),
    history: vi.fn().mockResolvedValue([{ role: 'user', content: 'асуулт' }]),
  } as unknown as ChatSessionService;

  const retrieval = {
    search: vi.fn().mockResolvedValue(options.hits ?? [hit()]),
    playbooks: vi.fn().mockResolvedValue(options.playbooks ?? []),
  } as unknown as RetrievalService;

  const answers = [options.answer ?? 'Материалаа эрт эхлэх нь зөв [K1].'];
  const llm = {
    stream: vi.fn().mockImplementation((_request: unknown, onResult?: (r: unknown) => void) => {
      const text = answers.shift() ?? 'Дахин бичсэн хариулт.';
      return (async function* (): AsyncIterable<LlmEvent> {
        yield { type: 'text', delta: text };
        onResult?.({
          model: 'gemini-3.1-flash-lite',
          provider: 'gemini',
          promptTokens: 900,
          completionTokens: 40,
          costMicros: 285,
          usedFallback: false,
        });
        yield { type: 'done', finishReason: 'stop' };
      })();
    }),
  } as unknown as LlmService;

  const budget = {
    check: vi.fn().mockResolvedValue({
      spent: options.spentToday ?? 0,
      limit: CONFIG.dailyTokenBudget,
      ratio: (options.spentToday ?? 0) / CONFIG.dailyTokenBudget,
      exhausted: (options.spentToday ?? 0) >= CONFIG.dailyTokenBudget,
    }),
  } as unknown as BudgetService;

  const orchestrator = new TurnOrchestrator(aiConfig, sessions, retrieval, llm, new GuardService(), budget);
  return { orchestrator, sessions, retrieval, llm, answers };
}

async function run(orchestrator: TurnOrchestrator, overrides: Partial<Parameters<TurnOrchestrator['run']>[0]> = {}) {
  const events: TurnEvent[] = [];
  for await (const event of orchestrator.run({
    session: session(),
    level: AccessLevel.PUBLIC,
    message: 'Материалаа хэзээ бэлдэх вэ?',
    ...overrides,
  })) {
    events.push(event);
  }
  return events;
}

describe('TurnOrchestrator', () => {
  beforeEach(() => vi.clearAllMocks());

  it('streams the answer, then its sources, then done', async () => {
    const { orchestrator } = harness();

    const events = await run(orchestrator);

    expect(events.map((event) => event.type)).toEqual(['token', 'sources', 'done']);
    expect(events.at(-1)).toMatchObject({ messageId: 'm-assistant', grounded: true });
  });

  it('retrieves at the caller level, with the configured threshold', async () => {
    const { orchestrator, retrieval } = harness();

    await run(orchestrator, { level: AccessLevel.CONTRACTED });

    expect(retrieval.search).toHaveBeenCalledWith(
      expect.objectContaining({ level: AccessLevel.CONTRACTED, minSimilarity: 0.66, limit: 8 }),
    );
  });

  it('lists only the sources the answer actually cited', async () => {
    const { orchestrator } = harness({
      hits: [hit(), hit({ chunkId: 'c2', documentId: 'd2', title: 'Хоёр дахь баримт' })],
      answer: 'Зөвхөн эхнийхийг ашигласан [K1].',
    });

    const sources = (await run(orchestrator)).find((event) => event.type === 'sources');

    // Crediting an answer with material it did not use is the opposite of what
    // a citation is for.
    expect(sources).toMatchObject({ sources: [{ ref: 'K1', title: 'Тэтгэлгийн хугацаа' }] });
  });

  it('bills the session for what the turn cost', async () => {
    const { orchestrator, sessions } = harness();

    await run(orchestrator);

    expect(sessions.recordAnswer).toHaveBeenCalledWith(
      expect.objectContaining({ promptTokens: 900, completionTokens: 40, costMicros: 285 }),
    );
  });

  it('strips a citation the model invented and flags the turn', async () => {
    const { orchestrator, sessions } = harness({ hits: [], answer: 'Ямар ч эх сурвалжгүй [K3].' });

    const events = await run(orchestrator);

    expect(events.at(-1)).toMatchObject({ grounded: false });
    expect(vi.mocked(sessions.recordAnswer).mock.calls[0]![0].content).not.toContain('[K3]');
  });

  it('marks an answer with an uncited figure as ungrounded', async () => {
    const { orchestrator, sessions } = harness({ answer: 'Төлбөр нь 1,200,000₮.' });

    const events = await run(orchestrator);

    expect(events.at(-1)).toMatchObject({ grounded: false });
    expect(vi.mocked(sessions.recordAnswer).mock.calls[0]![0].content).toContain('баталгаажуулна уу');
  });

  describe('when it must not answer', () => {
    it('says so when the kill switch is off', async () => {
      const { orchestrator, llm } = harness({ config: { enabled: false } });

      const events = await run(orchestrator);

      expect(events).toEqual([expect.objectContaining({ type: 'error', fallback: 'messenger' })]);
      expect(llm.stream).not.toHaveBeenCalled();
    });

    it('stays quiet in a session a human has taken over', async () => {
      const { orchestrator, llm } = harness();

      const events = await run(orchestrator, {
        session: session({ status: ChatSessionStatus.HANDED_OFF }),
      });

      expect(events[0]).toMatchObject({ type: 'error' });
      expect(llm.stream).not.toHaveBeenCalled();
    });

    it('routes to the consultation form when the day’s budget is spent', async () => {
      const { orchestrator, llm } = harness({ spentToday: 3_000_000 });

      const events = await run(orchestrator);

      // A spent ceiling is a business decision, not an error: the visitor gets a
      // way to reach a person rather than an apology.
      expect(events[0]).toMatchObject({ type: 'error', fallback: 'consultation' });
      expect(llm.stream).not.toHaveBeenCalled();
    });

    it('stops a conversation that has run past its own token budget', async () => {
      const { orchestrator, llm } = harness();

      const events = await run(orchestrator, {
        session: session({ promptTokens: 59_000, completionTokens: 2_000 }),
      });

      expect(events[0]).toMatchObject({ type: 'error', fallback: 'consultation' });
      expect(llm.stream).not.toHaveBeenCalled();
    });

    it('falls back to a human when the model itself fails', async () => {
      const { orchestrator, llm } = harness();
      vi.mocked(llm.stream).mockImplementation(() => {
        throw new Error('provider down');
      });

      expect(await run(orchestrator)).toEqual([
        expect.objectContaining({ type: 'error', fallback: 'messenger' }),
      ]);
    });
  });

  describe('when the answer leaks', () => {
    const playbook = {
      title: 'Үнийн яриа',
      body: 'Зочин үнэ асуувал дүнг нүүр рүү шидэхгүй, эхлээд үйлчилгээнд юу багтдагийг тайлбарла.',
    };

    it('regenerates once and sends the clean answer', async () => {
      const { orchestrator, llm } = harness({
        playbooks: [playbook],
        answer: `Танд хэлье: ${playbook.body}`,
      });

      const events = await run(orchestrator);

      expect(llm.stream).toHaveBeenCalledTimes(2);
      expect(events.at(-1)).toMatchObject({ type: 'done' });
      // The offending draft never reached the browser: a turn whose context
      // carries playbooks is buffered until the guard has cleared it.
      const streamed = events.filter((event) => event.type === 'token');
      expect(streamed).toHaveLength(1);
      expect((streamed[0] as { text: string }).text).not.toContain('нүүр рүү шидэхгүй');
    });

    it('streams live for an ordinary client turn, where nothing in context can leak', async () => {
      const { orchestrator } = harness();

      const tokens = (await run(orchestrator)).filter((event) => event.type === 'token');

      expect(tokens).toHaveLength(1);
    });

    it('abandons the turn if the retry leaks too — a leaked answer is never stored or shown', async () => {
      const built = harness({ playbooks: [playbook], answer: `Танд хэлье: ${playbook.body}` });
      // The second attempt repeats the offence.
      built.answers.push(`Дахиад: ${playbook.body}`);

      expect(await run(built.orchestrator)).toEqual([
        expect.objectContaining({ type: 'error', fallback: 'messenger' }),
      ]);
      expect(built.sessions.recordAnswer).not.toHaveBeenCalled();
    });
  });
});
