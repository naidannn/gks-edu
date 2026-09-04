import { Injectable, Logger } from '@nestjs/common';
import { DocumentStatus, Necessity } from '../../prisma/client.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import { REMINDER_OFFSET_DAYS } from '../../queue/queue.constants.js';
import { SETTLED_STATUSES } from './document-status.js';

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * 1D-12 — deadline sweep. A `DocumentReminder` row *is* the idempotency key:
 * `@@unique([caseDocumentId, offsetDays])` means the daily job may run many
 * times and still raise D-7 once.
 *
 * Delivery (email/SMS/in-app) is the notification dispatcher's job (1G-02);
 * what this owns is deciding *what* is due and recording that it was raised.
 */
@Injectable()
export class DocumentRemindersService {
  private readonly logger = new Logger(DocumentRemindersService.name);

  constructor(private readonly prisma: PrismaService) {}

  /** Returns the reminders newly raised by this sweep. */
  async sweep(now: Date = new Date()) {
    const horizon = new Date(now.getTime() + Math.max(...REMINDER_OFFSET_DAYS) * DAY_MS);

    const due = await this.prisma.caseDocument.findMany({
      where: {
        deletedAt: null,
        necessity: Necessity.REQUIRED,
        dueAt: { not: null, lte: horizon },
        status: { notIn: SETTLED_STATUSES as DocumentStatus[] },
      },
      select: { id: true, dueAt: true, reminders: { select: { offsetDays: true } } },
    });

    const raised: { caseDocumentId: string; offsetDays: number }[] = [];

    for (const doc of due) {
      if (!doc.dueAt) continue;
      const daysLeft = Math.ceil((doc.dueAt.getTime() - now.getTime()) / DAY_MS);
      const already = new Set(doc.reminders.map((reminder) => reminder.offsetDays));
      // Past the deadline, D-1 still stands as the last reminder raised.
      const offset = REMINDER_OFFSET_DAYS.find((candidate) => daysLeft <= candidate && !already.has(candidate));
      if (offset === undefined) continue;

      await this.prisma.documentReminder.create({ data: { caseDocumentId: doc.id, offsetDays: offset, dueAt: doc.dueAt } });
      raised.push({ caseDocumentId: doc.id, offsetDays: offset });
    }

    if (raised.length) this.logger.log(`Материалын ${raised.length} сануулга үүслээ`);
    return raised;
  }

  /** What staff should chase today (1D-16 sidebar). */
  async upcoming(withinDays = 7) {
    return this.prisma.caseDocument.findMany({
      where: {
        deletedAt: null,
        necessity: Necessity.REQUIRED,
        dueAt: { not: null, lte: new Date(Date.now() + withinDays * DAY_MS) },
        status: { notIn: SETTLED_STATUSES as DocumentStatus[] },
      },
      include: {
        template: { select: { code: true, nameMn: true } },
        case: { select: { id: true, code: true, user: { select: { id: true, name: true } } } },
      },
      orderBy: { dueAt: 'asc' },
      take: 100,
    });
  }
}
