import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { paginate } from '../../common/dto/pagination.dto.js';
import {
  CaseStage,
  ClientStatus,
  LeadActivityType,
  LeadSource,
  LeadStage,
  Prisma,
  Role,
} from '../../prisma/client.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import { CasesService } from '../cases/cases.service.js';
import { ADULT_AGE, ageOn } from './dto/client-fields.js';
import type { ConvertLeadDto } from './dto/convert-lead.dto.js';
import type { CreateClientDto } from './dto/create-client.dto.js';
import type { QueryClientsDto } from './dto/query-clients.dto.js';
import type { UpdateClientDto } from './dto/update-client.dto.js';

/** Either the app-wide `PrismaService` or an interactive `$transaction` client. */
type Db = PrismaService | Prisma.TransactionClient;

/**
 * The client's live service cycle, as shown in the list. One client may run
 * several cases over time (§20 — a language-prep client coming back for a
 * bachelor's); the newest non-terminal one is the one staff are working on.
 */
const TERMINAL_STAGES: CaseStage[] = [CaseStage.COMPLETED, CaseStage.CANCELLED, CaseStage.REJECTED];

const CASE_SUMMARY_SELECT = {
  id: true,
  code: true,
  stage: true,
  serviceType: true,
  createdAt: true,
  university: { select: { id: true, nameMn: true } },
  contract: { select: { id: true, status: true, type: true, signedAt: true, createdAt: true } },
} satisfies Prisma.CaseSelect;

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
  targetUniversity: { select: { id: true, nameMn: true } },
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
  ) {}

  // ─── Create ───────────────────────────────────────────────────────────────

  /**
   * Register a client from scratch (1B-14) — no lead required. The backing
   * `User` row is created in the same transaction because `Case`, `Contract`
   * and `Payment` all reference `userId`; it carries no password, so it cannot
   * be logged into until the client claims it.
   */
  async create(dto: CreateClientDto, actorId: string) {
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
          universityId: dto.targetUniversityId,
          intakeId: dto.plannedIntakeId,
        });
      }

      return client;
    });

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
          universityId: merged.targetUniversityId,
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

    return this.findOne(created.id);
  }

  // ─── Read ─────────────────────────────────────────────────────────────────

  async findAllStaff(query: QueryClientsDto) {
    const where = this.buildWhere(query);

    const [rows, total] = await this.prisma.$transaction([
      this.prisma.client.findMany({
        where,
        select: LIST_SELECT,
        orderBy: this.buildOrderBy(query),
        skip: query.skip,
        take: query.limit,
      }),
      this.prisma.client.count({ where }),
    ]);

    return paginate(rows.map((row) => this.toListItem(row)), total, query.page, query.limit);
  }

  /** Counters for the list header: total, by status, and how many are already under contract. */
  async stats() {
    const [total, byStatusRows, withContract, unassigned] = await this.prisma.$transaction([
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
      },
    });
    if (!client) throw new NotFoundException('Хэрэглэгч олдсонгүй');

    const { user, ...rest } = client;
    return {
      ...rest,
      ...this.caseSummary(user.cases),
      userId: user.id,
      cases: user.cases,
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

    await this.prisma.$transaction(async (tx) => {
      await tx.client.update({ where: { id }, data: this.toClientData(dto) });

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

    return this.findOne(id);
  }

  // ─── Internals ────────────────────────────────────────────────────────────

  /** Shared column mapping — `undefined` keys are skipped by Prisma on update. */
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

  private async assertRegisterFree(registerNumber: string): Promise<void> {
    const clash = await this.prisma.client.findUnique({
      where: { registerNumber },
      select: { code: true },
    });
    if (clash) throw new ConflictException(`Энэ регистрийн дугаартай хэрэглэгч бүртгэлтэй байна (${clash.code})`);
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
    if (Object.keys(caseFilter).length > 0) where.user = { cases: caseFilter };
    if (query.createdFrom || query.createdTo) {
      where.createdAt = {
        ...(query.createdFrom ? { gte: new Date(query.createdFrom) } : {}),
        ...(query.createdTo ? { lte: new Date(query.createdTo) } : {}),
      };
    }

    return where;
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
