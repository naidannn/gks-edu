import { Injectable, NotFoundException } from '@nestjs/common';
import { AccessLevel, ProgramLevel } from '../../../../prisma/client.js';
import { AdmissionsService } from '../../../admissions/admissions.service.js';
import { QueryAdmissionsDto } from '../../../admissions/dto/query-admissions.dto.js';
import { INTAKE_MONTHS } from '../../../admissions/intake-deadline.js';
import { UniversitiesService } from '../../../universities/universities.service.js';
import { readEnum, readInt, readString } from './args.js';
import type { AiTool, AiToolProvider, ToolOutcome } from './tool.types.js';

const LEVELS = Object.values(ProgramLevel);
const DEFAULT_LIMIT = 5;
const MAX_LIMIT = 8;

/** What the widget renders per round, and what the model is told. */
interface IntakeCard {
  id: string;
  university: { slug: string; nameMn: string; logoPath: string | null };
  level: ProgramLevel;
  year: number;
  month: number;
  internalDeadline: string | null;
  daysUntilInternalDeadline: number | null;
  classStartDate: string | null;
}

/**
 * `get_intake_deadlines` — when we have to have everything in hand (§5.3).
 *
 * **One date leaves this tool, and it is ours.** `IntakeTerm.applicationDeadline`
 * is the school's published last day and it is not omitted from the payload so
 * much as never fetched: both paths below go through a public service that
 * drops it during serialisation, so there is no field here for a careless
 * component — or a chatty model — to surface. Given two dates people work to the
 * later one, and translation, notarisation and postage live in the gap
 * (CLAUDE.md, `ARCHITECTURE.md` §3.2).
 *
 * Two paths, because the question has two shapes. "When does Konkuk close?" is
 * answered from the school's own cached detail — the rounds are already on it,
 * already serialised, already counted down, and asking the admissions list for
 * them would be a second query for rows we hold. "What closes soonest?" is the
 * admissions list itself, which sorts on our deadline and hides expired rounds.
 */
@Injectable()
export class AdmissionsTools implements AiToolProvider {
  constructor(
    private readonly admissions: AdmissionsService,
    private readonly universities: UniversitiesService,
  ) {}

  tools(): AiTool[] {
    return [this.getIntakeDeadlines()];
  }

  private getIntakeDeadlines(): AiTool {
    return {
      name: 'get_intake_deadlines',
      minLevel: AccessLevel.PUBLIC,
      label: 'Элсэлтийн хуанли шалгаж байна…',
      description:
        'Элсэлтийн улирлууд ба бүртгэлийн эцсийн хугацаа. Буцаах огноо бол МАНАЙ дотоод ' +
        'хугацаа — орчуулга, нотариат, шуудангийн хугацааг багтаасан. Өөр ямар ч хугацаа бүү дурд.',
      parameters: {
        type: 'object',
        properties: {
          universitySlug: { type: 'string', description: 'Нэг сургуулийн элсэлтүүд' },
          level: { type: 'string', enum: LEVELS },
          year: { type: 'integer', description: 'Хичээл эхлэх жил, жишээ нь 2027' },
          month: { type: 'integer', description: `Хичээл эхлэх сар — зөвхөн ${INTAKE_MONTHS.join(', ')}` },
          limit: { type: 'integer', description: `Хэдэн улирал буцаах (дээд тал нь ${MAX_LIMIT})` },
        },
      },
      run: async (args): Promise<ToolOutcome> => {
        const slug = readString(args, 'universitySlug', 120);
        const level = readEnum(args, 'level', LEVELS);
        const year = readInt(args, 'year', 2020, 2100);
        const month = readInt(args, 'month', 1, 12);
        const limit = readInt(args, 'limit', 1, MAX_LIMIT) ?? DEFAULT_LIMIT;

        const found = slug
          ? await this.forOneSchool({ slug, level, year, month, limit })
          : await this.acrossSchools({ level, year, month, limit });

        if (found === null) {
          return {
            title: 'Сургууль олдсонгүй',
            data: { found: false, message: `"${slug}" гэсэн сургууль каталогид алга` },
          };
        }

        return {
          title: 'Элсэлтийн хугацаа',
          data: {
            total: found.total,
            тайлбар:
              'internalDeadline бол манай дотоод эцсийн хугацаа — материал бүрэн бэлэн байх ёстой өдөр. ' +
              'Сургуулийн өөрийн зарласан хугацааг хэрэглэгчид хэлэхгүй.',
            элсэлтүүд: found.items.map((item) => ({
              сургууль: item.university.nameMn,
              түвшин: item.level,
              хичээл_эхлэх: `${item.year}/${item.month}`,
              манай_эцсийн_хугацаа: item.internalDeadline,
              үлдсэн_хоног: item.daysUntilInternalDeadline,
            })),
          },
          card: { type: 'intakes', data: { items: found.items, total: found.total } },
        };
      },
    };
  }

  /** The school's own page already holds its rounds — `null` when there is no such school. */
  private async forOneSchool(params: {
    slug: string;
    level?: ProgramLevel;
    year?: number;
    month?: number;
    limit: number;
  }): Promise<{ items: IntakeCard[]; total: number } | null> {
    let university: Awaited<ReturnType<UniversitiesService['findBySlug']>>;
    try {
      university = await this.universities.findBySlug(params.slug);
    } catch (error) {
      if (error instanceof NotFoundException) return null;
      throw error;
    }

    const school = {
      slug: university.slug,
      nameMn: university.nameMn,
      logoPath: university.logoPath,
    };

    const matching = university.intakes
      // A round whose own deadline has gone is history, not an option — unless
      // the caller asked about a specific term, where the honest answer to
      // "March 2026?" is that it has closed.
      .filter((intake) => (params.year || params.month ? true : intake.phase !== 'CLOSED'))
      .filter((intake) => (params.level ? intake.level === params.level : true))
      .filter((intake) => (params.year ? intake.year === params.year : true))
      .filter((intake) => (params.month ? intake.month === params.month : true))
      .sort(byInternalDeadline);

    return {
      total: matching.length,
      items: matching.slice(0, params.limit).map((intake) => toCard(intake, school)),
    };
  }

  private async acrossSchools(params: {
    level?: ProgramLevel;
    year?: number;
    month?: number;
    limit: number;
  }): Promise<{ items: IntakeCard[]; total: number }> {
    const query = Object.assign(new QueryAdmissionsDto(), {
      level: params.level,
      year: params.year,
      month: params.month,
      sort: 'deadline' as const,
      order: 'asc' as const,
      page: 1,
      limit: params.limit,
    });

    const { items, meta } = await this.admissions.findAll(query);

    return {
      total: meta.total,
      items: items.map((item) =>
        toCard(item, {
          slug: item.university.slug,
          nameMn: item.university.nameMn,
          logoPath: item.university.logoPath,
        }),
      ),
    };
  }
}

/**
 * A date from a service whose answer may have come back through Redis.
 *
 * `CacheService` stores through `@keyv/redis`, which serialises to JSON: the
 * first call inside a TTL window hands back a `Date` and every later one hands
 * back that date's ISO string. Both are the same instant — only code that calls
 * a `Date` method on the result is wrong, and it is wrong intermittently, which
 * is the worst way for it to be wrong.
 */
function isoDate(value: Date | string | null): string | null {
  if (value === null) return null;

  return value instanceof Date ? value.toISOString() : value;
}

/** A round with no deadline recorded yet sorts last — unknown is not soonest. */
function byInternalDeadline(
  a: { internalDeadline: Date | string | null },
  b: { internalDeadline: Date | string | null },
): number {
  const left = isoDate(a.internalDeadline);
  const right = isoDate(b.internalDeadline);
  if (left === null) return 1;
  if (right === null) return -1;

  // ISO strings sort chronologically as text, so no parsing is needed.
  return left < right ? -1 : left > right ? 1 : 0;
}

function toCard(
  intake: {
    id: string;
    level: ProgramLevel;
    year: number;
    month: number;
    internalDeadline: Date | string | null;
    daysUntilInternalDeadline: number | null;
    classStartDate: Date | string | null;
  },
  university: { slug: string; nameMn: string; logoPath: string | null },
): IntakeCard {
  return {
    id: intake.id,
    university,
    level: intake.level,
    year: intake.year,
    month: intake.month,
    internalDeadline: isoDate(intake.internalDeadline),
    daysUntilInternalDeadline: intake.daysUntilInternalDeadline,
    classStartDate: isoDate(intake.classStartDate),
  };
}
