import { Injectable } from '@nestjs/common';
import { Prisma } from '../../prisma/client.js';
import { paginate } from '../../common/dto/pagination.dto.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import { CacheService } from '../../redis/cache.service.js';
import type { ProgramSort, QueryProgramsDto } from './dto/query-programs.dto.js';

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

const FACULTY_FIELDS = {
  id: true,
  nameMn: true,
  nameEn: true,
  nameKo: true,
} satisfies Prisma.FacultySelect;

/** Everything a visitor may see about a programme. `internalNote` is absent by design. */
export const PROGRAM_CARD_FIELDS = {
  id: true,
  universityId: true,
  level: true,
  nameMn: true,
  nameEn: true,
  nameKo: true,
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
  faculty: { select: FACULTY_FIELDS },
  university: { select: UNIVERSITY_FIELDS },
} satisfies Prisma.UniversityProgramSelect;

/**
 * `university` is the default: the recommendation order of the catalogue,
 * carried over so a search opens with the schools we would actually suggest.
 * Postgres sorts ASC nulls-last, which is what an unscored school deserves;
 * the explicit `nulls` is spelled out where the order is DESC.
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
 * The programme catalogue: one flat list of departments, searched by word
 * (ARCHITECTURE.md §3.3).
 *
 * There is no canonical subject taxonomy behind this, and that is the design
 * rather than a gap. Every school words the same subject differently, so a
 * canonical list is a second vocabulary somebody has to maintain forever; what
 * a visitor types is a word — "IT", "маркетинг", "경영" — and the search
 * answers it straight off the names the schools themselves publish, plus the
 * college the department sits in.
 */
@Injectable()
export class ProgramsService {
  // Protected, not private: `AdminProgramsService` extends this class so the
  // staff filter and the public filter cannot drift apart.
  constructor(
    protected readonly prisma: PrismaService,
    protected readonly cache: CacheService,
  ) {}

  async findAll(query: QueryProgramsDto) {
    const where = this.buildWhere(query, { publicOnly: true });

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
   */
  async facets() {
    return this.cache.wrap(
      FACETS_CACHE_KEY,
      async () => {
        const where = {
          isPublished: true,
          university: { isPublished: true },
        } satisfies Prisma.UniversityProgramWhereInput;

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
            select: { id: true, slug: true, nameMn: true, nameEn: true, regionEn: true, regionMn: true },
          }),
        ]);

        // Regions cannot be grouped through the relation, so the per-school
        // counts are rolled up here. 135 rows — cheaper than a raw query and
        // easier to read than one.
        const universityById = new Map(universities.map((row) => [row.id, row]));
        const regions = new Map<string, { value: string; label: string; count: number }>();
        const schools: { value: string; label: string; count: number }[] = [];

        for (const row of byUniversity) {
          const university = universityById.get(row.universityId);
          if (!university) continue;

          const entry = regions.get(university.regionEn) ?? {
            value: university.regionEn,
            label: university.regionMn,
            count: 0,
          };
          entry.count += row._count._all;
          regions.set(university.regionEn, entry);

          schools.push({ value: university.slug, label: university.nameEn, count: row._count._all });
        }

        return {
          total,
          levels: levels.map((row) => ({ value: row.level, count: row._count._all })),
          languages: languages.map((row) => ({ value: row.language, count: row._count._all })),
          regions: [...regions.values()].sort((a, b) => b.count - a.count),
          // The school filter a flat list needs: with no subject to narrow by,
          // "just this university's departments" is the most-asked cut.
          universities: schools.sort((a, b) => a.label.localeCompare(b.label)),
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
  protected buildWhere(
    query: QueryProgramsDto,
    options: { publicOnly: boolean },
  ): Prisma.UniversityProgramWhereInput {
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

    if (query.q) and.push(programSearchWhere(query.q));

    if (query.level) where.level = query.level;
    if (query.language) where.language = query.language;
    if (query.universityId) where.universityId = query.universityId;
    if (query.university) university.slug = query.university;
    if (query.facultyId) where.facultyId = query.facultyId;
    if (query.region) university.regionEn = query.region;
    if (query.type) university.type = query.type;
    if (query.gks) university.isGksEligible = true;

    if (query.tuitionMin !== undefined || query.tuitionMax !== undefined) {
      where.tuitionPerYearKrw = {
        ...(query.tuitionMin !== undefined ? { gte: query.tuitionMin } : {}),
        ...(query.tuitionMax !== undefined ? { lte: query.tuitionMax } : {}),
      };
    }

    if (query.scholarship) {
      // A programme with no recorded discount is not a programme without one,
      // so this narrows to what we can actually promise. There is deliberately
      // no inverse filter.
      where.scholarshipMaxPercent = { gt: 0 };
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

/**
 * What a typed word matches.
 *
 * Every wording of the programme and of the college it sits in, in all three
 * languages, because whoever is typing may know the subject in any of them and
 * the catalogue holds all three. `contains` compiles to ILIKE '%q%', which the
 * pg_trgm GIN indexes on these columns serve.
 *
 * The school's name is searched too, but only for a term of four characters or
 * more. "IT" is two, and "Univers**it**y" contains it — a short word matched
 * against school names returns the entire catalogue, which is the one answer a
 * search box must never give. Whoever actually wants one school has a dropdown
 * listing every school with its count.
 *
 * Exported so the study planner searches on exactly these columns: two
 * definitions of "matches" is how a plan and the catalogue it links to start
 * disagreeing about how many programmes exist.
 */
export const SCHOOL_NAME_SEARCH_MIN_LENGTH = 4;

export function programSearchWhere(term: string): Prisma.UniversityProgramWhereInput {
  const trimmed = term.trim();
  const contains = { contains: trimmed, mode: 'insensitive' } as const;

  return {
    OR: [
      { nameMn: contains },
      { nameEn: contains },
      { nameKo: contains },
      { faculty: { nameMn: contains } },
      { faculty: { nameEn: contains } },
      { faculty: { nameKo: contains } },
      ...(trimmed.length >= SCHOOL_NAME_SEARCH_MIN_LENGTH
        ? [{ university: { nameMn: contains } }, { university: { nameEn: contains } }]
        : []),
    ],
  };
}
