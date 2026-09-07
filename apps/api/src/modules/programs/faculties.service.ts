import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '../../prisma/client.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import { CacheService } from '../../redis/cache.service.js';
import type { CreateFacultyDto, UpdateFacultyDto } from './dto/faculty.dto.js';

export const FACULTY_SELECT = {
  id: true,
  universityId: true,
  nameMn: true,
  nameEn: true,
  nameKo: true,
  sortOrder: true,
} satisfies Prisma.FacultySelect;

/**
 * Танхим — one school's colleges (ARCHITECTURE.md §3.3).
 *
 * There is no taxonomy above this and no matcher beside it. A faculty belongs
 * to exactly one university and is named the way that university names it, so
 * the only interesting operation is `resolve`: turning a name a research run
 * or a form produced into a row, creating it when the school has not got one
 * yet. Everything else is plain CRUD.
 */
@Injectable()
export class FacultiesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly cache: CacheService,
  ) {}

  /** Every faculty of one school, with how many programmes hang off each. */
  async findByUniversity(universityId: string) {
    const faculties = await this.prisma.faculty.findMany({
      where: { universityId },
      select: { ...FACULTY_SELECT, _count: { select: { programs: true } } },
      orderBy: [{ sortOrder: 'asc' }, { nameMn: 'asc' }],
    });

    return faculties.map(({ _count, ...faculty }) => ({ ...faculty, programCount: _count.programs }));
  }

  async create(dto: CreateFacultyDto) {
    await this.requireUniversity(dto.universityId);
    await this.assertNameFree(dto.universityId, dto.nameMn);

    return this.prisma.faculty.create({
      data: { ...dto, nameMn: dto.nameMn.trim() },
      select: FACULTY_SELECT,
    });
  }

  async update(id: string, dto: UpdateFacultyDto) {
    const current = await this.require(id);
    if (dto.nameMn && dto.nameMn.trim() !== current.nameMn) {
      await this.assertNameFree(current.universityId, dto.nameMn, id);
    }

    const faculty = await this.prisma.faculty.update({
      where: { id },
      data: { ...dto, ...(dto.nameMn ? { nameMn: dto.nameMn.trim() } : {}) },
      select: FACULTY_SELECT,
    });
    await this.invalidate();
    return faculty;
  }

  /**
   * Deleting a faculty does not delete its programmes — the relation is
   * `SetNull`, and they reappear under "танхим тодорхойгүй" where somebody can
   * file them again. Losing a department because a college was renamed would
   * be the worse outcome.
   */
  async remove(id: string): Promise<void> {
    await this.require(id);
    await this.prisma.faculty.delete({ where: { id } });
    await this.invalidate();
  }

  /**
   * The name a research run (or a form that let somebody type one) produced,
   * as a row id.
   *
   * Matching is on the trimmed name, case-insensitively, against both the
   * Mongolian and the Korean column: a run reports `공과대학`, and the faculty
   * the office created last month may be stored under exactly that. An empty
   * name is not an error — it is a programme with no college, which is normal.
   */
  async resolve(universityId: string, name: string | null | undefined): Promise<string | null> {
    const trimmed = name?.trim();
    if (!trimmed) return null;

    const existing = await this.prisma.faculty.findFirst({
      where: {
        universityId,
        OR: [
          { nameMn: { equals: trimmed, mode: 'insensitive' } },
          { nameKo: { equals: trimmed, mode: 'insensitive' } },
          { nameEn: { equals: trimmed, mode: 'insensitive' } },
        ],
      },
      select: { id: true },
    });
    if (existing) return existing.id;

    const created = await this.prisma.faculty.create({
      // A Korean name is stored in both columns until somebody words it in
      // Mongolian: the list has to show something, and `공과대학` is at least
      // the school's own word for it.
      data: { universityId, nameMn: trimmed, nameKo: /[가-힯]/.test(trimmed) ? trimmed : null },
      select: { id: true },
    });
    return created.id;
  }

  /**
   * The same, for a whole batch, in one pass over the school's faculties.
   *
   * A research run brings back sixty departments across eight colleges;
   * resolving each one on its own would be sixty round trips to a database
   * ~115 ms away (CLAUDE.md).
   */
  async resolveMany(universityId: string, names: (string | null | undefined)[]): Promise<Map<string, string>> {
    const wanted = [...new Set(names.map((name) => name?.trim()).filter((name): name is string => Boolean(name)))];
    if (wanted.length === 0) return new Map();

    const existing = await this.prisma.faculty.findMany({
      where: { universityId },
      select: { id: true, nameMn: true, nameEn: true, nameKo: true },
    });

    const byName = new Map<string, string>();
    for (const faculty of existing) {
      for (const name of [faculty.nameMn, faculty.nameEn, faculty.nameKo]) {
        if (name) byName.set(name.trim().toLowerCase(), faculty.id);
      }
    }

    const missing = wanted.filter((name) => !byName.has(name.toLowerCase()));
    if (missing.length) {
      await this.prisma.faculty.createMany({
        data: missing.map((name) => ({
          universityId,
          nameMn: name,
          nameKo: /[가-힯]/.test(name) ? name : null,
        })),
        skipDuplicates: true,
      });

      const created = await this.prisma.faculty.findMany({
        where: { universityId, nameMn: { in: missing } },
        select: { id: true, nameMn: true },
      });
      for (const faculty of created) byName.set(faculty.nameMn.trim().toLowerCase(), faculty.id);
    }

    // Keyed by the caller's own wording, so a candidate can look itself up.
    const resolved = new Map<string, string>();
    for (const name of wanted) {
      const id = byName.get(name.toLowerCase());
      if (id) resolved.set(name, id);
    }
    return resolved;
  }

  private async require(id: string) {
    const faculty = await this.prisma.faculty.findUnique({ where: { id }, select: FACULTY_SELECT });
    if (!faculty) throw new NotFoundException('Танхим олдсонгүй.');
    return faculty;
  }

  private async requireUniversity(id: string) {
    const university = await this.prisma.university.findUnique({ where: { id }, select: { id: true } });
    if (!university) throw new NotFoundException('Сургууль олдсонгүй.');
    return university;
  }

  private async assertNameFree(universityId: string, nameMn: string, exceptId?: string) {
    const duplicate = await this.prisma.faculty.findFirst({
      where: { universityId, nameMn: nameMn.trim(), ...(exceptId ? { id: { not: exceptId } } : {}) },
      select: { id: true },
    });
    if (duplicate) throw new ConflictException('Энэ сургуульд ижил нэртэй танхим бүртгэгдсэн байна.');
  }

  private async invalidate(): Promise<void> {
    await this.cache.del('programs:facets');
  }
}
