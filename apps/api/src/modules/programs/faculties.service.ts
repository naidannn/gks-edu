import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '../../prisma/client.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import { CacheService } from '../../redis/cache.service.js';
import { universityDetailCacheKey } from '../universities/universities.service.js';
import { catalogueNameKey } from './catalogue-name.js';
import type { CreateFacultyDto, UpdateFacultyDto } from './dto/faculty.dto.js';
import { PROGRAMS_FACETS_CACHE_KEY } from './programs.service.js';

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
    const university = await this.requireUniversity(dto.universityId);
    await this.assertNameFree(dto.universityId, dto.nameMn, dto.nameKo ?? null);

    const faculty = await this.prisma.faculty.create({
      data: { ...dto, nameMn: dto.nameMn.trim() },
      select: FACULTY_SELECT,
    });
    await this.invalidate(university.slug);
    return faculty;
  }

  async update(id: string, dto: UpdateFacultyDto) {
    const current = await this.require(id);
    const nameMn = dto.nameMn?.trim() ?? current.nameMn;
    // `undefined` leaves the Korean name as it is; `null` clears it.
    const nameKo = dto.nameKo === undefined ? current.nameKo : dto.nameKo;
    if (nameMn !== current.nameMn || catalogueNameKey(nameKo) !== catalogueNameKey(current.nameKo)) {
      await this.assertNameFree(current.universityId, nameMn, nameKo, id);
    }

    const faculty = await this.prisma.faculty.update({
      where: { id },
      data: { ...dto, ...(dto.nameMn ? { nameMn: dto.nameMn.trim() } : {}) },
      select: FACULTY_SELECT,
    });
    await this.invalidate(await this.slugOf(current.universityId));
    return faculty;
  }

  /**
   * Deleting a faculty does not delete its programmes — the relation is
   * `SetNull`, and they reappear under "танхим тодорхойгүй" where somebody can
   * file them again. Losing a department because a college was renamed would
   * be the worse outcome.
   */
  async remove(id: string): Promise<void> {
    const current = await this.require(id);
    await this.prisma.faculty.delete({ where: { id } });
    await this.invalidate(await this.slugOf(current.universityId));
  }

  /**
   * The name a research run (or a form that let somebody type one) produced,
   * as a row id, creating the faculty when the school has not got one yet.
   *
   * Matching is against all three columns in `catalogueNameKey` form: a run
   * reports `공과대학`, and the faculty the office created last month may be
   * stored under exactly that — or under `공과 대학`. An empty name is not an
   * error — it is a programme with no college, which is normal.
   */
  async resolve(universityId: string, name: string | null | undefined): Promise<string | null> {
    const trimmed = name?.trim();
    if (!trimmed) return null;
    return (await this.resolveMany(universityId, [trimmed])).get(trimmed) ?? null;
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

    const index = async () => {
      const faculties = await this.prisma.faculty.findMany({
        where: { universityId },
        select: { id: true, nameMn: true, nameEn: true, nameKo: true },
      });
      const byKey = new Map<string, string>();
      for (const faculty of faculties) {
        for (const name of [faculty.nameMn, faculty.nameEn, faculty.nameKo]) {
          const key = catalogueNameKey(name);
          if (key) byKey.set(key, faculty.id);
        }
      }
      return byKey;
    };

    let byKey = await index();

    // One new row per key, not per wording: `공과 대학` and `공과대학` in the
    // same batch are one college, and the second would collide with the first
    // on the Korean-name index.
    const missing = new Map<string, string>();
    for (const name of wanted) {
      const key = catalogueNameKey(name)!;
      if (!byKey.has(key) && !missing.has(key)) missing.set(key, name);
    }

    if (missing.size) {
      await this.prisma.faculty.createMany({
        // A Korean name is stored in both columns until somebody words it in
        // Mongolian: the list has to show something, and `공과대학` is at least
        // the school's own word for it.
        data: [...missing.values()].map((name) => ({
          universityId,
          nameMn: name,
          nameKo: /[가-힯]/.test(name) ? name : null,
        })),
        skipDuplicates: true,
      });
      // Re-read rather than trust what was sent: a row `skipDuplicates` dropped
      // was created by somebody else a moment ago, and it is the one to point at.
      byKey = await index();
    }

    // Keyed by the caller's own wording, so a candidate can look itself up.
    const resolved = new Map<string, string>();
    for (const name of wanted) {
      const id = byKey.get(catalogueNameKey(name)!);
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
    const university = await this.prisma.university.findUnique({ where: { id }, select: { id: true, slug: true } });
    if (!university) throw new NotFoundException('Сургууль олдсонгүй.');
    return university;
  }

  private async slugOf(universityId: string): Promise<string | null> {
    const university = await this.prisma.university.findUnique({
      where: { id: universityId },
      select: { slug: true },
    });
    return university?.slug ?? null;
  }

  /**
   * `nameMn` is unique per school, and so is the Korean name in
   * `catalogueNameKey` form — the second compared here because the index is on
   * an expression Prisma cannot filter by. A school has a dozen colleges.
   */
  private async assertNameFree(universityId: string, nameMn: string, nameKo: string | null, exceptId?: string) {
    const koKey = catalogueNameKey(nameKo);
    const siblings = await this.prisma.faculty.findMany({
      where: {
        universityId,
        OR: [{ nameMn: nameMn.trim() }, ...(koKey ? [{ nameKo: { not: null } }] : [])],
        ...(exceptId ? { id: { not: exceptId } } : {}),
      },
      select: { nameMn: true, nameKo: true },
    });

    if (siblings.some((faculty) => faculty.nameMn === nameMn.trim())) {
      throw new ConflictException('Энэ сургуульд ижил нэртэй танхим бүртгэгдсэн байна.');
    }
    const twin = koKey ? siblings.find((faculty) => catalogueNameKey(faculty.nameKo) === koKey) : undefined;
    if (twin) {
      throw new ConflictException(
        `Энэ сургуульд «${twin.nameKo}» солонгос нэртэй танхим «${twin.nameMn}» нэрээр бүртгэгдсэн байна.`,
      );
    }
  }

  /**
   * A college is a line on every programme card of its school, so a rename or a
   * deletion goes stale on the school page as well as in the facet lists — and
   * creating one used to invalidate nothing at all.
   */
  private async invalidate(slug: string | null): Promise<void> {
    await Promise.all([
      this.cache.del(PROGRAMS_FACETS_CACHE_KEY),
      ...(slug ? [this.cache.del(universityDetailCacheKey(slug))] : []),
    ]);
  }
}
