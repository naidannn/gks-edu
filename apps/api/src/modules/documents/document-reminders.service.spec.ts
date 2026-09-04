import { describe, expect, it, vi } from 'vitest';
import { DocumentStatus, Necessity } from '../../prisma/client.js';
import type { PrismaService } from '../../prisma/prisma.service.js';
import { DocumentRemindersService } from './document-reminders.service.js';

const NOW = new Date('2026-09-04T00:00:00Z');
const DAY = 86_400_000;

function prismaStub(documents: { id: string; dueAt: Date | null; reminders: { offsetDays: number }[] }[]) {
  const prisma = {
    caseDocument: { findMany: vi.fn().mockResolvedValue(documents) },
    documentReminder: { create: vi.fn().mockResolvedValue({}) },
  };
  return prisma as unknown as PrismaService & typeof prisma;
}

/** 1D-12 — the daily sweep. The `DocumentReminder` row is the idempotency key. */
describe('DocumentRemindersService.sweep', () => {
  it('raises D-7 first for a document a week out', async () => {
    const prisma = prismaStub([{ id: 'd1', dueAt: new Date(NOW.getTime() + 7 * DAY), reminders: [] }]);

    const raised = await new DocumentRemindersService(prisma).sweep(NOW);

    expect(raised).toEqual([{ caseDocumentId: 'd1', offsetDays: 7 }]);
  });

  it('skips an offset already raised and moves to the next one', async () => {
    const prisma = prismaStub([{ id: 'd1', dueAt: new Date(NOW.getTime() + 3 * DAY), reminders: [{ offsetDays: 7 }] }]);

    const raised = await new DocumentRemindersService(prisma).sweep(NOW);

    expect(raised).toEqual([{ caseDocumentId: 'd1', offsetDays: 3 }]);
  });

  it('raises nothing on a second run the same day', async () => {
    const prisma = prismaStub([
      { id: 'd1', dueAt: new Date(NOW.getTime() + 3 * DAY), reminders: [{ offsetDays: 7 }, { offsetDays: 3 }] },
    ]);

    expect(await new DocumentRemindersService(prisma).sweep(NOW)).toEqual([]);
    expect(prisma.documentReminder.create).not.toHaveBeenCalled();
  });

  it('still raises D-1 once a deadline has passed', async () => {
    const prisma = prismaStub([{ id: 'd1', dueAt: new Date(NOW.getTime() - 2 * DAY), reminders: [{ offsetDays: 7 }, { offsetDays: 3 }] }]);

    expect(await new DocumentRemindersService(prisma).sweep(NOW)).toEqual([{ caseDocumentId: 'd1', offsetDays: 1 }]);
  });

  it('only looks at required, unsettled documents that carry a deadline', async () => {
    const prisma = prismaStub([]);

    await new DocumentRemindersService(prisma).sweep(NOW);

    expect(prisma.caseDocument.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          deletedAt: null,
          necessity: Necessity.REQUIRED,
          status: { notIn: expect.arrayContaining([DocumentStatus.ACCEPTED, DocumentStatus.READY]) },
        }),
      }),
    );
  });
});
