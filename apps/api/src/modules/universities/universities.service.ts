import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '../../prisma/client.js';
import { paginate } from '../../common/dto/pagination.dto.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import { CacheService } from '../../redis/cache.service.js';
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
  name: (order) => [{ nameMn: order }],
  city: (order) => [{ cityMn: order }, { nameMn: 'asc' }],
  // Null metrics sort last either way — an unknown value is not a small one.
  students: (order) => [{ studentsTotal: { sort: order, nulls: 'last' } }, { nameMn: 'asc' }],
  founded: (order) => [{ foundedYear: { sort: order, nulls: 'last' } }, { nameMn: 'asc' }],
};

const FACETS_CACHE_TTL_MS = 300_000;
const DETAIL_CACHE_TTL_MS = 120_000;

@Injectable()
export class UniversitiesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly cache: CacheService,
  ) {}

  async findAll(query: QueryUniversitiesDto) {
    const where = this.buildWhere(query);

    const [items, total] = await this.prisma.$transaction([
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
              where: { isPublished: true },
              orderBy: [{ level: 'asc' }, { nameMn: 'asc' }],
              select: {
                id: true,
                level: true,
                nameMn: true,
                nameEn: true,
                faculty: true,
                durationYears: true,
                tuitionPerYearKrw: true,
                tuitionPerTermKrw: true,
                topikLevel: true,
                ieltsScore: true,
                otherRequirements: true,
              },
            },
            intakes: {
              orderBy: [{ year: 'asc' }, { month: 'asc' }],
              select: {
                id: true,
                level: true,
                year: true,
                month: true,
                applicationDeadline: true,
                status: true,
                note: true,
              },
            },
          },
        });

        if (!university) {
          throw new NotFoundException(`University ${slug} not found`);
        }
        return university;
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

        const [regions, types, languagePrep, gks, total] = await this.prisma.$transaction([
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
