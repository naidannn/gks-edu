import { Injectable, Logger, NotFoundException, type OnApplicationBootstrap } from '@nestjs/common';
import type { NotificationChannel, NotificationEvent } from '../../prisma/client.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import { NOTIFICATION_TEMPLATES } from './notification-templates.data.js';

/**
 * 1G-06 — template administration.
 *
 * `seedDefaults()` inserts anything missing and leaves existing rows alone: an
 * admin's wording must survive a deploy.
 */
@Injectable()
export class NotificationTemplatesService implements OnApplicationBootstrap {
  private readonly logger = new Logger(NotificationTemplatesService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Seeding on boot, not only from `prisma db seed`: a release that adds an
   * event ships its templates with it. Without this the new event dispatches
   * into nothing on the first deploy and the mail is silently never sent —
   * `dispatch()` only warns. Failure is logged, never fatal: the API must come
   * up even if this one write cannot.
   */
  async onApplicationBootstrap(): Promise<void> {
    try {
      await this.seedDefaults();
    } catch (error) {
      this.logger.error(
        'Мэдэгдлийн загварыг ачаалах үед үүсгэж чадсангүй',
        error instanceof Error ? error.stack : String(error),
      );
    }
  }

  async list(filter: { event?: NotificationEvent; channel?: NotificationChannel } = {}) {
    return this.prisma.notificationTemplate.findMany({
      where: {
        ...(filter.event ? { event: filter.event } : {}),
        ...(filter.channel ? { channel: filter.channel } : {}),
      },
      orderBy: [{ event: 'asc' }, { channel: 'asc' }],
    });
  }

  async update(
    id: string,
    patch: { titleMn?: string; bodyMn?: string; linkMn?: string; isActive?: boolean },
  ) {
    const existing = await this.prisma.notificationTemplate.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('Мэдэгдлийн загвар олдсонгүй');

    return this.prisma.notificationTemplate.update({ where: { id }, data: patch });
  }

  /**
   * Idempotent — safe to call on every boot and from the seed script.
   *
   * One `createMany` with `skipDuplicates`, not 58 `upsert`s: the unique
   * `event_channel` index turns this into a single `INSERT ... ON CONFLICT DO
   * NOTHING`, which is exactly "create if missing, never clobber an admin's
   * wording". The loop it replaced ran 58 upserts one after another, and Prisma
   * emulates an upsert as an interactive transaction — six round trips each to
   * a pooler ~115 ms away. That is ~44 s, and it ran before `app.listen()`, so
   * the API did not answer on :3001 for the whole of it; a `nest --watch`
   * rebuild inside that window killed the process before it ever bound the port.
   */
  async seedDefaults(): Promise<{ created: number; existing: number }> {
    const { count: created } = await this.prisma.notificationTemplate.createMany({
      data: NOTIFICATION_TEMPLATES.map((template) => ({
        event: template.event,
        channel: template.channel,
        titleMn: template.titleMn,
        bodyMn: template.bodyMn,
        linkMn: template.linkMn ?? null,
      })),
      skipDuplicates: true,
    });

    const existing = NOTIFICATION_TEMPLATES.length - created;

    this.logger.log(`Мэдэгдлийн загвар: ${created} шинэ, ${existing} хэвээр`);
    return { created, existing };
  }
}
