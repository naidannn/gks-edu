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
import { APPLICATION_DECISION_LABELS, formatDateMn } from '../notifications/notification-labels.js';
import { NotificationsService } from '../notifications/notifications.service.js';
import { assertApplicationTransition } from './application-status.js';
import type {
  CreateApplicationDto,
  CreateParallelApplicationDto,
  QueryApplicationsDto,
  RecordResultDto,
  RequestAdditionalDocsDto,
  ScheduleInterviewDto,
  TransitionApplicationDto,
  UpdateApplicationDto,
} from './dto/application.dto.js';
import { parallelChoices } from './parallel-applications.js';

/**
 * The states in which a school decision can actually arrive (1N-20). Recording
 * a result on a `PREPARING` application used to jump it straight to `ACCEPTED`
 * and email the client "тэнцлээ", while the case-stage move silently failed —
 * leaving the application and the case telling different stories.
 */
const DECIDABLE_STATUSES: readonly ApplicationStatus[] = [
  ApplicationStatus.SUBMITTED,
  ApplicationStatus.UNDER_REVIEW,
  ApplicationStatus.ADDITIONAL_DOCS_REQUESTED,
  ApplicationStatus.INTERVIEW_SCHEDULED,
  ApplicationStatus.DEFERRED,
];

/**
 * Reached through `recordResult` and nowhere else: only that path writes an
 * `ApplicationResult`, stamps `decidedAt`, moves the case and tells the client.
 */
const DECISION_STATUSES: readonly ApplicationStatus[] = [ApplicationStatus.ACCEPTED, ApplicationStatus.REJECTED];

/** A parallel application opened by mistake may be removed until it has left the office. */
const REMOVABLE_STATUSES: readonly ApplicationStatus[] = [ApplicationStatus.PREPARING, ApplicationStatus.READY];

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
 *
 * 1E-13 — a case may also apply to its other chosen schools at the same time.
 * Those parallel applications share the case's one set of documents and walk
 * the same status graph, but they are bookkeeping only: they never gate on
 * readiness, never mark documents sent, never move the case stage, and always
 * decide in a single round. The primary application alone drives the case.
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
    if (query.kind) where.isPrimary = query.kind === 'PRIMARY';
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
    const [applications, found, readiness] = await Promise.all([
      this.prisma.application.findMany({
        where: { caseId },
        include: APPLICATION_INCLUDE,
        orderBy: [{ isPrimary: 'desc' }, { createdAt: 'asc' }],
      }),
      this.prisma.case.findUnique({
        where: { id: caseId },
        select: {
          serviceType: true,
          universityId: true,
          universityChoices: {
            orderBy: { sortOrder: 'asc' },
            select: {
              universityId: true,
              track: true,
              university: { select: { id: true, nameMn: true, nameEn: true, nameKo: true } },
              program: { select: { id: true, nameMn: true, level: true } },
            },
          },
        },
      }),
      this.readiness(caseId),
    ]);

    const application = applications.find((row) => row.isPrimary) ?? null;
    const parallel = applications.filter((row) => !row.isPrimary);

    // The chosen schools nobody has opened an application to yet — what the
    // staff console offers to start tracking.
    const opened = new Set(parallel.map((row) => row.universityId));
    const parallelCandidates = found
      ? parallelChoices(found.serviceType, found.universityChoices, application?.universityId ?? found.universityId)
          .filter((choice) => !opened.has(choice.universityId))
          .map(({ universityId, university, program }) => ({ universityId, university, program }))
      : [];

    return { application, readiness, parallel, parallelCandidates };
  }

  /**
   * 1E-03 — the gate. Every `REQUIRED` admission document must be settled
   * before the application may leave `PREPARING`.
   */
  async readiness(caseId: string) {
    // "Required and not settled" is asked in four places; it is defined once,
    // on the service that owns the paperwork (1N-52).
    const { requiredTotal, missing } = await this.documents.missingRequired(caseId, DocStage.ADMISSION);

    return {
      isReady: requiredTotal > 0 && missing.length === 0,
      requiredTotal,
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

  /** Idempotent: one case has exactly one primary application (§5). */
  async createForCase(caseId: string, dto: CreateApplicationDto) {
    const gksCase = await this.prisma.case.findUnique({ where: { id: caseId } });
    if (!gksCase) throw new NotFoundException(`Үйлчилгээ ${caseId} олдсонгүй`);

    const existing = await this.prisma.application.findFirst({ where: { caseId, isPrimary: true }, include: APPLICATION_INCLUDE });
    if (existing) return existing;

    const universityId = dto.universityId ?? gksCase.universityId;
    await this.assertSchoolFree(caseId, universityId, null);

    return this.prisma.application.create({
      data: {
        caseId,
        universityId,
        programId: dto.programId ?? gksCase.programId,
        intakeId: dto.intakeId ?? gksCase.intakeId,
      },
      include: APPLICATION_INCLUDE,
    });
  }

  /**
   * 1E-13 — start tracking one more school the materials are going to. The
   * school must be one the case names, and not one the primary application
   * already covers (`parallelChoices`); the choice list stays the one place a
   * case's schools are decided.
   */
  async createParallel(caseId: string, dto: CreateParallelApplicationDto) {
    const found = await this.prisma.case.findUnique({
      where: { id: caseId },
      select: {
        serviceType: true,
        universityId: true,
        universityChoices: { select: { universityId: true, track: true, programId: true } },
        applications: { where: { isPrimary: true }, select: { universityId: true } },
      },
    });
    if (!found) throw new NotFoundException(`Үйлчилгээ ${caseId} олдсонгүй`);

    const primaryUniversityId = found.applications[0]?.universityId ?? found.universityId;
    const choice = parallelChoices(found.serviceType, found.universityChoices, primaryUniversityId).find(
      (row) => row.universityId === dto.universityId,
    );
    if (!choice) {
      throw new BadRequestException(
        found.serviceType === ServiceType.GKS_SCHOLARSHIP
          ? 'Нэмэлт мэдүүлгийг зөвхөн үйлчилгээн дээр сонгосон энгийн зуучлалын сургуульд нээнэ'
          : 'Нэмэлт мэдүүлгийг зөвхөн үйлчилгээн дээр сонгосон бусад сургуульд нээнэ',
      );
    }
    await this.assertSchoolFree(caseId, dto.universityId, null);

    return this.prisma.application.create({
      data: {
        caseId,
        isPrimary: false,
        universityId: dto.universityId,
        programId: dto.programId ?? choice.programId,
      },
      include: APPLICATION_INCLUDE,
    });
  }

  /** 1E-13 — undo a parallel application opened by mistake, before anything was sent. */
  async removeParallel(id: string) {
    const application = await this.getOrThrow(id);
    if (application.isPrimary) {
      throw new BadRequestException('Үндсэн мэдүүлгийг устгах боломжгүй');
    }
    if (!REMOVABLE_STATUSES.includes(application.status)) {
      throw new BadRequestException('Сургуульд илгээсэн мэдүүлгийг устгах боломжгүй — хариуг нь бүртгэнэ үү');
    }
    await this.prisma.application.delete({ where: { id } });
    return { id };
  }

  async update(id: string, dto: UpdateApplicationDto) {
    const application = await this.getOrThrow(id);
    if (dto.universityId && dto.universityId !== application.universityId) {
      await this.assertSchoolFree(application.caseId, dto.universityId, id);
    }
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
    if (DECISION_STATUSES.includes(dto.toStatus)) {
      throw new BadRequestException('Сургуулийн шийдвэрийг мэдүүлгийн хариу бүртгэх үйлдлээр (results) оруулна уу');
    }
    assertApplicationTransition(application.status, dto.toStatus);

    if (dto.toStatus === ApplicationStatus.READY && application.isPrimary) {
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

    if (dto.toStatus === ApplicationStatus.SUBMITTED && application.isPrimary) {
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
    // A GKS case's parallel school is ordinary brokerage: it decides once.
    const isGks = application.case.serviceType === ServiceType.GKS_SCHOLARSHIP && application.isPrimary;
    const round = dto.round ?? 1;

    if (!isGks && round !== 1) {
      throw new BadRequestException('Зөвхөн GKS тэтгэлгийн мэдүүлэг 2-р шатны хариутай байна');
    }

    // Both rounds in one trip: a read-only pair belongs in `Promise.all`, never
    // in a `$transaction` (CLAUDE.md — the database is ~115 ms away).
    const [first, second] = await Promise.all([
      this.prisma.applicationResult.findUnique({ where: { applicationId_round: { applicationId: id, round: 1 } } }),
      this.prisma.applicationResult.findUnique({ where: { applicationId_round: { applicationId: id, round: 2 } } }),
    ]);
    const existingForRound = round === 1 ? first : second;

    // A decision cannot arrive before the school has the application. The one
    // way past a concluded application is correcting the round it concluded on:
    // `ACCEPTED`/`REJECTED` have no outgoing edge, so a typo would otherwise be
    // permanent.
    if (!DECIDABLE_STATUSES.includes(application.status) && !existingForRound) {
      throw new BadRequestException(`Мэдүүлэг "${application.status}" төлөвтэй байхад сургуулийн хариу бүртгэх боломжгүй`);
    }
    if (round === 2 && first?.decision !== ApplicationDecision.PASSED) {
      throw new BadRequestException('1-р шатанд тэнцээгүй тул 2-р шатны хариу бүртгэх боломжгүй');
    }
    // Round 2 was decided on top of round 1; rewriting round 1 underneath it
    // would leave the pair contradicting each other.
    if (round === 1 && second) {
      throw new BadRequestException('2-р шатны хариу бүртгэгдсэн тул 1-р шатны хариуг өөрчлөх боломжгүй');
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

    // A parallel school's answer is the office's to act on — it never moves the
    // case, which follows the primary application alone.
    const stage = application.isPrimary ? this.caseStageFor(dto.decision, round, isGks) : null;
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

  /**
   * A refusal pauses the case; it does not end it (1N-19). `REJECTED` has no
   * edge out of it in the stage graph, and a GKS contract promises a fallback
   * school free of charge (§3.11) — so the office decides whether this case is
   * over, by moving it to `REJECTED` deliberately from `ON_HOLD`.
   */
  private caseStageFor(decision: ApplicationDecision, round: number, isGks: boolean): CaseStage | null {
    if (decision === ApplicationDecision.FAILED) return CaseStage.ON_HOLD;
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

  /**
   * One application per school per case. The unique index would catch it too,
   * but as a Prisma error rather than a sentence staff can act on.
   */
  private async assertSchoolFree(caseId: string, universityId: string | null, exceptId: string | null): Promise<void> {
    if (!universityId) return;
    const clash = await this.prisma.application.findFirst({
      where: { caseId, universityId, ...(exceptId ? { id: { not: exceptId } } : {}) },
      select: { id: true },
    });
    if (clash) throw new BadRequestException('Энэ сургуульд мэдүүлэг аль хэдийн нээгдсэн байна');
  }

  private async getOrThrow(id: string) {
    const application = await this.prisma.application.findUnique({ where: { id }, include: APPLICATION_INCLUDE });
    if (!application) throw new NotFoundException(`Мэдүүлэг ${id} олдсонгүй`);
    return application;
  }
}
