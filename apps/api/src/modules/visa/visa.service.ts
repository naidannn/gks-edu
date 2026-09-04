import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { paginate } from '../../common/dto/pagination.dto.js';
import type { AuthenticatedUser } from '../../common/types/authenticated-user.js';
import {
  BalanceTrigger,
  CaseStage,
  DocStage,
  Necessity,
  NotificationEvent,
  type Prisma,
  ServiceType,
  VisaStatus,
  VisaType,
} from '../../prisma/client.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import { CasesService } from '../cases/cases.service.js';
import { CaseDocumentsService } from '../documents/case-documents.service.js';
import { SETTLED_STATUSES } from '../documents/document-status.js';
import { RequirementsService } from '../documents/requirements.service.js';
import { DepartureService } from '../departure/departure.service.js';
import { VISA_STATUS_LABELS } from '../notifications/notification-labels.js';
import { NotificationsService } from '../notifications/notifications.service.js';
import type { OpenVisaCaseDto, QueryVisaCasesDto, RecordVisaDecisionDto, TransitionVisaDto, UpdateVisaCaseDto } from './dto/visa.dto.js';
import { assertVisaTransition } from './visa-status.js';

/** Language training is a D-4; every degree programme is a D-2 (§10). */
const VISA_TYPE_BY_SERVICE: Record<ServiceType, VisaType> = {
  [ServiceType.LANGUAGE_PREP]: VisaType.D4,
  [ServiceType.BACHELOR]: VisaType.D2,
  [ServiceType.MASTER]: VisaType.D2,
  [ServiceType.PHD]: VisaType.D2,
  [ServiceType.GKS_SCHOLARSHIP]: VisaType.D2,
};

const VISA_INCLUDE = {
  case: {
    select: {
      id: true,
      code: true,
      serviceType: true,
      stage: true,
      userId: true,
      user: { select: { id: true, name: true, phone: true } },
      university: { select: { id: true, nameMn: true } },
    },
  },
} satisfies Prisma.VisaCaseInclude;

/**
 * 1F — the visa phase. The client applies in person; what the system owns is
 * the paperwork (resolved by the same rule engine with `stage = VISA`, 1F-02),
 * the 8-state machine, and the decision that decides whether the balance is
 * invoiced or the refund clause applies (1F-05).
 */
@Injectable()
export class VisaService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly cases: CasesService,
    private readonly documents: CaseDocumentsService,
    private readonly requirements: RequirementsService,
    private readonly departure: DepartureService,
    private readonly notifications: NotificationsService,
  ) {}

  // ─── Reading ────────────────────────────────────────────────────────────────

  async findAll(query: QueryVisaCasesDto) {
    const where: Prisma.VisaCaseWhereInput = {};
    if (query.status) where.status = query.status;
    if (query.q) {
      where.case = {
        OR: [
          { code: { contains: query.q, mode: 'insensitive' } },
          { user: { name: { contains: query.q, mode: 'insensitive' } } },
        ],
      };
    }

    const [items, total] = await this.prisma.$transaction([
      this.prisma.visaCase.findMany({
        where,
        include: VISA_INCLUDE,
        orderBy: { updatedAt: 'desc' },
        skip: query.skip,
        take: query.limit,
      }),
      this.prisma.visaCase.count({ where }),
    ]);
    return paginate(items, total, query.page, query.limit);
  }

  async findForCase(caseId: string, actor: AuthenticatedUser) {
    await this.documents.assertCaseAccess(caseId, actor);
    const visaCase = await this.prisma.visaCase.findUnique({ where: { caseId }, include: VISA_INCLUDE });
    const checklist = visaCase ? await this.documents.checklist(caseId, DocStage.VISA, actor) : null;
    return { visaCase, checklist };
  }

  // ─── Writing ────────────────────────────────────────────────────────────────

  /**
   * Opens the visa phase and materialises its document list (1F-02). Called by
   * the invitation flow (1E-09) as well as by staff, so it is idempotent.
   */
  async openForCase(caseId: string, dto: OpenVisaCaseDto = {}) {
    const gksCase = await this.prisma.case.findUnique({ where: { id: caseId } });
    if (!gksCase) throw new NotFoundException(`Case ${caseId} not found`);

    const visaType = dto.visaType ?? VISA_TYPE_BY_SERVICE[gksCase.serviceType];
    const visaCase = await this.prisma.visaCase.upsert({
      where: { caseId },
      create: { caseId, visaType },
      update: { visaType: dto.visaType ?? undefined },
      include: VISA_INCLUDE,
    });

    const resolution = await this.requirements.resolveForCase(caseId, DocStage.VISA);
    return { visaCase, resolution };
  }

  async update(caseId: string, dto: UpdateVisaCaseDto, actor: AuthenticatedUser) {
    await this.documents.assertCaseAccess(caseId, actor);
    await this.getOrThrow(caseId);

    return this.prisma.visaCase.update({
      where: { caseId },
      data: {
        visaType: dto.visaType,
        appointmentAt: dto.appointmentAt ? new Date(dto.appointmentAt) : undefined,
        note: dto.note,
      },
      include: VISA_INCLUDE,
    });
  }

  async transition(caseId: string, dto: TransitionVisaDto, actor: AuthenticatedUser) {
    const visaCase = await this.getOrThrow(caseId);
    assertVisaTransition(visaCase.status, dto.toStatus);

    if (dto.toStatus === VisaStatus.READY) {
      const missing = await this.missingDocuments(caseId);
      if (missing.length > 0) {
        throw new BadRequestException(`Визний ${missing.length} материал бүрдээгүй байна`);
      }
    }

    const updated = await this.prisma.visaCase.update({
      where: { caseId },
      data: {
        status: dto.toStatus,
        submittedAt: dto.toStatus === VisaStatus.SUBMITTED ? new Date() : undefined,
        note: dto.note ?? undefined,
      },
      include: VISA_INCLUDE,
    });

    if (dto.toStatus === VisaStatus.SUBMITTED) {
      await this.cases.applyDomainTransition(caseId, CaseStage.VISA, actor.id, 'Виз мэдүүлсэн');
    }
    if (dto.toStatus === VisaStatus.REAPPLY) {
      // A fresh attempt re-runs the rule engine: the list may differ now.
      await this.requirements.resolveForCase(caseId, DocStage.VISA);
    }

    return updated;
  }

  /**
   * 1F-05 — the decision. On approval the case advances, which is what makes
   * the balance payment creatable for regular brokerage (its `BalanceTrigger`
   * is `AFTER_VISA_APPROVED`, §9), and the pre-departure plan is opened.
   *
   * A rejection does not refund anything by itself: the applicable clause lives
   * in the signed contract's `refundPolicy`, and staff issue the refund through
   * the payments module (1C-16). It is returned here so the screen can show it.
   */
  async recordDecision(caseId: string, dto: RecordVisaDecisionDto, actor: AuthenticatedUser) {
    const visaCase = await this.getOrThrow(caseId);
    if (dto.decision !== VisaStatus.APPROVED && dto.decision !== VisaStatus.REJECTED) {
      throw new BadRequestException('Зөвхөн APPROVED эсвэл REJECTED хариу бүртгэнэ');
    }
    if (dto.decision === VisaStatus.REJECTED && !dto.rejectionReason?.trim()) {
      throw new BadRequestException('Татгалзсан шалтгааныг бичнэ үү');
    }
    assertVisaTransition(visaCase.status, dto.decision);

    const decidedAt = dto.decidedAt ? new Date(dto.decidedAt) : new Date();
    const updated = await this.prisma.visaCase.update({
      where: { caseId },
      data: {
        status: dto.decision,
        decidedAt,
        visaNumber: dto.visaNumber,
        expiresAt: dto.expiresAt ? new Date(dto.expiresAt) : undefined,
        rejectionReason: dto.rejectionReason,
      },
      include: VISA_INCLUDE,
    });

    // §16 "Визний хариу бүртгэгдсэн" — sent for both verdicts.
    await this.notifications.dispatch({
      event: NotificationEvent.VISA_RESULT,
      userIds: [updated.case.userId],
      caseId,
      context: {
        caseId,
        caseCode: updated.case.code,
        visaStatusName: VISA_STATUS_LABELS[dto.decision],
        resultNote: dto.decision === VisaStatus.REJECTED ? (dto.rejectionReason ?? '') : (dto.visaNumber ?? ''),
      },
    });

    if (dto.decision === VisaStatus.APPROVED) {
      await this.cases.applyDomainTransition(caseId, CaseStage.VISA_APPROVED, actor.id, 'Виз гарсан');
      await this.departure.ensurePlan(caseId);
      return { visaCase: updated, balance: await this.balanceOutlook(caseId), refundPolicy: null };
    }

    await this.cases.applyDomainTransition(caseId, CaseStage.REJECTED, actor.id, `Виз татгалзсан: ${dto.rejectionReason}`);
    const contract = await this.prisma.contract.findUnique({ where: { caseId }, select: { refundPolicy: true } });
    return { visaCase: updated, balance: null, refundPolicy: contract?.refundPolicy ?? null };
  }

  /** What the client still owes, and whether the visa decision is what unlocks it (§9). */
  private async balanceOutlook(caseId: string) {
    const contract = await this.prisma.contract.findUnique({
      where: { caseId },
      select: { totalAmountSnapshot: true, prepaymentValueSnapshot: true, prepaymentModeSnapshot: true, balanceTriggerSnapshot: true },
    });
    if (!contract) return null;

    const total = Number(contract.totalAmountSnapshot);
    const prepayment =
      contract.prepaymentModeSnapshot === 'PERCENT'
        ? (total * Number(contract.prepaymentValueSnapshot)) / 100
        : Number(contract.prepaymentValueSnapshot);

    return {
      amountMnt: Math.max(total - prepayment, 0),
      isDueNow: contract.balanceTriggerSnapshot === BalanceTrigger.AFTER_VISA_APPROVED,
      trigger: contract.balanceTriggerSnapshot,
    };
  }

  private async missingDocuments(caseId: string) {
    const documents = await this.prisma.caseDocument.findMany({
      where: { caseId, stage: DocStage.VISA, deletedAt: null, necessity: Necessity.REQUIRED },
      select: { id: true, status: true, template: { select: { code: true, nameMn: true } } },
    });
    return documents.filter((doc) => !SETTLED_STATUSES.includes(doc.status));
  }

  private async getOrThrow(caseId: string) {
    const visaCase = await this.prisma.visaCase.findUnique({ where: { caseId } });
    if (!visaCase) throw new NotFoundException('Энэ хэрэг дээр визний шат нээгдээгүй байна');
    return visaCase;
  }
}
