import { ConflictException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import { DocStage, DocumentStatus, Necessity, NotificationEvent, Role } from '../../prisma/client.js';
import type { AuthenticatedUser } from '../../common/types/authenticated-user.js';
import type { PrismaService } from '../../prisma/prisma.service.js';
import type { NotificationsService } from '../notifications/notifications.service.js';
import { CaseDocumentsService } from './case-documents.service.js';
import { ReviewAction } from './dto/case-document.dto.js';
import type { RequirementsService } from './requirements.service.js';

const STAFF = { id: 'staff-1', role: Role.DOC_OFFICER } as unknown as AuthenticatedUser;
const CLIENT = { id: 'student-1', role: Role.USER } as unknown as AuthenticatedUser;

/** A `P2025` from Prisma: the `where` matched nothing, so somebody moved first. */
function missingRecord() {
  return Object.assign(new Error('Record to update not found'), { code: 'P2025' });
}

function harness(overrides: Partial<Record<string, unknown>> = {}) {
  const prisma = {
    caseDocument: {
      findUnique: vi.fn(),
      findMany: vi.fn().mockResolvedValue([]),
      update: vi.fn().mockResolvedValue({ id: 'doc-1' }),
      count: vi.fn().mockResolvedValue(0),
      create: vi.fn().mockResolvedValue({ id: 'doc-new' }),
      findFirst: vi.fn().mockResolvedValue(null),
    },
    documentReviewNote: { create: vi.fn().mockResolvedValue({}) },
    case: { findUnique: vi.fn().mockResolvedValue({ userId: 'student-1' }) },
    $transaction: vi.fn().mockImplementation((writes: unknown[]) => Promise.resolve(writes)),
    ...overrides,
  } as unknown as PrismaService;

  const requirements = { resolveForCase: vi.fn().mockResolvedValue({}) } as unknown as RequirementsService;
  const notifications = { dispatch: vi.fn().mockResolvedValue(1) } as unknown as NotificationsService;

  return { service: new CaseDocumentsService(prisma, requirements, notifications), prisma, notifications };
}

/**
 * 1N-24 — the write used to address the row by id alone, so two officers who
 * opened the same submission both succeeded and the client was told the paper
 * was accepted *and* needed fixing. The `where` now re-checks the status this
 * call read, the way `PaymentsService.confirmPayment` claims a payment.
 */
describe('CaseDocumentsService.applyStatus — one officer wins (1N-24)', () => {
  it('scopes the write to the status it read', async () => {
    const { service, prisma } = harness();

    await service.applyStatus('doc-1', DocumentStatus.SUBMITTED, DocumentStatus.UNDER_REVIEW, 'staff-1', null);

    expect(prisma.caseDocument.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'doc-1', status: DocumentStatus.SUBMITTED } }),
    );
  });

  it('turns the lost race into a 409 rather than a silent second verdict', async () => {
    const { service, prisma } = harness();
    (prisma.caseDocument.update as unknown as ReturnType<typeof vi.fn>).mockRejectedValue(missingRecord());

    await expect(
      service.applyStatus('doc-1', DocumentStatus.SUBMITTED, DocumentStatus.UNDER_REVIEW, 'staff-1', null),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('batches only when there is a note to write alongside — the database is 115 ms away', async () => {
    const { service, prisma } = harness();

    await service.applyStatus('doc-1', DocumentStatus.SUBMITTED, DocumentStatus.UNDER_REVIEW, 'staff-1', null);
    expect(prisma.$transaction).not.toHaveBeenCalled();

    await service.applyStatus('doc-1', DocumentStatus.UNDER_REVIEW, DocumentStatus.NEEDS_FIX, 'staff-1', 'Тодорхойгүй байна');
    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
  });
});

/**
 * 1N-21 — when the school asks again for a paper we already sent, the row used
 * to come back untouched: still "Сургуульд илгээсэн", still counted as settled,
 * nothing for the client to do — while the email named it.
 */
describe('CaseDocumentsService.createManual — a re-request reopens a settled document (1N-21)', () => {
  it('moves a sent document back to RESUBMIT_REQUIRED', async () => {
    const { service, prisma } = harness();
    (prisma.caseDocument.findUnique as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: 'doc-1',
      status: DocumentStatus.SENT_TO_UNIVERSITY,
      necessity: Necessity.REQUIRED,
      dueAt: null,
    });

    await service.createManual('case-1', { templateId: 'tpl-1', stage: DocStage.ADMISSION });

    expect(prisma.caseDocument.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'doc-1', status: DocumentStatus.SENT_TO_UNIVERSITY },
        data: expect.objectContaining({ status: DocumentStatus.RESUBMIT_REQUIRED }),
      }),
    );
  });

  it('leaves a document the client is still working on where it stands', async () => {
    const { service, prisma } = harness();
    (prisma.caseDocument.findUnique as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: 'doc-1',
      status: DocumentStatus.IN_PROGRESS,
      necessity: Necessity.REQUIRED,
      dueAt: null,
    });

    await service.createManual('case-1', { templateId: 'tpl-1', stage: DocStage.ADMISSION });

    const calls = (prisma.caseDocument.update as unknown as ReturnType<typeof vi.fn>).mock.calls as [{ data: Record<string, unknown> }][];
    expect(calls).toHaveLength(1);
    expect(calls[0]![0].data).not.toHaveProperty('status');
  });
});

/**
 * 1N-21 — the approval email counted required *and* conditional documents across
 * both stages, while the cabinet's progress bar counts required ones per stage.
 * The client read two different numbers for the same checklist.
 */
describe('CaseDocumentsService.review — the email counts what the cabinet counts (1N-21)', () => {
  it('names the remaining required documents of this stage only', async () => {
    const { service, prisma, notifications } = harness();
    (prisma.caseDocument.findUnique as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: 'doc-1',
      stage: DocStage.ADMISSION,
      status: DocumentStatus.UNDER_REVIEW,
      deletedAt: null,
      template: { nameMn: 'Гадаад паспорт', needsTranslation: false },
      case: { id: 'case-1', code: 'GKS-2026-0001', userId: 'student-1' },
    });
    // Two required on this stage, one of them settled.
    (prisma.caseDocument.findMany as unknown as ReturnType<typeof vi.fn>).mockResolvedValue([
      { necessity: Necessity.REQUIRED, status: DocumentStatus.ACCEPTED },
      { necessity: Necessity.REQUIRED, status: DocumentStatus.NOT_STARTED },
      { necessity: Necessity.OPTIONAL, status: DocumentStatus.NOT_STARTED },
    ]);

    await service.review('doc-1', { action: ReviewAction.ACCEPT }, STAFF);

    expect(prisma.caseDocument.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ caseId: 'case-1', stage: DocStage.ADMISSION }) }),
    );
    expect(notifications.dispatch).toHaveBeenCalledWith(
      expect.objectContaining({
        event: NotificationEvent.DOCUMENT_APPROVED,
        context: expect.objectContaining({ remainingCount: '1 материал' }),
      }),
    );
  });
});

/**
 * 1N-25 — the checklist include shipped back-office `WorkTask` rows to the
 * cabinet. It is one query either way; the client's copy simply arrives without
 * them.
 */
describe('CaseDocumentsService.checklist — the cabinet gets no back-office rows (1N-25)', () => {
  const rows = [
    {
      id: 'doc-1',
      necessity: Necessity.REQUIRED,
      status: DocumentStatus.NOT_STARTED,
      workTasks: [{ id: 'task-1', title: 'Орчуулга захиалах' }],
      files: [],
    },
  ];

  it('strips the work tasks for a client', async () => {
    const { service, prisma } = harness();
    (prisma.caseDocument.findMany as unknown as ReturnType<typeof vi.fn>).mockResolvedValue(rows);

    const { documents } = await service.checklist('case-1', DocStage.ADMISSION, CLIENT);

    expect(documents[0]).not.toHaveProperty('workTasks');
  });

  it('keeps them for staff', async () => {
    const { service, prisma } = harness();
    (prisma.caseDocument.findMany as unknown as ReturnType<typeof vi.fn>).mockResolvedValue(rows);

    const { documents } = await service.checklist('case-1', DocStage.ADMISSION, STAFF);

    expect(documents[0]).toHaveProperty('workTasks');
  });

  it('never selects the storage path — bytes are reached through a signed token (§9)', async () => {
    const { service, prisma } = harness();
    (prisma.caseDocument.findMany as unknown as ReturnType<typeof vi.fn>).mockResolvedValue([]);

    await service.checklist('case-1', DocStage.ADMISSION, CLIENT);

    const [[args]] = (prisma.caseDocument.findMany as unknown as ReturnType<typeof vi.fn>).mock.calls as [
      { include: { files: { select: Record<string, unknown> } } },
    ][];
    expect(args.include.files.select).not.toHaveProperty('path');
  });
});

/**
 * 1N-25 — the `stage` parameter on the questionnaire endpoint is a staff handle.
 * A client asking for `VISA` materialised a visa checklist for a visa case that
 * does not exist yet.
 */
describe('CaseDocumentsService.upsertConditions — a client only re-resolves admission (1N-25)', () => {
  it('forces the admission stage for a client', async () => {
    const { prisma } = harness({ caseConditions: { upsert: vi.fn().mockResolvedValue({}) } });
    const requirements = { resolveForCase: vi.fn().mockResolvedValue({}) } as unknown as RequirementsService;
    const notifications = { dispatch: vi.fn() } as unknown as NotificationsService;
    const scoped = new CaseDocumentsService(prisma, requirements, notifications);

    await scoped.upsertConditions('case-1', {}, CLIENT, DocStage.VISA);

    expect(requirements.resolveForCase).toHaveBeenCalledWith('case-1', DocStage.ADMISSION, 'student-1');
  });

  it('lets staff resolve the stage they asked for', async () => {
    const { prisma } = harness({ caseConditions: { upsert: vi.fn().mockResolvedValue({}) } });
    const requirements = { resolveForCase: vi.fn().mockResolvedValue({}) } as unknown as RequirementsService;
    const notifications = { dispatch: vi.fn() } as unknown as NotificationsService;
    const scoped = new CaseDocumentsService(prisma, requirements, notifications);

    await scoped.upsertConditions('case-1', {}, STAFF, DocStage.VISA);

    expect(requirements.resolveForCase).toHaveBeenCalledWith('case-1', DocStage.VISA, 'staff-1');
  });
});
