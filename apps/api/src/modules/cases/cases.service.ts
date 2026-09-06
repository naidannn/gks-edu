import { BadRequestException, ForbiddenException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { paginate } from '../../common/dto/pagination.dto.js';
import { isCrmStaff } from '../../common/constants/roles.js';
import type { AuthenticatedUser } from '../../common/types/authenticated-user.js';
import { nextYearlyCode } from '../../common/utils/yearly-code.js';
import { type CaseStage, Prisma, Role, type ServiceType } from '../../prisma/client.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import { AdmissionsService } from '../admissions/admissions.service.js';
import type { AssignCaseDto } from './dto/assign-case.dto.js';
import type { CreateCaseDto } from './dto/create-case.dto.js';
import type { QueryCasesDto } from './dto/query-cases.dto.js';
import type { TransitionCaseDto } from './dto/transition-case.dto.js';
import {
  type NormalisedChoice,
  type UniversityChoiceInput,
  normaliseChoices,
  primaryChoice,
} from './university-choice.rules.js';

/** Either the app-wide `PrismaService` or an interactive `$transaction` callback client. */
type Db = PrismaService | Prisma.TransactionClient;

/**
 * What `create`/`createWithin` actually need. Same shape as `CreateCaseDto`,
 * with the school list widened so in-process callers (`ClientsService`) can
 * hand over rows they have already normalised.
 */
export type CreateCaseInput = Omit<CreateCaseDto, 'universityChoices'> & {
  universityChoices?: readonly UniversityChoiceInput[];
};

/** Same widening for the replace endpoint's body. */
export type ReplaceUniversityChoicesInput = {
  universityChoices: readonly UniversityChoiceInput[];
};


/** Ordering of the flow rows that make up the main line; escapes sit at 900+. */
const MAIN_LINE_MAX_SORT = 900;

/** Everything a screen needs to name a chosen school, in preference order. */
const CHOICE_INCLUDE = {
  orderBy: { sortOrder: 'asc' },
  include: {
    university: { select: { id: true, nameMn: true, nameEn: true, slug: true } },
    program: { select: { id: true, nameMn: true, nameKo: true, level: true } },
  },
} satisfies Prisma.Case$universityChoicesArgs;

/**
 * `universityId` is the one-school shorthand every existing caller sends; a
 * `universityChoices` list, when given, is the whole answer and replaces it.
 */
function choiceInputs(dto: CreateCaseInput): readonly UniversityChoiceInput[] {
  if (dto.universityChoices && dto.universityChoices.length > 0) return dto.universityChoices;
  return dto.universityId ? [{ universityId: dto.universityId, programId: dto.programId ?? null }] : [];
}

@Injectable()
export class CasesService {
  private readonly logger = new Logger(CasesService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly admissions: AdmissionsService,
  ) {}

  async create(dto: CreateCaseInput) {
    const created = await this.createWithin(this.prisma, dto);
    // Outside `createWithin` so it also runs for the transactional callers,
    // after their transaction has committed.
    if (created.intakeId) await this.admissions.applyDeadlineToCase(created.id);
    return created;
  }

  /**
   * Same as `create`, but inside a caller's transaction — registering a client
   * opens their first case in one atomic step (1B-14).
   *
   * The intake is validated before anything is written: until 1H, `intakeId`
   * went into the row unchecked, so a case could point at another school's
   * round, at the wrong level, or at one that closed months ago.
   */
  async createWithin(db: Db, dto: CreateCaseInput) {
    const choices = normaliseChoices(dto.serviceType, choiceInputs(dto));
    await this.assertChoicesExist(db, choices);
    const primary = primaryChoice(choices);

    if (dto.intakeId) {
      await this.admissions.assertSelectable(dto.intakeId, primary?.universityId, dto.serviceType);
    }

    return db.case.create({
      data: {
        code: await this.generateCode(db),
        userId: dto.userId,
        serviceType: dto.serviceType,
        // The first preference is mirrored onto the case so every screen and
        // query that only ever needs "the school" keeps working unchanged.
        universityId: primary?.universityId,
        programId: primary?.programId ?? undefined,
        intakeId: dto.intakeId,
        universityChoices: choices.length > 0 ? { create: choices } : undefined,
      },
    });
  }

  /**
   * Replaces a case's school list (§5.1). Staff change their minds after the
   * contract is drafted — a school stops taking Mongolian students, a second
   * choice becomes the first — and the list is the one part of a case that is
   * meant to move, so it is a whole-list write rather than per-row edits.
   */
  async replaceUniversityChoices(id: string, dto: ReplaceUniversityChoicesInput) {
    const found = await this.getOrThrow(id);
    const choices = normaliseChoices(found.serviceType, dto.universityChoices);
    await this.assertChoicesExist(this.prisma, choices);
    const primary = primaryChoice(choices);

    if (found.intakeId && primary) {
      await this.admissions.assertSelectable(found.intakeId, primary.universityId, found.serviceType);
    }

    // A case whose first choice moved has nothing to say about the old school's
    // round, so the intake is dropped and re-picked on the admissions screen.
    const universityChanged = (primary?.universityId ?? null) !== found.universityId;

    await this.prisma.$transaction([
      this.prisma.caseUniversityChoice.deleteMany({ where: { caseId: id } }),
      ...(choices.length > 0
        ? [this.prisma.caseUniversityChoice.createMany({ data: choices.map((choice) => ({ ...choice, caseId: id })) })]
        : []),
      this.prisma.case.update({
        where: { id },
        data: {
          universityId: primary?.universityId ?? null,
          programId: primary?.programId ?? null,
          ...(universityChanged ? { intakeId: null } : {}),
        },
      }),
    ]);

    return this.prisma.case.findUnique({
      where: { id },
      include: {
        university: { select: { id: true, nameMn: true, nameEn: true } },
        universityChoices: CHOICE_INCLUDE,
      },
    });
  }

  /**
   * The FKs are `Restrict`/`SetNull`, so an unknown id would surface as a
   * Prisma error rather than a sentence staff can act on.
   */
  private async assertChoicesExist(db: Db, choices: readonly NormalisedChoice[]): Promise<void> {
    if (choices.length === 0) return;

    const [universities, programs] = await Promise.all([
      db.university.findMany({
        where: { id: { in: choices.map((choice) => choice.universityId) } },
        select: { id: true },
      }),
      db.universityProgram.findMany({
        where: { id: { in: choices.map((choice) => choice.programId).filter((id) => id !== null) } },
        select: { id: true, universityId: true },
      }),
    ]);

    if (universities.length !== choices.length) throw new BadRequestException('Сонгосон сургууль олдсонгүй');

    const programUniversity = new Map(programs.map((program) => [program.id, program.universityId]));
    for (const choice of choices) {
      if (!choice.programId) continue;
      const owner = programUniversity.get(choice.programId);
      if (owner !== choice.universityId) {
        throw new BadRequestException('Сонгосон хөтөлбөр тухайн сургуулийнх биш байна');
      }
    }
  }

  /** A logged-in user's own cases (1C-17) — there's no lead-conversion UI yet to link from, so this is the entry point. */
  async findMine(userId: string) {
    return this.prisma.case.findMany({
      where: { userId },
      include: {
        university: { select: { id: true, nameMn: true, nameEn: true } },
        universityChoices: CHOICE_INCLUDE,
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async findAllStaff(query: QueryCasesDto) {
    const where = this.buildWhere(query);
    const [items, total] = await Promise.all([
      this.prisma.case.findMany({
        where,
        include: {
          user: { select: { id: true, name: true, email: true } },
          university: { select: { id: true, nameMn: true, nameEn: true } },
          universityChoices: CHOICE_INCLUDE,
        },
        orderBy: { createdAt: 'desc' },
        skip: query.skip,
        take: query.limit,
      }),
      this.prisma.case.count({ where }),
    ]);
    return paginate(items, total, query.page, query.limit);
  }

  /**
   * The stage sequence for a service, read from `CaseFlowDefinition` rather
   * than a hardcoded list — the two families order `BALANCE_PAID` differently
   * around the visa step (§9), and that ordering is data.
   *
   * The client portal and the CRM client workspace both draw their stepper
   * from this, so "where is this person" reads the same on both sides.
   */
  async journey(serviceType: ServiceType): Promise<CaseStage[]> {
    const rows = await this.prisma.caseFlowDefinition.findMany({
      where: { serviceType, sortOrder: { lt: MAIN_LINE_MAX_SORT } },
      orderBy: { sortOrder: 'asc' },
      select: { fromStage: true, toStage: true },
    });
    if (rows.length === 0) return [];
    return [rows[0]!.fromStage, ...rows.map((row) => row.toStage)];
  }

  async findOne(id: string, user: AuthenticatedUser) {
    const found = await this.getOrThrow(id, {
      // `client` lets a case-scoped URL resolve to the client workspace that
      // now owns these screens.
      user: { select: { id: true, name: true, email: true, client: { select: { id: true, code: true } } } },
      university: { select: { id: true, nameMn: true, nameEn: true } },
      universityChoices: CHOICE_INCLUDE,
      assignedConsultant: { select: { id: true, name: true } },
      assignedDocOfficer: { select: { id: true, name: true } },
      contract: true,
      payments: { orderBy: { createdAt: 'desc' } },
      transitions: { orderBy: { createdAt: 'desc' }, take: 20, include: { actor: { select: { id: true, name: true } } } },
    });
    this.assertReadAccess(found, user);
    return found;
  }

  async assign(id: string, dto: AssignCaseDto) {
    await this.getOrThrow(id);

    if (dto.assignedConsultantId) {
      await this.assertActiveStaff(dto.assignedConsultantId, [Role.ADMIN, Role.CONSULTANT]);
    }
    if (dto.assignedDocOfficerId) {
      await this.assertActiveStaff(dto.assignedDocOfficerId, [Role.ADMIN, Role.DOC_OFFICER]);
    }

    return this.prisma.case.update({
      where: { id },
      data: {
        assignedConsultantId: dto.assignedConsultantId ?? null,
        assignedDocOfficerId: dto.assignedDocOfficerId ?? null,
      },
    });
  }

  private async assertActiveStaff(userId: string, allowedRoles: Role[]): Promise<void> {
    const user = await this.prisma.user.findFirst({ where: { id: userId, role: { in: allowedRoles }, isActive: true } });
    if (!user) throw new BadRequestException('Идэвхтэй, тохирох эрхтэй ажилтан олдсонгүй');
  }

  /** Staff-triggered move (1C-03) — validated against `CaseFlowDefinition`, never a free-form `PATCH`. */
  async transition(id: string, dto: TransitionCaseDto, actor: AuthenticatedUser) {
    const found = await this.getOrThrow(id);

    const rule = await this.prisma.caseFlowDefinition.findUnique({
      where: {
        serviceType_fromStage_toStage: {
          serviceType: found.serviceType,
          fromStage: found.stage,
          toStage: dto.toStage,
        },
      },
    });

    if (!rule) {
      throw new BadRequestException(`${found.stage} төлөвөөс ${dto.toStage} рүү шилжих боломжгүй`);
    }
    if (rule.isSystemOnly) {
      throw new BadRequestException('Энэ шилжилтийг зөвхөн систем автоматаар хийнэ (төлбөр/гэрээ баталгаажсанаар)');
    }
    if (rule.allowedRoles.length > 0 && !rule.allowedRoles.includes(actor.role)) {
      throw new ForbiddenException('Танд энэ шилжилтийг хийх эрх байхгүй');
    }

    return this.writeTransition(this.prisma, found.id, found.stage, dto.toStage, actor.id, dto.reason);
  }

  /**
   * System-triggered move (1C-15) — `ContractsService`/`PaymentsService` call
   * this once their own condition is met; `actorId` is always null on the
   * resulting `CaseTransition`. Pass `db` as the enclosing `$transaction`
   * callback client so the case update commits atomically with the caller's.
   */
  async applySystemTransition(db: Db, caseId: string, toStage: CaseStage): Promise<void> {
    const found = await db.case.findUnique({ where: { id: caseId } });
    if (!found) throw new NotFoundException(`Case ${caseId} not found`);

    const rule = await db.caseFlowDefinition.findUnique({
      where: {
        serviceType_fromStage_toStage: { serviceType: found.serviceType, fromStage: found.stage, toStage },
      },
    });
    if (!rule?.isSystemOnly) {
      throw new BadRequestException(`${found.stage} -> ${toStage} системийн шилжилт биш эсвэл тодорхойлогдоогүй байна`);
    }

    await this.writeTransition(db, caseId, found.stage, toStage, null, null);
  }

  /**
   * Moves the case as a *consequence* of a downstream aggregate's own event —
   * an application submitted, an invitation received, a visa approved (1E/1F).
   *
   * The edge must exist in `CaseFlowDefinition`, but the actor's role is not
   * checked: the authority here is the event, not a staff click, and a document
   * officer recording a school's decision must not be blocked by the CRM roles
   * on that edge. Returns false (and logs) when the case is somewhere the edge
   * does not start from, so recording the fact never fails on the stage graph.
   */
  async applyDomainTransition(caseId: string, toStage: CaseStage, actorId: string | null, reason: string): Promise<boolean> {
    const found = await this.prisma.case.findUnique({ where: { id: caseId } });
    if (!found) throw new NotFoundException(`Case ${caseId} not found`);
    if (found.stage === toStage) return false;

    const rule = await this.prisma.caseFlowDefinition.findUnique({
      where: {
        serviceType_fromStage_toStage: { serviceType: found.serviceType, fromStage: found.stage, toStage },
      },
    });
    if (!rule) {
      this.logger.warn(`${found.code}: ${found.stage} -> ${toStage} шилжилт урсгалд алга — үе шат хөдөлгөөгүй үлдлээ`);
      return false;
    }

    await this.writeTransition(this.prisma, caseId, found.stage, toStage, actorId, reason);
    return true;
  }

  private async writeTransition(
    db: Db,
    caseId: string,
    fromStage: CaseStage,
    toStage: CaseStage,
    actorId: string | null,
    reason?: string | null,
  ) {
    const [updated] = await Promise.all([
      db.case.update({ where: { id: caseId }, data: { stage: toStage } }),
      db.caseTransition.create({ data: { caseId, fromStage, toStage, actorId, reason: reason ?? null } }),
    ]);
    return updated;
  }

  private assertReadAccess(found: { userId: string }, user: AuthenticatedUser): void {
    if (!isCrmStaff(user.role) && found.userId !== user.id) {
      throw new ForbiddenException('Энэ үйлчилгээнд хандах эрхгүй байна');
    }
  }

  private async getOrThrow(id: string, include?: Prisma.CaseInclude) {
    const found = await this.prisma.case.findUnique({ where: { id }, include });
    if (!found) throw new NotFoundException(`Case ${id} not found`);
    return found;
  }

  private buildWhere(query: QueryCasesDto): Prisma.CaseWhereInput {
    const where: Prisma.CaseWhereInput = {};
    if (query.q) {
      where.OR = [
        { code: { contains: query.q, mode: 'insensitive' } },
        { user: { OR: [{ name: { contains: query.q, mode: 'insensitive' } }, { email: { contains: query.q, mode: 'insensitive' } }] } },
      ];
    }
    if (query.stage) where.stage = query.stage;
    if (query.serviceType) where.serviceType = query.serviceType;
    if (query.assignedConsultantId) where.assignedConsultantId = query.assignedConsultantId;
    if (query.assignedDocOfficerId) where.assignedDocOfficerId = query.assignedDocOfficerId;
    return where;
  }

  /** `GKS-2026-0007` (§5). */
  private generateCode(db: Db): Promise<string> {
    return nextYearlyCode('GKS', (stem) => db.case.count({ where: { code: { startsWith: stem } } }));
  }
}
