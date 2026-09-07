import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '../../prisma/client.js';
import { paginate } from '../../common/dto/pagination.dto.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import { CacheService } from '../../redis/cache.service.js';
import { GksRankingService } from './ranking/gks-ranking.service.js';
import { LIST_CACHE_PATTERN } from './universities.service.js';
import type { CreateUniversityDto } from './dto/create-university.dto.js';
import type { AdminUniversitySort, QueryAdminUniversitiesDto } from './dto/query-admin-universities.dto.js';
import type { UpdateUniversityDto } from './dto/update-university.dto.js';

/**
 * Row of the staff catalogue. Draft schools and the two internal notes are the
 * whole point of this screen, so unlike the public select they are included.
 */
const ROW_FIELDS = {
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
  acceptsFromMongolia: true,
  isGksEligible: true,
  agentContractStatus: true,
  isPublished: true,
  updatedAt: true,
  // Staff see both ranks and the score behind ours — the public card only ever
  // shows the THE number (ARCHITECTURE.md §3.1).
  theKoreaRank: true,
  theWorldRank: true,
  theRankYear: true,
  gksScore: true,
  gksRank: true,
  gksRankBoost: true,
  gksScoredAt: true,
  _count: { select: { programs: true, intakes: true, cases: true } },
} satisfies Prisma.UniversitySelect;

const DETAIL_FIELDS = {
  ...ROW_FIELDS,
  cityEn: true,
  address: true,
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
  livingCost: true,
  dormitory: true,
  links: true,
  quality: true,
  commissionNote: true,
  internalNote: true,
  gksScoreParts: true,
  createdAt: true,
  _count: {
    select: {
      programs: true,
      intakes: true,
      cases: true,
      clients: true,
      applications: true,
      requirementRules: true,
      savedBy: true,
    },
  },
} satisfies Prisma.UniversitySelect;

const PROGRAM_FIELDS = {
  id: true,
  universityId: true,
  level: true,
  nameMn: true,
  nameEn: true,
  nameKo: true,
  faculty: true,
  durationYears: true,
  tuitionPerYearKrw: true,
  tuitionPerTermKrw: true,
  admissionFeeKrw: true,
  tuitionYear: true,
  scholarshipMaxPercent: true,
  scholarshipNote: true,
  topikLevel: true,
  ieltsScore: true,
  otherRequirements: true,
  language: true,
  acceptsInternational: true,
  studyFieldId: true,
  studyField: { select: { id: true, slug: true, nameMn: true, nameEn: true, nameKo: true, parentId: true } },
  sourceUrl: true,
  sourceType: true,
  verifiedAt: true,
  internalNote: true,
  isPublished: true,
} satisfies Prisma.UniversityProgramSelect;

/**
 * The catalogue detail page still lists a school's rounds. The dates and the
 * provenance now live in the admissions module, so keep the two selects in
 * step — a missing column here shows up as a blank date on that page.
 */
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

const ORDER_BY: Record<AdminUniversitySort, (order: Prisma.SortOrder) => Prisma.UniversityOrderByWithRelationInput[]> = {
  gks: (order) => [{ gksRank: { sort: order, nulls: 'last' } }, { nameMn: 'asc' }],
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
  updated: (order) => [{ updatedAt: order }],
  created: (order) => [{ createdAt: order }],
};

/**
 * Columns the database declares NOT NULL. `PartialType` lets an explicit `null`
 * through for every field, which is right for "this number is unknown again"
 * but would blow up on these, so they are rejected with a 400 instead of a 500.
 */
const NON_NULLABLE_FIELDS = [
  'slug',
  'nameKo',
  'nameEn',
  'nameMn',
  'type',
  'cityEn',
  'cityMn',
  'regionEn',
  'regionMn',
  'advantages',
  'links',
  'acceptsLanguagePrep',
  'acceptsFromMongolia',
  'isGksEligible',
  'agentContractStatus',
  'isPublished',
  'gksRankBoost',
] as const;

/** Relations that make a school undeletable — its history would go with it. */
const BLOCKING_RELATIONS: { key: 'cases' | 'clients' | 'applications' | 'requirementRules'; label: string }[] = [
  { key: 'cases', label: 'үйлчилгээ' },
  { key: 'clients', label: 'хэрэглэгч' },
  { key: 'applications', label: 'мэдүүлэг' },
  { key: 'requirementRules', label: 'материалын дүрэм' },
];

/**
 * Staff-side catalogue management (1A-25 … 1A-27). Everything here writes, so
 * every write also drops the public read-through cache the catalogue serves
 * from — otherwise an edit stays invisible for up to five minutes.
 */
@Injectable()
export class AdminUniversitiesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly cache: CacheService,
    private readonly ranking: GksRankingService,
  ) {}

  async findAll(query: QueryAdminUniversitiesDto) {
    const where = this.buildWhere(query);

    const [items, total] = await Promise.all([
      this.prisma.university.findMany({
        where,
        select: ROW_FIELDS,
        orderBy: ORDER_BY[query.sort](query.order),
        skip: query.skip,
        take: query.limit,
      }),
      this.prisma.university.count({ where }),
    ]);

    return paginate(items, total, query.page, query.limit);
  }

  /** Counters for the list header — the catalogue's completeness at a glance. */
  async stats() {
    const [total, published, languagePrep, gks, agentSigned, missingIntro, byType] =
      await Promise.all([
        this.prisma.university.count(),
        this.prisma.university.count({ where: { isPublished: true } }),
        this.prisma.university.count({ where: { acceptsLanguagePrep: true } }),
        this.prisma.university.count({ where: { isGksEligible: true } }),
        this.prisma.university.count({ where: { agentContractStatus: 'SIGNED' } }),
        this.prisma.university.count({ where: { shortIntroMn: null } }),
        this.prisma.university.groupBy({ by: ['type'], _count: { _all: true } }),
      ]);

    return {
      total,
      published,
      draft: total - published,
      languagePrep,
      gks,
      agentSigned,
      missingIntro,
      byType: byType.map((t) => ({ value: t.type, count: t._count._all })),
    };
  }

  /** Distinct regions across every school, published or not — a filter needs the drafts too. */
  async regions() {
    const rows = await this.prisma.university.groupBy({
      by: ['regionEn', 'regionMn'],
      _count: { _all: true },
      orderBy: { regionMn: 'asc' },
    });
    return rows.map((r) => ({ value: r.regionEn, label: r.regionMn, count: r._count._all }));
  }

  async findOne(id: string) {
    const university = await this.prisma.university.findUnique({
      where: { id },
      select: {
        ...DETAIL_FIELDS,
        programs: { orderBy: [{ level: 'asc' }, { nameMn: 'asc' }], select: PROGRAM_FIELDS },
        intakes: { orderBy: [{ year: 'desc' }, { month: 'asc' }], select: INTAKE_FIELDS },
      },
    });

    if (!university) throw new NotFoundException(`Сургууль ${id} олдсонгүй`);
    return university;
  }

  async create(dto: CreateUniversityDto) {
    await this.assertSlugFree(dto.slug);

    const created = await this.prisma.university.create({
      data: this.toWriteData(dto) as Prisma.UniversityCreateInput,
      select: DETAIL_FIELDS,
    });

    await this.invalidate(created.slug);
    return this.findOne(created.id);
  }

  async update(id: string, dto: UpdateUniversityDto) {
    const current = await this.prisma.university.findUnique({ where: { id }, select: { slug: true } });
    if (!current) throw new NotFoundException(`Сургууль ${id} олдсонгүй`);

    this.assertNoNullOnRequired(dto);
    if (dto.slug && dto.slug !== current.slug) await this.assertSlugFree(dto.slug);

    const updated = await this.prisma.university.update({
      where: { id },
      data: this.toWriteData(dto),
      select: { slug: true },
    });

    // Both slugs: the old cache entry would otherwise serve a stale detail page.
    await this.invalidate(current.slug, updated.slug);
    return this.findOne(id);
  }

  async remove(id: string): Promise<void> {
    const university = await this.prisma.university.findUnique({
      where: { id },
      select: { slug: true, nameMn: true, _count: { select: { cases: true, clients: true, applications: true, requirementRules: true } } },
    });
    if (!university) throw new NotFoundException(`Сургууль ${id} олдсонгүй`);

    const blockers = BLOCKING_RELATIONS
      .filter((relation) => university._count[relation.key] > 0)
      .map((relation) => `${university._count[relation.key]} ${relation.label}`);

    if (blockers.length) {
      throw new ConflictException(
        `"${university.nameMn}" сургууль дээр ${blockers.join(', ')} холбогдсон тул устгах боломжгүй. `
        + 'Оронд нь нийтлэлээс хасна уу.',
      );
    }

    await this.prisma.university.delete({ where: { id } });
    await this.invalidate(university.slug);
  }

  // --- Internals ---

  private buildWhere(query: QueryAdminUniversitiesDto): Prisma.UniversityWhereInput {
    const where: Prisma.UniversityWhereInput = {};

    if (query.q) {
      // `contains` compiles to ILIKE '%q%', which the pg_trgm GIN indexes serve.
      const contains = { contains: query.q, mode: 'insensitive' } as const;
      where.OR = [
        { nameMn: contains },
        { nameEn: contains },
        { nameKo: contains },
        { cityMn: contains },
        { cityEn: contains },
        { slug: contains },
      ];
    }

    if (query.region) where.regionEn = query.region;
    if (query.type) where.type = query.type;
    if (query.agentContractStatus) where.agentContractStatus = query.agentContractStatus;
    if (query.published !== undefined) where.isPublished = query.published;
    if (query.languagePrep) where.acceptsLanguagePrep = true;
    if (query.gks) where.isGksEligible = true;
    if (query.level) where.programs = { some: { level: query.level } };

    return where;
  }

  /**
   * Drops `undefined` keys and translates the two JSON columns into what Prisma
   * expects — a cleared `dormitory` is `DbNull`, not JavaScript `null`.
   */
  private toWriteData(dto: CreateUniversityDto | UpdateUniversityDto): Prisma.UniversityUpdateInput {
    const { dormitory, links, ...rest } = this.stripUndefined(dto);

    return {
      ...rest,
      ...(dormitory !== undefined
        ? { dormitory: dormitory === null ? Prisma.DbNull : (dormitory as Prisma.InputJsonValue) }
        : {}),
      ...(links !== undefined ? { links: links as Prisma.InputJsonValue } : {}),
    } as Prisma.UniversityUpdateInput;
  }

  private stripUndefined<T extends object>(dto: T): T {
    return Object.fromEntries(Object.entries(dto).filter(([, value]) => value !== undefined)) as T;
  }

  private assertNoNullOnRequired(dto: UpdateUniversityDto): void {
    const offenders = NON_NULLABLE_FIELDS.filter((field) => dto[field] === null);
    if (offenders.length) {
      throw new BadRequestException(`Эдгээр талбар хоосон байж болохгүй: ${offenders.join(', ')}`);
    }
  }

  private async assertSlugFree(slug: string): Promise<void> {
    const existing = await this.prisma.university.findUnique({ where: { slug }, select: { id: true } });
    if (existing) throw new ConflictException(`"${slug}" slug аль хэдийн ашиглагдсан байна.`);
  }


  /**
   * Drops the public catalogue's read-through cache for the touched school(s)
   * and queues a ranking recompute.
   *
   * Every write that lands here moves a ranking input — a contract status, a
   * GKS flag, a programme's tuition, an intro that changes the completeness
   * score — and those inputs are relative, so one edit reshuffles the whole
   * catalogue. The recompute is queued rather than awaited: the editor gets
   * their response back immediately and the new order lands a few seconds later
   * (`GksRankingService.scheduleRecompute`).
   */
  private async invalidate(...slugs: string[]): Promise<void> {
    await Promise.all([
      ...[...new Set(slugs)].map((slug) => this.cache.del(`university:${slug}`)),
      this.cache.del('universities:facets'),
      this.cache.delByPattern(LIST_CACHE_PATTERN),
      this.ranking.scheduleRecompute(),
    ]);
  }
}
