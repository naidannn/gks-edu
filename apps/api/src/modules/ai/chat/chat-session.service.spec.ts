import { NotFoundException } from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ChatRole, FeedbackValue } from '../../../prisma/client.js';
import type { PrismaService } from '../../../prisma/prisma.service.js';
import { ChatSessionService } from './chat-session.service.js';

/**
 * The two rules the widget's own endpoints rest on (2C-01, 2C-11).
 *
 * Both are about who may touch a conversation. Neither is visible in the happy
 * path — a normal visitor rates their own answer and reads their own thread —
 * and both are one missing `where` clause away from being untrue.
 */
function harness() {
  const prisma = {
    chatMessage: { findFirst: vi.fn(), findMany: vi.fn() },
    chatFeedback: { upsert: vi.fn().mockResolvedValue({ value: 'DOWN', reason: 'WRONG' }) },
    chatSession: { findMany: vi.fn().mockResolvedValue([]) },
  } as unknown as PrismaService;

  const config = { getOrThrow: () => 'test-refresh-secret' } as unknown as ConfigService;

  return { service: new ChatSessionService(prisma, config), prisma };
}

describe('ChatSessionService.recordFeedback', () => {
  beforeEach(() => vi.clearAllMocks());

  it('looks the message up inside the session, not by id alone', async () => {
    const { service, prisma } = harness();
    vi.mocked(prisma.chatMessage.findFirst).mockResolvedValue({ id: 'm1' } as never);

    await service.recordFeedback({ sessionId: 's1', messageId: 'm1', value: FeedbackValue.UP });

    // Without `sessionId` in the where clause a known message id is enough to
    // vote on somebody else's conversation, and the quality signal the office
    // reads becomes something anyone can write.
    expect(vi.mocked(prisma.chatMessage.findFirst).mock.calls[0]![0]).toMatchObject({
      where: { id: 'm1', sessionId: 's1', role: ChatRole.ASSISTANT },
    });
  });

  it('refuses a message that is not in this conversation', async () => {
    const { service, prisma } = harness();
    vi.mocked(prisma.chatMessage.findFirst).mockResolvedValue(null as never);

    await expect(
      service.recordFeedback({ sessionId: 's1', messageId: 'someone-elses', value: FeedbackValue.UP }),
    ).rejects.toBeInstanceOf(NotFoundException);

    expect(prisma.chatFeedback.upsert).not.toHaveBeenCalled();
  });

  it('replaces an earlier thumb rather than adding a second one', async () => {
    const { service, prisma } = harness();
    vi.mocked(prisma.chatMessage.findFirst).mockResolvedValue({ id: 'm1' } as never);

    await service.recordFeedback({
      sessionId: 's1',
      messageId: 'm1',
      value: FeedbackValue.DOWN,
      reason: 'WRONG',
      comment: '  ',
    });

    const call = vi.mocked(prisma.chatFeedback.upsert).mock.calls[0]![0];
    expect(call.where).toEqual({ messageId: 'm1' });
    // A comment of nothing but spaces is not a comment.
    expect(call.update).toMatchObject({ value: 'DOWN', reason: 'WRONG', comment: null });
  });
});

describe('ChatSessionService.publicTranscript', () => {
  beforeEach(() => vi.clearAllMocks());

  it('asks for none of the operational columns the admin viewer gets', async () => {
    const { service, prisma } = harness();
    vi.mocked(prisma.chatMessage.findMany).mockResolvedValue([] as never);

    await service.publicTranscript('s1');

    const select = vi.mocked(prisma.chatMessage.findMany).mock.calls[0]![0]!.select!;
    // Which model answered, what it cost and how long it took belong to the
    // office, not to the visitor whose question they describe. `toolCalls` is
    // left out too: the arguments the model chose can quote a question back in
    // a shape nobody expected to be shown.
    for (const column of ['model', 'promptTokens', 'completionTokens', 'latencyMs', 'toolCalls']) {
      expect(select).not.toHaveProperty(column);
    }
    expect(select).toMatchObject({ content: true, citations: true, cards: true });
  });

  it('turns a null citations column into an empty list, never null', async () => {
    const { service, prisma } = harness();
    vi.mocked(prisma.chatMessage.findMany).mockResolvedValue([
      { id: 'm1', role: ChatRole.ASSISTANT, content: 'сайн', citations: null, cards: null, grounded: true, createdAt: new Date(), feedback: null },
    ] as never);

    const [message] = await service.publicTranscript('s1');

    // The widget maps over these; a null would be a blank render, and an answer
    // stored before citations existed must still be readable.
    expect(message!.sources).toEqual([]);
    expect(message!.cards).toEqual([]);
  });
});

describe('ChatSessionService.listSummaries', () => {
  beforeEach(() => vi.clearAllMocks());

  const A = '11111111-1111-4111-8111-111111111111';
  const B = '22222222-2222-4222-8222-222222222222';

  it('keeps only the tokens that verify, and the session each one names', async () => {
    const { service, prisma } = harness();
    const forged = service.sign(B).replace(/\.[^.]+$/, '.forged');

    await service.listSummaries({ tokens: [service.sign(A), forged, 'not-a-token'] });

    const where = vi.mocked(prisma.chatSession.findMany).mock.calls[0]![0]!.where!;
    // A token is the whole of a guest's proof. Listing a session on a token
    // that does not verify would hand its opening question to anyone who can
    // guess an id.
    expect(where.OR).toEqual([{ id: { in: [A] } }]);
  });

  it('adds a signed-in caller’s own sessions, and nobody else’s', async () => {
    const { service, prisma } = harness();

    await service.listSummaries({ tokens: [], userId: 'u1' });

    const where = vi.mocked(prisma.chatSession.findMany).mock.calls[0]![0]!.where!;
    expect(where.OR).toEqual([{ userId: 'u1' }]);
    expect(where.status).toEqual({ not: 'CLOSED' });
  });

  it('asks the database nothing when the caller proves no session at all', async () => {
    const { service, prisma } = harness();

    expect(await service.listSummaries({ tokens: ['junk'] })).toEqual([]);
    expect(prisma.chatSession.findMany).not.toHaveBeenCalled();
  });

  it('titles a conversation by its opening question, on one line', async () => {
    const { service, prisma } = harness();
    vi.mocked(prisma.chatSession.findMany).mockResolvedValue([
      { id: A, status: 'ACTIVE', lastMessageAt: new Date(), messages: [{ content: 'Сөүлд\n\nхэлний   бэлтгэл' }] },
      { id: B, status: 'ACTIVE', lastMessageAt: new Date(), messages: [{ content: 'я'.repeat(120) }] },
    ] as never);

    const [first, second] = await service.listSummaries({ tokens: [service.sign(A)] });

    expect(first!.title).toBe('Сөүлд хэлний бэлтгэл');
    expect(second!.title).toHaveLength(80);
    expect(second!.title.endsWith('…')).toBe(true);
  });
});
