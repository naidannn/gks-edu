import { Prisma, ProgramLevel } from '../../prisma/client.js';

/**
 * Annual tuition, derived — never stored (ARCHITECTURE.md §3.3, CLAUDE.md).
 *
 * Korean schools publish tuition per term and the database keeps it that way;
 * `tuitionPerYearKrw` is filled only when the school itself published an annual
 * figure, which most of them do not. Every filter, sort, facet and score that
 * reads the annual column alone therefore drops a normal programme entirely, so
 * they all read the derived figure through this file instead.
 *
 * This mirrors `packages/shared/src/tuition.ts`, which is the web app's copy.
 * `apps/api` does not depend on that package — it is not in its `package.json`,
 * its entry point is raw TypeScript, and `nest build` compiles `src` only — so
 * the numbers live in both places and have to be changed in both.
 */

/**
 * How many tuition terms a year of study has. A language institute runs four
 * 10-week terms, so the familiar ×2 would understate a language-prep year by
 * half; degrees run two semesters.
 */
export const TERMS_PER_YEAR: Record<ProgramLevel, number> = {
  [ProgramLevel.LANGUAGE_PREP]: 4,
  [ProgramLevel.BACHELOR]: 2,
  [ProgramLevel.MASTER]: 2,
  [ProgramLevel.PHD]: 2,
};

/** The levels that share a terms-per-year figure, for a per-level `where`. */
export const LEVELS_BY_TERMS_PER_YEAR: { terms: number; levels: ProgramLevel[] }[] = Object.values(ProgramLevel)
  .reduce<{ terms: number; levels: ProgramLevel[] }[]>((groups, level) => {
    const terms = TERMS_PER_YEAR[level];
    const group = groups.find((entry) => entry.terms === terms);
    if (group) group.levels.push(level);
    else groups.push({ terms, levels: [level] });
    return groups;
  }, []);

/**
 * The annual tuition a visitor is shown: the school's own annual figure when it
 * published one, otherwise the per-term figure × terms in a year. `null` when
 * neither is known — render that as "мэдээлэл шинэчлэгдэж байна", never as 0.
 */
export function annualTuitionKrw(program: {
  level: ProgramLevel;
  tuitionPerYearKrw: number | null;
  tuitionPerTermKrw: number | null;
}): number | null {
  if (program.tuitionPerYearKrw !== null && program.tuitionPerYearKrw !== undefined) return program.tuitionPerYearKrw;
  if (program.tuitionPerTermKrw === null || program.tuitionPerTermKrw === undefined) return null;
  return program.tuitionPerTermKrw * TERMS_PER_YEAR[program.level];
}

/**
 * The same expression in SQL, for the aggregates Prisma cannot express. Assumes
 * the programme table is aliased `p`.
 */
export const ANNUAL_TUITION_SQL = Prisma.sql`COALESCE(
  p."tuitionPerYearKrw",
  p."tuitionPerTermKrw" * CASE p."level"
    WHEN 'LANGUAGE_PREP' THEN ${TERMS_PER_YEAR.LANGUAGE_PREP}
    ELSE ${TERMS_PER_YEAR.BACHELOR}
  END
)`;

/**
 * A budget filter over the derived figure, as a `where` clause.
 *
 * One branch per terms-per-year group, because the multiplier depends on the
 * level: a programme with only a per-term price is in budget when that price
 * times its own terms is. The bounds are moved rather than the column, so the
 * indexes still serve it.
 */
export function annualTuitionWhere(
  min: number | undefined,
  max: number | undefined,
): Prisma.UniversityProgramWhereInput {
  const annual = {
    ...(min !== undefined ? { gte: min } : {}),
    ...(max !== undefined ? { lte: max } : {}),
  };

  return {
    OR: [
      { tuitionPerYearKrw: annual },
      ...LEVELS_BY_TERMS_PER_YEAR.map(({ terms, levels }) => ({
        tuitionPerYearKrw: null,
        level: { in: levels },
        tuitionPerTermKrw: {
          ...(min !== undefined ? { gte: Math.ceil(min / terms) } : {}),
          ...(max !== undefined ? { lte: Math.floor(max / terms) } : {}),
        },
      })),
    ],
  };
}

/** Orders two programmes by their derived annual tuition; unknown sorts last. */
export function compareAnnualTuition(
  left: Parameters<typeof annualTuitionKrw>[0],
  right: Parameters<typeof annualTuitionKrw>[0],
  order: 'asc' | 'desc',
): number {
  const a = annualTuitionKrw(left);
  const b = annualTuitionKrw(right);
  // A price we do not know is not a cheap one — it goes to the back either way.
  if (a === null) return b === null ? 0 : 1;
  if (b === null) return -1;
  return order === 'desc' ? b - a : a - b;
}
