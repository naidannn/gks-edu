import { ConflictException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { Prisma } from '../../prisma/client.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import { CacheService } from '../../redis/cache.service.js';
import type { AssignStudyFieldDto, CreateStudyFieldDto, RematchStudyFieldsDto, UpdateStudyFieldDto } from './dto/study-field.dto.js';
import {
  buildStudyFieldIndex,
  matchStudyField,
  normaliseProgramName,
  type MatchableStudyField,
  type StudyFieldIndex,
  type StudyFieldMatch,
} from './study-field.matcher.js';

const FIELD_SELECT = {
  id: true,
  slug: true,
  nameMn: true,
  nameEn: true,
  nameKo: true,
  aliases: true,
  parentId: true,
  sortOrder: true,
  isActive: true,
} satisfies Prisma.StudyFieldSelect;

type FieldRow = Prisma.StudyFieldGetPayload<{ select: typeof FIELD_SELECT }>;

const TREE_CACHE_KEY = 'study-fields:tree';
const TREE_CACHE_TTL_MS = 300_000;

/**
 * The canonical subject taxonomy, and the matcher that files a school's own
 * wording under it (ARCHITECTURE.md §3.3).
 *
 * The matcher index is rebuilt from the table on every write rather than
 * cached across requests: the taxonomy is ~90 rows, building the index is a
 * sort, and an index that lags behind an alias somebody just added is exactly
 * the confusing half-state this feature must not have.
 */
@Injectable()
export class StudyFieldsService {
  private readonly logger = new Logger(StudyFieldsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly cache: CacheService,
  ) {}

  /** Every field, groups first, for the admin screen. */
  async findAll() {
    const [fields, counts] = await Promise.all([
      this.prisma.studyField.findMany({
        select: FIELD_SELECT,
        orderBy: [{ sortOrder: 'asc' }, { nameMn: 'asc' }],
      }),
      this.prisma.universityProgram.groupBy({ by: ['studyFieldId'], _count: { _all: true } }),
    ]);

    const byField = new Map(counts.map((row) => [row.studyFieldId, row._count._all]));
    return this.toTree(fields, byField);
  }

  /**
   * The public filter panel: only active fields, and only ones with a
   * published programme behind them — an empty subject on a filter list is a
   * dead end a visitor clicks once.
   */
  async publicTree() {
    return this.cache.wrap(
      TREE_CACHE_KEY,
      async () => {
        const [fields, counts] = await Promise.all([
          this.prisma.studyField.findMany({
            where: { isActive: true },
            select: FIELD_SELECT,
            orderBy: [{ sortOrder: 'asc' }, { nameMn: 'asc' }],
          }),
          this.prisma.universityProgram.groupBy({
            by: ['studyFieldId'],
            where: { isPublished: true, university: { isPublished: true } },
            _count: { _all: true },
          }),
        ]);

        const byField = new Map(counts.map((row) => [row.studyFieldId, row._count._all]));
        return this.toTree(fields, byField).filter((group) => group.programCount > 0);
      },
      TREE_CACHE_TTL_MS,
    );
  }

  /**
   * A field slug expanded to itself plus its children — so filtering by the
   * group "Бизнес" returns marketing, accounting and the rest of it.
   */
  async resolveFieldIds(slug: string): Promise<string[]> {
    const field = await this.prisma.studyField.findUnique({
      where: { slug },
      select: { id: true, children: { select: { id: true } } },
    });
    if (!field) return [];
    return [field.id, ...field.children.map((child) => child.id)];
  }

  /** The matcher, ready to use. Rebuilt per call — see the class comment. */
  async index(): Promise<StudyFieldIndex> {
    const fields = await this.prisma.studyField.findMany({
      where: { isActive: true },
      select: { id: true, slug: true, nameMn: true, nameEn: true, nameKo: true, aliases: true, parentId: true },
    });
    return buildStudyFieldIndex(fields satisfies MatchableStudyField[]);
  }

  /** The best canonical subject for one programme's names, or null. */
  async match(texts: (string | null | undefined)[]): Promise<StudyFieldMatch | null> {
    return matchStudyField(await this.index(), texts);
  }

  // --- Admin writes ---

  async create(dto: CreateStudyFieldDto) {
    const existing = await this.prisma.studyField.findUnique({ where: { slug: dto.slug }, select: { id: true } });
    if (existing) throw new ConflictException(`"${dto.slug}" slug аль хэдийн ашиглагдсан байна.`);

    const field = await this.prisma.studyField.create({
      data: { ...dto, aliases: dto.aliases ?? [] } as Prisma.StudyFieldUncheckedCreateInput,
      select: FIELD_SELECT,
    });
    await this.invalidate();
    return field;
  }

  async update(id: string, dto: UpdateStudyFieldDto) {
    await this.require(id);
    if (dto.parentId === id) throw new ConflictException('Чиглэл өөрийгөө агуулах боломжгүй.');

    const field = await this.prisma.studyField.update({
      where: { id },
      data: dto as Prisma.StudyFieldUncheckedUpdateInput,
      select: FIELD_SELECT,
    });
    await this.invalidate();
    return field;
  }

  /**
   * Deleting a field does not delete the programmes under it — the relation is
   * `SetNull`, so they fall back to "ангилаагүй" and stay findable. A group
   * with children is refused: orphaning half the taxonomy silently is worse
   * than the error message.
   */
  async remove(id: string): Promise<void> {
    const field = await this.prisma.studyField.findUnique({
      where: { id },
      select: { nameMn: true, _count: { select: { children: true, programs: true } } },
    });
    if (!field) throw new NotFoundException('Чиглэл олдсонгүй.');
    if (field._count.children > 0) {
      throw new ConflictException(
        `"${field.nameMn}" дотор ${field._count.children} дэд чиглэл байна. Эхлээд тэдгээрийг зөөнө үү.`,
      );
    }

    await this.prisma.studyField.delete({ where: { id } });
    await this.invalidate();
    this.logger.log(`Чиглэл устгалаа: ${field.nameMn} (${field._count.programs} хөтөлбөр ангилалгүй боллоо)`);
  }

  /**
   * Files a hand-picked set of programmes under one subject — the "нэгтгэх"
   * step for wordings the matcher could not place.
   *
   * With `learnAliases`, each programme's Korean and English name is added to
   * the field, which is the part that compounds: the next school that words it
   * the same way is matched without anybody being asked again.
   */
  async assign(fieldId: string, dto: AssignStudyFieldDto) {
    const field = await this.require(fieldId);

    const programs = await this.prisma.universityProgram.findMany({
      where: { id: { in: dto.programIds } },
      select: { id: true, nameKo: true, nameEn: true, nameMn: true },
    });

    const learned: string[] = [];
    if (dto.learnAliases) {
      const known = new Set(field.aliases.map((alias) => normaliseProgramName(alias)));
      for (const program of programs) {
        // The school's own Korean and English wording is what another school
        // will reuse. The Mongolian name is ours and is often a paraphrase, so
        // it is not learned.
        for (const name of [program.nameKo, program.nameEn]) {
          const normalised = name ? normaliseProgramName(name) : '';
          if (!normalised || known.has(normalised)) continue;
          known.add(normalised);
          learned.push(name!);
        }
      }
    }

    const [updated] = await this.prisma.$transaction([
      this.prisma.universityProgram.updateMany({
        where: { id: { in: programs.map((program) => program.id) } },
        data: { studyFieldId: fieldId },
      }),
      ...(learned.length
        ? [
            this.prisma.studyField.update({
              where: { id: fieldId },
              data: { aliases: { push: learned } },
            }),
          ]
        : []),
    ]);

    await this.invalidate();
    return { assigned: updated.count, learnedAliases: learned };
  }

  /**
   * Runs the matcher over the catalogue.
   *
   * `dryRun` defaults to true and the admin screen calls it that way first:
   * this touches every programme at once, and seeing the list before it is
   * written is the difference between a useful tool and a mass mis-filing.
   */
  async rematch(dto: RematchStudyFieldsDto) {
    const dryRun = dto.dryRun ?? true;
    const index = await this.index();

    const programs = await this.prisma.universityProgram.findMany({
      where: dto.includeClassified ? {} : { studyFieldId: null },
      select: {
        id: true,
        nameMn: true,
        nameEn: true,
        nameKo: true,
        faculty: true,
        studyFieldId: true,
        university: { select: { nameMn: true } },
      },
      orderBy: { nameMn: 'asc' },
    });

    const matched: {
      programId: string;
      programName: string;
      universityNameMn: string;
      fieldId: string;
      fieldSlug: string;
      score: number;
      matchedOn: string;
      wasClassified: boolean;
    }[] = [];

    for (const program of programs) {
      const hit = matchStudyField(index, [program.nameKo, program.nameEn, program.nameMn, program.faculty]);
      if (!hit || hit.fieldId === program.studyFieldId) continue;
      matched.push({
        programId: program.id,
        programName: program.nameMn,
        universityNameMn: program.university.nameMn,
        fieldId: hit.fieldId,
        fieldSlug: hit.slug,
        score: hit.score,
        matchedOn: hit.matchedOn,
        wasClassified: program.studyFieldId !== null,
      });
    }

    if (!dryRun && matched.length) {
      // One statement per target field rather than per programme: 90 fields is
      // a bounded number of round trips, 4 000 programmes is not.
      const byField = new Map<string, string[]>();
      for (const row of matched) {
        byField.set(row.fieldId, [...(byField.get(row.fieldId) ?? []), row.programId]);
      }
      await this.prisma.$transaction(
        [...byField].map(([fieldId, programIds]) =>
          this.prisma.universityProgram.updateMany({ where: { id: { in: programIds } }, data: { studyFieldId: fieldId } }),
        ),
      );
      await this.invalidate();
    }

    return {
      dryRun,
      scanned: programs.length,
      matched: matched.length,
      unmatched: programs.length - matched.length,
      rows: matched.slice(0, 300),
    };
  }

  // --- Internals ---

  private async require(id: string) {
    const field = await this.prisma.studyField.findUnique({ where: { id }, select: FIELD_SELECT });
    if (!field) throw new NotFoundException('Чиглэл олдсонгүй.');
    return field;
  }

  /**
   * Groups with their subjects nested, and a `programCount` that rolls up: a
   * group's count is its own programmes plus its children's, because that is
   * the number a filter panel is asked about.
   */
  private toTree(fields: FieldRow[], counts: Map<string | null, number>) {
    const groups = fields.filter((field) => field.parentId === null);

    return groups.map((group) => {
      const children = fields
        .filter((field) => field.parentId === group.id)
        .map((child) => ({ ...child, programCount: counts.get(child.id) ?? 0 }));

      return {
        ...group,
        children,
        programCount:
          (counts.get(group.id) ?? 0) + children.reduce((total, child) => total + child.programCount, 0),
      };
    });
  }

  private async invalidate(): Promise<void> {
    await this.cache.del(TREE_CACHE_KEY);
  }
}
