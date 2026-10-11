import { describe, expect, it, vi } from 'vitest';
import { FacebookIntakeService } from './facebook-intake.service.js';

/**
 * Two intake rules found in production (2026-10-11 audit).
 *
 * Both lost real people an answer without any error anywhere: a message that
 * arrived while a turn was running was swallowed by the running job's id, and
 * Business Suite's follow-up automation paused the assistant for twelve hours.
 */
function setup(opts: { active?: boolean; exists?: boolean; echoAt?: Date | null } = {}) {
  const job = { isActive: vi.fn(async () => opts.active ?? false) };
  const queue = {
    getJob: vi.fn(async () => (opts.exists === false ? undefined : job)),
    add: vi.fn(async () => ({})),
  };
  const prisma = {
    facebookMessage: {
      findFirst: vi.fn(async () => (opts.echoAt ? { createdAt: opts.echoAt } : null)),
    },
    facebookThread: { update: vi.fn(async (args: { data: object }) => ({ id: 'T1', ...args.data })) },
  };

  const service = new FacebookIntakeService(prisma as never, {} as never, {} as never, {} as never, queue as never);
  return { service, queue, prisma };
}

describe('queueReply', () => {
  it('uses the thread’s own slot when nothing is running', async () => {
    const { service, queue } = setup({ exists: false });

    await service.queueReply('T1');

    expect(queue.add).toHaveBeenCalledWith('reply-thread', { threadId: 'T1' }, expect.objectContaining({ jobId: 'reply-T1' }));
  });

  it('takes the follow-up slot while a turn for the thread is running', async () => {
    // a8c6db00: "Хаяг холбоо барих" landed 0.9 s into the turn and was never answered.
    const { service, queue } = setup({ active: true });

    await service.queueReply('T1');

    expect(queue.add).toHaveBeenCalledWith(
      'reply-thread',
      { threadId: 'T1' },
      expect.objectContaining({ jobId: 'reply-T1-next' }),
    );
  });

  it('joins a job that is only waiting — it will read this message too', async () => {
    const { service, queue } = setup({ active: false });

    await service.queueReply('T1');

    expect(queue.add).toHaveBeenCalledWith('reply-thread', { threadId: 'T1' }, expect.objectContaining({ jobId: 'reply-T1' }));
  });
});

describe('a pause set by an automation echo', () => {
  const HOUR = 3_600_000;
  const pressed = new Date('2026-10-09T14:23:30.082Z');
  const echoAt = new Date('2026-10-09T14:23:29.830Z');
  const undo = (service: FacebookIntakeService, aiPausedUntil: Date | null) =>
    (
      service as unknown as {
        undoAutomatedPause: (thread: object, at: Date, hours: number) => Promise<{ aiPausedUntil: Date | null }>;
      }
    ).undoAutomatedPause(
      { id: 'T1', aiPausedUntil },
      pressed,
      12,
    );

  it('is lifted when the contact’s message follows it within seconds', async () => {
    const { service, prisma } = setup({ echoAt });

    const thread = await undo(service, new Date(echoAt.getTime() + 12 * HOUR));

    expect(prisma.facebookThread.update).toHaveBeenCalledWith({ where: { id: 'T1' }, data: { aiPausedUntil: null } });
    expect(thread.aiPausedUntil).toBeNull();
  });

  it('stands when a person set it earlier', async () => {
    const { service, prisma } = setup({ echoAt });

    await undo(service, new Date(echoAt.getTime() - 30 * 60_000 + 12 * HOUR));

    expect(prisma.facebookThread.update).not.toHaveBeenCalled();
  });

  it('stands when no echo came just before', async () => {
    const { service, prisma } = setup({ echoAt: null });

    await undo(service, new Date(echoAt.getTime() + 12 * HOUR));

    expect(prisma.facebookThread.update).not.toHaveBeenCalled();
  });
});
