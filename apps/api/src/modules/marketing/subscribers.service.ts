import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { paginate } from '../../common/dto/pagination.dto.js';
import { SubscriberStatus, type Prisma } from '../../prisma/client.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import { BrevoService } from './brevo.service.js';
import { isMailable } from './marketing-audience.service.js';
import { normaliseEmail, signUnsubscribeToken, verifyUnsubscribeToken } from './unsubscribe-token.js';

/**
 * 1O — the newsletter list and the suppression list, which are one table.
 *
 * Nothing here ever deletes a row. An unsubscribe that removed the address
 * would let the next import put it straight back, and the next campaign would
 * mail somebody who has already said no — the one mistake that turns a mailing
 * list into a spam complaint.
 */
@Injectable()
export class SubscribersService {
  private readonly logger = new Logger(SubscribersService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly brevo: BrevoService,
    private readonly config: ConfigService,
  ) {}

  /** The link that goes in every campaign's footer and `List-Unsubscribe` header. */
  unsubscribeUrl(email: string): string {
    const base = (this.config.get<string>('notifications.appUrl') ?? '').replace(/\/$/, '');
    const token = signUnsubscribeToken(email, this.config.get<string>('jwt.secret')!);
    return `${base}/unsubscribe?token=${encodeURIComponent(token)}`;
  }

  /**
   * The public form. Idempotent on purpose — somebody who signs up twice gets
   * the same "бүртгэгдлээ", not an error about an address they cannot see.
   *
   * An address that previously unsubscribed *is* re-subscribed here: they are
   * standing in front of the form asking for it.
   */
  async subscribe(input: {
    email: string;
    name?: string | null;
    source?: string;
    tags?: string[];
    utm?: Prisma.InputJsonValue;
  }): Promise<{ email: string; status: SubscriberStatus }> {
    const email = normaliseEmail(input.email);

    const row = await this.prisma.emailSubscriber.upsert({
      where: { email },
      create: {
        email,
        name: input.name?.trim() || null,
        source: input.source ?? 'website',
        tags: input.tags ?? [],
        ...(input.utm ? { utm: input.utm } : {}),
      },
      update: {
        status: SubscriberStatus.SUBSCRIBED,
        unsubscribedAt: null,
        ...(input.name?.trim() ? { name: input.name.trim() } : {}),
        ...(input.tags?.length ? { tags: input.tags } : {}),
      },
    });

    // Brevo being down must not lose the subscription: the row is already
    // written, and the manual sync picks up anything `brevoSyncedAt` missed.
    void this.pushToBrevo(row.id, email, row.name).catch((error: unknown) => {
      this.logger.warn(`Brevo руу захиалагч илгээж чадсангүй: ${String(error)}`);
    });

    return { email: row.email, status: row.status };
  }

  /**
   * @returns the address that was unsubscribed, or `null` for a tampered link.
   */
  async unsubscribeByToken(token: string): Promise<string | null> {
    const email = verifyUnsubscribeToken(token, this.config.get<string>('jwt.secret')!);
    if (!email) return null;

    await this.prisma.emailSubscriber.upsert({
      where: { email },
      // A client who never joined the newsletter still gets a row — that row
      // *is* the record of their "no", and it is what every audience checks.
      create: {
        email,
        source: 'unsubscribe',
        status: SubscriberStatus.UNSUBSCRIBED,
        unsubscribedAt: new Date(),
      },
      update: { status: SubscriberStatus.UNSUBSCRIBED, unsubscribedAt: new Date() },
    });

    void this.brevo.blocklistContact(email).catch((error: unknown) => {
      this.logger.warn(`Brevo дээр блоклож чадсангүй: ${String(error)}`);
    });

    return email;
  }

  /** Staff-side: mark an address unsubscribed by hand ("залгаад хүсэлт гаргасан"). */
  async setStatus(id: string, status: SubscriberStatus) {
    return this.prisma.emailSubscriber.update({
      where: { id },
      data: {
        status,
        unsubscribedAt: status === SubscriberStatus.SUBSCRIBED ? null : new Date(),
      },
    });
  }

  async list(query: { page: number; limit: number; skip: number; status?: SubscriberStatus; search?: string }) {
    const where: Prisma.EmailSubscriberWhereInput = {
      ...(query.status ? { status: query.status } : {}),
      ...(query.search
        ? {
            OR: [
              { email: { contains: query.search, mode: 'insensitive' as const } },
              { name: { contains: query.search, mode: 'insensitive' as const } },
            ],
          }
        : {}),
    };

    // Read-only pair under `Promise.all`, never `$transaction` (CLAUDE.md §8).
    const [items, total] = await Promise.all([
      this.prisma.emailSubscriber.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: query.skip,
        take: query.limit,
      }),
      this.prisma.emailSubscriber.count({ where }),
    ]);

    return paginate(items, total, query.page, query.limit);
  }

  async stats(): Promise<{ subscribed: number; unsubscribed: number; bounced: number }> {
    const rows = await this.prisma.emailSubscriber.groupBy({ by: ['status'], _count: { _all: true } });
    const of = (status: SubscriberStatus) =>
      rows.find((row) => row.status === status)?._count._all ?? 0;

    return {
      subscribed: of(SubscriberStatus.SUBSCRIBED),
      unsubscribed: of(SubscriberStatus.UNSUBSCRIBED),
      bounced: of(SubscriberStatus.BOUNCED),
    };
  }

  /**
   * Pushes the whole live list into the Brevo contact list, so the office can
   * also build a campaign inside Brevo's own designer. One import call per 500
   * rather than one HTTP call per contact.
   */
  async syncToBrevo(): Promise<{ synced: number; skipped: number }> {
    const rows = await this.prisma.emailSubscriber.findMany({
      where: { status: SubscriberStatus.SUBSCRIBED },
      select: { id: true, email: true, name: true },
    });

    const mailable = rows.filter((row) => isMailable(row.email));
    const synced = await this.brevo.importContacts(
      mailable.map((row) => ({ email: row.email, firstName: row.name })),
    );

    if (synced) {
      await this.prisma.emailSubscriber.updateMany({
        where: { id: { in: mailable.map((row) => row.id) } },
        data: { brevoSyncedAt: new Date() },
      });
    }

    return { synced, skipped: rows.length - mailable.length };
  }

  private async pushToBrevo(id: string, email: string, name: string | null): Promise<void> {
    if (!this.brevo.enabled) return;
    await this.brevo.upsertContact({ email, firstName: name });
    await this.prisma.emailSubscriber.update({ where: { id }, data: { brevoSyncedAt: new Date() } });
  }
}
