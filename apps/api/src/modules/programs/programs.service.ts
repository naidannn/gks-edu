import { Injectable } from '@nestjs/common';
import { Prisma } from '../../prisma/client.js';
import { paginate } from '../../common/dto/pagination.dto.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import { CacheService } from '../../redis/cache.service.js';
import type { ProgramSort, QueryProgramsDto } from './dto/query-programs.dto.js';
import { StudyFieldsService } from './study-fields.service.js';

/**
 * The school columns a programme row carries. Less than a catalogue card — a
 * programme list is read as a table, and `gksRank` orders it without appearing
 * in it (ARCHITECTURE.md §3.1).
 */
const UNIVERSITY_FIELDS = {
  id: true,
  slug: true,
  nameMn: true,
  nameEn: true,
  nameKo: true,
  logoPath: true,
  type: true,
  cityMn: true,
  regionMn: true,
  regionEn: true,
  isGksEligible: true,
  acceptsLanguagePrep: true,
  theKoreaRank: true,
} satisfies Prisma.UniversitySelect;

const STUDY_FIELD_FIELDS = {
  id: true,
  slug: true,
  nameMn: true,
  nameEn: true,
  nameKo: true,
  parentId: true,
} satisfies Prisma.StudyFieldSelect;

/** Everything a visitor may see about a programme. `internalNote` is absent by design. */
export const PROGRAM_CARD_FIELDS = {
  id: true,
  universityId: true,
  level: true,
  nameMn: true,
  nameEn: true,
  nameKo: true,
  faculty: true,
  durationYears: true,
  tuitionPerTermKrw: true,
  tuitionPerYearKrw: true,
  admissionFeeKrw: true,
  tuitionYear: true,
  scholarshipMaxPercent: true,
  scholarshipNote: true,
  topikLevel: true,
  ieltsScore: true,
  otherRequirements: true,
  language: true,
  acceptsInternational: true,
  sourceUrl: true,
  studyField: { select: STUDY_FIELD_FIELDS },
  university: { select: UNIVERSITY_FIELDS },
} satisfies Prisma.UniversityProgramSelect;

/**
 * `university` is the default: the recommendation order of the catalogue,
 * carried over so a subject search opens with the schools we would actually
 * suggest. Postgres sorts ASC nulls-last, which is what an unscored school
 * deserves; the explicit `nulls` is spelled out where the order is DESC.
 */
const ORDER_BY: Record<
  ProgramSort,
  (order: Prisma.SortOrder) => Prisma.UniversityProgramOrderByWithRelationInput[]
> = {
  university: () => [{ university: { gksRank: 'asc' } }, { university: { nameMn: 'asc' } }, { nameMn: 'asc' }],
  tuition: (order) => [
    { tuitionPerYearKrw: { sort: order, nulls: 'last' } },
    { university: { gksRank: 'asc' } },
    { nameMn: 'asc' },
  ],
  name: (order) => [{ nameMn: order }, { university: { nameMn: 'asc' } }],
  topik: (order) => [{ topikLevel: { sort: order, nulls: 'last' } }, { university: { gksRank: 'asc' } }],
  duration: (order) => [{ durationYears: { sort: order, nulls: 'last' } }, { university: { gksRank: 'asc' } }],
};

const FACETS_CACHE_KEY = 'programs:facets';
const FACETS_CACHE_TTL_MS = 300_000;

/**
 * Programme search across every school (ARCHITECTURE.md §3.3).
 *
 * The question this answers is "who teaches marketing, and what does it cost?"
 * — one subject, every university, tuition alongside. It works because a
 * programme is filed under a canonical `StudyField` while keeping the school's
 * own wording for display.
 */
@Injectable()
export class ProgramsService {
  // Protected, not private: `AdminProgramsService` extends this class so the
  // staff filter and the public filter cannot drift apart.
  constructor(
    protected readonly prisma: PrismaService,
    protected readonly cache: CacheService,
    protected readonly studyFields: StudyFieldsService,
  ) {}

  async findAll(query: QueryProgramsDto) {
    const where = await this.buildWhere(query, { publicOnly: true });

    // Read-only pair under `Promise.all`, never `$transaction` — the pooler is
    // ~115 ms away and a transaction pays for BEGIN and COMMIT too (CLAUDE.md).
    const [items, total] = await Promise.all([
      this.prisma.universityProgram.findMany({
        where,
        select: PROGRAM_CARD_FIELDS,
        orderBy: ORDER_BY[query.sort](query.order),
        skip: query.skip,
        take: query.limit,
      }),
      this.prisma.universityProgram.count({ where }),
    ]);

    return paginate(items, total, query.page, query.limit);
  }

  /**
   * Filter-panel counts over the published catalogue as a whole.
   *
   * Deliberately not narrowed by the caller's current filters: they are cached
   * as one object, and the number a visitor wants next to "Сөүл" is how many
   * programmes Seoul has, not how many survive the filters already applied.
   * The subject counts live on `GET /study-fields`, which is the same idea.
   */
  async facets() {
    return this.cache.wrap(
      FACETS_CACHE_KEY,
      async () => {
        const where = { isPublished: true, university: { isPublished: true } } satisfies Prisma.UniversityProgramWhereInput;

        const [levels, languages, byUniversity, tuition, total, universities] = await Promise.all([
          this.prisma.universityProgram.groupBy({ by: ['level'], where, _count: { _all: true } }),
          this.prisma.universityProgram.groupBy({ by: ['language'], where, _count: { _all: true } }),
          this.prisma.universityProgram.groupBy({ by: ['universityId'], where, _count: { _all: true } }),
          this.prisma.universityProgram.aggregate({
            where: { ...where, tuitionPerYearKrw: { not: null } },
            _min: { tuitionPerYearKrw: true },
            _max: { tuitionPerYearKrw: true },
            _avg: { tuitionPerYearKrw: true },
          }),
          this.prisma.universityProgram.count({ where }),
          this.prisma.university.findMany({
            where: { isPublished: true },
            select: { id: true, regionEn: true, regionMn: true },
          }),
        ]);

        // Regions cannot be grouped through the relation, so the per-school
        // counts are rolled up here. 135 rows — cheaper than a raw query and
        // easier to read than one.
        const regionOf = new Map(universities.map((row) => [row.id, row]));
        const regions = new Map<string, { value: string; label: string; count: number }>();
        for (const row of byUniversity) {
          const university = regionOf.get(row.universityId);
          if (!university) continue;
          const entry = regions.get(university.regionEn) ?? {
            value: university.regionEn,
            label: university.regionMn,
            count: 0,
          };
          entry.count += row._count._all;
          regions.set(university.regionEn, entry);
        }

        return {
          total,
          levels: levels.map((row) => ({ value: row.level, count: row._count._all })),
          languages: languages.map((row) => ({ value: row.language, count: row._count._all })),
          regions: [...regions.values()].sort((a, b) => b.count - a.count),
          tuition: {
            minKrw: tuition._min.tuitionPerYearKrw,
            maxKrw: tuition._max.tuitionPerYearKrw,
            avgKrw: tuition._avg.tuitionPerYearKrw === null ? null : Math.round(tuition._avg.tuitionPerYearKrw),
          },
        };
      },
      FACETS_CACHE_TTL_MS,
    );
  }

  /**
   * The `where` behind both the public list and the staff one.
   *
   * `publicOnly` is the whole difference: a draft programme, or one at an
   * unpublished school, must never reach a visitor.
   */
  protected async buildWhere(
    query: QueryProgramsDto,
    options: { publicOnly: boolean },
  ): Promise<Prisma.UniversityProgramWhereInput> {
    const where: Prisma.UniversityProgramWhereInput = {};
    const university: Prisma.UniversityWhereInput = {};
    // Every condition that is itself an OR goes in here. Two of them cannot
    // share `where.OR`, and quietly dropping one is how a filter stops
    // filtering without anybody noticing.
    const and: Prisma.UniversityProgramWhereInput[] = [];

    if (options.publicOnly) {
      where.isPublished = true;
      where.acceptsInternational = true;
      university.isPublished = true;
    }

    if (query.q) {
      // `contains` compiles to ILIKE '%q%', which the pg_trgm GIN indexes serve.
      const contains = { contains: query.q, mode: 'insensitive' } as const;
      and.push({
        OR: [
          { nameMn: contains },
          { nameEn: contains },
          { nameKo: contains },
          { faculty: contains },
          { university: { nameMn: contains } },
          { university: { nameEn: contains } },
          { studyField: { nameMn: contains } },
        ],
      });
    }

    if (query.field) {
      // A group slug stands for every subject inside it, so "Бизнес" answers
      // with marketing and accounting rather than with nothing.
      const ids = await this.studyFields.resolveFieldIds(query.field);
      // An unknown slug must return nothing, not everything.
      where.studyFieldId = ids.length ? { in: ids } : { in: [] };
    }

    if (query.level) where.level = query.level;
    if (query.language) where.language = query.language;
    if (query.universityId) where.universityId = query.universityId;
    if (query.region) university.regionEn = query.region;
    if (query.type) university.type = query.type;
    if (query.gks) university.isGksEligible = true;

    if (query.tuitionMin !== undefined || query.tuitionMax !== undefined) {
      where.tuitionPerYearKrw = {
        ...(query.tuitionMin !== undefined ? { gte: query.tuitionMin } : {}),
        ...(query.tuitionMax !== undefined ? { lte: query.tuitionMax } : {}),
      };
    }

    if (query.topikMax !== undefined) {
      // A programme that publishes no TOPIK requirement is not thereby
      // demanding one — it stays in the answer, and the UI shows it as unknown.
      and.push({ OR: [{ topikLevel: { lte: query.topikMax } }, { topikLevel: null }] });
    }

    if (and.length) where.AND = and;
    if (Object.keys(university).length) where.university = university;
    return where;
  }
}
