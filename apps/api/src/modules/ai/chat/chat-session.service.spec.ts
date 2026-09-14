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
