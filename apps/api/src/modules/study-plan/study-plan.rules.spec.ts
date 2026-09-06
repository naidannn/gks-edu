import { describe, expect, it } from 'vitest';
import { EducationLevel, ProgramLevel } from '../../prisma/client.js';
import {
  addMonths,
  calendarIntakes,
  daysUntil,
  isGoalReachable,
  needsLanguageStage,
  prepMonths,
  sumRange,
} from './study-plan.rules.js';

const at = (value: string) => new Date(`${value}T12:00:00.000Z`);

describe('isGoalReachable', () => {
  it('lets a school leaver plan a bachelor, not a master', () => {
    expect(isGoalReachable(EducationLevel.SECONDARY_SCHOOL, ProgramLevel.BACHELOR)).toBe(true);
    expect(isGoalReachable(EducationLevel.SECONDARY_SCHOOL, ProgramLevel.MASTER)).toBe(false);
  });

  it('offers language prep at every level of education', () => {
    for (const education of Object.values(EducationLevel)) {
      expect(isGoalReachable(education, ProgramLevel.LANGUAGE_PREP)).toBe(true);
    }
  });
});

describe('prepMonths', () => {
  it('gives one level one term', () => {
    expect(prepMonths(2, 3)).toBe(3);
  });

  it('gives zero Korean nine months to reach TOPIK 3, the usual degree entry', () => {
    expect(prepMonths(0, 3)).toBe(9);
  });

  it('runs the whole ladder inside the two-year guard', () => {
    expect(prepMonths(0, 6)).toBe(18);
  });

  it('never returns nothing when the stage is in the path at all', () => {
    expect(prepMonths(4, 3)).toBe(3);
  });
});

describe('needsLanguageStage', () => {
  it('is skipped when one real programme would already take them', () => {
    expect(needsLanguageStage(ProgramLevel.MASTER, 1, 20)).toBe(false);
  });

  it('is required when Korean is the only thing in the way', () => {
    expect(needsLanguageStage(ProgramLevel.MASTER, 0, 20)).toBe(true);
  });

  it('is not the answer to an empty catalogue', () => {
    expect(needsLanguageStage(ProgramLevel.MASTER, 0, 0)).toBe(false);
  });

  it('never stacks in front of language prep itself', () => {
    expect(needsLanguageStage(ProgramLevel.LANGUAGE_PREP, 0, 20)).toBe(false);
  });
});

describe('calendarIntakes', () => {
  it('runs degrees on the March and September semesters', () => {
    const found = calendarIntakes(ProgramLevel.BACHELOR, at('2026-09-06'), { count: 2 });
    expect(found.map((row) => `${row.year}-${row.month}`)).toEqual(['2027-3', '2027-9']);
  });

  it('runs language prep four times a year', () => {
    const found = calendarIntakes(ProgramLevel.LANGUAGE_PREP, at('2026-09-06'), { count: 3 });
    expect(found.map((row) => row.month)).toEqual([12, 3, 6]);
  });

  it('closes registration at the end of the month two before classes', () => {
    const [first] = calendarIntakes(ProgramLevel.BACHELOR, at('2026-09-06'), { count: 1 });
    expect(first?.registerBy.toISOString().slice(0, 10)).toBe('2027-01-31');
  });

  it('drops a round whose registration month has already passed', () => {
    // 5 February: the March round closed on 31 January.
    const found = calendarIntakes(ProgramLevel.BACHELOR, at('2027-02-05'), { count: 1 });
    expect(found[0]?.month).toBe(9);
  });

  it('honours a floor, so a second stage starts after the first one ends', () => {
    const found = calendarIntakes(ProgramLevel.MASTER, at('2026-09-06'), {
      count: 1,
      notBefore: at('2028-04-01'),
    });
    expect(`${found[0]?.year}-${found[0]?.month}`).toBe('2028-9');
  });
});

describe('daysUntil', () => {
  it('counts whole days and stays null for an unknown date', () => {
    expect(daysUntil(at('2026-09-16'), at('2026-09-06'))).toBe(10);
    expect(daysUntil(null, at('2026-09-06'))).toBeNull();
  });
});

describe('addMonths', () => {
  it('rolls over the year end', () => {
    expect(addMonths(at('2026-11-15'), 15).toISOString().slice(0, 7)).toBe('2028-02');
  });
});

describe('sumRange', () => {
  it('adds the lines it knows and ignores the ones it does not', () => {
    expect(
      sumRange([
        { minMnt: 100, maxMnt: 200 },
        { minMnt: null, maxMnt: null },
        { minMnt: 50, maxMnt: 50 },
      ]),
    ).toEqual({ min: 150, max: 250 });
  });

  it('stays null when nothing is known at all', () => {
    expect(sumRange([{ minMnt: null, maxMnt: null }])).toEqual({ min: null, max: null });
  });
});
