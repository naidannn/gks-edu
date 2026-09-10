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
  LIST_CACHE_PATTERN as UNIVERSITY_LIST_CACHE_PATTERN,
  UNIVERSITY_CARD_FIELDS,
  universityDetailCacheKey,
} from '../universities/universities.service.js';
import {
  SERVICE_LEVELS,
  type IntakeDateFields,
  type IntakePhase,
  computeIntakePhase,
  computeInternalDeadline,
  daysUntil,
  isIntakeSelectable,
  resolveIntakeDates,
  resolveOverrideInternalDeadline,
  serviceAcceptsLevel,
  toIntakeDate,
} from './intake-deadline.js';

export const ADMISSIONS_CACHE_PATTERN = 'admissions:*';
/** One school's detail page lists its rounds, so a write here drops it too. */
const UNIVERSITY_DETAIL_CACHE_PATTERN = 'university:*';

const DUPLICATE_INTAKE_MESSAGE = 'Тухайн түвшний энэ элсэлтийн улирал аль хэдийн бүртгэгдсэн байна.';

const LIST_CACHE_TTL_MS = 60_000;
const FACETS_CACHE_TTL_MS = 300_000;

/**
 * The school columns an admissions row carries — the public catalogue card,
 * shared with `UniversitiesService` so the two payloads cannot drift.
 */
const UNIVERSITY_CARD = UNIVERSITY_CARD_FIELDS;

/**
 * The intake columns every screen reads. Exported because the catalogue detail
 * page lists a school's rounds too, and a second copy of this list is how a
 * column added here turns into a blank date over there.
 */
export const INTAKE_FIELDS = {
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

/** The dates an override may carry — `null` on any of them means "use the term's". */
const OVERRIDE_DATE_FIELDS = {
  openAt: true,
  applicationDeadline: true,
  internalDeadline: true,
  internalDeadlineIsManual: true,
  classStartDate: true,
} satisfies Prisma.IntakeProgramOverrideSelect;

const OVERRIDE_FIELDS = {
  id: true,
  programId: true,
  ...OVERRIDE_DATE_FIELDS,
  quota: true,
  note: true,
  program: { select: { nameMn: true } },
} satisfies Prisma.IntakeProgramOverrideSelect;

const ADMIN_INTAKE_FIELDS = {
  ...INTAKE_FIELDS,
  verifiedBy: { select: { id: true, name: true } },
  programOverrides: { orderBy: { createdAt: 'asc' }, select: OVERRIDE_FIELDS },
  _count: { select: { cases: true, applications: true } },
} satisfies Prisma.IntakeTermSelect;

type IntakeRow = Prisma.IntakeTermGetPayload<{ select: typeof INTAKE_FIELDS }>;
type UniversityCardRow = Prisma.UniversityGetPayload<{ select: typeof UNIVERSITY_CARD }>;
type AdminIntakeRow = Prisma.IntakeTermGetPayload<{ select: typeof ADMIN_INTAKE_FIELDS }>;
type OverrideRow = Prisma.IntakeProgramOverrideGetPayload<{ select: typeof OVERRIDE_FIELDS }>;

/**
 * "This round has not already happened", for a round with no deadline recorded.
 *
 * Its class start if it has one, otherwise the year and month it is named for —
 * a round is entered against a month, so the month is always something to floor
 * on even when every date is still blank.
 */
function notPastWhere(now: Date): Prisma.IntakeTermWhereInput {
  const year = now.getUTCFullYear();
  const month = now.getUTCMonth() + 1;

  return {
    OR: [
      { classStartDate: { gte: now } },
      {
        classStartDate: null,
        OR: [{ year: { gt: year } }, { year, month: { gte: month } }],
      },
    ],
  };
}

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
          this.prisma.intakeTerm.groupBy({ by: ['universityId'], where, _count: { _all: true } }),
          this.prisma.intakeTerm.count({
            where: {
              ...where,
              internalDeadline: { gte: now, lte: new Date(now.getTime() + 14 * 24 * 60 * 60 * 1000) },
            },
          }),
        ]);

        // Regions cannot be grouped through the relation, so the per-school
        // counts are rolled up here — the same pattern as `ProgramsService`,
        // and a grouped count rather than a row per published intake.
        const schools = await this.prisma.university.findMany({
          where: { id: { in: regions.map((row) => row.universityId) } },
          select: { id: true, regionEn: true, regionMn: true },
        });
        const regionOf = new Map(schools.map((row) => [row.id, row]));

        const regionCounts = new Map<string, { label: string; count: number }>();
        for (const row of regions) {
          const school = regionOf.get(row.universityId);
          if (!school) continue;
          const entry = regionCounts.get(school.regionEn) ?? { label: school.regionMn, count: 0 };
          entry.count += row._count._all;
          regionCounts.set(school.regionEn, entry);
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
    // Never answer with a month that has already begun. The planner asks for
    // the first stage with no floor of its own, and "your earliest start is
    // March 2026" read in September is worse than no answer at all.
    const currentMonth = now.getUTCFullYear() * 12 + now.getUTCMonth();
    for (const group of groups) {
      if (group.year * 12 + (group.month - 1) < currentMonth) continue;
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
    if (duplicate) throw new ConflictException(DUPLICATE_INTAKE_MESSAGE);

    const data = await this.buildWriteData(dto, actorId, { isCreate: true });
    // The check above is a courtesy; the unique constraint is the guarantee.
    // Two tabs a second apart both pass it, and the loser should see the same
    // Mongolian 409 as everyone else rather than a raw Prisma error.
    const row = await this.runOrConflict(() =>
      this.prisma.intakeTerm.create({ data, select: ADMIN_INTAKE_FIELDS }),
    );

    await this.invalidate(university.slug);
    return this.serializeAdmin(row, new Date());
  }

  /** Turns the unique-constraint violation on `(university, level, year, month)` into a 409. */
  private async runOrConflict<T>(write: () => Promise<T>): Promise<T> {
    try {
      return await write();
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new ConflictException(DUPLICATE_INTAKE_MESSAGE);
      }
      throw error;
    }
  }

  /**
   * Saves several reviewed rounds at once — how a year's worth of research
   * candidates lands after staff have read them. Atomic: a batch that trips
   * the duplicate check writes nothing, so the reviewer sees one clear error
   * rather than a half-imported year.
   */
  async createMany(dto: BulkCreateIntakeTermsDto, actorId: string | null) {
    if (!dto.intakes.length) throw new BadRequestException('Нэмэх элсэлт сонгогдоогүй байна.');

    // The check the comment above promised and the method never made: without
    // it a batch repeating a round already in the table came back as a raw
    // Prisma error, and one repeated twice inside the batch did too.
    await this.assertNoDuplicates(dto.intakes);

    const data = await Promise.all(dto.intakes.map((intake) => this.buildWriteData(intake, actorId, { isCreate: true })));

    const created = await this.runOrConflict(() =>
      this.prisma.$transaction(
        data.map((row) => this.prisma.intakeTerm.create({ data: row, select: ADMIN_INTAKE_FIELDS })),
      ),
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
      select: { universityId: true, university: { select: { slug: true } } },
    });
    if (!intake) throw new NotFoundException('Элсэлтийн улирал олдсонгүй.');

    const program = await this.prisma.universityProgram.findFirst({
      where: { id: dto.programId, universityId: intake.universityId },
      select: { id: true },
    });
    if (!program) throw new NotFoundException('Хөтөлбөр энэ сургуульд харьяалагдахгүй байна.');

    const leadDays = await this.config.getInternalLeadDays();
    const applicationDeadline = this.toDate(dto.applicationDeadline);
    // A deadline the reviewer typed freezes. Otherwise it is derived only from
    // the override's *own* school deadline: deriving it from the term's and
    // storing the result leaves a snapshot nothing recomputes, so the next
    // change to the term's date or to the lead time loses to a stale copy.
    // `null` here means "fall through to the term", which is what §3.2 says.
    const manual = dto.internalDeadline !== undefined && dto.internalDeadline !== null;
    const internalDeadline = resolveOverrideInternalDeadline({
      applicationDeadline,
      internalDeadline: this.toDate(dto.internalDeadline),
      internalDeadlineIsManual: manual,
      leadDays,
    });

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
      select: OVERRIDE_FIELDS,
    });

    // The override moved this programme's deadline, so the cases on it move too.
    await this.applyDeadlineToCases(intakeId, dto.programId);
    await this.invalidate(intake.university.slug);
    return this.serializeOverride(override);
  }

  async removeOverride(intakeId: string, overrideId: string): Promise<void> {
    const override = await this.prisma.intakeProgramOverride.findFirst({
      where: { id: overrideId, intakeId },
      select: { id: true, programId: true, intake: { select: { university: { select: { slug: true } } } } },
    });
    if (!override) throw new NotFoundException('Хөтөлбөрийн онцгой хугацаа олдсонгүй.');

    await this.prisma.intakeProgramOverride.delete({ where: { id: overrideId } });
    // The programme is back on the term's calendar, so its cases are too.
    await this.applyDeadlineToCases(intakeId, override.programId);
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
    programId?: string | null,
  ) {
    const intake = await this.prisma.intakeTerm.findUnique({ where: { id: intakeId }, select: INTAKE_FIELDS });
    if (!intake) throw new NotFoundException('Сонгосон элсэлтийн улирал олдсонгүй.');

    if (universityId && intake.universityId !== universityId) {
      throw new BadRequestException('Сонгосон элсэлт тухайн сургуульд харьяалагдахгүй байна.');
    }

    if (!serviceAcceptsLevel(serviceType, intake.level)) {
      throw new BadRequestException('Сонгосон элсэлтийн түвшин үйлчилгээний төрөлтэй тохирохгүй байна.');
    }

    // A programme on its own calendar closes on its own date, and refusing or
    // accepting on the term's would be the wrong answer either way (§3.2).
    const dates = resolveIntakeDates(intake, await this.overrideDates(intakeId, programId));
    if (!isIntakeSelectable(dates, intake.status, now)) {
      throw new BadRequestException('Энэ элсэлтийн бүртгэл хаагдсан байна. Өөр элсэлтийн улирал сонгоно уу.');
    }

    return { ...intake, ...dates };
  }

  /**
   * The dates an override supplies for one programme, or `null` when the
   * programme runs to the term's own calendar (which is the normal case).
   */
  private async overrideDates(
    intakeId: string,
    programId: string | null | undefined,
  ): Promise<Partial<IntakeDateFields> | null> {
    if (!programId) return null;
    return this.prisma.intakeProgramOverride.findUnique({
      where: { intakeId_programId: { intakeId, programId } },
      select: OVERRIDE_DATE_FIELDS,
    });
  }

  /**
   * Our deadline for one case: its round's, with its programme's override laid
   * over. The one date documents, countdowns and reminders are driven to.
   */
  async resolveCaseDeadline(caseId: string): Promise<Date | null> {
    const row = await this.prisma.case.findUnique({
      where: { id: caseId },
      select: { intakeId: true, programId: true, intake: { select: INTAKE_FIELDS } },
    });
    if (!row?.intakeId || !row.intake) return null;

    const override = await this.overrideDates(row.intakeId, row.programId);
    return resolveIntakeDates(row.intake, override).internalDeadline;
  }

  /**
   * Pushes an intake's internal deadline onto the case's documents.
   *
   * Only fills blanks — a `dueAt` somebody set by hand is a decision, and a
   * date change must not silently undo it. This is what wires the calendar to
   * the existing D-7/D-3/D-1 material reminders (1D-12): before this, a case
   * with an intake still had no dates on its documents at all.
   */
  async applyDeadlineToCases(intakeId: string, onlyProgramId?: string | null): Promise<number> {
    const [intake, overrides] = await Promise.all([
      this.prisma.intakeTerm.findUnique({ where: { id: intakeId }, select: INTAKE_FIELDS }),
      this.prisma.intakeProgramOverride.findMany({
        where: { intakeId },
        select: { programId: true, ...OVERRIDE_DATE_FIELDS },
      }),
    ]);
    if (!intake) return 0;

    // Narrowed to one programme after its override was written or dropped: the
    // date that applies to it is the override's when there is one, and the
    // term's the moment there is not.
    if (onlyProgramId) {
      const deadline = resolveIntakeDates(
        intake,
        overrides.find((override) => override.programId === onlyProgramId) ?? null,
      ).internalDeadline;
      return deadline ? this.fillDueDates({ intakeId, programId: onlyProgramId }, deadline) : 0;
    }

    // One update per distinct deadline, not per case: every programme with its
    // own calendar is one group, and everything else rides the term's date.
    const overridden = overrides.map((override) => ({
      programId: override.programId,
      deadline: resolveIntakeDates(intake, override).internalDeadline,
    }));
    const groups: { where: Prisma.CaseWhereInput; deadline: Date | null }[] = [
      {
        where: {
          intakeId,
          ...(overridden.length
            ? { OR: [{ programId: null }, { programId: { notIn: overridden.map((entry) => entry.programId) } }] }
            : {}),
        },
        deadline: intake.internalDeadline,
      },
      ...overridden.map((entry) => ({
        where: { intakeId, programId: entry.programId } satisfies Prisma.CaseWhereInput,
        deadline: entry.deadline,
      })),
    ];

    let count = 0;
    for (const group of groups) {
      if (!group.deadline) continue;
      count += await this.fillDueDates(group.where, group.deadline);
    }

    if (count) {
      this.logger.log(`Элсэлтийн хугацаа ${count} материалын эцсийн огноог бөглөлөө (intake ${intakeId}).`);
    }
    return count;
  }

  /** Same, for one case — called right after a case is pointed at an intake. */
  async applyDeadlineToCase(caseId: string): Promise<number> {
    const deadline = await this.resolveCaseDeadline(caseId);
    if (!deadline) return 0;
    return this.fillDueDates({ id: caseId }, deadline);
  }

  /** Only fills blanks — see `applyDeadlineToCases`. */
  private async fillDueDates(caseWhere: Prisma.CaseWhereInput, dueAt: Date): Promise<number> {
    const result = await this.prisma.caseDocument.updateMany({
      where: {
        deletedAt: null,
        dueAt: null,
        necessity: Necessity.REQUIRED,
        status: { notIn: SETTLED_STATUSES as DocumentStatus[] },
        case: caseWhere,
      },
      data: { dueAt },
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
    const leadDays = Math.max(await this.config.getInternalLeadDays(), 0);
    const lead = Prisma.sql`(${leadDays}::int * INTERVAL '1 day')`;

    // One statement per table, not one per row: the catalogue is ~1,000 rounds
    // and the pooler is ~115 ms away, so the loop this replaces took minutes
    // and left half the catalogue on the old lead time when it timed out.
    // Atomic for the same reason (CLAUDE.md, hard rule 8).
    const [terms, overrides] = await this.prisma.$transaction([
      this.prisma.$executeRaw`
        UPDATE "intake_terms"
           SET "internalDeadline" = "applicationDeadline" - ${lead}
         WHERE "internalDeadlineIsManual" = false
           AND "applicationDeadline" IS NOT NULL
           AND "internalDeadline" IS DISTINCT FROM "applicationDeadline" - ${lead}
      `,
      // Overrides run to the same rule and were left out of it entirely, so a
      // retuned lead time moved every round except the ones on their own
      // calendar — which are the ones a deadline change matters most for.
      this.prisma.$executeRaw`
        UPDATE "intake_program_overrides"
           SET "internalDeadline" = "applicationDeadline" - ${lead}
         WHERE "internalDeadlineIsManual" = false
           AND "applicationDeadline" IS NOT NULL
           AND "internalDeadline" IS DISTINCT FROM "applicationDeadline" - ${lead}
      `,
    ]);

    const changed = terms + overrides;
    if (changed) {
      await this.invalidateAll();
      this.logger.log(`Дотоод эцсийн хугацаа ${changed} элсэлт дээр дахин бодогдлоо (${leadDays} хоног).`);
    }
    return changed;
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
   * passed.
   *
   * A round whose deadline is unknown has no cut-off of its own, so it falls
   * back to its class start and then to its own year and month: without that
   * floor a round entered without dates stays "open" forever, and last March's
   * is still listed, still selectable, and still answering the planner.
   */
  private stillOpenWhere(now: Date): Prisma.IntakeTermWhereInput['OR'] {
    return [{ internalDeadline: { gte: now } }, { internalDeadline: null, AND: [notPastWhere(now)] }];
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
  /**
   * Every round in a batch is new, and no two of them are the same round.
   * Checked before anything is written so the reviewer sees one clear error
   * rather than a half-imported year.
   */
  private async assertNoDuplicates(intakes: CreateIntakeTermDto[]): Promise<void> {
    const key = (row: { universityId: string; level: ProgramLevel; year: number; month: number }) =>
      `${row.universityId}:${row.level}:${row.year}:${row.month}`;

    const seen = new Set<string>();
    for (const intake of intakes) {
      if (seen.has(key(intake))) throw new ConflictException(DUPLICATE_INTAKE_MESSAGE);
      seen.add(key(intake));
    }

    const existing = await this.prisma.intakeTerm.findMany({
      where: { OR: intakes.map(({ universityId, level, year, month }) => ({ universityId, level, year, month })) },
      select: { universityId: true, level: true, year: true, month: true },
    });
    if (existing.some((row) => seen.has(key(row)))) {
      throw new ConflictException(DUPLICATE_INTAKE_MESSAGE);
    }
  }

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

  /**
   * Every date on this module's write path goes through here, so the admin form
   * and the seed store the same instant for the same day (`toIntakeDate`).
   */
  private toDate(value: string | null | undefined): Date | null {
    return toIntakeDate(value);
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

  private serializeOverride(override: OverrideRow) {
    const { program, ...rest } = override;
    return { ...rest, programNameMn: program.nameMn };
  }

  /**
   * Drops what a write invalidates: the admissions caches, plus the touched
   * school's catalogue detail — its page lists the intakes too.
   */
  /**
   * A catalogue-wide write: every school page lists its rounds, so there is no
   * useful slug list to narrow to.
   */
  private async invalidateAll(): Promise<void> {
    await Promise.all([
      this.cache.delByPattern(ADMISSIONS_CACHE_PATTERN),
      this.cache.delByPattern(UNIVERSITY_DETAIL_CACHE_PATTERN),
      this.cache.delByPattern(UNIVERSITY_LIST_CACHE_PATTERN),
    ]);
  }

  private async invalidate(...slugs: string[]): Promise<void> {
    await Promise.all([
      this.cache.delByPattern(ADMISSIONS_CACHE_PATTERN),
      ...[...new Set(slugs)].map((slug) => this.cache.del(universityDetailCacheKey(slug))),
    ]);
  }
}
