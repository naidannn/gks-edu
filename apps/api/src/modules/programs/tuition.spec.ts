import { describe, expect, it } from 'vitest';
import { ProgramLevel } from '../../prisma/client.js';
import {
  ANNUAL_TUITION_SQL,
  TERMS_PER_YEAR,
  annualTuitionKrw,
  annualTuitionWhere,
  compareAnnualTuition,
} from './tuition.js';

/** A bachelor's department priced the way Korean schools publish it. */
const perTermOnly = { level: ProgramLevel.BACHELOR, tuitionPerYearKrw: null, tuitionPerTermKrw: 4_000_000 };
/** A language institute: four 10-week terms a year, not two semesters. */
const languagePrep = { level: ProgramLevel.LANGUAGE_PREP, tuitionPerYearKrw: null, tuitionPerTermKrw: 1_600_000 };
/** The rare programme whose school published an annual figure of its own. */
const annual = { level: ProgramLevel.MASTER, tuitionPerYearKrw: 9_000_000, tuitionPerTermKrw: 4_000_000 };
const unpriced = { level: ProgramLevel.PHD, tuitionPerYearKrw: null, tuitionPerTermKrw: null };

describe('annualTuitionKrw (1N-30)', () => {
  it('doubles a degree term', () => {
    expect(annualTuitionKrw(perTermOnly)).toBe(8_000_000);
  });

  // The case ×2 gets wrong: a language course runs four terms a year.
  it('quadruples a language-prep term', () => {
    expect(annualTuitionKrw(languagePrep)).toBe(6_400_000);
    expect(TERMS_PER_YEAR[ProgramLevel.LANGUAGE_PREP]).toBe(4);
  });

  it("prefers the school's own annual figure over the derived one", () => {
    expect(annualTuitionKrw(annual)).toBe(9_000_000);
  });

  it('stays null when nothing is published — never a confident zero', () => {
    expect(annualTuitionKrw(unpriced)).toBeNull();
  });
});

/** The derived branch a level falls into, for the assertions below. */
type TermBranch = { tuitionPerYearKrw: null; level: { in: ProgramLevel[] }; tuitionPerTermKrw: object };

function branchFor(where: ReturnType<typeof annualTuitionWhere>, level: ProgramLevel): TermBranch | undefined {
  return (where.OR ?? [])
    .filter((branch): branch is TermBranch => 'level' in branch && typeof branch.level === 'object')
    .find((branch) => branch.level.in.includes(level));
}

describe('annualTuitionWhere (1N-30)', () => {
  /**
   * The bug: filtering on `tuitionPerYearKrw` alone excludes every normally
   * priced programme the moment a visitor picks a budget.
   */
  it('keeps a per-term-only programme in a budget it fits', () => {
    const where = annualTuitionWhere(undefined, 9_000_000);

    // One branch per terms-per-year group, with the bound scaled back to a term.
    expect(branchFor(where, ProgramLevel.LANGUAGE_PREP)).toMatchObject({
      tuitionPerYearKrw: null,
      tuitionPerTermKrw: { lte: 2_250_000 },
    });
    expect(branchFor(where, ProgramLevel.BACHELOR)).toMatchObject({
      tuitionPerYearKrw: null,
      tuitionPerTermKrw: { lte: 4_500_000 },
    });
    // A degree and a language course must not land in the same branch.
    expect(branchFor(where, ProgramLevel.MASTER)).toBe(branchFor(where, ProgramLevel.PHD));
    expect(branchFor(where, ProgramLevel.MASTER)).not.toBe(branchFor(where, ProgramLevel.LANGUAGE_PREP));
  });

  it('still matches the annual column when the school published one', () => {
    expect(annualTuitionWhere(1_000_000, 9_000_000).OR).toContainEqual({
      tuitionPerYearKrw: { gte: 1_000_000, lte: 9_000_000 },
    });
  });

  // A floor rounds up and a ceiling rounds down, so a term price on the edge
  // is never let into a budget its year would blow.
  it('rounds each bound the safe way', () => {
    const degrees = branchFor(annualTuitionWhere(9_000_001, 8_999_999), ProgramLevel.BACHELOR);
    expect(degrees?.tuitionPerTermKrw).toEqual({ gte: 4_500_001, lte: 4_499_999 });
  });
});

describe('compareAnnualTuition (1N-30)', () => {
  it('sorts a cheap per-term programme ahead of a dearer annual one', () => {
    expect(compareAnnualTuition(languagePrep, annual, 'asc')).toBeLessThan(0);
  });

  it('sends an unpriced programme to the back either way', () => {
    expect(compareAnnualTuition(unpriced, perTermOnly, 'asc')).toBeGreaterThan(0);
    expect(compareAnnualTuition(unpriced, perTermOnly, 'desc')).toBeGreaterThan(0);
  });
});


describe('ANNUAL_TUITION_SQL (1N-30)', () => {
  /**
   * The aggregates Prisma cannot express read the same figure as the
   * TypeScript helper, and one of them silently returning the raw column is
   * exactly the bug this task exists for.
   */
  it('coalesces onto the per-term price, scaled by the level', () => {
    expect(ANNUAL_TUITION_SQL.sql.replace(/\s+/g, ' ')).toBe(
      'COALESCE( p."tuitionPerYearKrw", p."tuitionPerTermKrw" * CASE p."level" ' +
        "WHEN 'LANGUAGE_PREP' THEN ? ELSE ? END )",
    );
    expect(ANNUAL_TUITION_SQL.values).toEqual([
      TERMS_PER_YEAR[ProgramLevel.LANGUAGE_PREP],
      TERMS_PER_YEAR[ProgramLevel.BACHELOR],
    ]);
  });
});
