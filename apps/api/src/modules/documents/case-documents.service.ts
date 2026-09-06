import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { paginate } from '../../common/dto/pagination.dto.js';
import { isStaff } from '../../common/constants/roles.js';
import type { AuthenticatedUser } from '../../common/types/authenticated-user.js';
import { type DocStage, DocumentStatus, Necessity, NotificationEvent, type Prisma } from '../../prisma/client.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import { restorePatch, softDeletePatch } from '../../prisma/soft-delete.js';
import { assertTransition, isClientTransition, SETTLED_STATUSES } from './document-status.js';
import type { UpsertCaseConditionsDto } from './dto/case-conditions.dto.js';
import {
  type AddDocumentNoteDto,
  type CreateCaseDocumentDto,
  type NewDocumentTemplateDto,
  type QueryCaseDocumentsDto,
  ReviewAction,
  type ReviewDocumentDto,
  type TransitionDocumentDto,
  type UpdateCaseDocumentDto,
} from './dto/case-document.dto.js';
import { toTemplateCode, uniqueTemplateCode } from './template-code.js';
import { NotificationsService } from '../notifications/notifications.service.js';
import { RequirementsService } from './requirements.service.js';

/** What each review verdict does to the document (gksedu.md §6.3). */
const REVIEW_TARGET: Record<ReviewAction, DocumentStatus> = {
  [ReviewAction.ACCEPT]: DocumentStatus.ACCEPTED,
  [ReviewAction.REQUEST_FIX]: DocumentStatus.NEEDS_FIX,
  [ReviewAction.RETURN]: DocumentStatus.RESUBMIT_REQUIRED,
};

const CHECKLIST_INCLUDE = {
  template: true,
  files: { where: { deletedAt: null }, orderBy: { version: 'desc' } },
  workTasks: { orderBy: { createdAt: 'desc' } },
} satisfies Prisma.CaseDocumentInclude;

export interface StageProgress {
  stage: DocStage;
  requiredTotal: number;
  requiredDone: number;
  /** 0–100, rounded. 100 when nothing is required yet. */
  percent: number;
  awaitingReview: number;
  needsFix: number;
}

/**
 * Everything a case's paperwork does after the rule engine has produced it:
 * the client's checklist, the 12-state machine (1D-07), staff review (1D-09)
 * and the progress figure shown on the case (1D-19).
 */
@Injectable()
export class CaseDocumentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly requirements: RequirementsService,
    private readonly notifications: NotificationsService,
  ) {}

  // ─── Conditions questionnaire (1D-06) ───────────────────────────────────────

  async getConditions(caseId: string, actor: AuthenticatedUser) {
    await this.assertCaseAccess(caseId, actor);
    return this.prisma.caseConditions.findUnique({ where: { caseId } });
  }

  /**
   * Saving an answer immediately re-resolves the checklist — swapping a sponsor
   * is exactly the case ARCHITECTURE.md §7.1 asks the engine to handle.
   */
  async upsertConditions(caseId: string, dto: UpsertCaseConditionsDto, actor: AuthenticatedUser, stage: DocStage) {
    await this.assertCaseAccess(caseId, actor);

    const conditions = await this.prisma.caseConditions.upsert({
      where: { caseId },
      create: { caseId, ...dto, answeredById: actor.id },
      update: { ...dto, answeredById: actor.id },
    });
    const resolution = await this.requirements.resolveForCase(caseId, stage);
    return { conditions, resolution };
  }

  // ─── Reading ────────────────────────────────────────────────────────────────

  /** The client-facing checklist (1D-13) — internal notes are filtered out. */
  async checklist(caseId: string, stage: DocStage, actor: AuthenticatedUser) {
    await this.assertCaseAccess(caseId, actor);
    const staff = isStaff(actor.role);

    const documents = await this.prisma.caseDocument.findMany({
      where: { caseId, stage, deletedAt: null },
      include: {
        ...CHECKLIST_INCLUDE,
        notes: {
          where: staff ? {} : { isInternal: false },
          orderBy: { createdAt: 'desc' },
          include: { author: { select: { id: true, name: true } } },
        },
      },
      orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
    });

    return { documents, progress: summarise(stage, documents) };
  }

  async progress(caseId: string, stage: DocStage): Promise<StageProgress> {
    const documents = await this.prisma.caseDocument.findMany({
      where: { caseId, stage, deletedAt: null },
      select: { necessity: true, status: true },
    });
    return summarise(stage, documents);
  }

  async findOne(id: string, actor: AuthenticatedUser) {
    const doc = await this.prisma.caseDocument.findUnique({
      where: { id },
      include: {
        ...CHECKLIST_INCLUDE,
        notes: {
          where: isStaff(actor.role) ? {} : { isInternal: false },
          orderBy: { createdAt: 'desc' },
          include: { author: { select: { id: true, name: true } } },
        },
        case: { select: { id: true, code: true, userId: true, serviceType: true } },
      },
    });
    if (!doc || doc.deletedAt) throw new NotFoundException(`Материал ${id} олдсонгүй`);
    this.assertOwnership(doc.case.userId, actor);
    return doc;
  }

  /** The staff review queue (1D-16) — oldest submission first, so nobody waits. */
  async reviewQueue(query: QueryCaseDocumentsDto) {
    const where: Prisma.CaseDocumentWhereInput = { deletedAt: null };
    if (query.stage) where.stage = query.stage;
    if (query.caseId) where.caseId = query.caseId;
    where.status = query.status ?? { in: [DocumentStatus.SUBMITTED, DocumentStatus.UNDER_REVIEW] };
    if (query.assignedDocOfficerId || query.q) {
      where.case = {
        ...(query.assignedDocOfficerId ? { assignedDocOfficerId: query.assignedDocOfficerId } : {}),
        ...(query.q
          ? {
              OR: [
                { code: { contains: query.q, mode: 'insensitive' } },
                { user: { name: { contains: query.q, mode: 'insensitive' } } },
              ],
            }
          : {}),
      };
    }

    const [items, total] = await Promise.all([
      this.prisma.caseDocument.findMany({
        where,
        include: {
          template: { select: { id: true, code: true, nameMn: true, needsTranslation: true, needsPhysicalOriginal: true } },
          files: { where: { deletedAt: null }, orderBy: { version: 'desc' }, take: 1 },
          case: {
            select: {
              id: true,
              code: true,
              serviceType: true,
              user: { select: { id: true, name: true, email: true } },
              assignedDocOfficer: { select: { id: true, name: true } },
            },
          },
        },
        orderBy: [{ submittedAt: 'asc' }, { createdAt: 'asc' }],
        skip: query.skip,
        take: query.limit,
      }),
      this.prisma.caseDocument.count({ where }),
    ]);
    return paginate(items, total, query.page, query.limit);
  }

  /** Documents that can only be closed at the office (1D-11). */
  async physicalOriginals(caseId: string, actor: AuthenticatedUser) {
    await this.assertCaseAccess(caseId, actor);
    return this.prisma.caseDocument.findMany({
      where: { caseId, deletedAt: null, template: { needsPhysicalOriginal: true } },
      include: { template: { select: { id: true, code: true, nameMn: true } } },
      orderBy: { sortOrder: 'asc' },
    });
  }

  // ─── Writing ────────────────────────────────────────────────────────────────

  /**
   * Manual addition — a school asks for something no rule covers (1E-04).
   *
   * Either a template is picked, or one is written out here and saved as a
   * template on the way past (1D-22): the paper a school asked one client for
   * is usually the paper it will ask the next one for.
   */
  async createManual(caseId: string, dto: CreateCaseDocumentDto) {
    const templateId = dto.templateId ?? (await this.templateForAdHoc(dto.template));

    const existing = await this.prisma.caseDocument.findUnique({
      where: { caseId_templateId_stage: { caseId, templateId, stage: dto.stage } },
    });
    if (existing) {
      return this.prisma.caseDocument.update({
        where: { id: existing.id },
        data: { ...restorePatch(), necessity: dto.necessity ?? existing.necessity, dueAt: dto.dueAt ? new Date(dto.dueAt) : existing.dueAt },
      });
    }

    const last = await this.prisma.caseDocument.findFirst({
      where: { caseId, stage: dto.stage },
      orderBy: { sortOrder: 'desc' },
      select: { sortOrder: true },
    });

    return this.prisma.caseDocument.create({
      data: {
        caseId,
        templateId,
        stage: dto.stage,
        necessity: dto.necessity ?? Necessity.REQUIRED,
        conditionNote: dto.conditionNote,
        dueAt: dto.dueAt ? new Date(dto.dueAt) : null,
        sortOrder: (last?.sortOrder ?? 0) + 1,
      },
    });
  }

  /**
   * The template behind a hand-written material.
   *
   * A name the register already knows is reused rather than duplicated — three
   * staff typing "Банкны тодорхойлолт" on three clients must not leave three
   * templates behind, and the existing one keeps its own wording and flags,
   * because it is shared with every checklist already carrying it.
   */
  private async templateForAdHoc(template: NewDocumentTemplateDto | undefined): Promise<string> {
    const nameMn = template?.nameMn?.trim();
    if (!nameMn) throw new BadRequestException('Материалын загвар сонгох, эсвэл шинэ материалын нэрийг бичнэ үү');

    const known = await this.prisma.documentTemplate.findFirst({
      where: { isActive: true, nameMn: { equals: nameMn, mode: 'insensitive' } },
      select: { id: true },
    });
    if (known) return known.id;

    const taken = await this.prisma.documentTemplate.findMany({ select: { code: true } });
    const created = await this.prisma.documentTemplate.create({
      data: {
        code: uniqueTemplateCode(toTemplateCode(nameMn), taken.map((row) => row.code)),
        nameMn,
        descriptionMn: template?.descriptionMn?.trim() || null,
        sourceHint: template?.sourceHint?.trim() || null,
        issuerHint: template?.issuerHint?.trim() || null,
        needsTranslation: template?.needsTranslation ?? false,
        needsNotary: template?.needsNotary ?? false,
        needsApostille: template?.needsApostille ?? false,
        needsPhysicalOriginal: template?.needsPhysicalOriginal ?? false,
        tipsMn: template?.tipsMn?.trim() || null,
      },
      select: { id: true },
    });
    return created.id;
  }

  async update(id: string, dto: UpdateCaseDocumentDto) {
    await this.getOrThrow(id);
    return this.prisma.caseDocument.update({
      where: { id },
      data: {
        necessity: dto.necessity,
        conditionNote: dto.conditionNote,
        dueAt: dto.dueAt === undefined ? undefined : dto.dueAt ? new Date(dto.dueAt) : null,
      },
    });
  }

  /** Soft delete (§9) — the file history survives. */
  async remove(id: string) {
    await this.getOrThrow(id);
    return this.prisma.caseDocument.update({ where: { id }, data: softDeletePatch() });
  }

  async transition(id: string, dto: TransitionDocumentDto, actor: AuthenticatedUser) {
    const doc = await this.getOrThrow(id, { case: { select: { userId: true } }, template: true });
    this.assertOwnership(doc.case.userId, actor);

    assertTransition(doc.status, dto.toStatus);
    if (!isStaff(actor.role) && !isClientTransition(doc.status, dto.toStatus)) {
      throw new ForbiddenException('Энэ шилжилтийг зөвхөн ажилтан хийнэ');
    }
    if (dto.toStatus === DocumentStatus.READY && doc.template.needsTranslation && doc.status === DocumentStatus.ACCEPTED) {
      throw new BadRequestException('Энэ материал орчуулга шаарддаг тул шууд "Бэлэн" болгож болохгүй');
    }

    return this.applyStatus(id, doc.status, dto.toStatus, actor.id, dto.note ?? null);
  }

  /** Staff verdict on a submitted document (1D-09). */
  async review(id: string, dto: ReviewDocumentDto, actor: AuthenticatedUser) {
    const doc = await this.getOrThrow(id, { case: { select: { id: true, code: true, userId: true } } });

    if (dto.action !== ReviewAction.ACCEPT && !dto.note?.trim()) {
      throw new BadRequestException('Засвар хүсэх/буцаах үед тайлбар заавал бичнэ');
    }

    // Reviewing implies picking the document up: SUBMITTED → UNDER_REVIEW first.
    let status = doc.status;
    if (status === DocumentStatus.SUBMITTED) {
      await this.applyStatus(id, status, DocumentStatus.UNDER_REVIEW, actor.id, null);
      status = DocumentStatus.UNDER_REVIEW;
    }

    const target = REVIEW_TARGET[dto.action];
    if (dto.action === ReviewAction.RETURN && status === DocumentStatus.UNDER_REVIEW) {
      // RESUBMIT_REQUIRED is only reachable through NEEDS_FIX (§7.2).
      await this.applyStatus(id, status, DocumentStatus.NEEDS_FIX, actor.id, dto.note ?? null);
      const returned = await this.applyStatus(id, DocumentStatus.NEEDS_FIX, target, actor.id, null);
      await this.notifyReview(doc, dto);
      return returned;
    }

    assertTransition(status, target);
    const updated = await this.applyStatus(id, status, target, actor.id, dto.note ?? null);
    await this.notifyReview(doc, dto);
    return updated;
  }

  /**
   * §16 "Материал буцаагдсан" / "Засвар шаардлагатай" (1G-02). A `RETURN`
   * verdict is the rejection; `REQUEST_FIX` is the softer one.
   */
  private async notifyReview(
    doc: { id: string; case: { id: string; code: string; userId: string }; template: { nameMn: string } },
    dto: ReviewDocumentDto,
  ): Promise<void> {
    if (dto.action === ReviewAction.ACCEPT) {
      // "Yours is in" is worth an email on its own: without it the client only
      // ever hears from us when something is wrong, and starts to assume
      // silence means rejection.
      const remaining = await this.prisma.caseDocument.count({
        where: {
          caseId: doc.case.id,
          deletedAt: null,
          necessity: { not: Necessity.OPTIONAL },
          status: { notIn: [...SETTLED_STATUSES] },
        },
      });

      await this.notifications.dispatch({
        event: NotificationEvent.DOCUMENT_APPROVED,
        userIds: [doc.case.userId],
        caseId: doc.case.id,
        context: {
          caseId: doc.case.id,
          caseCode: doc.case.code,
          documentName: doc.template.nameMn,
          remainingCount: remaining ? `${remaining} материал` : 'Бүрдэн дууссан',
        },
      });
      return;
    }

    await this.notifications.dispatch({
      event:
        dto.action === ReviewAction.RETURN
          ? NotificationEvent.DOCUMENT_REJECTED
          : NotificationEvent.DOCUMENT_FIX_REQUIRED,
      userIds: [doc.case.userId],
      caseId: doc.case.id,
      context: {
        caseId: doc.case.id,
        caseCode: doc.case.code,
        documentName: doc.template.nameMn,
        reason: dto.note ?? '',
      },
    });
  }

  async addNote(id: string, dto: AddDocumentNoteDto, actor: AuthenticatedUser) {
    const doc = await this.getOrThrow(id, { case: { select: { userId: true } } });
    this.assertOwnership(doc.case.userId, actor);
    const isInternal = Boolean(dto.isInternal) && isStaff(actor.role);

    return this.prisma.documentReviewNote.create({
      data: { caseDocumentId: id, authorId: actor.id, body: dto.body, isInternal },
      include: { author: { select: { id: true, name: true } } },
    });
  }

  /**
   * Writes the new status plus its timestamp, and records the staff comment as
   * a `DocumentReviewNote` so the client sees *why* something moved (§6.3).
   */
  async applyStatus(id: string, from: DocumentStatus, to: DocumentStatus, actorId: string | null, note: string | null) {
    const now = new Date();
    const stamps: Partial<Record<DocumentStatus, Prisma.CaseDocumentUpdateInput>> = {
      [DocumentStatus.SUBMITTED]: { submittedAt: now },
      [DocumentStatus.ACCEPTED]: { acceptedAt: now },
      [DocumentStatus.READY]: { readyAt: now },
      [DocumentStatus.SENT_TO_UNIVERSITY]: { sentToUniversityAt: now },
    };

    const [updated] = await this.prisma.$transaction([
      this.prisma.caseDocument.update({ where: { id }, data: { status: to, ...(stamps[to] ?? {}) } }),
      ...(note
        ? [
            this.prisma.documentReviewNote.create({
              data: { caseDocumentId: id, authorId: actorId, body: note, fromStatus: from, toStatus: to },
            }),
          ]
        : []),
    ]);
    return updated;
  }

  // ─── Access ─────────────────────────────────────────────────────────────────

  /** Staff see every case; a client only their own (ARCHITECTURE.md §11). */
  async assertCaseAccess(caseId: string, actor: AuthenticatedUser): Promise<void> {
    const found = await this.prisma.case.findUnique({ where: { id: caseId }, select: { userId: true } });
    if (!found) throw new NotFoundException(`Case ${caseId} not found`);
    this.assertOwnership(found.userId, actor);
  }

  private assertOwnership(ownerId: string, actor: AuthenticatedUser): void {
    if (!isStaff(actor.role) && ownerId !== actor.id) {
      throw new ForbiddenException('Энэ үйлчилгээний материалд хандах эрхгүй байна');
    }
  }

  private async getOrThrow<T extends Prisma.CaseDocumentInclude>(id: string, include?: T) {
    const doc = await this.prisma.caseDocument.findUnique({
      where: { id },
      include: { template: true, case: { select: { userId: true } }, ...(include ?? {}) },
    });
    if (!doc || doc.deletedAt) throw new NotFoundException(`Материал ${id} олдсонгүй`);
    return doc;
  }
}

/** Only `REQUIRED` documents count toward completion; optional ones never block (§7.1). */
export function summarise(stage: DocStage, documents: { necessity: Necessity; status: DocumentStatus }[]): StageProgress {
  const required = documents.filter((doc) => doc.necessity === Necessity.REQUIRED);
  const requiredDone = required.filter((doc) => SETTLED_STATUSES.includes(doc.status)).length;

  return {
    stage,
    requiredTotal: required.length,
    requiredDone,
    percent: required.length === 0 ? 100 : Math.round((requiredDone / required.length) * 100),
    awaitingReview: documents.filter((doc) => doc.status === DocumentStatus.SUBMITTED || doc.status === DocumentStatus.UNDER_REVIEW).length,
    needsFix: documents.filter((doc) => doc.status === DocumentStatus.NEEDS_FIX || doc.status === DocumentStatus.RESUBMIT_REQUIRED).length,
  };
}
