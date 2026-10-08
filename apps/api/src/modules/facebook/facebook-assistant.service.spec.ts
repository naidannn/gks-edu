import { describe, expect, it, vi } from 'vitest';
import { FacebookAssistantService, commentQuestion } from './facebook-assistant.service.js';
import type { TurnEvent } from '../ai/chat/turn.orchestrator.js';

const NOW = Date.now();

function thread(overrides: Record<string, unknown> = {}) {
  return {
    id: 'T1',
    psid: 'U1',
    aiMode: 'AUTO',
    aiPausedUntil: null,
    chatSessionId: 'S1',
    leadId: null,
    clientId: null,
    lastInboundAt: new Date(NOW - 60_000),
    ...overrides,
  };
}

const SESSION = {
  id: 'S1',
  code: 'AI-2026-0001',
  status: 'ACTIVE',
  channel: 'FACEBOOK',
  messageCount: 2,
  promptTokens: 0,
  completionTokens: 0,
  leadId: null,
  profile: {},
};

function setup(opts: {
  threads?: Record<string, unknown>[];
  events?: TurnEvent[];
  stored?: string;
  pending?: { text: string | null; createdAt: Date }[];
}) {
  const threads = [...(opts.threads ?? [thread(), thread()])];
  const pending = opts.pending ?? [
    { text: 'Сайн байна уу', createdAt: new Date(NOW - 5_000) },
    { text: 'GKS хэзээ вэ?', createdAt: new Date(NOW - 4_000) },
  ];

  const prisma = {
    facebookThread: {
      findUnique: vi.fn(async () => threads.shift() ?? null),
      update: vi.fn(async () => ({})),
      updateMany: vi.fn(async () => ({ count: 0 })),
    },
    facebookMessage: {
      findFirst: vi.fn(async () => ({ createdAt: new Date(NOW - 3_600_000) })),
      // First call: the unanswered burst (newest first); second: history.
      findMany: vi
        .fn()
        .mockResolvedValueOnce([...pending].reverse())
        .mockResolvedValueOnce([
          { sender: 'CONTACT', text: 'Үнэ хэд вэ?' },
          { sender: 'STAFF', text: 'Зөвлөх тань руу залгана.' },
        ].reverse()),
      count: vi.fn(async () => 0),
      create: vi.fn(async () => ({})),
    },
    chatSession: { findUnique: vi.fn(async () => SESSION), update: vi.fn() },
    chatMessage: { findUnique: vi.fn(async () => ({ content: opts.stored ?? 'GKS-ийн хугацаа 10/15 [T1].' })) },
    client: { findUnique: vi.fn() },
  };

  const run = vi.fn(async function* () {
    for (const event of opts.events ?? [{ type: 'done', messageId: 'M1', grounded: true, truncated: false }]) {
      yield event;
    }
  });

  const graph = {
    typing: vi.fn(async () => undefined),
    sendText: vi.fn(async () => ({ recipientId: 'U1', messageId: 'mid.1' })),
  };
  const intake = { queueReply: vi.fn() };
  const aiConfig = {
    get: vi.fn(async () => ({
      enabled: true,
      facebookEnabled: true,
      sessionMessageLimit: 40,
      sessionTokenBudget: 60_000,
    })),
  };

  const service = new FacebookAssistantService(
    prisma as never,
    aiConfig as never,
    { start: vi.fn(), close: vi.fn() } as never,
    { run } as never,
    graph as never,
    intake as never,
  );

  return { service, prisma, run, graph, intake };
}

describe('FacebookAssistantService.replyToThread', () => {
  it('answers a burst as one question, with the staff reply in the history, in plain text', async () => {
    const { service, run, graph, prisma } = setup({});

    await service.replyToThread('T1');

    const call = (run.mock.calls[0] as unknown as [Record<string, unknown>])[0];
    expect(call.message).toBe('Сайн байна уу\nGKS хэзээ вэ?');
    expect(call.level).toBe('PUBLIC');
    expect(call.history).toEqual([
      { role: 'user', content: 'Үнэ хэд вэ?' },
      { role: 'assistant', content: 'Зөвлөх тань руу залгана.' },
      { role: 'user', content: 'Сайн байна уу\nGKS хэзээ вэ?' },
    ]);

    // The stored answer, with its citation marker stripped for Messenger.
    expect(graph.sendText).toHaveBeenCalledWith('U1', 'GKS-ийн хугацаа 10/15.');
    expect(prisma.facebookMessage.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ mid: 'mid.1', sender: 'AI', chatMessageId: 'M1' }),
    });
    expect(prisma.facebookThread.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ needsStaff: false, lastSender: 'AI' }) }),
    );
  });

  it('stays silent while a person has the thread', async () => {
    const paused = thread({ aiPausedUntil: new Date(NOW + 3_600_000) });
    const { service, run, graph } = setup({ threads: [paused] });

    await service.replyToThread('T1');

    expect(run).not.toHaveBeenCalled();
    expect(graph.sendText).not.toHaveBeenCalled();
  });

  it('sends nothing and flags the thread when the assistant cannot answer', async () => {
    const { service, graph, prisma } = setup({
      events: [{ type: 'error', code: 'assistant_unavailable', message: 'budget', fallback: 'consultation' }],
    });

    await service.replyToThread('T1');

    expect(graph.sendText).not.toHaveBeenCalled();
    expect(prisma.facebookThread.update).toHaveBeenCalledWith({ where: { id: 'T1' }, data: { needsStaff: true } });
  });

  it('does not send over a person who stepped in mid-turn', async () => {
    const { service, graph } = setup({
      threads: [thread(), thread({ aiPausedUntil: new Date(NOW + 3_600_000) })],
    });

    await service.replyToThread('T1');

    expect(graph.sendText).not.toHaveBeenCalled();
  });

  it('leaves a photo with no words to staff', async () => {
    const { service, run, prisma } = setup({ pending: [{ text: null, createdAt: new Date(NOW - 1_000) }] });

    await service.replyToThread('T1');

    expect(run).not.toHaveBeenCalled();
    expect(prisma.facebookThread.update).toHaveBeenCalledWith({ where: { id: 'T1' }, data: { needsStaff: true } });
  });
});

describe('commentQuestion', () => {
  it('gives the model the post it was asked under', () => {
    expect(commentQuestion(' Үнэ? ', 'Солонгос хэлний бэлтгэл\n2026 оны хавар')).toBe(
      '(Facebook постны доор бичсэн сэтгэгдэл. Хариулт хувийн мессежээр очно.)\n' +
        'Пост: «Солонгос хэлний бэлтгэл 2026 оны хавар»\n' +
        'Сэтгэгдэл: Үнэ?',
    );
  });
});
