import { InjectQueue } from '@nestjs/bullmq';
import { ConflictException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import type { Queue } from 'bullmq';
import { GKS_RANKING_JOB, GKS_RANKING_QUEUE } from '../../queue/queue.constants.js';
import { paginate } from '../../common/dto/pagination.dto.js';
import { Prisma, ProgramSource } from '../../prisma/client.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import { CacheService } from '../../redis/cache.service.js';
import { LIST_CACHE_PATTERN } from '../universities/universities.service.js';
import type { BulkCreateProgramsDto } from './dto/bulk-programs.dto.js';
import type { QueryAdminProgramsDto } from './dto/query-programs.dto.js';
import type { CreateProgramDto, UpdateProgramDto } from './dto/university-program.dto.js';
import { FacultiesService } from './faculties.service.js';
import { PROGRAM_CARD_FIELDS, ProgramsService } from './programs.service.js';

/**
 * The columns a DTO can set. The three that identify a programme are passed
 * separately, because a create needs them and an update must not move them.
 */
type ProgramWriteData = Omit<Prisma.UniversityProgramUncheckedCreateInput, 'universityId' | 'level' | 'nameMn'>;

/** Everything the public row carries, plus the columns only staff may see. */
const ADMIN_PROGRAM_FIELDS = {
  ...PROGRAM_CARD_FIELDS,
  facultyId: true,
  sourceType: true,
  verifiedAt: true,
  verifiedBy: { select: { id: true, name: true } },
  internalNote: true,
  isPublished: true,
  createdAt: true,
  updatedAt: true,
  _count: { select: { cases: true, applications: true } },
} satisfies Prisma.UniversityProgramSelect;

/**
 * Staff programme management (the write side of ARCHITECTURE.md §3.3).
 *
 * It extends `ProgramsService` for one reason: the `where` builder. A staff
 * filter and a public filter must mean the same thing, and the only difference
 * between them — drafts and unpublished schools — is one flag rather than a
 * second copy of the query.
 */
@Injectable()
export class AdminProgramsService extends ProgramsService {
  private readonly logger = new Logger(AdminProgramsService.name);

  constructor(
    prisma: PrismaService,
    cache: CacheService,
    private readonly faculties: FacultiesService,
    @InjectQueue(GKS_RANKING_QUEUE) private readonly rankingQueue: Queue,
  ) {
    super(prisma, cache);
  }

  async findAllAdmin(query: QueryAdminProgramsDto) {
    const where = this.buildAdminWhere(query);

    const [items, total] = await Promise.all([
      this.prisma.universityProgram.findMany({
        where,
        select: ADMIN_PROGRAM_FIELDS,
        orderBy: this.adminOrderBy(query),
        skip: query.skip,
        take: query.limit,
      }),
      this.prisma.universityProgram.count({ where }),
    ]);

    return paginate(items, total, query.page, query.limit);
  }

  /**
   * The numbers this screen is judged on: how much of the catalogue is priced,
   * filed under a college and checked. Every one of those gaps is invisible on
   * the list itself — a programme with no tuition looks like any other row.
   */
  async stats() {
    const [total, published, missingTuition, noFaculty, unverified, staleTuition] = await Promise.all([
      this.prisma.universityProgram.count(),
      this.prisma.universityProgram.count({ where: { isPublished: true } }),
      this.prisma.universityProgram.count({
        where: { tuitionPerYearKrw: null, tuitionPerTermKrw: null },
      }),
      this.prisma.universityProgram.count({ where: { facultyId: null } }),
      this.prisma.universityProgram.count({ where: { verifiedAt: null } }),
      // A price with a year older than last year's is the one that gets quoted
      // to a client and turns out to be wrong.
      this.prisma.universityProgram.count({
        where: { tuitionYear: { lt: new Date().getFullYear() - 1 } },
      }),
    ]);

    return { total, published, draft: total - published, missingTuition, noFaculty, unverified, staleTuition };
  }

  async findOne(id: string) {
    const program = await this.prisma.universityProgram.findUnique({
      where: { id },
      select: ADMIN_PROGRAM_FIELDS,
    });
    if (!program) throw new NotFoundException('Хөтөлбөр олдсонгүй.');
    return program;
  }

  async create(dto: CreateProgramDto, userId: string | null) {
    const university = await this.requireUniversity(dto.universityId);
    await this.assertNameFree(dto.universityId, dto.level, dto.nameMn);

    const data = this.toWriteData(dto, userId, await this.resolveFaculty(dto.universityId, dto));
    const program = await this.prisma.universityProgram.create({
      data: { ...data, universityId: dto.universityId, level: dto.level, nameMn: dto.nameMn },
      select: ADMIN_PROGRAM_FIELDS,
    });

    await this.invalidate(university.slug);
    return program;
  }

  async update(id: string, dto: UpdateProgramDto, userId: string | null) {
    const current = await this.prisma.universityProgram.findUnique({
      where: { id },
      select: { id: true, universityId: true, level: true, nameMn: true, university: { select: { slug: true } } },
    });
    if (!current) throw new NotFoundException('Хөтөлбөр олдсонгүй.');

    const level = dto.level ?? current.level;
    const nameMn = dto.nameMn ?? current.nameMn;
    if (level !== current.level || nameMn !== current.nameMn) {
      await this.assertNameFree(current.universityId, level, nameMn, id);
    }

    const program = await this.prisma.universityProgram.update({
      where: { id },
      data: this.toWriteData(dto, userId, await this.resolveFaculty(current.universityId, dto)),
      select: ADMIN_PROGRAM_FIELDS,
    });

    await this.invalidate(current.university.slug);
    return program;
  }

  /**
   * A programme a case or an application points at is not deleted: the
   * relation is `SetNull`, so deleting would quietly blank the programme on a
   * live record. Unpublishing is the answer, and the message says so.
   */
  async remove(id: string): Promise<void> {
    const program = await this.prisma.universityProgram.findUnique({
      where: { id },
      select: {
        nameMn: true,
        university: { select: { slug: true } },
        _count: { select: { cases: true, applications: true } },
      },
    });
    if (!program) throw new NotFoundException('Хөтөлбөр олдсонгүй.');

    const { cases, applications } = program._count;
    if (cases + applications > 0) {
      throw new ConflictException(
        `Энэ хөтөлбөр ${cases} үйлчилгээ, ${applications} мэдүүлэгт ашиглагдсан тул устгах боломжгүй. `
        + 'Оронд нь нийтлэлээс хасна уу.',
      );
    }

    await this.prisma.universityProgram.delete({ where: { id } });
    await this.invalidate(program.university.slug);
  }

  /**
   * Saves a batch of programmes a human ticked off a research run (the review
   * step of the Gemini flow).
   *
   * A duplicate is skipped, not merged and not failed: a school's list is
   * researched more than once, and the second run mostly repeats the first.
   * The caller gets both numbers back so the screen can say what happened.
   */
  async bulkCreate(dto: BulkCreateProgramsDto, userId: string | null) {
    const university = await this.requireUniversity(dto.universityId);

    const existing = await this.prisma.universityProgram.findMany({
      where: { universityId: dto.universityId },
      select: { level: true, nameMn: true },
    });
    const taken = new Set(existing.map((program) => `${program.level}:${program.nameMn.trim().toLowerCase()}`));

    // Colleges are resolved once for the whole batch: a research run brings
    // back sixty departments across eight of them, and resolving each on its
    // own would be sixty round trips to a database ~115 ms away.
    const facultyIds = await this.faculties.resolveMany(
      dto.universityId,
      dto.programs.map((entry) => entry.facultyName),
    );

    const created: string[] = [];
    const skipped: string[] = [];
    const rows: Prisma.UniversityProgramCreateManyInput[] = [];

    for (const entry of dto.programs) {
      const key = `${entry.level}:${entry.nameMn.trim().toLowerCase()}`;
      if (taken.has(key)) {
        skipped.push(entry.nameMn);
        continue;
      }
      taken.add(key);

      const facultyId = entry.facultyName ? (facultyIds.get(entry.facultyName.trim()) ?? null) : null;
      const data = this.toWriteData(
        { ...entry, sourceType: entry.sourceType ?? ProgramSource.AI_ASSISTED },
        userId,
        facultyId,
      );
      rows.push({ ...data, universityId: dto.universityId, level: entry.level, nameMn: entry.nameMn });
      created.push(entry.nameMn);
    }

    if (rows.length) {
      // `skipDuplicates` is the backstop for the unique constraint: the
      // in-memory check above cannot see a row another tab created a second ago.
      await this.prisma.universityProgram.createMany({ data: rows, skipDuplicates: true });
    }

    if (dto.researchRunId && created.length) {
      await this.prisma.programResearchRun.update({
        where: { id: dto.researchRunId },
        data: { acceptedCount: { increment: created.length } },
      });
    }

    await this.invalidate(university.slug);
    this.logger.log(`${university.nameMn}: ${created.length} хөтөлбөр нэмлээ, ${skipped.length} давхардсаныг алгаслаа`);

    return { created: created.length, skipped: skipped.length, createdNames: created, skippedNames: skipped };
  }

  // --- Internals ---

  private buildAdminWhere(query: QueryAdminProgramsDto): Prisma.UniversityProgramWhereInput {
    const where = this.buildWhere(query, { publicOnly: false });

    if (query.noFaculty) where.facultyId = null;
    if (query.unverified) where.verifiedAt = null;
    if (query.published !== undefined) where.isPublished = query.published;
    if (query.missingTuition) {
      where.AND = [...(Array.isArray(where.AND) ? where.AND : where.AND ? [where.AND] : []),
        { tuitionPerYearKrw: null, tuitionPerTermKrw: null }];
    }

    return where;
  }

  private adminOrderBy(query: QueryAdminProgramsDto): Prisma.UniversityProgramOrderByWithRelationInput[] {
    if (query.sort === 'tuition') {
      return [{ tuitionPerYearKrw: { sort: query.order, nulls: 'last' } }, { nameMn: 'asc' }];
    }
    if (query.sort === 'name') return [{ nameMn: query.order }];
    return [{ university: { nameMn: 'asc' } }, { level: 'asc' }, { nameMn: 'asc' }];
  }

  /**
   * Turns a DTO into columns.
   *
   * `verified` is one checkbox but two columns, and `facultyName` is a name the
   * caller typed (or a research run reported) which the caller has no id for —
   * both are resolved before this, and dropped here so neither reaches Prisma
   * as a column that does not exist.
   */
  private toWriteData(
    dto: Partial<CreateProgramDto>,
    userId: string | null,
    facultyId: string | null | undefined,
  ): ProgramWriteData {
    const { verified, ...rest } = dto;
    // `universityId` and `facultyName` are dropped by key rather than
    // destructured out: the first belongs to the row's identity, which `create`
    // passes separately and `update` must never move, and the second is a name
    // this method is handed the resolved id for.
    const data = Object.fromEntries(
      Object.entries(rest).filter(
        ([key, value]) => value !== undefined && key !== 'universityId' && key !== 'facultyName',
      ),
    ) as ProgramWriteData;

    if (verified !== undefined) {
      data.verifiedAt = verified ? new Date() : null;
      data.verifiedById = verified ? userId : null;
    }

    if (facultyId !== undefined) data.facultyId = facultyId;

    return data;
  }

  /**
   * The college this write should point at.
   *
   * An explicit `facultyId` wins — including an explicit `null`, which is how
   * somebody says "this department has no college". A `facultyName` is the
   * other way in: whoever typed it, or a research run that read `공과대학` off
   * a prospectus, gets the row created for them. Neither given means the
   * column is left exactly as it is.
   */
  private async resolveFaculty(
    universityId: string,
    dto: Partial<CreateProgramDto>,
  ): Promise<string | null | undefined> {
    if (dto.facultyId !== undefined) return dto.facultyId;
    if (dto.facultyName === undefined) return undefined;
    return this.faculties.resolve(universityId, dto.facultyName);
  }

  private async requireUniversity(id: string) {
    const university = await this.prisma.university.findUnique({
      where: { id },
      select: { id: true, slug: true, nameMn: true },
    });
    if (!university) throw new NotFoundException('Сургууль олдсонгүй.');
    return university;
  }

  private async assertNameFree(universityId: string, level: string, nameMn: string, exceptId?: string) {
    const duplicate = await this.prisma.universityProgram.findFirst({
      where: {
        universityId,
        level: level as Prisma.EnumProgramLevelFilter['equals'],
        nameMn,
        ...(exceptId ? { id: { not: exceptId } } : {}),
      },
      select: { id: true },
    });
    if (duplicate) throw new ConflictException('Энэ түвшинд ижил нэртэй хөтөлбөр бүртгэгдсэн байна.');
  }

  /**
   * Drops the catalogue's read-through caches and queues a ranking recompute.
   *
   * Tuition and programme count are both inputs to `gksScore`, and the score is
   * relative, so one programme moves the whole order. Queued, not awaited: the
   * editor gets their response back and the new order lands seconds later.
   */
  private async invalidate(slug: string): Promise<void> {
    await Promise.all([
      this.cache.del(`university:${slug}`),
      this.cache.del('universities:facets'),
      this.cache.del('programs:facets'),
      this.cache.delByPattern(LIST_CACHE_PATTERN),
      this.rankingQueue
        .add(GKS_RANKING_JOB, {}, { jobId: 'recompute', removeOnComplete: true, delay: 5_000 })
        // Redis being down must not fail a catalogue edit; the nightly run catches up.
        .catch((error: Error) => this.logger.warn(`Рэйтинг дахин тооцоолол дараалалд орсонгүй: ${error.message}`)),
    ]);
  }
}
