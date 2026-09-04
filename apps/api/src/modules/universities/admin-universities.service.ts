import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '../../prisma/client.js';
import { paginate } from '../../common/dto/pagination.dto.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import { CacheService } from '../../redis/cache.service.js';
import { LIST_CACHE_PATTERN } from './universities.service.js';
import type { CreateIntakeTermDto, UpdateIntakeTermDto } from './dto/intake-term.dto.js';
import type { CreateUniversityDto } from './dto/create-university.dto.js';
import type { AdminUniversitySort, QueryAdminUniversitiesDto } from './dto/query-admin-universities.dto.js';
import type { UpdateUniversityDto } from './dto/update-university.dto.js';
import type {
  CreateUniversityProgramDto,
  UpdateUniversityProgramDto,
} from './dto/university-program.dto.js';

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
  topikLevel: true,
  ieltsScore: true,
  otherRequirements: true,
  isPublished: true,
} satisfies Prisma.UniversityProgramSelect;

const INTAKE_FIELDS = {
  id: true,
  universityId: true,
  level: true,
  year: true,
  month: true,
  applicationDeadline: true,
  status: true,
  note: true,
} satisfies Prisma.IntakeTermSelect;

const ORDER_BY: Record<AdminUniversitySort, (order: Prisma.SortOrder) => Prisma.UniversityOrderByWithRelationInput[]> = {
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
] as const;

/** Relations that make a school undeletable — its history would go with it. */
const BLOCKING_RELATIONS: { key: 'cases' | 'clients' | 'applications' | 'requirementRules'; label: string }[] = [
  { key: 'cases', label: 'хэрэг' },
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

    if (!university) throw new NotFoundException(`University ${id} not found`);
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
    if (!current) throw new NotFoundException(`University ${id} not found`);

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
    if (!university) throw new NotFoundException(`University ${id} not found`);

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

  // --- Programmes (1A-24) ---

  async createProgram(universityId: string, dto: CreateUniversityProgramDto) {
    const slug = await this.requireSlug(universityId);

    const duplicate = await this.prisma.universityProgram.findFirst({
      where: { universityId, level: dto.level, nameMn: dto.nameMn },
      select: { id: true },
    });
    if (duplicate) throw new ConflictException('Энэ түвшинд ижил нэртэй хөтөлбөр бүртгэгдсэн байна.');

    const program = await this.prisma.universityProgram.create({
      data: { ...this.stripUndefined(dto), universityId } as Prisma.UniversityProgramUncheckedCreateInput,
      select: PROGRAM_FIELDS,
    });

    await this.invalidate(slug);
    return program;
  }

  async updateProgram(universityId: string, programId: string, dto: UpdateUniversityProgramDto) {
    const slug = await this.requireSlug(universityId);
    await this.requireProgram(universityId, programId);

    const program = await this.prisma.universityProgram.update({
      where: { id: programId },
      data: this.stripUndefined(dto) as Prisma.UniversityProgramUpdateInput,
      select: PROGRAM_FIELDS,
    });

    await this.invalidate(slug);
    return program;
  }

  async removeProgram(universityId: string, programId: string): Promise<void> {
    const slug = await this.requireSlug(universityId);
    await this.requireProgram(universityId, programId);

    // Cases and applications point at a programme with `onDelete: SetNull`, so
    // deleting one quietly unsets it on live records — say so instead.
    const [cases, applications] = await Promise.all([
      this.prisma.case.count({ where: { programId } }),
      this.prisma.application.count({ where: { programId } }),
    ]);
    if (cases + applications > 0) {
      throw new ConflictException(
        `Энэ хөтөлбөр ${cases} хэрэг, ${applications} мэдүүлэгт ашиглагдсан тул устгах боломжгүй. `
        + 'Оронд нь нийтлэлээс хасна уу.',
      );
    }

    await this.prisma.universityProgram.delete({ where: { id: programId } });
    await this.invalidate(slug);
  }

  // --- Intake terms (1A-24) ---

  async createIntake(universityId: string, dto: CreateIntakeTermDto) {
    const slug = await this.requireSlug(universityId);

    const duplicate = await this.prisma.intakeTerm.findFirst({
      where: { universityId, level: dto.level, year: dto.year, month: dto.month },
      select: { id: true },
    });
    if (duplicate) throw new ConflictException('Тухайн түвшний энэ элсэлтийн улирал аль хэдийн бүртгэгдсэн байна.');

    const intake = await this.prisma.intakeTerm.create({
      data: {
        ...this.stripUndefined(dto),
        universityId,
        ...(dto.applicationDeadline ? { applicationDeadline: new Date(dto.applicationDeadline) } : {}),
      } as Prisma.IntakeTermUncheckedCreateInput,
      select: INTAKE_FIELDS,
    });

    await this.invalidate(slug);
    return intake;
  }

  async updateIntake(universityId: string, intakeId: string, dto: UpdateIntakeTermDto) {
    const slug = await this.requireSlug(universityId);
    await this.requireIntake(universityId, intakeId);

    const intake = await this.prisma.intakeTerm.update({
      where: { id: intakeId },
      data: {
        ...this.stripUndefined(dto),
        ...(dto.applicationDeadline !== undefined
          ? { applicationDeadline: dto.applicationDeadline ? new Date(dto.applicationDeadline) : null }
          : {}),
      } as Prisma.IntakeTermUpdateInput,
      select: INTAKE_FIELDS,
    });

    await this.invalidate(slug);
    return intake;
  }

  async removeIntake(universityId: string, intakeId: string): Promise<void> {
    const slug = await this.requireSlug(universityId);
    await this.requireIntake(universityId, intakeId);

    const [cases, applications] = await Promise.all([
      this.prisma.case.count({ where: { intakeId } }),
      this.prisma.application.count({ where: { intakeId } }),
    ]);
    if (cases + applications > 0) {
      throw new ConflictException(
        `Энэ элсэлтийн улирал ${cases} хэрэг, ${applications} мэдүүлэгт ашиглагдсан тул устгах боломжгүй.`,
      );
    }

    await this.prisma.intakeTerm.delete({ where: { id: intakeId } });
    await this.invalidate(slug);
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

  private async requireSlug(universityId: string): Promise<string> {
    const university = await this.prisma.university.findUnique({
      where: { id: universityId },
      select: { slug: true },
    });
    if (!university) throw new NotFoundException(`University ${universityId} not found`);
    return university.slug;
  }

  private async requireProgram(universityId: string, programId: string): Promise<void> {
    const program = await this.prisma.universityProgram.findFirst({
      where: { id: programId, universityId },
      select: { id: true },
    });
    if (!program) throw new NotFoundException(`Programme ${programId} not found`);
  }

  private async requireIntake(universityId: string, intakeId: string): Promise<void> {
    const intake = await this.prisma.intakeTerm.findFirst({
      where: { id: intakeId, universityId },
      select: { id: true },
    });
    if (!intake) throw new NotFoundException(`Intake ${intakeId} not found`);
  }

  /** Drops the public catalogue's read-through cache for the touched school(s). */
  private async invalidate(...slugs: string[]): Promise<void> {
    await Promise.all([
      ...[...new Set(slugs)].map((slug) => this.cache.del(`university:${slug}`)),
      this.cache.del('universities:facets'),
      this.cache.delByPattern(LIST_CACHE_PATTERN),
    ]);
  }
}
