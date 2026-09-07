import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { paginate } from '../../common/dto/pagination.dto.js';
import type { AuthenticatedUser } from '../../common/types/authenticated-user.js';
import {
  ApplicationDecision,
  ApplicationStatus,
  CaseStage,
  DocStage,
  Necessity,
  NotificationEvent,
  type Prisma,
  ServiceType,
} from '../../prisma/client.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import { CasesService } from '../cases/cases.service.js';
import { CaseDocumentsService } from '../documents/case-documents.service.js';
import { SETTLED_STATUSES } from '../documents/document-status.js';
import { APPLICATION_DECISION_LABELS, formatDateMn } from '../notifications/notification-labels.js';
import { NotificationsService } from '../notifications/notifications.service.js';
import { assertApplicationTransition } from './application-status.js';
import type {
  CreateApplicationDto,
  QueryApplicationsDto,
  RecordResultDto,
  RequestAdditionalDocsDto,
  ScheduleInterviewDto,
  TransitionApplicationDto,
  UpdateApplicationDto,
} from './dto/application.dto.js';

const APPLICATION_INCLUDE = {
  university: { select: { id: true, nameMn: true, nameEn: true, nameKo: true, logoPath: true } },
  program: { select: { id: true, nameMn: true, level: true } },
  intake: { select: { id: true, year: true, month: true } },
  results: { orderBy: { round: 'asc' } },
  case: { select: { id: true, code: true, serviceType: true, stage: true, userId: true } },
} satisfies Prisma.ApplicationInclude;

/**
 * 1E-01…1E-05 — the school submission. The interesting parts are the readiness
 * gate (nothing is submitted while a required document is missing) and the GKS
 * two-round decision, which lives in `ApplicationResult.round` rather than in
 * extra statuses.
 */
@Injectable()
export class ApplicationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly cases: CasesService,
    private readonly documents: CaseDocumentsService,
    private readonly notifications: NotificationsService,
  ) {}

  // ─── Reading ────────────────────────────────────────────────────────────────

  async findAll(query: QueryApplicationsDto) {
    const where: Prisma.ApplicationWhereInput = {};
    if (query.status) where.status = query.status;
    if (query.universityId) where.universityId = query.universityId;
    const caseFilter: Prisma.CaseWhereInput = {};
    if (query.serviceType) caseFilter.serviceType = query.serviceType;
    if (query.q) {
      caseFilter.OR = [
        { code: { contains: query.q, mode: 'insensitive' } },
        { user: { name: { contains: query.q, mode: 'insensitive' } } },
      ];
    }
    if (Object.keys(caseFilter).length > 0) where.case = caseFilter;

    const [items, total] = await Promise.all([
      this.prisma.application.findMany({
        where,
        include: {
          ...APPLICATION_INCLUDE,
          case: { select: { id: true, code: true, serviceType: true, stage: true, userId: true, user: { select: { id: true, name: true } } } },
        },
        orderBy: { updatedAt: 'desc' },
        skip: query.skip,
        take: query.limit,
      }),
      this.prisma.application.count({ where }),
    ]);
    return paginate(items, total, query.page, query.limit);
  }

  async findForCase(caseId: string, actor: AuthenticatedUser) {
    await this.documents.assertCaseAccess(caseId, actor);
    const application = await this.prisma.application.findUnique({ where: { caseId }, include: APPLICATION_INCLUDE });
    const readiness = await this.readiness(caseId);
    return { application, readiness };
  }

  /**
   * 1E-03 — the gate. Every `REQUIRED` admission document must be settled
   * before the application may leave `PREPARING`.
   */
  async readiness(caseId: string) {
    const documents = await this.prisma.caseDocument.findMany({
      where: { caseId, stage: DocStage.ADMISSION, deletedAt: null, necessity: Necessity.REQUIRED },
      select: { id: true, status: true, template: { select: { code: true, nameMn: true } } },
    });
    const missing = documents.filter((doc) => !SETTLED_STATUSES.includes(doc.status));

    return {
      isReady: documents.length > 0 && missing.length === 0,
      requiredTotal: documents.length,
      missing: missing.map((doc) => ({ id: doc.id, code: doc.template.code, nameMn: doc.template.nameMn, status: doc.status })),
    };
  }

  /** 1E-12 — how each university's submissions are going. */
  async reportByUniversity() {
    const rows = await this.prisma.application.groupBy({
      by: ['universityId', 'status'],
      _count: { _all: true },
    });
    const universities = await this.prisma.university.findMany({
      where: { id: { in: rows.map((row) => row.universityId).filter((id): id is string => id !== null) } },
      select: { id: true, nameMn: true, nameEn: true, nameKo: true },
    });
    const byId = new Map(universities.map((university) => [university.id, university]));

    return rows.map((row) => ({
      universityId: row.universityId,
      university: row.universityId ? (byId.get(row.universityId) ?? null) : null,
      status: row.status,
      count: row._count._all,
    }));
  }

  // ─── Writing ────────────────────────────────────────────────────────────────

  /** Idempotent: one case has exactly one application (§5). */
  async createForCase(caseId: string, dto: CreateApplicationDto) {
    const gksCase = await this.prisma.case.findUnique({ where: { id: caseId } });
    if (!gksCase) throw new NotFoundException(`Үйлчилгээ ${caseId} олдсонгүй`);

    const existing = await this.prisma.application.findUnique({ where: { caseId } });
    if (existing) return this.prisma.application.findUnique({ where: { caseId }, include: APPLICATION_INCLUDE });

    return this.prisma.application.create({
      data: {
        caseId,
        universityId: dto.universityId ?? gksCase.universityId,
        programId: dto.programId ?? gksCase.programId,
        intakeId: dto.intakeId ?? gksCase.intakeId,
      },
      include: APPLICATION_INCLUDE,
    });
  }

  async update(id: string, dto: UpdateApplicationDto) {
    await this.getOrThrow(id);
    return this.prisma.application.update({
      where: { id },
      data: {
        universityId: dto.universityId,
        programId: dto.programId,
        intakeId: dto.intakeId,
        applicationNo: dto.applicationNo,
        admissionFeeKrw: dto.admissionFeeKrw,
        note: dto.note,
      },
      include: APPLICATION_INCLUDE,
    });
  }

  async transition(id: string, dto: TransitionApplicationDto, actor: AuthenticatedUser) {
    const application = await this.getOrThrow(id);
    assertApplicationTransition(application.status, dto.toStatus);

    if (dto.toStatus === ApplicationStatus.READY) {
      const readiness = await this.readiness(application.caseId);
      if (!readiness.isReady) {
        throw new BadRequestException(
          `Шаардлагатай ${readiness.missing.length} материал бүрдээгүй тул мэдүүлэхэд бэлэн болгох боломжгүй`,
        );
      }
    }

    const updated = await this.prisma.application.update({
      where: { id },
      data: {
        status: dto.toStatus,
        submittedAt: dto.toStatus === ApplicationStatus.SUBMITTED ? new Date() : undefined,
        note: dto.note ?? undefined,
      },
      include: APPLICATION_INCLUDE,
    });

    if (dto.toStatus === ApplicationStatus.SUBMITTED) {
      await this.markDocumentsSent(application.caseId);
      await this.cases.applyDomainTransition(application.caseId, CaseStage.APPLICATION_SUBMITTED, actor.id, 'Мэдүүлэг сургуульд илгээгдсэн');
    }

    return updated;
  }

  /** 1E-05 — book the interview and hand the client their preparation note. */
  async scheduleInterview(id: string, dto: ScheduleInterviewDto) {
    const application = await this.getOrThrow(id);
    if (application.status !== ApplicationStatus.INTERVIEW_SCHEDULED) {
      assertApplicationTransition(application.status, ApplicationStatus.INTERVIEW_SCHEDULED);
    }

    return this.prisma.application.update({
      where: { id },
      data: {
        status: ApplicationStatus.INTERVIEW_SCHEDULED,
        interviewAt: new Date(dto.interviewAt),
        interviewNote: dto.interviewNote,
      },
      include: APPLICATION_INCLUDE,
    });
  }

  /**
   * 1E-04 — the school wants more paperwork. Each template becomes a fresh
   * `CaseDocument` on the admission stage, so it lands in the client's existing
   * checklist rather than in a side channel.
   */
  async requestAdditionalDocs(id: string, dto: RequestAdditionalDocsDto) {
    const application = await this.getOrThrow(id);
    if (application.status !== ApplicationStatus.ADDITIONAL_DOCS_REQUESTED) {
      assertApplicationTransition(application.status, ApplicationStatus.ADDITIONAL_DOCS_REQUESTED);
    }

    const created = [];
    for (const templateId of dto.templateIds) {
      created.push(
        await this.documents.createManual(application.caseId, {
          templateId,
          stage: DocStage.ADMISSION,
          necessity: Necessity.REQUIRED,
          conditionNote: 'Сургуулиас нэмэлтээр шаардсан',
          dueAt: dto.dueAt,
        }),
      );
    }

    const updated = await this.prisma.application.update({
      where: { id },
      data: { status: ApplicationStatus.ADDITIONAL_DOCS_REQUESTED, note: dto.note ?? undefined },
      include: APPLICATION_INCLUDE,
    });

    // §16 "Нэмэлт материал шаардсан". `createManual` returns bare rows, so the
    // human-readable names come from the templates the caller named.
    const templates = await this.prisma.documentTemplate.findMany({
      where: { id: { in: dto.templateIds } },
      select: { id: true, nameMn: true },
    });

    await this.notifications.dispatch({
      event: NotificationEvent.APPLICATION_EXTRA_DOCS,
      userIds: [updated.case.userId],
      caseId: updated.caseId,
      context: {
        caseId: updated.caseId,
        caseCode: updated.case.code,
        universityName: updated.university?.nameMn ?? 'Сургууль',
        requestedDocs: templates.map((template) => `• ${template.nameMn}`).join('\n'),
        dueDate: formatDateMn(dto.dueAt),
      },
    });

    return { application: updated, documents: created };
  }

  /**
   * 1E-02 — record a decision. GKS decides twice: round 1 keeps the application
   * under review and only round 2 concludes it, which is exactly why the case
   * stage graph gives scholarship cases their own two stages (§9).
   */
  async recordResult(id: string, dto: RecordResultDto, actor: AuthenticatedUser) {
    const application = await this.getOrThrow(id);
    const isGks = application.case.serviceType === ServiceType.GKS_SCHOLARSHIP;
    const round = dto.round ?? 1;

    if (!isGks && round !== 1) {
      throw new BadRequestException('Зөвхөн GKS тэтгэлгийн мэдүүлэг 2-р шатны хариутай байна');
    }
    if (round === 2) {
      const first = await this.prisma.applicationResult.findUnique({
        where: { applicationId_round: { applicationId: id, round: 1 } },
      });
      if (first?.decision !== ApplicationDecision.PASSED) {
        throw new BadRequestException('1-р шатанд тэнцээгүй тул 2-р шатны хариу бүртгэх боломжгүй');
      }
    }

    const decidedAt = dto.decidedAt ? new Date(dto.decidedAt) : new Date();
    await this.prisma.applicationResult.upsert({
      where: { applicationId_round: { applicationId: id, round } },
      create: { applicationId: id, round, decision: dto.decision, decidedAt, note: dto.note, recordedById: actor.id },
      update: { decision: dto.decision, decidedAt, note: dto.note, recordedById: actor.id },
    });

    const status = this.statusFor(dto.decision, round, isGks);
    const updated = await this.prisma.application.update({
      where: { id },
      data: { status, decidedAt: status === ApplicationStatus.ACCEPTED || status === ApplicationStatus.REJECTED ? decidedAt : undefined },
      include: APPLICATION_INCLUDE,
    });

    const stage = this.caseStageFor(dto.decision, round, isGks);
    if (stage) {
      await this.cases.applyDomainTransition(application.caseId, stage, actor.id, `Мэдүүлгийн ${round}-р шатны хариу: ${dto.decision}`);
    }

    // §16 "Сургуулийн хариу ирсэн".
    await this.notifications.dispatch({
      event: NotificationEvent.APPLICATION_RESULT,
      userIds: [updated.case.userId],
      caseId: updated.caseId,
      context: {
        caseId: updated.caseId,
        caseCode: updated.case.code,
        universityName: updated.university?.nameMn ?? 'Сургууль',
        decisionName: APPLICATION_DECISION_LABELS[dto.decision],
        roundName: isGks ? `${round}-р` : 'Элсэлтийн',
        resultNote: dto.note ?? '',
      },
    });

    return updated;
  }

  /** GKS round 1 keeps the application open; everything else concludes it. */
  private statusFor(decision: ApplicationDecision, round: number, isGks: boolean): ApplicationStatus {
    if (decision === ApplicationDecision.FAILED) return ApplicationStatus.REJECTED;
    if (decision === ApplicationDecision.DEFERRED || decision === ApplicationDecision.WAITLISTED) return ApplicationStatus.DEFERRED;
    return isGks && round === 1 ? ApplicationStatus.UNDER_REVIEW : ApplicationStatus.ACCEPTED;
  }

  private caseStageFor(decision: ApplicationDecision, round: number, isGks: boolean): CaseStage | null {
    if (decision === ApplicationDecision.FAILED) return CaseStage.REJECTED;
    if (decision !== ApplicationDecision.PASSED) return null;
    if (!isGks) return CaseStage.ADMITTED;
    return round === 1 ? CaseStage.GKS_ROUND1_PASSED : CaseStage.GKS_ROUND2_PASSED;
  }

  /** Submitting the application closes out every ready document (§7.2). */
  private async markDocumentsSent(caseId: string): Promise<void> {
    const ready = await this.prisma.caseDocument.findMany({
      where: { caseId, stage: DocStage.ADMISSION, deletedAt: null, status: 'READY' },
      select: { id: true, status: true },
    });
    for (const doc of ready) {
      await this.documents.applyStatus(doc.id, doc.status, 'SENT_TO_UNIVERSITY', null, null);
    }
  }

  private async getOrThrow(id: string) {
    const application = await this.prisma.application.findUnique({ where: { id }, include: APPLICATION_INCLUDE });
    if (!application) throw new NotFoundException(`Мэдүүлэг ${id} олдсонгүй`);
    return application;
  }
}
