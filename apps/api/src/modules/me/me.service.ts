import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { CaseStage, ContractType, type Prisma, ServiceType } from '../../prisma/client.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import { computeIntakePhase, daysUntil, resolveIntakeDates } from '../admissions/intake-deadline.js';
import { CASE_FLOWS } from '../cases/case-flow.js';
import { CasesService } from '../cases/cases.service.js';
import { ClientsService } from '../clients/clients.service.js';
import { CLIENT_CONTRACT_SELECT, toClientContract } from '../contracts/client-contract.select.js';
import { ContractsService } from '../contracts/contracts.service.js';
import { CaseDocumentsService, type StageProgress } from '../documents/case-documents.service.js';
import { CLIENT_PAYMENT_SELECT } from '../payments/client-payment.select.js';
import { activePricingWhere } from '../pricing/active-pricing.js';
import { PricingService } from '../pricing/pricing.service.js';
import type { StartMyCaseDto } from './dto/start-case.dto.js';
import type { UpsertMyProfileDto } from './dto/upsert-my-profile.dto.js';
import { nextAction } from '../cases/next-action.js';
import { profileCompleteness } from './profile-completeness.js';

/** A case in one of these is over — a new one for the same service may be opened. */
const TERMINAL_STAGES: CaseStage[] = [CaseStage.COMPLETED, CaseStage.CANCELLED, CaseStage.REJECTED];

const CASE_INCLUDE = {
  university: { select: { id: true, nameMn: true, nameEn: true, slug: true } },
  // The client plans around these three dates (1H-09). `internalDeadline` is
  // the one the portal counts down to — the school's date is shown only so
  // the buffer is visible.
  intake: {
    select: {
      id: true,
      level: true,
      year: true,
      month: true,
      openAt: true,
      applicationDeadline: true,
      internalDeadline: true,
      internalDeadlineIsManual: true,
      classStartDate: true,
      resultAnnouncedAt: true,
      requirementNote: true,
      status: true,
      // A programme on its own calendar closes on its own date (§3.2). Joined
      // here rather than queried per case, and dropped from the payload below:
      // only the resolved date reaches the client.
      programOverrides: {
        select: {
          programId: true,
          openAt: true,
          applicationDeadline: true,
          internalDeadline: true,
          internalDeadlineIsManual: true,
          classStartDate: true,
        },
      },
    },
  },
  /**
   * Both explicitly selected, not `true`. The payment row carries staff
   * remarks and storage paths, and the contract carries the office's audit
   * trail — one projection each, shared with the staff modules so a column
   * added later cannot leak from here alone (1C-27, 1N-04).
   */
  contract: { select: CLIENT_CONTRACT_SELECT },
  payments: { select: CLIENT_PAYMENT_SELECT, orderBy: { createdAt: 'desc' as const } },
} satisfies Prisma.CaseInclude;

/**
 * The client's own view of the platform (1B-18, 1C-23, 1G-15).
 *
 * Everything here acts on the caller: their profile, their cases, the contract
 * they sign themselves. Staff screens go through the CRM modules instead — this
 * service never takes a user id from the request.
 */
@Injectable()
export class MeService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly clients: ClientsService,
    private readonly cases: CasesService,
    private readonly contracts: ContractsService,
    private readonly pricing: PricingService,
    private readonly documents: CaseDocumentsService,
  ) {}

  // ─── Profile (1B-18) ───────────────────────────────────────────────────────

  async profile(userId: string) {
    const [account, client] = await Promise.all([
      this.prisma.user.findUniqueOrThrow({
        where: { id: userId },
        select: { id: true, email: true, name: true, phone: true, role: true, createdAt: true },
      }),
      this.clients.findByUserId(userId),
    ]);

    return { account, client, completeness: profileCompleteness(client) };
  }

  async saveProfile(userId: string, dto: UpsertMyProfileDto) {
    const client = await this.clients.upsertOwn(userId, dto);
    return { client, completeness: profileCompleteness(client) };
  }

  // ─── Service catalogue with live prices (§5.4) ─────────────────────────────

  /**
   * What the client may sign up for, priced from `ServicePricing` — never a
   * constant. A service with no active price or no active contract template
   * comes back `available: false` rather than disappearing, so the reason a
   * choice is greyed out stays visible.
   */
  async services() {
    const [prices, templates] = await Promise.all([
      this.prisma.servicePricing.findMany({
        where: activePricingWhere(new Date()),
        orderBy: { effectiveFrom: 'desc' },
      }),
      this.prisma.contractTemplate.findMany({ where: { isActive: true }, select: { serviceType: true } }),
    ]);

    const templated = new Set(templates.map((template) => template.serviceType));

    return Object.values(ServiceType).map((serviceType) => {
      const pricing = prices.find((row) => row.serviceType === serviceType) ?? null;
      const amounts = pricing ? PricingService.amounts(pricing) : null;

      return {
        serviceType,
        available: Boolean(pricing && templated.has(serviceType)),
        totalAmount: pricing?.totalAmount.toString() ?? null,
        prepaymentAmount: amounts?.prepayment ?? null,
        balanceAmount: amounts?.balance ?? null,
        balanceTrigger: pricing?.balanceTrigger ?? null,
      };
    });
  }

  // ─── Opening a case and issuing its contract (1C-23) ───────────────────────

  /**
   * The client starts their own service cycle: a `Case` in `CONTRACT_DRAFT`
   * and the electronic brokerage contract that goes with it, rendered from the
   * active template against the price in effect right now (§6.1).
   *
   * They still sign it through the same accept → emailed OTP flow staff-issued
   * contracts use (1C-08, 1C-33); nothing here shortcuts the signature.
   */
  async startCase(userId: string, dto: StartMyCaseDto) {
    const client = await this.prisma.client.findUnique({ where: { userId } });
    const completeness = profileCompleteness(client);
    if (!completeness.exists) {
      throw new BadRequestException('Эхлээд өөрийн мэдээллээ бөглөнө үү — гэрээ таны нэр дээр бичигдэнэ');
    }
    if (!completeness.isComplete) {
      const labels = completeness.missing.map((entry) => entry.label).join(', ');
      throw new BadRequestException(`Профайлын дараах талбар дутуу байна: ${labels}`);
    }

    const open = await this.prisma.case.findFirst({
      where: { userId, serviceType: dto.serviceType, stage: { notIn: TERMINAL_STAGES } },
      select: { code: true },
    });
    if (open) {
      throw new ConflictException(`Энэ үйлчилгээ танд аль хэдийн нээлттэй байна (${open.code})`);
    }

    // Both throw a readable message before anything is written, so a missing
    // price or template never leaves a case behind without its contract.
    await this.pricing.getActive(dto.serviceType);
    const template = await this.contracts.activeTemplate(dto.serviceType);
    if (!template) {
      throw new BadRequestException('Энэ үйлчилгээний гэрээний загвар бэлэн болоогүй байна — зөвлөхтэйгээ холбогдоно уу');
    }

    // An intake belongs to one school, and `CasesService` only checks that it
    // does when there is a school to check it against — so a round sent without
    // one produced a case pointing at some other school's calendar (1N-13).
    if (dto.intakeId && !dto.universityId) {
      throw new BadRequestException('Элсэлтийн улирал сонгохын өмнө сургуулиа сонгоно уу');
    }
    if (dto.universityId) await this.assertPublishedUniversity(dto.universityId);

    const created = await this.cases.create({
      userId,
      serviceType: dto.serviceType,
      universityId: dto.universityId,
      intakeId: dto.intakeId,
    });

    try {
      await this.contracts.createForCase({ caseId: created.id, type: ContractType.ELECTRONIC });
    } catch (error) {
      // A case with no contract is a dead end: the client cannot sign it, and
      // every retry hits the "you already have one open" conflict above.
      // Nothing else points at it yet, so it goes rather than being left for
      // staff to find (1N-15).
      await this.prisma.case.delete({ where: { id: created.id } }).catch(() => undefined);
      throw error;
    }

    // The client record keeps the choice they just made, so the CRM list and
    // the contract's placeholders agree with the case that was opened.
    await this.prisma.client.update({
      where: { userId },
      data: {
        primaryServiceType: dto.serviceType,
        ...(dto.universityId ? { targetUniversityId: dto.universityId } : {}),
        ...(dto.intakeId ? { plannedIntakeId: dto.intakeId } : {}),
        ...(dto.targetMajor ? { targetMajor: dto.targetMajor } : {}),
      },
    });

    return this.caseDetail(userId, created.id);
  }

  // ─── Dashboard + case detail (1G-15) ───────────────────────────────────────

  async overview(userId: string) {
    const [{ account, client, completeness }, rows] = await Promise.all([
      this.profile(userId),
      this.prisma.case.findMany({ where: { userId }, include: CASE_INCLUDE, orderBy: { createdAt: 'desc' } }),
    ]);

    const cases = await Promise.all(rows.map((row) => this.decorate(row)));
    const active = cases.find((row) => !TERMINAL_STAGES.includes(row.stage)) ?? null;

    return {
      account,
      profile: { ...completeness, code: client?.code ?? null, fullName: client ? `${client.lastName} ${client.firstName}` : null },
      cases,
      activeCaseId: active?.id ?? null,
      /** A second live case for the *same* service is refused; a different one is fine. */
      openServiceTypes: cases.filter((row) => !TERMINAL_STAGES.includes(row.stage)).map((row) => row.serviceType),
    };
  }

  /** One case, with the journey, the paperwork progress and the next step on it. */
  async caseDetail(userId: string, caseId: string) {
    const row = await this.prisma.case.findFirst({
      where: { id: caseId, userId },
      include: {
        ...CASE_INCLUDE,
        assignedConsultant: { select: { id: true, name: true } },
        assignedDocOfficer: { select: { id: true, name: true } },
        transitions: { orderBy: { createdAt: 'desc' }, take: 20, include: { actor: { select: { id: true, name: true } } } },
      },
    });
    if (!row) throw new NotFoundException('Үйлчилгээ олдсонгүй');

    return this.decorate(row);
  }

  // ─── Internals ─────────────────────────────────────────────────────────────

  private async decorate<T extends Prisma.CaseGetPayload<{ include: typeof CASE_INCLUDE }>>(row: T) {
    // The journey is `CASE_FLOWS[serviceType]` and nothing else, so the portal
    // overview no longer pays a query per case for it (1N-52). The staff side
    // still reads `CaseFlowDefinition`, which is where an office edit to the
    // graph would show up.
    const journey = CASE_FLOWS[row.serviceType];
    const [admissionDocs, visaDocs] = await Promise.all([
      this.documents.progress(row.id, 'ADMISSION'),
      this.documents.progress(row.id, 'VISA'),
    ]);

    // The client works to one date, ours. `applicationDeadline` decides the
    // phase and is then dropped — quoting the school's later date next to it is
    // how somebody talks themselves into another week. `programOverrides` goes
    // the same way: it is an input to the date, never part of the answer.
    const now = new Date();
    const intake = row.intake
      ? (({ applicationDeadline, programOverrides, ...rest }) => {
          const dates = resolveIntakeDates(
            { ...rest, applicationDeadline },
            programOverrides.find((override) => override.programId === row.programId),
          );
          return {
            ...rest,
            internalDeadline: dates.internalDeadline,
            classStartDate: dates.classStartDate,
            phase: computeIntakePhase(dates, rest.status, now),
            daysUntilInternalDeadline: daysUntil(dates.internalDeadline, now),
          };
        })(row.intake)
      : null;

    return {
      ...row,
      intake,
      contract: row.contract ? toClientContract(row.contract) : null,
      journey,
      documents: { admission: admissionDocs, visa: visaDocs } satisfies Record<string, StageProgress>,
      nextAction: nextAction({
        serviceType: row.serviceType,
        stage: row.stage,
        contract: row.contract
          ? {
              type: row.contract.type,
              status: row.contract.status,
              acceptedAt: row.contract.acceptedAt,
              otpVerifiedAt: row.contract.otpVerifiedAt,
              balanceTriggerSnapshot: row.contract.balanceTriggerSnapshot,
            }
          : null,
        payments: row.payments.map((payment) => ({ kind: payment.kind, status: payment.status })),
        admissionDocs,
        visaDocs,
        daysUntilIntakeDeadline: intake?.daysUntilInternalDeadline ?? null,
      }),
    };
  }

  private async assertPublishedUniversity(universityId: string): Promise<void> {
    const university = await this.prisma.university.findFirst({
      where: { id: universityId, isPublished: true },
      select: { id: true },
    });
    if (!university) throw new BadRequestException('Сонгосон сургууль олдсонгүй');
  }
}
