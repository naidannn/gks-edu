import { Injectable, NotFoundException } from '@nestjs/common';
import { IntakeStatus, Prisma } from '../../prisma/client.js';
import { paginate } from '../../common/dto/pagination.dto.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import { CacheService } from '../../redis/cache.service.js';
import { computeIntakePhase, daysUntil } from '../admissions/intake-deadline.js';
import type { QueryUniversitiesDto, UniversitySort } from './dto/query-universities.dto.js';

/**
 * Columns safe to expose publicly. `commissionNote` and `internalNote` are
 * deliberately absent — they are staff-only (ARCHITECTURE.md §3).
 */
const CARD_FIELDS = {
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
  // The base rank is public and citable; `gksScore`/`gksRank` are not — they
  // order the list and stay behind the admin screen (ARCHITECTURE.md §3.1).
  theKoreaRank: true,
  theWorldRank: true,
  theRankYear: true,
} satisfies Prisma.UniversitySelect;

const DETAIL_FIELDS = {
  ...CARD_FIELDS,
  address: true,
  cityEn: true,
  lat: true,
  lon: true,
  coverPath: true,
  detailedIntroMn: true,
  internationalStudents: true,
  mongolianStudents: true,
  numCampuses: true,
  campusInfo: true,
  distanceFromSeoulKm: true,
  travelTimeFromSeoul: true,
  nearestTransit: true,
  advantages: true,
  dormitory: true,
  links: true,
  quality: true,
  acceptsFromMongolia: true,
  updatedAt: true,
} satisfies Prisma.UniversitySelect;

const ORDER_BY: Record<UniversitySort, (order: Prisma.SortOrder) => Prisma.UniversityOrderByWithRelationInput[]> = {
  // The default. `gksRank` is 1-is-best, so ascending is the recommended order;
  // a null means the school has not been scored yet and belongs at the back.
  gks: (order) => [{ gksRank: { sort: order, nulls: 'last' } }, { nameMn: 'asc' }],
  // The outside opinion, for a visitor who wants it. Only 41 of 135 schools
  // carry one, so the unranked tail falls back to our own order rather than
  // to an arbitrary alphabet.
  rank: (order) => [
    { theKoreaRank: { sort: order, nulls: 'last' } },
    { gksRank: { sort: 'asc', nulls: 'last' } },
    { nameMn: 'asc' },
  ],
  name: (order) => [{ nameMn: order }],
  city: (order) => [{ cityMn: order }, { nameMn: 'asc' }],
  // Null metrics sort last either way — an unknown value is not a small one.
  students: (order) => [{ studentsTotal: { sort: order, nulls: 'last' } }, { nameMn: 'asc' }],
  founded: (order) => [{ foundedYear: { sort: order, nulls: 'last' } }, { nameMn: 'asc' }],
};

const FACETS_CACHE_TTL_MS = 300_000;
const DETAIL_CACHE_TTL_MS = 120_000;
const LIST_CACHE_TTL_MS = 60_000;

/** Every key the list cache writes, so an admin edit can drop them in one sweep. */
export const LIST_CACHE_PATTERN = 'universities:list:*';

/**
 * A stable key for one page of the catalogue. Free-text searches are left out
 * on purpose — their cardinality is unbounded and each one is typed once.
 */
function listCacheKey(query: QueryUniversitiesDto): string | null {
  if (query.q) return null;

  const parts = [
    query.region ?? '',
    query.type ?? '',
    query.level ?? '',
    query.languagePrep ? '1' : '',
    query.gks ? '1' : '',
    query.sort,
    query.order,
    query.page,
    query.limit,
  ];
  return `universities:list:${parts.join('|')}`;
}

@Injectable()
export class UniversitiesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly cache: CacheService,
  ) {}

  async findAll(query: QueryUniversitiesDto) {
    const where = this.buildWhere(query);

    const run = async () => {
      const [items, total] = await Promise.all([
        this.prisma.university.findMany({
          where,
          select: CARD_FIELDS,
          orderBy: ORDER_BY[query.sort](query.order),
          skip: query.skip,
          take: query.limit,
        }),
        this.prisma.university.count({ where }),
      ]);

      return paginate(items, total, query.page, query.limit);
    };

    // The catalogue is read-heavy and only an admin edit changes it, so a whole
    // page of cards is cached under its filters (the landing page alone asks
    // for two of them on every visit).
    const key = listCacheKey(query);
    return key ? this.cache.wrap(key, run, LIST_CACHE_TTL_MS) : run();
  }

  async findBySlug(slug: string) {
    return this.cache.wrap(
      `university:${slug}`,
      async () => {
        const university = await this.prisma.university.findFirst({
          where: { slug, isPublished: true },
          select: {
            ...DETAIL_FIELDS,
            programs: {
              // A programme the school does not open to foreign students is
              // not news to a Mongolian visitor.
              where: { isPublished: true, acceptsInternational: true },
              orderBy: [{ level: 'asc' }, { nameMn: 'asc' }],
              select: {
                id: true,
                level: true,
                nameMn: true,
                nameEn: true,
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
                studyField: {
                  select: { id: true, slug: true, nameMn: true, nameEn: true, nameKo: true, parentId: true },
                },
              },
            },
            // Drafts never reach a visitor; a cancelled round is not news either.
            intakes: {
              where: { status: { in: [IntakeStatus.OPEN, IntakeStatus.CLOSED] } },
              orderBy: [{ year: 'asc' }, { month: 'asc' }],
              select: {
                id: true,
                level: true,
                year: true,
                month: true,
                openAt: true,
                applicationDeadline: true,
                internalDeadline: true,
                classStartDate: true,
                resultAnnouncedAt: true,
                quota: true,
                admissionFeeKrw: true,
                requirementNote: true,
                status: true,
                note: true,
                sourceUrl: true,
              },
            },
          },
        });

        if (!university) {
          throw new NotFoundException(`University ${slug} not found`);
        }

        // `phase` and the countdown are derived, not stored. They are computed
        // here so the school page and the admissions list read the calendar the
        // same way; the 2-minute cache is well inside a day of drift.
        //
        // `applicationDeadline` is used for the phase and then dropped: a
        // visitor is given one date to work to, ours (`internalDeadline`).
        const now = new Date();
        return {
          ...university,
          intakes: university.intakes.map(({ applicationDeadline, ...intake }) => ({
            ...intake,
            phase: computeIntakePhase({ applicationDeadline, internalDeadline: intake.internalDeadline }, intake.status, now),
            daysUntilInternalDeadline: daysUntil(intake.internalDeadline, now),
          })),
        };
      },
      DETAIL_CACHE_TTL_MS,
    );
  }

  /** Filter-panel facets: which regions and types actually have published schools. */
  async facets() {
    return this.cache.wrap(
      'universities:facets',
      async () => {
        const published = { isPublished: true } satisfies Prisma.UniversityWhereInput;

        const [regions, types, languagePrep, gks, total] = await Promise.all([
          this.prisma.university.groupBy({
            by: ['regionEn', 'regionMn'],
            where: published,
            _count: { _all: true },
            orderBy: { regionMn: 'asc' },
          }),
          this.prisma.university.groupBy({
            by: ['type'],
            where: published,
            _count: { _all: true },
          }),
          this.prisma.university.count({ where: { ...published, acceptsLanguagePrep: true } }),
          this.prisma.university.count({ where: { ...published, isGksEligible: true } }),
          this.prisma.university.count({ where: published }),
        ]);

        return {
          total,
          regions: regions.map((r) => ({ value: r.regionEn, label: r.regionMn, count: r._count._all })),
          types: types.map((t) => ({ value: t.type, count: t._count._all })),
          languagePrep,
          gks,
        };
      },
      FACETS_CACHE_TTL_MS,
    );
  }

  private buildWhere(query: QueryUniversitiesDto): Prisma.UniversityWhereInput {
    const where: Prisma.UniversityWhereInput = { isPublished: true };

    if (query.q) {
      // `contains` compiles to ILIKE '%q%', which the pg_trgm GIN indexes serve.
      const contains = { contains: query.q, mode: 'insensitive' } as const;
      where.OR = [
        { nameMn: contains },
        { nameEn: contains },
        { nameKo: contains },
        { cityMn: contains },
        { cityEn: contains },
      ];
    }

    if (query.region) where.regionEn = query.region;
    if (query.type) where.type = query.type;
    if (query.languagePrep) where.acceptsLanguagePrep = true;
    if (query.gks) where.isGksEligible = true;
    if (query.level) where.programs = { some: { level: query.level, isPublished: true } };

    return where;
  }
}
