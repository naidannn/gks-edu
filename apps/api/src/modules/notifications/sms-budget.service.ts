import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NotificationChannel, NotificationStatus } from '../../prisma/client.js';
import { PrismaService } from '../../prisma/prisma.service.js';

/**
 * 1G-04 — SMS cost control.
 *
 * SMS is the only billed channel, so two ceilings apply before a message goes
 * out: one per recipient per day (stops a loop from texting one client twenty
 * times) and one for the whole platform per day (caps the daily bill).
 *
 * Counting reads the `notifications` table rather than a Redis counter: the
 * rows are the billing record, and a Redis flush must not silently reopen the
 * budget.
 */
@Injectable()
export class SmsBudgetService {
  private readonly logger = new Logger(SmsBudgetService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {}

  /** `null` when the message may go; a Mongolian reason when it may not. */
  async blockReason(userId: string, now: Date = new Date()): Promise<string | null> {
    const since = startOfDay(now);
    const perUser = this.config.get<number>('sms.dailyLimitPerUser') ?? 3;
    const global = this.config.get<number>('sms.dailyLimitGlobal') ?? 500;

    const [userSent, globalSent] = await Promise.all([
      this.prisma.notification.count({
        where: { userId, channel: NotificationChannel.SMS, status: NotificationStatus.SENT, sentAt: { gte: since } },
      }),
      this.prisma.notification.count({
        where: { channel: NotificationChannel.SMS, status: NotificationStatus.SENT, sentAt: { gte: since } },
      }),
    ]);

    if (globalSent >= global) {
      this.logger.warn(`Өдрийн SMS хязгаар (${global}) дүүрлээ`);
      return `Өдрийн нийт SMS хязгаар (${global}) дүүрсэн`;
    }
    if (userSent >= perUser) {
      return `Хэрэглэгчийн өдрийн SMS хязгаар (${perUser}) дүүрсэн`;
    }
    return null;
  }

  /** Today's SMS spend, for the admin dashboard. */
  async usage(now: Date = new Date()) {
    const since = startOfDay(now);
    const [sent, failed] = await Promise.all([
      this.prisma.notification.count({
        where: { channel: NotificationChannel.SMS, status: NotificationStatus.SENT, sentAt: { gte: since } },
      }),
      this.prisma.notification.count({
        where: { channel: NotificationChannel.SMS, status: NotificationStatus.FAILED, updatedAt: { gte: since } },
      }),
    ]);

    return {
      date: since,
      sent,
      failed,
      dailyLimit: this.config.get<number>('sms.dailyLimitGlobal') ?? 500,
      perUserLimit: this.config.get<number>('sms.dailyLimitPerUser') ?? 3,
    };
  }
}

function startOfDay(now: Date): Date {
  const day = new Date(now);
  day.setHours(0, 0, 0, 0);
  return day;
}
