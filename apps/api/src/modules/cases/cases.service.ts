import { BadRequestException, ConflictException, ForbiddenException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { assertOwnerOrCrm } from '../../common/auth/assert-owner.js';
import { paginate } from '../../common/dto/pagination.dto.js';
import { isCrmStaff } from '../../common/constants/roles.js';
import type { AuthenticatedUser } from '../../common/types/authenticated-user.js';
import { nextYearlyCode } from '../../common/utils/yearly-code.js';
import { CaseStage, Prisma, Role, type ServiceType } from '../../prisma/client.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import { AdmissionsService } from '../admissions/admissions.service.js';
import { CLIENT_CONTRACT_SELECT, toClientContract } from '../contracts/client-contract.select.js';
import { CLIENT_PAYMENT_SELECT } from '../payments/client-payment.select.js';
import { CASE_FLOWS, mainLineForward } from './case-flow.js';
import { CASE_STAGE_LABELS } from './case-stage-labels.js';
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
      // The programme goes in too: one on its own calendar is judged against
      // its override, not against the round everybody else runs to (§3.2).
      await this.admissions.assertSelectable(
        dto.intakeId,
        primary?.universityId,
        dto.serviceType,
        undefined,
        primary?.programId,
      );
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

    // A case whose first choice moved has nothing to say about the old school's
    // round, so the intake is dropped and re-picked on the admissions screen.
    const universityChanged = (primary?.universityId ?? null) !== found.universityId;

    // Asked only while the school stayed put. Asking it first was the bug
    // (1N-13): `assertSelectable` throws on an intake belonging to another
    // school, which is precisely the case the line above exists to handle — so
    // moving the first choice always 400'd instead of dropping the intake.
    if (found.intakeId && primary && !universityChanged) {
      await this.admissions.assertSelectable(
        found.intakeId,
        primary.universityId,
        found.serviceType,
        undefined,
        primary.programId,
      );
    }

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

  /**
   * One case, for staff or for the client it belongs to. The client's copy is
   * narrowed: a case-scoped URL is reachable by its owner, so the same include
   * that gives staff `receiptPath` and `signedIp` would have handed them over
   * (1N-04).
   */
  async findOne(id: string, user: AuthenticatedUser) {
    const staff = isCrmStaff(user.role);
    const found = await this.getOrThrow(id, {
      // `client` lets a case-scoped URL resolve to the client workspace that
      // now owns these screens.
      user: { select: { id: true, name: true, email: true, client: { select: { id: true, code: true } } } },
      university: { select: { id: true, nameMn: true, nameEn: true } },
      universityChoices: CHOICE_INCLUDE,
      assignedConsultant: { select: { id: true, name: true } },
      assignedDocOfficer: { select: { id: true, name: true } },
      contract: staff ? true : { select: CLIENT_CONTRACT_SELECT },
      payments: { ...(staff ? {} : { select: CLIENT_PAYMENT_SELECT }), orderBy: { createdAt: 'desc' } },
      transitions: { orderBy: { createdAt: 'desc' }, take: 20, include: { actor: { select: { id: true, name: true } } } },
    });
    this.assertReadAccess(found, user);

    if (staff) return found;
    const contract = (found as { contract?: { pdfPath: string | null } | null }).contract;
    return { ...found, contract: contract ? toClientContract(contract) : null };
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
      throw new BadRequestException(
        `${CASE_STAGE_LABELS[found.stage]} төлөвөөс ${CASE_STAGE_LABELS[dto.toStage]} рүү шилжих боломжгүй`,
      );
    }
    if (rule.isSystemOnly) {
      throw new BadRequestException('Энэ шилжилтийг зөвхөн систем автоматаар хийнэ (төлбөр/гэрээ баталгаажсанаар)');
    }
    if (rule.allowedRoles.length > 0 && !rule.allowedRoles.includes(actor.role)) {
      throw new ForbiddenException('Танд энэ шилжилтийг хийх эрх байхгүй');
    }
    if (found.stage === CaseStage.ON_HOLD) {
      await this.assertResumable(found.id, found.serviceType, dto.toStage);
    }

    await this.writeTransition(this.prisma, found.id, found.stage, dto.toStage, actor.id, dto.reason);
    return this.prisma.case.findUniqueOrThrow({ where: { id: found.id } });
  }

  /**
   * A paused case resumes where it has been, and nowhere else (1N-06).
   *
   * `ON_HOLD` has an edge to every non-system stage of the flow, because staff
   * decide where the work picks up — but that list is "any stage", and without
   * this a case parked at `CONTRACT_DRAFT` could come back at `VISA_APPROVED`,
   * skipping the contract and the money. The trail says where it has actually
   * been; the flow's own first stage is where every case starts and leaves no
   * row behind it.
   */
  private async assertResumable(caseId: string, serviceType: ServiceType, toStage: CaseStage): Promise<void> {
    if (CASE_FLOWS[serviceType][0] === toStage) return;

    const beenThere = await this.prisma.caseTransition.findFirst({
      where: { caseId, toStage },
      select: { id: true },
    });
    if (!beenThere) {
      throw new BadRequestException(
        `Түр зогссон үйлчилгээг "${CASE_STAGE_LABELS[toStage]}" шат руу үргэлжлүүлэх боломжгүй — энэ үйлчилгээ тэр шатанд байгаагүй байна`,
      );
    }
  }

  /**
   * System-triggered move (1C-15) — `ContractsService`/`PaymentsService` call
   * this once their own condition is met; `actorId` is always null on the
   * resulting `CaseTransition`. Pass `db` as the enclosing `$transaction`
   * callback client so the case update commits atomically with the caller's.
   */
  async applySystemTransition(db: Db, caseId: string, toStage: CaseStage): Promise<void> {
    const found = await db.case.findUnique({ where: { id: caseId } });
    if (!found) throw new NotFoundException(`Үйлчилгээ ${caseId} олдсонгүй`);

    const rule = await db.caseFlowDefinition.findUnique({
      where: {
        serviceType_fromStage_toStage: { serviceType: found.serviceType, fromStage: found.stage, toStage },
      },
    });
    if (!rule?.isSystemOnly) {
      throw new BadRequestException(
        `${CASE_STAGE_LABELS[found.stage]} -> ${CASE_STAGE_LABELS[toStage]} системийн шилжилт биш эсвэл тодорхойлогдоогүй байна`,
      );
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
    if (!found) throw new NotFoundException(`Үйлчилгээ ${caseId} олдсонгүй`);
    if (found.stage === toStage) return false;

    const rule = await this.prisma.caseFlowDefinition.findUnique({
      where: {
        serviceType_fromStage_toStage: { serviceType: found.serviceType, fromStage: found.stage, toStage },
      },
    });
    if (rule) {
      await this.writeTransition(this.prisma, caseId, found.stage, toStage, actorId, reason);
      return true;
    }

    // No single edge, but the target may still be ahead on the main line — a
    // step nobody recorded (an invitation with no school invoice in front of
    // it) is otherwise fatal: the case stops moving, and the balance invoice is
    // refused for a stage it never reached (1N-27). Walk the gap instead, one
    // `CaseTransition` per hop, so the trail says which steps were skipped.
    const hops = mainLineForward(found.serviceType, found.stage, toStage);
    if (!hops) {
      this.logger.warn(`${found.code}: ${found.stage} -> ${toStage} шилжилт урсгалд алга — үе шат хөдөлгөөгүй үлдлээ`);
      return false;
    }

    this.logger.warn(`${found.code}: ${found.stage} -> ${toStage} — ${hops.length - 1} алгассан шатыг нөхөж бичлээ`);
    await this.prisma.$transaction(async (tx) => {
      let fromStage = found.stage;
      for (const hop of hops) {
        // Only the hop the caller asked for carries their plain reason; the
        // ones in front of it are marked, so a report reading the trail can
        // tell a recorded step from one the system filled in.
        const hopReason = hop === toStage ? reason : `${reason} (алгассан шат)`;
        await this.writeTransition(tx, caseId, fromStage, hop, actorId, hopReason);
        fromStage = hop;
      }
    });
    return true;
  }

  /**
   * The stage and its trail entry are one fact, so they are one transaction —
   * under `Promise.all` a failed `caseTransition.create` left the case standing
   * somewhere with no record of how it got there (1N-14).
   *
   * The update is conditional on the stage we read, so two staff clicking the
   * same button do not both apply: the loser matches no row and is told to
   * reload rather than writing a second transition out of a stage the case has
   * already left.
   */
  private async writeTransition(
    db: Db,
    caseId: string,
    fromStage: CaseStage,
    toStage: CaseStage,
    actorId: string | null,
    reason?: string | null,
  ): Promise<void> {
    const write = async (tx: Db) => {
      const claimed = await tx.case.updateMany({ where: { id: caseId, stage: fromStage }, data: { stage: toStage } });
      if (claimed.count === 0) {
        throw new ConflictException('Үйлчилгээний төлөв энэ хооронд өөрчлөгдсөн байна — хуудсаа сэргээгээд дахин оролдоно уу');
      }
      await tx.caseTransition.create({ data: { caseId, fromStage, toStage, actorId, reason: reason ?? null } });
    };

    // A payment or a contract signing is already inside its own transaction and
    // hands it over as `db`; only a standalone move opens one.
    if (db === this.prisma) {
      await this.prisma.$transaction(write);
      return;
    }
    await write(db);
  }

  private assertReadAccess(found: { userId: string }, user: AuthenticatedUser): void {
    assertOwnerOrCrm(found.userId, user, 'Энэ үйлчилгээнд хандах эрхгүй байна');
  }

  private async getOrThrow(id: string, include?: Prisma.CaseInclude) {
    const found = await this.prisma.case.findUnique({ where: { id }, include });
    if (!found) throw new NotFoundException(`Үйлчилгээ ${id} олдсонгүй`);
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
