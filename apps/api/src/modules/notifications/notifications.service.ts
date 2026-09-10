import { InjectQueue } from '@nestjs/bullmq';
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Queue } from 'bullmq';
import { PaginationQueryDto, paginate } from '../../common/dto/pagination.dto.js';
import {
  NotificationChannel,
  NotificationEvent,
  NotificationStatus,
  type Prisma,
} from '../../prisma/client.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import {
  NOTIFICATION_DELIVER_JOB,
  NOTIFICATION_QUEUE,
  NOTIFICATION_STALE_AFTER_MS,
} from '../../queue/queue.constants.js';

/** Values a template may interpolate. Everything is stringified before render. */
export type NotificationContext = Record<string, string | number | null | undefined>;

export interface DispatchInput {
  event: NotificationEvent;
  /** Recipients — duplicates are collapsed, missing users are skipped. */
  userIds: string[];
  context?: NotificationContext;
  caseId?: string | null;
  leadId?: string | null;
  /**
   * Stable per (event, recipient, subject) — a scheduled sweep passes one so
   * running twice a day still notifies once. Omit for user-triggered events.
   */
  dedupeSubject?: string;
}

/**
 * 1G-02 — the dispatcher.
 *
 * `dispatch()` is deliberately fire-and-forget from the caller's point of
 * view: a business action must not fail because a template is missing or the
 * queue is down. It writes `Notification` rows (the durable record) and hands
 * their ids to BullMQ; the processor does the actual sending.
 */
@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    @InjectQueue(NOTIFICATION_QUEUE) private readonly queue: Queue,
  ) {}

  /** Returns how many `Notification` rows this actually created — a repeated
   *  scheduled sweep dedupes to 0, which is what the sweep report should say. */
  async dispatch(input: DispatchInput): Promise<number> {
    try {
      const created = await this.dispatchOrThrow(input);
      return created.length;
    } catch (error) {
      this.logger.error(
        `Мэдэгдэл илгээхэд алдаа гарлаа (${input.event})`,
        error instanceof Error ? error.stack : String(error),
      );
      return 0;
    }
  }

  /** Same as {@link dispatch} but surfaces failures — used by tests and admin retries. */
  async dispatchOrThrow(input: DispatchInput): Promise<string[]> {
    const userIds = [...new Set(input.userIds.filter(Boolean))];
    if (!userIds.length) return [];

    const templates = await this.prisma.notificationTemplate.findMany({
      where: { event: input.event, isActive: true },
    });
    if (!templates.length) {
      this.logger.warn(`"${input.event}" үйл явдалд идэвхтэй загвар алга`);
      return [];
    }

    const recipients = await this.prisma.user.findMany({
      where: { id: { in: userIds }, isActive: true },
      select: {
        id: true,
        name: true,
        email: true,
        phone: true,
        notificationPreferences: { select: { channel: true, enabled: true } },
      },
    });

    const created: string[] = [];

    for (const recipient of recipients) {
      const off = new Set(
        recipient.notificationPreferences.filter((pref) => !pref.enabled).map((pref) => pref.channel),
      );

      for (const template of templates) {
        const context: NotificationContext = {
          clientName: recipient.name ?? 'Эрхэм харилцагч',
          ...input.context,
        };
        const link = template.linkMn ? this.absoluteLink(render(template.linkMn, context)) : null;
        const body = render(template.bodyMn, { ...context, link: link ?? '' });
        const title = render(template.titleMn, context);

        const status = this.initialStatus(template.channel, off, recipient);
        const dedupeKey = input.dedupeSubject
          ? `${input.event}:${template.channel}:${recipient.id}:${input.dedupeSubject}`.slice(0, 200)
          : null;

        const data: Prisma.NotificationUncheckedCreateInput = {
          userId: recipient.id,
          event: input.event,
          channel: template.channel,
          templateId: template.id,
          title: title.slice(0, 200),
          body,
          link: link?.slice(0, 300) ?? null,
          caseId: input.caseId ?? null,
          leadId: input.leadId ?? null,
          meta: (input.context ?? {}) as Prisma.InputJsonValue,
          status,
          // In-app is delivered by the act of writing the row, so it is sent
          // now; the queue stamps the other channels when they actually go.
          sentAt: status === NotificationStatus.SENT ? new Date() : null,
          dedupeKey,
        };

        // `dedupeKey` is unique, so a repeated sweep collides instead of
        // duplicating. `skipDuplicates`-style handling without a transaction.
        const row = dedupeKey
          ? await this.prisma.notification
              .create({ data })
              .catch((error: unknown) => (isUniqueViolation(error) ? null : Promise.reject(error)))
          : await this.prisma.notification.create({ data });

        if (!row) continue;
        created.push(row.id);

        if (status === NotificationStatus.PENDING && template.channel !== NotificationChannel.IN_APP) {
          // The row is the durable record; the queue is only how it moves. A
          // Redis outage must not abort the remaining recipients — the row
          // stays PENDING and `requeueStale` picks it up (1N-22).
          try {
            await this.enqueue(row.id);
          } catch (error) {
            this.logger.error(
              `Мэдэгдэл ${row.id}-г дараалалд оруулж чадсангүй`,
              error instanceof Error ? error.stack : String(error),
            );
          }
        }
      }
    }

    return created;
  }

  /**
   * Re-queues rows that were written `PENDING` and never reached BullMQ.
   *
   * Without this the row sits `PENDING` forever, and for a swept reminder its
   * `dedupeKey` blocks every later attempt — the client is simply never told.
   * The row id is the job id, so a job that is still queued or still in the
   * failed set is not duplicated (1N-22).
   */
  async requeueStale(now: Date = new Date(), olderThanMs: number = NOTIFICATION_STALE_AFTER_MS): Promise<number> {
    const stale = await this.prisma.notification.findMany({
      where: {
        status: NotificationStatus.PENDING,
        channel: { not: NotificationChannel.IN_APP },
        createdAt: { lt: new Date(now.getTime() - olderThanMs) },
      },
      select: { id: true },
      orderBy: { createdAt: 'asc' },
      take: 500,
    });

    let requeued = 0;
    for (const row of stale) {
      try {
        await this.enqueue(row.id);
        requeued += 1;
      } catch (error) {
        // Redis is still down — stop rather than log the same failure 500 times.
        this.logger.error(
          'Хүлээгдэж буй мэдэгдлүүдийг дараалалд буцаах боломжгүй',
          error instanceof Error ? error.stack : String(error),
        );
        break;
      }
    }

    if (requeued) this.logger.log(`${requeued} хүлээгдэж буй мэдэгдлийг дараалалд буцаалаа`);
    return requeued;
  }

  /** One place decides the job's id and retry policy, so a re-queue matches it. */
  private async enqueue(notificationId: string): Promise<void> {
    await this.queue.add(
      NOTIFICATION_DELIVER_JOB,
      { notificationId },
      { jobId: notificationId, attempts: 3, backoff: { type: 'exponential', delay: 30_000 }, removeOnComplete: true },
    );
  }

  /**
   * Dispatch to a case's client with the `{ caseId, caseCode, universityName }`
   * every case-scoped template interpolates — one query in one place instead of
   * a re-read of the case plus a repeated `?? 'Сургууль'` at each caller
   * (1N-52). A caller that already holds the case passes its own context.
   */
  async dispatchForCase(
    caseId: string,
    event: NotificationEvent,
    context: NotificationContext = {},
  ): Promise<number> {
    const gksCase = await this.prisma.case.findUnique({
      where: { id: caseId },
      select: { id: true, code: true, userId: true, university: { select: { nameMn: true } } },
    });
    if (!gksCase) {
      this.logger.warn(`Мэдэгдэл илгээх үйлчилгээ ${caseId} олдсонгүй (${event})`);
      return 0;
    }

    return this.dispatch({
      event,
      userIds: [gksCase.userId],
      caseId,
      context: {
        caseId: gksCase.id,
        caseCode: gksCase.code,
        universityName: gksCase.university?.nameMn ?? 'Сургууль',
        ...context,
      },
    });
  }

  /**
   * In-app is delivered by the act of writing the row. Email/SMS need an
   * address and the recipient's consent; PUSH has no provider yet (§10).
   */
  private initialStatus(
    channel: NotificationChannel,
    off: Set<NotificationChannel>,
    recipient: { email: string | null; phone: string | null },
  ): NotificationStatus {
    if (channel === NotificationChannel.IN_APP) return NotificationStatus.SENT;
    if (off.has(channel)) return NotificationStatus.SKIPPED;
    if (channel === NotificationChannel.EMAIL && !recipient.email) return NotificationStatus.SKIPPED;
    if (channel === NotificationChannel.SMS && !recipient.phone) return NotificationStatus.SKIPPED;
    if (channel === NotificationChannel.PUSH) return NotificationStatus.SKIPPED;
    return NotificationStatus.PENDING;
  }

  private absoluteLink(path: string): string {
    if (/^https?:\/\//i.test(path)) return path;
    const base = this.config.get<string>('notifications.appUrl') ?? '';
    return `${base.replace(/\/$/, '')}${path.startsWith('/') ? path : `/${path}`}`;
  }

  // ── In-app notification centre (1G-05) ───────────────────────────────────

  async listForUser(userId: string, query: PaginationQueryDto & { unreadOnly?: boolean }) {
    const where: Prisma.NotificationWhereInput = {
      userId,
      channel: NotificationChannel.IN_APP,
      ...(query.unreadOnly ? { readAt: null } : {}),
    };

    const [items, total, unread] = await Promise.all([
      this.prisma.notification.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: query.skip,
        take: query.limit,
      }),
      this.prisma.notification.count({ where }),
      this.unreadCount(userId),
    ]);

    return { ...paginate(items, total, query.page, query.limit), unread };
  }

  async unreadCount(userId: string): Promise<number> {
    return this.prisma.notification.count({
      where: { userId, channel: NotificationChannel.IN_APP, readAt: null },
    });
  }

  async markRead(userId: string, id: string): Promise<{ id: string; readAt: Date | null }> {
    const now = new Date();
    // `updateMany` scopes the write to the owner — a plain `update` by id would
    // let one user mark another user's notification read.
    await this.prisma.notification.updateMany({
      where: { id, userId, readAt: null },
      data: { readAt: now },
    });
    return { id, readAt: now };
  }

  async markAllRead(userId: string): Promise<{ updated: number }> {
    const result = await this.prisma.notification.updateMany({
      where: { userId, channel: NotificationChannel.IN_APP, readAt: null },
      data: { readAt: new Date() },
    });
    return { updated: result.count };
  }

  // ── Channel preferences ──────────────────────────────────────────────────

  async getPreferences(userId: string) {
    const rows = await this.prisma.notificationPreference.findMany({ where: { userId } });
    const off = new Map(rows.map((row) => [row.channel, row.enabled]));
    // In-app is not switchable (§10) and so is not listed.
    return [NotificationChannel.EMAIL, NotificationChannel.SMS].map((channel) => ({
      channel,
      enabled: off.get(channel) ?? true,
    }));
  }

  async setPreference(userId: string, channel: NotificationChannel, enabled: boolean) {
    if (channel === NotificationChannel.IN_APP) {
      // Silently normalise rather than 400: the UI never offers the switch.
      return { channel, enabled: true };
    }
    await this.prisma.notificationPreference.upsert({
      where: { userId_channel: { userId, channel } },
      create: { userId, channel, enabled },
      update: { enabled },
    });
    return { channel, enabled };
  }
}

/** Replaces `{{key}}` with the context value; unknown keys become `—`. */
export function render(template: string, context: NotificationContext): string {
  return template.replace(/\{\{\s*([\w.]+)\s*\}\}/g, (_match, key: string) => {
    const value = context[key];
    if (value === null || value === undefined || value === '') return '—';
    return String(value);
  });
}

function isUniqueViolation(error: unknown): boolean {
  return typeof error === 'object' && error !== null && (error as { code?: string }).code === 'P2002';
}
