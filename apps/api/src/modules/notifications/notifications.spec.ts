import { describe, expect, it, vi } from 'vitest';
import type { ConfigService } from '@nestjs/config';
import { NotificationChannel, NotificationEvent, NotificationStatus } from '../../prisma/client.js';
import type { PrismaService } from '../../prisma/prisma.service.js';
import type { ConfigService as NestConfigService } from '@nestjs/config';
import type { Queue } from 'bullmq';
import { NOTIFICATION_TEMPLATES } from './notification-templates.data.js';
import { formatAmountMn, formatDateMn } from './notification-labels.js';
import { NotificationsService, render } from './notifications.service.js';
import { SmsBudgetService } from './sms-budget.service.js';

describe('render (1G-02 placeholder interpolation)', () => {
  it('substitutes known keys', () => {
    expect(render('Сайн байна уу, {{clientName}}.', { clientName: 'Бат' })).toBe('Сайн байна уу, Бат.');
  });

  it('tolerates whitespace inside the braces', () => {
    expect(render('{{ caseCode }}', { caseCode: 'GKS-1' })).toBe('GKS-1');
  });

  it('renders a missing or empty value as an em dash rather than "undefined"', () => {
    expect(render('{{missing}}', {})).toBe('—');
    expect(render('{{empty}}', { empty: '' })).toBe('—');
    expect(render('{{zero}}', { zero: 0 })).toBe('0');
  });
});

describe('NOTIFICATION_TEMPLATES (1G-06)', () => {
  it('covers every event with an in-app template', () => {
    const inApp = new Set(
      NOTIFICATION_TEMPLATES.filter((row) => row.channel === NotificationChannel.IN_APP).map((row) => row.event),
    );
    for (const event of Object.values(NotificationEvent)) {
      expect(inApp.has(event), `${event} has no IN_APP template`).toBe(true);
    }
  });

  it('has no duplicate event × channel pair — the table enforces it too', () => {
    const seen = new Set<string>();
    for (const row of NOTIFICATION_TEMPLATES) {
      const key = `${row.event}:${row.channel}`;
      expect(seen.has(key), `duplicate ${key}`).toBe(false);
      seen.add(key);
    }
  });

  it('keeps SMS to the events where being late costs money or a place', () => {
    const smsEvents = NOTIFICATION_TEMPLATES.filter((row) => row.channel === NotificationChannel.SMS).map(
      (row) => row.event,
    );
    expect(smsEvents.sort()).toEqual(
      [
        NotificationEvent.DOCUMENT_DEADLINE_NEAR,
        NotificationEvent.CONTRACT_CONFIRMED,
        NotificationEvent.PAYMENT_DUE,
        NotificationEvent.PAYMENT_CONFIRMED,
        NotificationEvent.APPLICATION_RESULT,
        NotificationEvent.INVITATION_RECEIVED,
        NotificationEvent.VISA_APPOINTMENT_DUE,
        NotificationEvent.VISA_RESULT,
        NotificationEvent.DEPARTURE_NEAR,
        // Missing an intake deadline loses the place outright (1H-09); the
        // other two admissions events stay off SMS.
        NotificationEvent.INTAKE_DEADLINE_NEAR,
      ].sort(),
    );
  });
});

describe('formatting helpers', () => {
  it('writes a date the Mongolian way', () => {
    expect(formatDateMn(new Date('2026-09-05T10:00:00Z'))).toBe('2026 оны 09 сарын 05');
  });

  /**
   * 1N-22 — deadlines are stored at end of day UTC. Read with local getters
   * under any `TZ` east of UTC they roll into the next day, and every reminder
   * printed the deadline one day late: the expensive direction.
   */
  it('reads an end-of-day UTC deadline as that day, not the next one', () => {
    const original = process.env.TZ;
    process.env.TZ = 'Asia/Ulaanbaatar';
    try {
      expect(formatDateMn(new Date('2027-01-17T23:59:59.000Z'))).toBe('2027 оны 01 сарын 17');
    } finally {
      process.env.TZ = original;
    }
  });

  it('renders null as an em dash instead of "Invalid Date"', () => {
    expect(formatDateMn(null)).toBe('—');
    expect(formatAmountMn(null)).toBe('—');
  });

  it('groups amounts', () => {
    // `mn-MN` groups with a non-breaking space, so compare the digits only.
    expect(formatAmountMn(1200000).replace(/\D/g, '')).toBe('1200000');
    expect(formatAmountMn(1200000)).not.toBe('1200000');
  });
});

describe('SmsBudgetService (1G-04)', () => {
  function harness(userSent: number, globalSent: number, perUser = 3, global = 500) {
    const prisma = {
      notification: { count: vi.fn().mockResolvedValueOnce(userSent).mockResolvedValueOnce(globalSent) },
    } as unknown as PrismaService;
    const config = {
      get: vi.fn((key: string) => (key === 'sms.dailyLimitPerUser' ? perUser : global)),
    } as unknown as ConfigService;
    return new SmsBudgetService(prisma, config);
  }

  it('lets a message through under both ceilings', async () => {
    await expect(harness(1, 10).blockReason('user-1')).resolves.toBeNull();
  });

  it('blocks once the recipient hit their daily cap', async () => {
    await expect(harness(3, 10).blockReason('user-1')).resolves.toContain('Хэрэглэгчийн');
  });

  it('blocks everyone once the platform cap is reached — the bill, not the person', async () => {
    await expect(harness(0, 500).blockReason('user-1')).resolves.toContain('нийт SMS');
  });
});

/**
 * 1N-22 — the row is written `PENDING` and only then enqueued. If Redis was
 * down the enqueue error was swallowed and the row sat `PENDING` forever — and
 * for a swept reminder its `dedupeKey` blocked every later attempt, so the
 * client was simply never told.
 */
describe('NotificationsService.requeueStale (1N-22)', () => {
  function harness(rows: { id: string }[], queueThrows = false) {
    const prisma = {
      notification: { findMany: vi.fn().mockResolvedValue(rows) },
    } as unknown as PrismaService;
    const config = { get: vi.fn().mockReturnValue('https://gksedu.mn') } as unknown as NestConfigService;
    const add = queueThrows
      ? vi.fn().mockRejectedValue(new Error('ECONNREFUSED'))
      : vi.fn().mockResolvedValue({});
    const queue = { add } as unknown as Queue;
    return { service: new NotificationsService(prisma, config, queue), prisma, add };
  }

  it('re-queues each stale row under its own id, so a job still queued is not duplicated', async () => {
    const { service, add } = harness([{ id: 'n1' }, { id: 'n2' }]);

    await expect(service.requeueStale()).resolves.toBe(2);
    expect(add).toHaveBeenCalledWith(
      expect.any(String),
      { notificationId: 'n1' },
      expect.objectContaining({ jobId: 'n1' }),
    );
  });

  it('asks only for PENDING rows on a channel the queue actually delivers', async () => {
    const { service, prisma } = harness([]);

    await service.requeueStale(new Date('2026-09-11T09:00:00.000Z'), 10 * 60 * 1000);

    expect(prisma.notification.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          status: NotificationStatus.PENDING,
          channel: { not: NotificationChannel.IN_APP },
          createdAt: { lt: new Date('2026-09-11T08:50:00.000Z') },
        }),
      }),
    );
  });

  it('stops at the first failure rather than logging the same outage 500 times', async () => {
    const { service, add } = harness([{ id: 'n1' }, { id: 'n2' }, { id: 'n3' }], true);

    await expect(service.requeueStale()).resolves.toBe(0);
    expect(add).toHaveBeenCalledTimes(1);
  });
});
