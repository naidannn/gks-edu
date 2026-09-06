import { BadRequestException, ConflictException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { paginate } from '../../common/dto/pagination.dto.js';
import {
  DocumentStatus,
  IntakeSource,
  IntakeStatus,
  Necessity,
  Prisma,
  type ProgramLevel,
  type ServiceType,
} from '../../prisma/client.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import { CacheService } from '../../redis/cache.service.js';
import { SETTLED_STATUSES } from '../documents/document-status.js';
import { AdmissionConfigService } from './admission-config.service.js';
import type {
  BulkCreateIntakeTermsDto,
  CreateIntakeTermDto,
  UpdateIntakeTermDto,
  UpsertIntakeProgramOverrideDto,
} from './dto/intake-term.dto.js';
import type {
  AdmissionSort,
  QueryAdminAdmissionsDto,
  QueryAdmissionsDto,
} from './dto/query-admissions.dto.js';
import {
  SERVICE_LEVELS,
  type IntakePhase,
  computeIntakePhase,
  computeInternalDeadline,
  daysUntil,
  isIntakeSelectable,
  serviceAcceptsLevel,
} from './intake-deadline.js';

export const ADMISSIONS_CACHE_PATTERN = 'admissions:*';

const LIST_CACHE_TTL_MS = 60_000;
const FACETS_CACHE_TTL_MS = 300_000;

/** The school columns an admissions row carries — the public catalogue card. */
const UNIVERSITY_CARD = {
  id: true,
  slug: true,
  nameMn: true,
  nameEn: true,
  nameKo: true,
  type: true,
  cityMn: true,
  regionMn: true,
  regionEn: true,
  foundedYear: true,
  studentsTotal: true,
  logoPath: true,
  shortIntroMn: true,
  acceptsLanguagePrep: true,
  isGksEligible: true,
  livingCost: true,
  theKoreaRank: true,
  theWorldRank: true,
  theRankYear: true,
} satisfies Prisma.UniversitySelect;

const INTAKE_FIELDS = {
  id: true,
  universityId: true,
  level: true,
  year: true,
  month: true,
  openAt: true,
  applicationDeadline: true,
  internalDeadline: true,
  internalDeadlineIsManual: true,
  classStartDate: true,
  resultAnnouncedAt: true,
  quota: true,
  admissionFeeKrw: true,
  requirementNote: true,
  status: true,
  note: true,
  sourceUrl: true,
  sourceType: true,
  verifiedAt: true,
} satisfies Prisma.IntakeTermSelect;

const ADMIN_INTAKE_FIELDS = {
  ...INTAKE_FIELDS,
  verifiedBy: { select: { id: true, name: true } },
  programOverrides: {
    orderBy: { createdAt: 'asc' },
    select: {
      id: true,
      programId: true,
      openAt: true,
      applicationDeadline: true,
      internalDeadline: true,
      internalDeadlineIsManual: true,
      classStartDate: true,
      quota: true,
      note: true,
      program: { select: { nameMn: true } },
    },
  },
  _count: { select: { cases: true, applications: true } },
} satisfies Prisma.IntakeTermSelect;

type IntakeRow = Prisma.IntakeTermGetPayload<{ select: typeof INTAKE_FIELDS }>;
type UniversityCardRow = Prisma.UniversityGetPayload<{ select: typeof UNIVERSITY_CARD }>;
type AdminIntakeRow = Prisma.IntakeTermGetPayload<{ select: typeof ADMIN_INTAKE_FIELDS }>;

const ORDER_BY: Record<AdmissionSort, (order: Prisma.SortOrder) => Prisma.IntakeTermOrderByWithRelationInput[]> = {
  // The default. A null deadline is not "soonest" — an unknown date sorts last
  // either way, the same rule the catalogue uses for unknown metrics.
  deadline: (order) => [{ internalDeadline: { sort: order, nulls: 'last' } }, { year: 'asc' }, { month: 'asc' }],
  classStart: (order) => [{ classStartDate: { sort: order, nulls: 'last' } }, { year: 'asc' }, { month: 'asc' }],
  gks: (order) => [{ university: { gksRank: { sort: order, nulls: 'last' } } }, { internalDeadline: 'asc' }],
  university: (order) => [{ university: { nameMn: order } }, { year: 'asc' }, { month: 'asc' }],
};

/**
 * The intake calendar (1H — gksedu.md §4.1, §4.2).
 *
 * Everything about "when does this close and who is going to miss it" lives
 * here. The date arithmetic itself is in `intake-deadline.ts`; this class owns
 * the storage, the cache and the rule that an intake a case depends on cannot
 * simply be deleted.
 */
@Injectable()
export class AdmissionsService {
  private readonly logger = new Logger(AdmissionsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly cache: CacheService,
    private readonly config: AdmissionConfigService,
  ) {}

  /* --------------------------------------------------------------------- *
   * Public catalogue
   * --------------------------------------------------------------------- */

  async findAll(query: QueryAdmissionsDto) {
    const now = new Date();
    const where = this.buildPublicWhere(query, now);

    const run = async () => {
      const [rows, total] = await Promise.all([
        this.prisma.intakeTerm.findMany({
          where,
          select: { ...INTAKE_FIELDS, university: { select: UNIVERSITY_CARD } },
          orderBy: ORDER_BY[query.sort](query.order),
          skip: query.skip,
          take: query.limit,
        }),
        this.prisma.intakeTerm.count({ where }),
      ]);

      return paginate(
        rows.map((row) => this.serializeWithUniversity(row, now)),
        total,
        query.page,
        query.limit,
      );
    };

    const key = this.listCacheKey(query);
    return key ? this.cache.wrap(key, run, LIST_CACHE_TTL_MS) : run();
  }

  async facets() {
    return this.cache.wrap(
      'admissions:facets',
      async () => {
        const now = new Date();
        const where = this.publishedWhere(now);

        const [total, byLevel, byMonth, byYear, regions, closingSoon] = await Promise.all([
          this.prisma.intakeTerm.count({ where }),
          this.prisma.intakeTerm.groupBy({ by: ['level'], where, _count: { _all: true } }),
          this.prisma.intakeTerm.groupBy({ by: ['month'], where, _count: { _all: true } }),
          this.prisma.intakeTerm.groupBy({ by: ['year'], where, _count: { _all: true } }),
          this.prisma.intakeTerm.findMany({
            where,
            select: { university: { select: { regionEn: true, regionMn: true } } },
          }),
          this.prisma.intakeTerm.count({
            where: {
              ...where,
              internalDeadline: { gte: now, lte: new Date(now.getTime() + 14 * 24 * 60 * 60 * 1000) },
            },
          }),
        ]);

        const regionCounts = new Map<string, { label: string; count: number }>();
        for (const row of regions) {
          const key = row.university.regionEn;
          const entry = regionCounts.get(key) ?? { label: row.university.regionMn, count: 0 };
          entry.count += 1;
          regionCounts.set(key, entry);
        }

        return {
          total,
          levels: byLevel.map((row) => ({ value: row.level, count: row._count._all })),
          months: byMonth
            .map((row) => ({ value: row.month, count: row._count._all }))
            .sort((a, b) => a.value - b.value),
          years: byYear.map((row) => ({ value: row.year, count: row._count._all })).sort((a, b) => a.value - b.value),
          regions: [...regionCounts.entries()]
            .map(([value, { label, count }]) => ({ value, label, count }))
            .sort((a, b) => b.count - a.count),
          closingSoon,
        };
      },
      FACETS_CACHE_TTL_MS,
    );
  }

  /** One year of rounds, bucketed by the month classes start (§4.1). */
  async calendar(year: number) {
    return this.cache.wrap(
      `admissions:calendar:${year}`,
      async () => {
        const now = new Date();
        const rows = await this.prisma.intakeTerm.findMany({
          where: { ...this.publishedWhere(now), year },
          select: { ...INTAKE_FIELDS, university: { select: UNIVERSITY_CARD } },
          orderBy: [{ month: 'asc' }, { internalDeadline: { sort: 'asc', nulls: 'last' } }],
        });

        type Bucket = { year: number; month: number; intakes: ReturnType<AdmissionsService['serializeWithUniversity']>[] };
        const buckets = new Map<number, Bucket>();
        for (const row of rows) {
          const bucket = buckets.get(row.month) ?? { year, month: row.month, intakes: [] };
          bucket.intakes.push(this.serializeWithUniversity(row, now));
          buckets.set(row.month, bucket);
        }

        return [...buckets.values()].sort((a, b) => a.month - b.month);
      },
      LIST_CACHE_TTL_MS,
    );
  }

  /**
   * The rounds a client may pick for a case, for the start-a-case wizard and
   * the university page — everything up to our own deadline.
   *
   * A `FINAL_CALL` round (ours passed, the school's has not) is deliberately
   * absent here while `assertSelectable` still accepts it: a client is not
   * offered a round they are already late for, but a consultant who decides it
   * is worth pushing can still point a case at it.
   */
  async selectableForUniversity(universityId: string, serviceType?: ServiceType) {
    const now = new Date();
    const rows = await this.prisma.intakeTerm.findMany({
      where: {
        universityId,
        status: IntakeStatus.OPEN,
        OR: this.stillOpenWhere(now),
        ...(serviceType ? { level: { in: this.levelsForService(serviceType) } } : {}),
      },
      select: INTAKE_FIELDS,
      orderBy: [{ internalDeadline: { sort: 'asc', nulls: 'last' } }, { year: 'asc' }, { month: 'asc' }],
    });

    return rows.map((row) => this.serialize(row, now));
  }

  /**
   * The soonest month a new applicant could still register for at this level —
   * the headline of the study planner (ARCHITECTURE.md §3.4).
   *
   * It lives here rather than in the planner because "which rounds are still
   * catchable" is this module's rule, and a second copy of it is how the
   * planner ends up advertising a round the calendar has already closed. What
   * comes back is a *month*, not a round: a plan is made in months, and the one
   * date attached to it is the earliest deadline in that month — after it the
   * schools start dropping out of the list one by one.
   *
   * Returns `null` when no round at this level is entered yet, which is not an
   * error: the planner then falls back to the academic calendar and says so.
   */
  async earliestOpenMonth(
    level: ProgramLevel,
    options: { region?: string | null; notBefore?: Date | null } = {},
  ): Promise<{
    year: number;
    month: number;
    registerBy: Date | null;
    classStartDate: Date | null;
    intakeCount: number;
  } | null> {
    const now = new Date();
    const groups = await this.prisma.intakeTerm.groupBy({
      by: ['year', 'month'],
      where: {
        ...this.publishedWhere(now),
        level,
        ...(options.region ? { university: { isPublished: true, regionEn: options.region } } : {}),
      },
      _count: { _all: true },
      _min: { internalDeadline: true, classStartDate: true },
      orderBy: [{ year: 'asc' }, { month: 'asc' }],
    });

    const floor = options.notBefore ?? null;
    for (const group of groups) {
      // Compare on the first of the month at noon UTC, the same instant the
      // planner's calendar fallback uses, so the two agree on "after".
      const monthStart = new Date(Date.UTC(group.year, group.month - 1, 1, 12));
      if (floor && monthStart.getTime() <= floor.getTime()) continue;
      return {
        year: group.year,
        month: group.month,
        registerBy: group._min.internalDeadline,
        classStartDate: group._min.classStartDate,
        intakeCount: group._count._all,
      };
    }

    return null;
  }

  /* --------------------------------------------------------------------- *
   * Staff CRUD
   * --------------------------------------------------------------------- */

  async findAllAdmin(query: QueryAdminAdmissionsDto) {
    const now = new Date();
    const where = this.buildAdminWhere(query, now);

    const [rows, total] = await Promise.all([
      this.prisma.intakeTerm.findMany({
        where,
        select: { ...ADMIN_INTAKE_FIELDS, university: { select: UNIVERSITY_CARD } },
        orderBy: ORDER_BY[query.sort](query.order),
        skip: query.skip,
        take: query.limit,
      }),
      this.prisma.intakeTerm.count({ where }),
    ]);

    return paginate(
      rows.map((row) => ({ ...this.serializeAdmin(row, now), university: row.university })),
      total,
      query.page,
      query.limit,
    );
  }

  async findOneAdmin(id: string) {
    const row = await this.prisma.intakeTerm.findUnique({
      where: { id },
      select: { ...ADMIN_INTAKE_FIELDS, university: { select: UNIVERSITY_CARD } },
    });
    if (!row) throw new NotFoundException('Элсэлтийн улирал олдсонгүй.');

    return { ...this.serializeAdmin(row, new Date()), university: row.university };
  }

  async create(dto: CreateIntakeTermDto, actorId: string | null) {
    const university = await this.prisma.university.findUnique({
      where: { id: dto.universityId },
      select: { id: true, slug: true },
    });
    if (!university) throw new NotFoundException('Сургууль олдсонгүй.');

    const duplicate = await this.prisma.intakeTerm.findFirst({
      where: { universityId: dto.universityId, level: dto.level, year: dto.year, month: dto.month },
      select: { id: true },
    });
    if (duplicate) {
      throw new ConflictException('Тухайн түвшний энэ элсэлтийн улирал аль хэдийн бүртгэгдсэн байна.');
    }

    const row = await this.prisma.intakeTerm.create({
      data: await this.buildWriteData(dto, actorId, { isCreate: true }),
      select: ADMIN_INTAKE_FIELDS,
    });

    await this.invalidate(university.slug);
    return this.serializeAdmin(row, new Date());
  }

  /**
   * Saves several reviewed rounds at once — how a year's worth of research
   * candidates lands after staff have read them. Atomic: a batch that trips
   * the duplicate check writes nothing, so the reviewer sees one clear error
   * rather than a half-imported year.
   */
  async createMany(dto: BulkCreateIntakeTermsDto, actorId: string | null) {
    if (!dto.intakes.length) throw new BadRequestException('Нэмэх элсэлт сонгогдоогүй байна.');

    const data = await Promise.all(dto.intakes.map((intake) => this.buildWriteData(intake, actorId, { isCreate: true })));

    const created = await this.prisma.$transaction(
      data.map((row) => this.prisma.intakeTerm.create({ data: row, select: ADMIN_INTAKE_FIELDS })),
    );

    const slugs = await this.prisma.university.findMany({
      where: { id: { in: [...new Set(dto.intakes.map((i) => i.universityId))] } },
      select: { slug: true },
    });
    await this.invalidate(...slugs.map((row) => row.slug));

    const now = new Date();
    return created.map((row) => this.serializeAdmin(row, now));
  }

  /**
   * `expectedUniversityId` is passed by the per-university route
   * (`/admin/universities/:id/intakes/:intakeId`) so a path cannot address one
   * school and edit another school's round.
   */
  async update(id: string, dto: UpdateIntakeTermDto, actorId: string | null, expectedUniversityId?: string) {
    const existing = await this.prisma.intakeTerm.findUnique({
      where: { id },
      select: {
        universityId: true,
        applicationDeadline: true,
        internalDeadline: true,
        internalDeadlineIsManual: true,
        university: { select: { slug: true } },
      },
    });
    if (!existing) throw new NotFoundException('Элсэлтийн улирал олдсонгүй.');
    if (expectedUniversityId && existing.universityId !== expectedUniversityId) {
      throw new NotFoundException('Элсэлтийн улирал энэ сургуульд харьяалагдахгүй байна.');
    }

    const row = await this.prisma.intakeTerm.update({
      where: { id },
      data: await this.buildWriteData(dto, actorId, { isCreate: false, existing }),
      select: ADMIN_INTAKE_FIELDS,
    });

    // Moving the deadline moves every case riding on this round.
    await this.applyDeadlineToCases(id);
    await this.invalidate(existing.university.slug);
    return this.serializeAdmin(row, new Date());
  }

  async remove(id: string, expectedUniversityId?: string): Promise<void> {
    const existing = await this.prisma.intakeTerm.findUnique({
      where: { id },
      select: {
        universityId: true,
        university: { select: { slug: true } },
        _count: { select: { cases: true, applications: true } },
      },
    });
    if (!existing) throw new NotFoundException('Элсэлтийн улирал олдсонгүй.');
    if (expectedUniversityId && existing.universityId !== expectedUniversityId) {
      throw new NotFoundException('Элсэлтийн улирал энэ сургуульд харьяалагдахгүй байна.');
    }

    const { cases, applications } = existing._count;
    if (cases + applications > 0) {
      throw new ConflictException(
        `Энэ элсэлтийн улирал ${cases} үйлчилгээ, ${applications} мэдүүлэгт ашиглагдсан тул устгах боломжгүй. ` +
          'Оронд нь төлөвийг "Цуцлагдсан" болгоно уу.',
      );
    }

    await this.prisma.intakeTerm.delete({ where: { id } });
    await this.invalidate(existing.university.slug);
  }

  /* --------------------------------------------------------------------- *
   * Programme overrides — one programme running to its own calendar
   * --------------------------------------------------------------------- */

  async upsertOverride(intakeId: string, dto: UpsertIntakeProgramOverrideDto) {
    const intake = await this.prisma.intakeTerm.findUnique({
      where: { id: intakeId },
      select: { universityId: true, applicationDeadline: true, university: { select: { slug: true } } },
    });
    if (!intake) throw new NotFoundException('Элсэлтийн улирал олдсонгүй.');

    const program = await this.prisma.universityProgram.findFirst({
      where: { id: dto.programId, universityId: intake.universityId },
      select: { id: true },
    });
    if (!program) throw new NotFoundException('Хөтөлбөр энэ сургуульд харьяалагдахгүй байна.');

    const leadDays = await this.config.getInternalLeadDays();
    const applicationDeadline = this.toDate(dto.applicationDeadline);
    // A deadline the reviewer typed freezes; otherwise derive it from whichever
    // school deadline applies — the override's, or the term's.
    const manual = dto.internalDeadline !== undefined && dto.internalDeadline !== null;
    const internalDeadline = manual
      ? this.toDate(dto.internalDeadline)
      : computeInternalDeadline(applicationDeadline ?? intake.applicationDeadline, leadDays);

    const data = {
      openAt: this.toDate(dto.openAt),
      applicationDeadline,
      internalDeadline,
      internalDeadlineIsManual: manual,
      classStartDate: this.toDate(dto.classStartDate),
      quota: dto.quota ?? null,
      note: dto.note ?? null,
    };

    const override = await this.prisma.intakeProgramOverride.upsert({
      where: { intakeId_programId: { intakeId, programId: dto.programId } },
      update: data,
      create: { intakeId, programId: dto.programId, ...data },
      select: {
        id: true,
        programId: true,
        openAt: true,
        applicationDeadline: true,
        internalDeadline: true,
        internalDeadlineIsManual: true,
        classStartDate: true,
        quota: true,
        note: true,
        program: { select: { nameMn: true } },
      },
    });

    await this.invalidate(intake.university.slug);
    return this.serializeOverride(override);
  }

  async removeOverride(intakeId: string, overrideId: string): Promise<void> {
    const override = await this.prisma.intakeProgramOverride.findFirst({
      where: { id: overrideId, intakeId },
      select: { id: true, intake: { select: { university: { select: { slug: true } } } } },
    });
    if (!override) throw new NotFoundException('Хөтөлбөрийн онцгой хугацаа олдсонгүй.');

    await this.prisma.intakeProgramOverride.delete({ where: { id: overrideId } });
    await this.invalidate(override.intake.university.slug);
  }

  /* --------------------------------------------------------------------- *
   * Case integration
   * --------------------------------------------------------------------- */

  /**
   * Guards the one thing `Case.intakeId` never checked: that the round exists,
   * belongs to the chosen school, matches the service, and is still open.
   *
   * Returns the resolved dates so the caller can act on them; throws in
   * Mongolian, because every one of these lands in front of a user.
   */
  async assertSelectable(
    intakeId: string,
    universityId: string | null | undefined,
    serviceType: ServiceType,
    now: Date = new Date(),
  ) {
    const intake = await this.prisma.intakeTerm.findUnique({ where: { id: intakeId }, select: INTAKE_FIELDS });
    if (!intake) throw new NotFoundException('Сонгосон элсэлтийн улирал олдсонгүй.');

    if (universityId && intake.universityId !== universityId) {
      throw new BadRequestException('Сонгосон элсэлт тухайн сургуульд харьяалагдахгүй байна.');
    }

    if (!serviceAcceptsLevel(serviceType, intake.level)) {
      throw new BadRequestException('Сонгосон элсэлтийн түвшин үйлчилгээний төрөлтэй тохирохгүй байна.');
    }

    if (!isIntakeSelectable(intake, intake.status, now)) {
      throw new BadRequestException('Энэ элсэлтийн бүртгэл хаагдсан байна. Өөр элсэлтийн улирал сонгоно уу.');
    }

    return intake;
  }

  /**
   * Pushes an intake's internal deadline onto the case's documents.
   *
   * Only fills blanks — a `dueAt` somebody set by hand is a decision, and a
   * date change must not silently undo it. This is what wires the calendar to
   * the existing D-7/D-3/D-1 material reminders (1D-12): before this, a case
   * with an intake still had no dates on its documents at all.
   */
  async applyDeadlineToCases(intakeId: string): Promise<number> {
    const intake = await this.prisma.intakeTerm.findUnique({
      where: { id: intakeId },
      select: { internalDeadline: true },
    });
    if (!intake?.internalDeadline) return 0;

    const result = await this.prisma.caseDocument.updateMany({
      where: {
        deletedAt: null,
        dueAt: null,
        necessity: Necessity.REQUIRED,
        status: { notIn: SETTLED_STATUSES as DocumentStatus[] },
        case: { intakeId },
      },
      data: { dueAt: intake.internalDeadline },
    });

    if (result.count) {
      this.logger.log(`Элсэлтийн хугацаа ${result.count} материалын эцсийн огноог бөглөлөө (intake ${intakeId}).`);
    }
    return result.count;
  }

  /** Same, for one case — called right after a case is pointed at an intake. */
  async applyDeadlineToCase(caseId: string): Promise<number> {
    const row = await this.prisma.case.findUnique({
      where: { id: caseId },
      select: { intake: { select: { internalDeadline: true } } },
    });
    const deadline = row?.intake?.internalDeadline;
    if (!deadline) return 0;

    const result = await this.prisma.caseDocument.updateMany({
      where: {
        caseId,
        deletedAt: null,
        dueAt: null,
        necessity: Necessity.REQUIRED,
        status: { notIn: SETTLED_STATUSES as DocumentStatus[] },
      },
      data: { dueAt: deadline },
    });
    return result.count;
  }

  /**
   * Re-derives every automatic internal deadline after the lead time changes.
   *
   * Rows staff pinned by hand are skipped by definition — that is what
   * `internalDeadlineIsManual` is for.
   */
  async recomputeInternalDeadlines(): Promise<number> {
    const leadDays = await this.config.getInternalLeadDays();

    const rows = await this.prisma.intakeTerm.findMany({
      where: { internalDeadlineIsManual: false, applicationDeadline: { not: null } },
      select: { id: true, applicationDeadline: true, internalDeadline: true },
    });

    const changed = rows.flatMap((row) => {
      const next = computeInternalDeadline(row.applicationDeadline, leadDays);
      if (!next || next.getTime() === row.internalDeadline?.getTime()) return [];
      return [{ id: row.id, internalDeadline: next }];
    });

    for (const row of changed) {
      await this.prisma.intakeTerm.update({ where: { id: row.id }, data: { internalDeadline: row.internalDeadline } });
    }

    if (changed.length) {
      await this.cache.delByPattern(ADMISSIONS_CACHE_PATTERN);
      this.logger.log(`Дотоод эцсийн хугацаа ${changed.length} элсэлт дээр дахин бодогдлоо (${leadDays} хоног).`);
    }
    return changed.length;
  }

  /* --------------------------------------------------------------------- *
   * Internals
   * --------------------------------------------------------------------- */

  /** Levels a service may target — GKS covers all four (§4.3). */
  private levelsForService(serviceType: ServiceType): ProgramLevel[] {
    return [...SERVICE_LEVELS[serviceType]];
  }

  /**
   * Rounds a visitor may still act on.
   *
   * The cut-off is OUR deadline, not the school's: we take registrations for a
   * published round right up to it, and stop advertising the round once it has
   * passed. A round whose deadline is unknown has no cut-off to apply.
   */
  private stillOpenWhere(now: Date): Prisma.IntakeTermWhereInput['OR'] {
    return [{ internalDeadline: null }, { internalDeadline: { gte: now } }];
  }

  private publishedWhere(now: Date): Prisma.IntakeTermWhereInput {
    return {
      status: IntakeStatus.OPEN,
      university: { isPublished: true },
      OR: this.stillOpenWhere(now),
    };
  }

  private buildPublicWhere(query: QueryAdmissionsDto, now: Date): Prisma.IntakeTermWhereInput {
    const where: Prisma.IntakeTermWhereInput = {
      status: IntakeStatus.OPEN,
      university: { isPublished: true },
    };

    // Default is "still catchable" — an admissions list of expired rounds is
    // noise. `openOnly=false` is how the archive is reached.
    if (query.openOnly !== false) {
      where.OR = this.stillOpenWhere(now);
    }

    this.applyCommonFilters(where, query);
    return where;
  }

  private buildAdminWhere(query: QueryAdminAdmissionsDto, now: Date): Prisma.IntakeTermWhereInput {
    const where: Prisma.IntakeTermWhereInput = {};

    if (query.status) where.status = query.status;
    if (query.openOnly === true) {
      where.status = query.status ?? IntakeStatus.OPEN;
      where.OR = this.stillOpenWhere(now);
    }
    if (query.unverified) where.verifiedAt = null;
    if (query.missingDates) where.applicationDeadline = null;

    this.applyCommonFilters(where, query);
    return where;
  }

  private applyCommonFilters(where: Prisma.IntakeTermWhereInput, query: QueryAdmissionsDto): void {
    if (query.level) where.level = query.level;
    if (query.year) where.year = query.year;
    if (query.month) where.month = query.month;
    if (query.universityId) where.universityId = query.universityId;

    if (query.region || query.q) {
      const university: Prisma.UniversityWhereInput = { ...(where.university as Prisma.UniversityWhereInput) };
      if (query.region) university.regionEn = query.region;
      if (query.q) {
        // `contains` compiles to ILIKE '%q%', served by the pg_trgm GIN indexes.
        university.OR = [
          { nameMn: { contains: query.q, mode: 'insensitive' } },
          { nameEn: { contains: query.q, mode: 'insensitive' } },
          { nameKo: { contains: query.q, mode: 'insensitive' } },
          { cityMn: { contains: query.q, mode: 'insensitive' } },
        ];
      }
      where.university = university;
    }
  }

  /** Free-text pages are not cached — unbounded cardinality, typed once. */
  private listCacheKey(query: QueryAdmissionsDto): string | null {
    if (query.q) return null;

    const parts = [
      query.level ?? '',
      query.year ?? '',
      query.month ?? '',
      query.region ?? '',
      query.universityId ?? '',
      query.openOnly === false ? 'all' : 'open',
      query.sort,
      query.order,
      query.page,
      query.limit,
    ];
    return `admissions:list:${parts.join('|')}`;
  }

  /**
   * Turns a DTO into columns, deriving `internalDeadline` on the way.
   *
   * The rule the module turns on: a date the DTO carries is a human's, and it
   * sets `internalDeadlineIsManual` for good; otherwise it is `applicationDeadline`
   * minus the configured lead time. Sending `internalDeadline: null` explicitly
   * hands the row back to the automatic rule.
   */
  private async buildWriteData(
    dto: CreateIntakeTermDto | UpdateIntakeTermDto,
    actorId: string | null,
    options: {
      isCreate: boolean;
      existing?: { applicationDeadline: Date | null; internalDeadline: Date | null; internalDeadlineIsManual: boolean };
    },
  ): Promise<Prisma.IntakeTermUncheckedCreateInput> {
    const leadDays = await this.config.getInternalLeadDays();

    const applicationDeadline =
      dto.applicationDeadline !== undefined
        ? this.toDate(dto.applicationDeadline)
        : (options.existing?.applicationDeadline ?? null);

    let internalDeadline: Date | null;
    let internalDeadlineIsManual: boolean;

    if (dto.internalDeadline !== undefined) {
      internalDeadline = this.toDate(dto.internalDeadline);
      internalDeadlineIsManual = internalDeadline !== null;
      if (!internalDeadlineIsManual) internalDeadline = computeInternalDeadline(applicationDeadline, leadDays);
    } else if (options.existing?.internalDeadlineIsManual) {
      internalDeadline = options.existing.internalDeadline;
      internalDeadlineIsManual = true;
    } else {
      internalDeadline = computeInternalDeadline(applicationDeadline, leadDays);
      internalDeadlineIsManual = false;
    }

    const data: Prisma.IntakeTermUncheckedCreateInput = {
      universityId: dto.universityId as string,
      level: dto.level as ProgramLevel,
      year: dto.year as number,
      month: dto.month as number,
      applicationDeadline,
      internalDeadline,
      internalDeadlineIsManual,
    };

    if (dto.openAt !== undefined) data.openAt = this.toDate(dto.openAt);
    if (dto.classStartDate !== undefined) data.classStartDate = this.toDate(dto.classStartDate);
    if (dto.resultAnnouncedAt !== undefined) data.resultAnnouncedAt = this.toDate(dto.resultAnnouncedAt);
    if (dto.quota !== undefined) data.quota = dto.quota;
    if (dto.admissionFeeKrw !== undefined) data.admissionFeeKrw = dto.admissionFeeKrw;
    if (dto.requirementNote !== undefined) data.requirementNote = dto.requirementNote;
    if (dto.status !== undefined) data.status = dto.status;
    if (dto.note !== undefined) data.note = dto.note;
    if (dto.sourceUrl !== undefined) data.sourceUrl = dto.sourceUrl;
    if (dto.sourceType !== undefined) data.sourceType = dto.sourceType;

    // "Verified" is a signature, so it records who and when — an unverified
    // round is one nobody has checked against the school yet.
    if (dto.verified === true) {
      data.verifiedAt = new Date();
      data.verifiedById = actorId;
    } else if (dto.verified === false) {
      data.verifiedAt = null;
      data.verifiedById = null;
    }

    if (options.isCreate && data.sourceType === undefined) data.sourceType = IntakeSource.MANUAL;

    // On update the identity columns are never rewritten.
    if (!options.isCreate) {
      delete (data as Partial<Prisma.IntakeTermUncheckedCreateInput>).universityId;
      if (dto.level === undefined) delete (data as Partial<Prisma.IntakeTermUncheckedCreateInput>).level;
      if (dto.year === undefined) delete (data as Partial<Prisma.IntakeTermUncheckedCreateInput>).year;
      if (dto.month === undefined) delete (data as Partial<Prisma.IntakeTermUncheckedCreateInput>).month;
    }

    return data;
  }

  private toDate(value: string | null | undefined): Date | null {
    return value ? new Date(value) : null;
  }

  /** A public list row: the round, its derived phase, and the school card. */
  private serializeWithUniversity(row: IntakeRow & { university: UniversityCardRow }, now: Date) {
    const { university, ...intake } = row;
    return { ...this.serialize(intake, now), university };
  }

  /**
   * The client-facing shape of one round.
   *
   * `applicationDeadline` is computed with but never emitted: a client is given
   * exactly one date to work to, ours. Two deadlines on a public card is how
   * somebody reads the later one and arrives a week late. Staff keep both — see
   * `serializeAdmin`. The staff-only provenance columns
   * (`internalDeadlineIsManual`, `sourceType`, `verifiedAt`) stay out too.
   */
  private serialize(row: IntakeRow, now: Date) {
    const phase: IntakePhase = computeIntakePhase(row, row.status, now);
    const { applicationDeadline, internalDeadlineIsManual, sourceType, verifiedAt, ...visible } = row;
    void applicationDeadline;
    void internalDeadlineIsManual;
    void sourceType;
    void verifiedAt;

    return {
      ...visible,
      phase,
      daysUntilInternalDeadline: daysUntil(row.internalDeadline, now),
    };
  }

  /** Staff see the school's own deadline as well — it is the buffer they manage. */
  private serializeAdmin(row: AdminIntakeRow, now: Date) {
    const { programOverrides, ...rest } = row;
    return {
      ...this.serialize(rest as IntakeRow, now),
      applicationDeadline: row.applicationDeadline,
      internalDeadlineIsManual: row.internalDeadlineIsManual,
      sourceType: row.sourceType,
      verifiedAt: row.verifiedAt,
      verifiedBy: row.verifiedBy,
      programOverrides: programOverrides.map((override) => this.serializeOverride(override)),
      _count: row._count,
    };
  }

  private serializeOverride(override: {
    id: string;
    programId: string;
    openAt: Date | null;
    applicationDeadline: Date | null;
    internalDeadline: Date | null;
    internalDeadlineIsManual: boolean;
    classStartDate: Date | null;
    quota: number | null;
    note: string | null;
    program: { nameMn: string };
  }) {
    const { program, ...rest } = override;
    return { ...rest, programNameMn: program.nameMn };
  }

  /**
   * Drops what a write invalidates: the admissions caches, plus the touched
   * school's catalogue detail — its page lists the intakes too.
   */
  private async invalidate(...slugs: string[]): Promise<void> {
    await Promise.all([
      this.cache.delByPattern(ADMISSIONS_CACHE_PATTERN),
      ...[...new Set(slugs)].map((slug) => this.cache.del(`university:${slug}`)),
    ]);
  }
}
