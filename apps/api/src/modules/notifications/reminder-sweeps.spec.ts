import { describe, expect, it, vi } from 'vitest';
import { NotificationEvent, PaymentKind, PaymentStatus } from '../../prisma/client.js';
import type { PrismaService } from '../../prisma/prisma.service.js';
import type { AdmissionConfigService } from '../admissions/admission-config.service.js';
import type { NotificationsService } from './notifications.service.js';
import { ReminderSweepsService } from './reminder-sweeps.service.js';

/**
 * The regression these guard: `Payment.dueAt` had no writer, so the payment
 * half of the nightly sweep swept an empty set for the whole of phase 1 and
 * §16's "Төлбөрийн хугацаа болсон" never reached anybody. The sweep itself was
 * fine — nothing proved it, because nothing fed it.
 */

const DAY_MS = 24 * 60 * 60 * 1000;
const NOW = new Date('2026-09-08T09:00:00.000Z');

function buildHarness(payments: Record<string, unknown>[]) {
  const empty = { findMany: vi.fn().mockResolvedValue([]) };

  const prisma = {
    caseDocument: empty,
    payment: { findMany: vi.fn().mockResolvedValue(payments) },
    visaCase: empty,
    departurePlan: empty,
    lead: empty,
    user: empty,
    case: empty,
  } as unknown as PrismaService;

  const notifications = { dispatch: vi.fn().mockResolvedValue(1) } as unknown as NotificationsService;

  const admissionConfig = {
    get: vi.fn().mockResolvedValue({ clientReminderOffsets: [7], staffReminderOffsets: [7], riskReadinessThreshold: 80 }),
  } as unknown as AdmissionConfigService;

  return {
    service: new ReminderSweepsService(prisma, notifications, admissionConfig),
    prisma,
    notifications,
  };
}

function pendingPayment(dueAt: Date) {
  return {
    id: 'payment-1',
    kind: PaymentKind.PREPAYMENT,
    amountMnt: '200000',
    dueAt,
    case: { id: 'case-1', code: 'GKS-2026-0001', userId: 'student-1' },
  };
}

describe('ReminderSweepsService — payments (§16 "Төлбөрийн хугацаа болсон")', () => {
  it('reminds the client three days out', async () => {
    const { service, notifications } = buildHarness([pendingPayment(new Date(NOW.getTime() + 3 * DAY_MS))]);

    const result = await service.sweepAll(NOW);

    expect(result.payments).toBe(1);
    expect(notifications.dispatch).toHaveBeenCalledWith(
      expect.objectContaining({
        event: NotificationEvent.PAYMENT_DUE,
        userIds: ['student-1'],
        caseId: 'case-1',
        // Stable per (payment, offset), so a sweep that runs twice in a day
        // collides on the unique dedupeKey instead of nagging twice.
        dedupeSubject: 'payment-1:3',
        context: expect.objectContaining({ daysLeft: 3, caseCode: 'GKS-2026-0001' }),
      }),
    );
  });

  it('stays on the three-day rung while the date is still ahead', async () => {
    // `dueAt` is stored at end of day, so a payment due tonight still has a
    // whole day left by this count — the second rung is for money that is late,
    // not for the last afternoon.
    const { service, notifications } = buildHarness([pendingPayment(new Date(NOW.getTime() + 12 * 60 * 60 * 1000))]);

    await service.sweepAll(NOW);

    expect(notifications.dispatch).toHaveBeenCalledWith(
      expect.objectContaining({ dedupeSubject: 'payment-1:3', context: expect.objectContaining({ daysLeft: 1 }) }),
    );
  });

  it('moves to its own rung once the payment is late, so the ladder is two reminders not one', async () => {
    // The regression: over a descending ladder, `find` matched 3 first and the
    // second rung was unreachable — a client who missed the date was never told.
    const { service, notifications } = buildHarness([pendingPayment(new Date(NOW.getTime() - 5 * DAY_MS))]);

    await service.sweepAll(NOW);

    expect(notifications.dispatch).toHaveBeenCalledWith(
      // Never a negative countdown in front of a client.
      expect.objectContaining({ dedupeSubject: 'payment-1:0', context: expect.objectContaining({ daysLeft: 0 }) }),
    );
  });

  it('asks only for pending payments that have a date at all', async () => {
    const { service, prisma } = buildHarness([]);

    await service.sweepAll(NOW);

    expect(prisma.payment.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          status: PaymentStatus.PENDING,
          dueAt: { not: null, lte: new Date(NOW.getTime() + 3 * DAY_MS) },
        }),
      }),
    );
  });

  it('sends nothing for a payment still further out than the widest offset', async () => {
    const { service, notifications } = buildHarness([pendingPayment(new Date(NOW.getTime() + 10 * DAY_MS))]);

    // The query would not have returned it; if it ever does, the offset ladder
    // must still decline rather than remind ten days early.
    await service.sweepAll(NOW);

    expect(notifications.dispatch).not.toHaveBeenCalled();
  });
});
