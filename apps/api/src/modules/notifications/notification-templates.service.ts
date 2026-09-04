import { Injectable, Logger, NotFoundException } from '@nestjs/common';
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
export class NotificationTemplatesService {
  private readonly logger = new Logger(NotificationTemplatesService.name);

  constructor(private readonly prisma: PrismaService) {}

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

  /** Idempotent — safe to call on every boot and from the seed script. */
  async seedDefaults(): Promise<{ created: number; existing: number }> {
    let created = 0;
    let existing = 0;

    for (const template of NOTIFICATION_TEMPLATES) {
      const result = await this.prisma.notificationTemplate.upsert({
        where: { event_channel: { event: template.event, channel: template.channel } },
        create: {
          event: template.event,
          channel: template.channel,
          titleMn: template.titleMn,
          bodyMn: template.bodyMn,
          linkMn: template.linkMn ?? null,
        },
        // An empty update still returns the row — this is a "create if missing"
        // that never clobbers an admin's edited wording.
        update: {},
        select: { createdAt: true, updatedAt: true },
      });

      if (result.createdAt.getTime() === result.updatedAt.getTime()) created += 1;
      else existing += 1;
    }

    this.logger.log(`Мэдэгдлийн загвар: ${created} шинэ, ${existing} хэвээр`);
    return { created, existing };
  }
}
