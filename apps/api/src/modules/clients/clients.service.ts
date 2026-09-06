import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { paginate } from '../../common/dto/pagination.dto.js';
import {
  CaseStage,
  ClientStatus,
  DocumentStatus,
  LeadActivityType,
  LeadSource,
  LeadStage,
  Necessity,
  PaymentStatus,
  Prisma,
  Role,
  type ServiceType,
  WorkTaskStatus,
} from '../../prisma/client.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import { CasesService } from '../cases/cases.service.js';
import {
  type NormalisedChoice,
  type UniversityChoiceInput,
  normaliseChoices,
} from '../cases/university-choice.rules.js';
import { SETTLED_STATUSES } from '../documents/document-status.js';
import { AccountClaimService } from '../users/account-claim.service.js';
import { ADULT_AGE, ageOn } from './dto/client-fields.js';
import type { ConvertLeadDto } from './dto/convert-lead.dto.js';
import type { CreateClientDto } from './dto/create-client.dto.js';
import type { QueryClientsDto } from './dto/query-clients.dto.js';
import type { UpdateClientDto } from './dto/update-client.dto.js';

/** Either the app-wide `PrismaService` or an interactive `$transaction` client. */
type Db = PrismaService | Prisma.TransactionClient;

/**
 * What a client may fill in about themselves (1B-18) — the staff-only columns
 * (`status`, `assignedConsultantId`, `source`, `note`) are not part of it.
 */
export type SelfServiceClientInput = Omit<
  CreateClientDto,
  'source' | 'status' | 'assignedConsultantId' | 'note' | 'openCase'
>;

/**
 * The client's live service cycle, as shown in the list. One client may run
 * several cases over time (§20 — a language-prep client coming back for a
 * bachelor's); the newest non-terminal one is the one staff are working on.
 */
const TERMINAL_STAGES: CaseStage[] = [CaseStage.COMPLETED, CaseStage.CANCELLED, CaseStage.REJECTED];

/** Back-office work that is still someone's problem. */
const OPEN_TASK_STATUSES: WorkTaskStatus[] = [WorkTaskStatus.TODO, WorkTaskStatus.IN_PROGRESS];

/** A deadline this close is worth a row-level warning on the list. */
const DEADLINE_WARNING_DAYS = 7;

/** Per-row operational state, so the list answers "who needs me today" (1G-17). */
interface ClientAttention {
  /** Required documents not yet collected on the live case. */
  missingDocuments: number;
  pendingPayments: number;
  overdueTasks: number;
  /** Earliest unmet document/payment deadline, or null. */
  nextDeadline: Date | null;
  /** True once that deadline is in the past. */
  overdue: boolean;
}

const NO_ATTENTION: ClientAttention = {
  missingDocuments: 0,
  pendingPayments: 0,
  overdueTasks: 0,
  nextDeadline: null,
  overdue: false,
};

const CASE_SUMMARY_SELECT = {
  id: true,
  code: true,
  stage: true,
  serviceType: true,
  createdAt: true,
  university: { select: { id: true, nameMn: true, nameEn: true } },
  contract: { select: { id: true, status: true, type: true, signedAt: true, createdAt: true } },
} satisfies Prisma.CaseSelect;

/**
 * What the client's login is worth today (1B-19). Staff open a client and need
 * one honest line — invited, expired, activated, or "no address, so nothing was
 * ever sent" — and the answer only exists on the backing `User` row.
 */
const PORTAL_USER_SELECT = {
  email: true,
  password: true,
  googleId: true,
  claimTokenHash: true,
  claimTokenExpiresAt: true,
  claimedAt: true,
} satisfies Prisma.UserSelect;

type PortalUser = Prisma.UserGetPayload<{ select: typeof PORTAL_USER_SELECT }>;

function portalAccess(user: PortalUser) {
  const invitedUntil = user.claimTokenHash ? user.claimTokenExpiresAt : null;
  const status = !user.email
    ? 'NO_EMAIL'
    : user.password || user.googleId
      ? 'ACTIVE'
      : !invitedUntil
        ? 'NOT_INVITED'
        : invitedUntil > new Date()
          ? 'INVITED'
          : 'EXPIRED';

  return {
    email: user.email,
    status,
    // Never the hash itself — only whether one is outstanding, and until when.
    invitedUntil,
    claimedAt: user.claimedAt,
    viaGoogle: Boolean(user.googleId),
  } as const;
}

const LIST_SELECT = {
  id: true,
  code: true,
  lastName: true,
  firstName: true,
  phone: true,
  email: true,
  registerNumber: true,
  birthDate: true,
  status: true,
  source: true,
  primaryServiceType: true,
  targetMajor: true,
  createdAt: true,
  updatedAt: true,
  targetUniversity: { select: { id: true, nameMn: true, nameEn: true } },
  assignedConsultant: { select: { id: true, name: true, email: true } },
  user: {
    select: {
      id: true,
      cases: { select: CASE_SUMMARY_SELECT, orderBy: { createdAt: 'desc' } },
    },
  },
} satisfies Prisma.ClientSelect;

type ClientListRow = Prisma.ClientGetPayload<{ select: typeof LIST_SELECT }>;
type CaseSummary = Prisma.CaseGetPayload<{ select: typeof CASE_SUMMARY_SELECT }>;

@Injectable()
export class ClientsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly cases: CasesService,
    private readonly claims: AccountClaimService,
  ) {}

  // ─── Create ───────────────────────────────────────────────────────────────

  /**
   * Register a client from scratch (1B-14) — no lead required. The backing
   * `User` row is created in the same transaction because `Case`, `Contract`
   * and `Payment` all reference `userId`; it carries no password, so it cannot
   * be logged into until the client claims it.
   */
  async create(dto: CreateClientDto, actorId: string) {
    const choices = this.resolveChoices(dto);
    this.assertGuardianPresent(new Date(dto.birthDate), dto);
    await this.assertRegisterFree(dto.registerNumber);
    await this.assertEmailFree(dto.email);
    if (dto.assignedConsultantId) await this.assertStaff(dto.assignedConsultantId);

    const created = await this.prisma.$transaction(async (tx) => {
      const account = await this.createAccount(tx, dto);
      const client = await tx.client.create({
        data: {
          ...this.toClientData(dto),
          ...this.toRequiredClientData(dto),
          targetUniversityId: choices[0]?.universityId,
          code: await this.generateCode(tx),
          userId: account.id,
          createdById: actorId,
        },
        select: { id: true, userId: true },
      });

      if (dto.openCase !== false) {
        await this.cases.createWithin(tx, {
          userId: client.userId,
          serviceType: dto.primaryServiceType,
          universityChoices: choices,
          intakeId: dto.plannedIntakeId,
        });
      }

      return client;
    });

    await this.invitePortal(created.userId, dto);

    return this.findOne(created.id);
  }

  /**
   * Lead → client (1B-10). The lead row is kept as sales history and moved to
   * `WON`; everything still true about the person is copied across, with the
   * form's values winning wherever staff corrected them.
   */
  async createFromLead(leadId: string, dto: ConvertLeadDto, actorId: string) {
    const lead = await this.prisma.lead.findUnique({
      where: { id: leadId },
      include: { client: { select: { id: true, code: true } } },
    });
    if (!lead) throw new NotFoundException('Сэжим олдсонгүй');
    if (lead.client) {
      throw new ConflictException(`Энэ сэжим аль хэдийн ${lead.client.code} хэрэглэгч болсон байна`);
    }

    const primaryServiceType = dto.primaryServiceType ?? lead.interestedServices[0];
    if (!primaryServiceType) {
      throw new BadRequestException('Үйлчилгээний төрлийг сонгоно уу — сэжим дээр бүртгэгдээгүй байна');
    }

    const merged: CreateClientDto = {
      ...dto,
      primaryServiceType,
      lastName: dto.lastName ?? lead.lastName,
      firstName: dto.firstName ?? lead.firstName,
      phone: dto.phone ?? lead.phone,
      email: dto.email ?? lead.email ?? undefined,
      educationLevel: dto.educationLevel ?? lead.educationLevel ?? undefined,
      gpa: dto.gpa ?? lead.gpa ?? undefined,
      gpaScale: dto.gpaScale ?? lead.gpaScale ?? undefined,
      koreanLevel: dto.koreanLevel ?? lead.koreanLevel ?? undefined,
      englishLevel: dto.englishLevel ?? lead.englishLevel ?? undefined,
      targetMajor: dto.targetMajor ?? lead.interestedMajor ?? undefined,
      targetUniversityId: dto.targetUniversityId ?? lead.interestedUniversityIds[0],
      plannedIntakeId: dto.plannedIntakeId ?? lead.plannedIntakeId ?? undefined,
      source: dto.source ?? lead.source,
      assignedConsultantId: dto.assignedConsultantId ?? lead.assignedToId ?? undefined,
      birthDate: dto.birthDate,
      registerNumber: dto.registerNumber,
    };

    const choices = this.resolveChoices(merged);
    this.assertGuardianPresent(new Date(merged.birthDate), merged);
    await this.assertRegisterFree(merged.registerNumber);
    await this.assertEmailFree(merged.email);
    if (merged.assignedConsultantId) await this.assertStaff(merged.assignedConsultantId);

    const created = await this.prisma.$transaction(async (tx) => {
      const account = await this.createAccount(tx, merged);
      const client = await tx.client.create({
        data: {
          ...this.toClientData(merged),
          ...this.toRequiredClientData(merged),
          targetUniversityId: choices[0]?.universityId,
          code: await this.generateCode(tx),
          userId: account.id,
          leadId: lead.id,
          createdById: actorId,
        },
        select: { id: true, code: true, userId: true },
      });

      if (merged.openCase !== false) {
        await this.cases.createWithin(tx, {
          userId: client.userId,
          serviceType: merged.primaryServiceType,
          universityChoices: choices,
          intakeId: merged.plannedIntakeId,
        });
      }

      // The lead keeps its own timeline; the conversion is one more entry on it.
      await tx.lead.update({
        where: { id: lead.id },
        data: { userId: client.userId, ...(lead.stage === LeadStage.WON ? {} : { stage: LeadStage.WON }) },
      });
      await tx.leadActivity.create({
        data: {
          leadId: lead.id,
          type: LeadActivityType.STAGE_CHANGE,
          body: `Хэрэглэгч болгон бүртгэв (${client.code})`,
          meta: { from: lead.stage, to: LeadStage.WON, clientId: client.id } satisfies Prisma.InputJsonObject,
          actorId,
        },
      });

      return client;
    });

    await this.invitePortal(created.userId, merged);

    return this.findOne(created.id);
  }

  /**
   * 1B-19 — the welcome mail goes out the moment a client is registered.
   *
   * Before this, a staff-created row owned the client's address without ever
   * telling them: they could not register (the address is taken), could not log
   * in (there is no password), and the process mails that followed pointed at a
   * cabinet they had no way into. Sending the invitation with the registration
   * closes that gap at the only moment we are certain to remember.
   */
  private async invitePortal(userId: string, dto: Pick<CreateClientDto, 'email' | 'assignedConsultantId'>) {
    if (!dto.email) return;

    const consultant = dto.assignedConsultantId
      ? await this.prisma.user.findUnique({
          where: { id: dto.assignedConsultantId },
          select: { name: true },
        })
      : null;

    await this.claims.inviteQuietly(userId, { kind: 'welcome', consultantName: consultant?.name });
  }

  // ─── Read ─────────────────────────────────────────────────────────────────

  async findAllStaff(query: QueryClientsDto) {
    const where = this.buildWhere(query);

    const [rows, total] = await Promise.all([
      this.prisma.client.findMany({
        where,
        select: LIST_SELECT,
        orderBy: this.buildOrderBy(query),
        skip: query.skip,
        take: query.limit,
      }),
      this.prisma.client.count({ where }),
    ]);

    // Progress and the attention flags are read for the page only — four
    // grouped queries for up to `limit` rows, never one query per client.
    const items = rows.map((row) => this.toListItem(row));
    const [journeys, attention] = await Promise.all([
      this.journeys(),
      this.attentionFor(items.map((item) => item.activeCase?.id).filter((id): id is string => Boolean(id))),
    ]);

    return paginate(
      items.map((item) => ({
        ...item,
        progressPercent: this.progressPercent(journeys, item.activeCase),
        attention: (item.activeCase && attention.get(item.activeCase.id)) ?? NO_ATTENTION,
      })),
      total,
      query.page,
      query.limit,
    );
  }

  /**
   * Every service's stage sequence in one read, so a page of clients can be
   * placed on its own flow without a query per row.
   */
  private async journeys(): Promise<Map<ServiceType, CaseStage[]>> {
    const rows = await this.prisma.caseFlowDefinition.findMany({
      where: { sortOrder: { lt: 900 } },
      orderBy: [{ serviceType: 'asc' }, { sortOrder: 'asc' }],
      select: { serviceType: true, fromStage: true, toStage: true },
    });

    const byService = new Map<ServiceType, CaseStage[]>();
    for (const row of rows) {
      const stages = byService.get(row.serviceType);
      if (!stages) byService.set(row.serviceType, [row.fromStage, row.toStage]);
      else stages.push(row.toStage);
    }
    return byService;
  }

  /** Where the live case sits on its own flow, as a percentage. */
  private progressPercent(
    journeys: Map<ServiceType, CaseStage[]>,
    activeCase: { stage: CaseStage; serviceType: ServiceType } | null,
  ): number {
    if (!activeCase) return 0;
    const journey = journeys.get(activeCase.serviceType) ?? [];
    const index = journey.indexOf(activeCase.stage);
    if (index < 0) return 0;
    return Math.round((index / Math.max(1, journey.length - 1)) * 100);
  }

  /**
   * Missing paperwork, unpaid invoices, overdue back-office work and the next
   * deadline — grouped across the whole page in one pass each.
   */
  private async attentionFor(caseIds: string[]): Promise<Map<string, ClientAttention>> {
    const result = new Map<string, ClientAttention>();
    if (caseIds.length === 0) return result;

    const now = new Date();
    const [missing, payments, tasks, deadlines] = await Promise.all([
      this.prisma.caseDocument.groupBy({
        by: ['caseId'],
        where: {
          caseId: { in: caseIds },
          deletedAt: null,
          necessity: Necessity.REQUIRED,
          status: { notIn: SETTLED_STATUSES as DocumentStatus[] },
        },
        _count: { _all: true },
      }),
      this.prisma.payment.groupBy({
        by: ['caseId'],
        where: { caseId: { in: caseIds }, status: PaymentStatus.PENDING },
        _count: { _all: true },
        _min: { dueAt: true },
      }),
      this.prisma.workTask.groupBy({
        by: ['caseId'],
        where: { caseId: { in: caseIds }, status: { in: OPEN_TASK_STATUSES }, dueAt: { lt: now } },
        _count: { _all: true },
      }),
      this.prisma.caseDocument.groupBy({
        by: ['caseId'],
        where: {
          caseId: { in: caseIds },
          deletedAt: null,
          status: { notIn: SETTLED_STATUSES as DocumentStatus[] },
          dueAt: { not: null },
        },
        _min: { dueAt: true },
      }),
    ]);

    const read = (caseId: string): ClientAttention => {
      const existing = result.get(caseId);
      if (existing) return existing;
      const fresh: ClientAttention = { ...NO_ATTENTION };
      result.set(caseId, fresh);
      return fresh;
    };

    for (const row of missing) read(row.caseId).missingDocuments = row._count._all;
    // `WorkTask.caseId` is nullable since 1B-05 (lead follow-ups); the query
    // above filters to these cases, so the null branch is unreachable.
    for (const row of tasks) {
      if (row.caseId) read(row.caseId).overdueTasks = row._count._all;
    }
    for (const row of payments) {
      const entry = read(row.caseId);
      entry.pendingPayments = row._count._all;
      entry.nextDeadline = earliest(entry.nextDeadline, row._min.dueAt);
    }
    for (const row of deadlines) {
      const entry = read(row.caseId);
      entry.nextDeadline = earliest(entry.nextDeadline, row._min.dueAt);
    }
    for (const entry of result.values()) {
      entry.overdue = Boolean(entry.overdueTasks) || Boolean(entry.nextDeadline && entry.nextDeadline < now);
    }

    return result;
  }

  /** Counters for the list header: total, by status, and how many are already under contract. */
  async stats() {
    const [total, byStatusRows, withContract, unassigned] = await Promise.all([
      this.prisma.client.count(),
      this.prisma.client.groupBy({ by: ['status'], _count: { _all: true } }),
      this.prisma.client.count({ where: { user: { cases: { some: { contract: { isNot: null } } } } } }),
      this.prisma.client.count({ where: { assignedConsultantId: null, status: ClientStatus.ACTIVE } }),
    ]);

    return {
      total,
      byStatus: Object.fromEntries(byStatusRows.map((row) => [row.status, row._count._all])) as Record<
        ClientStatus,
        number
      >,
      withContract,
      unassigned,
    };
  }

  /** The caller's own client record, or null while they have only an account (1B-18). */
  async findByUserId(userId: string) {
    const client = await this.prisma.client.findUnique({ where: { userId }, select: { id: true } });
    return client ? this.findOne(client.id) : null;
  }

  /**
   * The client filling in their own record from the portal (1B-18).
   *
   * Same invariants as the staff form — guardian below 18, register number
   * unique — but the office's own columns (status, assigned consultant,
   * internal note) are untouchable from here, and `source` is stamped
   * `WEBSITE` on creation and never rewritten afterwards.
   */
  async upsertOwn(userId: string, dto: SelfServiceClientInput) {
    const existing = await this.prisma.client.findUnique({ where: { userId } });

    const birthDate = dto.birthDate ? new Date(dto.birthDate) : existing?.birthDate;
    if (!birthDate) throw new BadRequestException('Төрсөн огноог бөглөнө үү');
    this.assertGuardianPresent(birthDate, dto);

    if (dto.registerNumber !== existing?.registerNumber) {
      await this.assertRegisterFree(dto.registerNumber, existing?.id);
    }
    if (dto.email && dto.email !== existing?.email) await this.assertEmailFree(dto.email, userId);

    // `undefined` keys are skipped by Prisma, which is exactly what the two
    // office-owned columns need: the client never sets or resets them.
    const columns = { ...this.toClientData(dto), source: undefined, status: undefined };

    await this.prisma.$transaction(async (tx) => {
      if (existing) {
        await tx.client.update({ where: { id: existing.id }, data: columns });
      } else {
        await tx.client.create({
          data: {
            ...columns,
            ...this.toRequiredClientData(dto),
            code: await this.generateCode(tx),
            userId,
            source: LeadSource.WEBSITE,
          },
        });
      }

      // The account mirrors the name and phone the client just entered, so
      // staff screens that read `case.user` show the same person.
      await tx.user.update({
        where: { id: userId },
        data: { name: `${dto.lastName.trim()} ${dto.firstName.trim()}`, phone: dto.phone },
      });
    });

    return this.findByUserId(userId);
  }

  async findOne(id: string) {
    const client = await this.prisma.client.findUnique({
      where: { id },
      select: {
        ...LIST_SELECT,
        phoneAlt: true,
        address: true,
        gender: true,
        guardianLastName: true,
        guardianFirstName: true,
        guardianRegisterNumber: true,
        guardianPhone: true,
        guardianRelation: true,
        educationLevel: true,
        schoolName: true,
        gpa: true,
        gpaScale: true,
        koreanLevel: true,
        englishLevel: true,
        passportNumber: true,
        passportExpiry: true,
        targetUniversityId: true,
        plannedIntakeId: true,
        assignedConsultantId: true,
        note: true,
        leadId: true,
        lead: { select: { id: true, stage: true, source: true, createdAt: true } },
        createdBy: { select: { id: true, name: true, email: true } },
        user: {
          select: {
            id: true,
            cases: { select: CASE_SUMMARY_SELECT, orderBy: { createdAt: 'desc' } },
            ...PORTAL_USER_SELECT,
          },
        },
      },
    });
    if (!client) throw new NotFoundException('Хэрэглэгч олдсонгүй');

    const { user, ...rest } = client;
    return {
      ...rest,
      ...this.caseSummary(user.cases),
      userId: user.id,
      cases: user.cases,
      portal: portalAccess(user),
      isMinor: ageOn(client.birthDate) < ADULT_AGE,
    };
  }

  // ─── Update ───────────────────────────────────────────────────────────────

  async update(id: string, dto: UpdateClientDto) {
    const existing = await this.prisma.client.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('Хэрэглэгч олдсонгүй');

    const birthDate = dto.birthDate ? new Date(dto.birthDate) : existing.birthDate;
    this.assertGuardianPresent(birthDate, { ...existing, ...dto });

    if (dto.registerNumber && dto.registerNumber !== existing.registerNumber) {
      await this.assertRegisterFree(dto.registerNumber);
    }
    if (dto.email && dto.email !== existing.email) await this.assertEmailFree(dto.email, existing.userId);
    if (dto.assignedConsultantId) await this.assertStaff(dto.assignedConsultantId);

    // The school list belongs to the live case, not to the client row, so it is
    // written first: a list the service rejects must not leave a half-edited
    // client behind.
    const choices = dto.universityChoices
      ? await this.applyChoicesToLiveCase(existing, dto.universityChoices, dto.primaryServiceType)
      : null;

    await this.prisma.$transaction(async (tx) => {
      await tx.client.update({
        where: { id },
        data: {
          ...this.toClientData(dto),
          ...(choices ? { targetUniversityId: choices[0]?.universityId ?? null } : {}),
        },
      });

      // The backing account mirrors the display name, phone and email so staff
      // screens that read `case.user` stay in step with the client record.
      const name =
        dto.lastName || dto.firstName
          ? `${(dto.lastName ?? existing.lastName).trim()} ${(dto.firstName ?? existing.firstName).trim()}`
          : undefined;
      if (name || dto.phone || dto.email !== undefined) {
        await tx.user.update({
          where: { id: existing.userId },
          data: {
            ...(name ? { name } : {}),
            ...(dto.phone ? { phone: dto.phone } : {}),
            ...(dto.email !== undefined ? { email: dto.email?.trim().toLowerCase() ?? null } : {}),
          },
        });
      }
    });

    // An address typed in later is the same moment as registering with one:
    // it is the first time the invitation can go anywhere (1B-19). A client who
    // already has a login is left alone — `inviteQuietly` refuses those.
    if (dto.email && dto.email !== existing.email) {
      await this.invitePortal(existing.userId, {
        email: dto.email,
        assignedConsultantId: dto.assignedConsultantId ?? existing.assignedConsultantId ?? undefined,
      });
    }

    return this.findOne(id);
  }

  // ─── Internals ────────────────────────────────────────────────────────────

  /** Shared column mapping — `undefined` keys are skipped by Prisma on update. */
  /**
   * Re-points the client's live case at a new school list. A client may have
   * run several cases over the years (§20); the one being edited is the newest
   * that has not ended, exactly as the list and the workspace pick it.
   */
  private async applyChoicesToLiveCase(
    existing: { userId: string; primaryServiceType: ServiceType },
    inputs: UniversityChoiceInput[],
    serviceType?: ServiceType,
  ): Promise<NormalisedChoice[]> {
    const choices = normaliseChoices(serviceType ?? existing.primaryServiceType, inputs);
    const liveCase = await this.prisma.case.findFirst({
      where: { userId: existing.userId, stage: { notIn: TERMINAL_STAGES } },
      orderBy: { createdAt: 'desc' },
      select: { id: true },
    });

    if (!liveCase) {
      if (choices.length > 1) {
        throw new BadRequestException('Идэвхтэй үйлчилгээгүй тул нэгээс олон сургууль хадгалах боломжгүй');
      }
      return choices;
    }

    await this.cases.replaceUniversityChoices(liveCase.id, { universityChoices: choices });
    return choices;
  }

  /**
   * The schools chosen at registration, validated against what the service
   * allows (§5.1). `targetUniversityId` remains the one-school shorthand every
   * older caller sends; a `universityChoices` list, when present, is the whole
   * answer and the first of it becomes `targetUniversityId`.
   *
   * The extra schools live on the `Case`, so refusing to open one leaves them
   * nowhere to go — that is an error rather than a silent drop.
   */
  private resolveChoices(dto: Partial<CreateClientDto> & Pick<CreateClientDto, 'primaryServiceType'>): NormalisedChoice[] {
    const inputs: UniversityChoiceInput[] =
      dto.universityChoices && dto.universityChoices.length > 0
        ? dto.universityChoices
        : dto.targetUniversityId
          ? [{ universityId: dto.targetUniversityId }]
          : [];

    const choices = normaliseChoices(dto.primaryServiceType, inputs);
    if (dto.openCase === false && choices.length > 1) {
      throw new BadRequestException(
        'Нэгээс олон сургууль сонгосон бол зуучлалын үйлчилгээг шууд эхлүүлнэ үү — сонголтууд үйлчилгээн дээр хадгалагдана',
      );
    }
    return choices;
  }

  private toClientData(dto: Partial<CreateClientDto>) {
    return {
      lastName: dto.lastName?.trim(),
      firstName: dto.firstName?.trim(),
      birthDate: dto.birthDate ? new Date(dto.birthDate) : undefined,
      registerNumber: dto.registerNumber,
      gender: dto.gender,
      phone: dto.phone,
      phoneAlt: dto.phoneAlt,
      email: dto.email?.trim().toLowerCase(),
      address: dto.address,
      guardianLastName: dto.guardianLastName?.trim(),
      guardianFirstName: dto.guardianFirstName?.trim(),
      guardianRegisterNumber: dto.guardianRegisterNumber,
      guardianPhone: dto.guardianPhone,
      guardianRelation: dto.guardianRelation,
      educationLevel: dto.educationLevel,
      schoolName: dto.schoolName,
      gpa: dto.gpa,
      gpaScale: dto.gpaScale,
      koreanLevel: dto.koreanLevel,
      englishLevel: dto.englishLevel,
      passportNumber: dto.passportNumber,
      passportExpiry: dto.passportExpiry ? new Date(dto.passportExpiry) : undefined,
      primaryServiceType: dto.primaryServiceType,
      targetUniversityId: dto.targetUniversityId,
      targetMajor: dto.targetMajor,
      plannedIntakeId: dto.plannedIntakeId,
      source: dto.source ?? LeadSource.OFFICE,
      status: dto.status,
      assignedConsultantId: dto.assignedConsultantId,
      note: dto.note,
    };
  }

  /** The columns a new client cannot be created without. */
  private toRequiredClientData(dto: CreateClientDto) {
    return {
      lastName: dto.lastName.trim(),
      firstName: dto.firstName.trim(),
      birthDate: new Date(dto.birthDate),
      registerNumber: dto.registerNumber,
      phone: dto.phone,
      primaryServiceType: dto.primaryServiceType,
    };
  }

  /**
   * The `User` row every client hangs off. No password is set, so `login`
   * rejects it until the client claims the account themselves.
   */
  private createAccount(db: Db, dto: CreateClientDto) {
    return db.user.create({
      data: {
        email: dto.email?.trim().toLowerCase() ?? null,
        name: `${dto.lastName.trim()} ${dto.firstName.trim()}`,
        phone: dto.phone,
      },
      select: { id: true },
    });
  }

  /**
   * A minor cannot sign the brokerage contract themselves (§6.2), so the
   * guardian's name and register number are mandatory below 18. Age is read
   * from `birthDate` rather than trusted from the request.
   */
  private assertGuardianPresent(
    birthDate: Date,
    values: {
      guardianLastName?: string | null;
      guardianFirstName?: string | null;
      guardianRegisterNumber?: string | null;
    },
  ): void {
    if (ageOn(birthDate) >= ADULT_AGE) return;
    if (!values.guardianLastName || !values.guardianFirstName || !values.guardianRegisterNumber) {
      throw new BadRequestException(
        '18 нас хүрээгүй тул төлөөлөн гэрээ байгуулах хүний овог, нэр, регистрийн дугаарыг заавал бөглөнө',
      );
    }
  }

  /**
   * 1B-16 — a soft duplicate check the register-number unique index cannot do.
   *
   * Two siblings legitimately share a phone, so a phone match is a *warning*
   * the consultant reads before saving, never a rejection. The register number
   * is the hard rule and stays a 409 in {@link assertRegisterFree}.
   */
  async checkDuplicates(params: { phone?: string; registerNumber?: string; excludeClientId?: string }) {
    const phone = params.phone?.replace(/\D/g, '').slice(-8);

    const [byRegister, byPhone] = await Promise.all([
      params.registerNumber
        ? this.prisma.client.findUnique({
            where: { registerNumber: params.registerNumber },
            select: { id: true, code: true, lastName: true, firstName: true, phone: true },
          })
        : Promise.resolve(null),
      phone
        ? this.prisma.client.findMany({
            where: {
              OR: [{ phone: { endsWith: phone } }, { phoneAlt: { endsWith: phone } }],
              ...(params.excludeClientId ? { id: { not: params.excludeClientId } } : {}),
            },
            select: { id: true, code: true, lastName: true, firstName: true, phone: true, status: true },
            take: 5,
          })
        : Promise.resolve([]),
    ]);

    const registerClash =
      byRegister && byRegister.id !== params.excludeClientId ? byRegister : null;

    return {
      registerClash,
      phoneMatches: byPhone.filter((row) => row.id !== registerClash?.id),
      /** True when saving would be refused outright. */
      blocked: Boolean(registerClash),
    };
  }

  private async assertRegisterFree(registerNumber: string, ownClientId?: string): Promise<void> {
    const clash = await this.prisma.client.findUnique({
      where: { registerNumber },
      select: { id: true, code: true },
    });
    // `ownClientId` is only set when a client is editing their own record; on
    // create there is nothing to excuse, so any hit is a clash.
    if (clash && (!ownClientId || clash.id !== ownClientId)) {
      throw new ConflictException(`Энэ регистрийн дугаартай хэрэглэгч бүртгэлтэй байна (${clash.code})`);
    }
  }

  private async assertEmailFree(email: string | undefined, ownUserId?: string): Promise<void> {
    if (!email) return;
    const clash = await this.prisma.user.findUnique({
      where: { email: email.trim().toLowerCase() },
      select: { id: true },
    });
    if (clash && clash.id !== ownUserId) throw new ConflictException('Энэ имэйлээр бүртгэл үүссэн байна');
  }

  private async assertStaff(userId: string): Promise<void> {
    const staff = await this.prisma.user.findFirst({
      where: { id: userId, role: { in: [Role.ADMIN, Role.CONSULTANT] }, isActive: true },
      select: { id: true },
    });
    if (!staff) throw new BadRequestException('Идэвхтэй, тохирох эрхтэй ажилтан олдсонгүй');
  }

  private buildWhere(query: QueryClientsDto): Prisma.ClientWhereInput {
    const where: Prisma.ClientWhereInput = {};

    if (query.q) {
      const q = query.q.trim();
      where.OR = [
        { lastName: { contains: q, mode: 'insensitive' } },
        { firstName: { contains: q, mode: 'insensitive' } },
        { phone: { contains: q } },
        { registerNumber: { contains: q, mode: 'insensitive' } },
        { email: { contains: q, mode: 'insensitive' } },
        { code: { contains: q, mode: 'insensitive' } },
      ];
    }
    if (query.serviceType) where.primaryServiceType = query.serviceType;
    if (query.status) where.status = query.status;
    if (query.source) where.source = query.source;
    if (query.assignedConsultantId) {
      where.assignedConsultantId = query.assignedConsultantId === 'unassigned' ? null : query.assignedConsultantId;
    }
    // Stage and contract live on the case, one join away from the client row.
    // Combining them into a single `some` is deliberate: "DOCUMENTS and under
    // contract" must mean one case that is both, not two unrelated ones.
    const caseFilter: Prisma.CaseListRelationFilter = {};
    if (query.stage) caseFilter.some = { stage: query.stage };
    if (query.hasContract === true) caseFilter.some = { ...caseFilter.some, contract: { isNot: null } };
    if (query.hasContract === false) caseFilter.every = { contract: { is: null } };
    const attentionFilter = this.attentionCaseFilter(query);
    if (attentionFilter) caseFilter.some = { ...caseFilter.some, ...attentionFilter };
    if (Object.keys(caseFilter).length > 0) where.user = { cases: caseFilter };
    if (query.createdFrom || query.createdTo) {
      where.createdAt = {
        ...(query.createdFrom ? { gte: new Date(query.createdFrom) } : {}),
        ...(query.createdTo ? { lte: new Date(query.createdTo) } : {}),
      };
    }

    return where;
  }

  /** One `Case` clause per attention filter — the list and the flags agree. */
  private attentionCaseFilter(query: QueryClientsDto): Prisma.CaseWhereInput | null {
    const now = new Date();
    switch (query.attention) {
      case 'MISSING_DOCS':
        return {
          documents: {
            some: { deletedAt: null, necessity: Necessity.REQUIRED, status: { notIn: SETTLED_STATUSES as DocumentStatus[] } },
          },
        };
      case 'PENDING_PAYMENT':
        return { payments: { some: { status: PaymentStatus.PENDING } } };
      case 'OVERDUE_TASK':
        return { workTasks: { some: { status: { in: OPEN_TASK_STATUSES }, dueAt: { lt: now } } } };
      case 'DEADLINE_SOON':
        return {
          documents: {
            some: {
              deletedAt: null,
              status: { notIn: SETTLED_STATUSES as DocumentStatus[] },
              dueAt: { lte: new Date(now.getTime() + DEADLINE_WARNING_DAYS * 86_400_000) },
            },
          },
        };
      default:
        return null;
    }
  }

  private buildOrderBy(query: QueryClientsDto): Prisma.ClientOrderByWithRelationInput {
    return query.sort === 'lastName'
      ? { lastName: query.order }
      : { [query.sort]: query.order };
  }

  /** Newest live case, falling back to the newest of any kind for a finished client. */
  private caseSummary(cases: CaseSummary[]) {
    const active = cases.find((c) => !TERMINAL_STAGES.includes(c.stage)) ?? cases[0] ?? null;
    const contract = active?.contract ?? null;
    return {
      activeCase: active
        ? {
            id: active.id,
            code: active.code,
            stage: active.stage,
            serviceType: active.serviceType,
            university: active.university,
          }
        : null,
      contractStatus: contract?.status ?? null,
      /** What staff mean by "гэрээ хийсэн огноо": the signature, or the draft date until then. */
      contractDate: contract ? (contract.signedAt ?? contract.createdAt) : null,
      caseCount: cases.length,
    };
  }

  private toListItem(row: ClientListRow) {
    const { user, ...rest } = row;
    return { ...rest, userId: user.id, ...this.caseSummary(user.cases) };
  }

  /** `KH-{year}-{seq}` — "харилцагч", sequence resets each calendar year. */
  private async generateCode(db: Db): Promise<string> {
    const year = new Date().getFullYear();
    const prefix = `KH-${year}-`;
    const count = await db.client.count({ where: { code: { startsWith: prefix } } });
    return `${prefix}${(count + 1).toString().padStart(4, '0')}`;
  }
}

/** The earlier of two possibly-absent dates. */
function earliest(current: Date | null, candidate: Date | null | undefined): Date | null {
  if (!candidate) return current;
  if (!current) return candidate;
  return candidate < current ? candidate : current;
}
