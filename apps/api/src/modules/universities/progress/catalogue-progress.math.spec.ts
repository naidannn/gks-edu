import { describe, expect, it } from 'vitest';
import {
  expectedLevels,
  scoreSchool,
  summarise,
  type IntakeAggregate,
  type ProgramAggregate,
  type SchoolInput,
} from './catalogue-progress.math.js';

function school(overrides: Partial<SchoolInput> = {}): SchoolInput {
  return {
    id: 'a',
    slug: 'a',
    nameEn: 'Test',
    nameMn: 'Тест',
    nameKo: '테스트',
    logoPath: null,
    isPublished: true,
    acceptsLanguagePrep: false,
    faculties: 0,
    programs: [],
    intakes: [],
    lastActivityAt: null,
    lastActivityBy: null,
    ...overrides,
  };
}

const programs = (level: ProgramAggregate['level'], total: number, filled = total): ProgramAggregate => ({
  level,
  total,
  withTuition: filled,
  withScholarship: filled,
  withFaculty: filled,
  verified: 0,
});

const intake = (level: IntakeAggregate['level'], upcoming = 1): IntakeAggregate => ({
  level,
  total: Math.max(upcoming, 1),
  upcoming,
  upcomingVerified: 0,
});

describe('expectedLevels', () => {
  it('asks for language prep only where the school runs it, and never for PhD', () => {
    expect(expectedLevels({ acceptsLanguagePrep: false })).toEqual(['BACHELOR', 'MASTER']);
    expect(expectedLevels({ acceptsLanguagePrep: true })).toEqual(['LANGUAGE_PREP', 'BACHELOR', 'MASTER']);
  });

  it('asks for language prep where one is already on file, even if the flag is off', () => {
    expect(
      expectedLevels({ acceptsLanguagePrep: false, intakes: [intake('LANGUAGE_PREP', 0)] }),
    ).toEqual(['LANGUAGE_PREP', 'BACHELOR', 'MASTER']);
  });
});

describe('scoreSchool', () => {
  it('is NOT_STARTED at 0% when nothing has been entered', () => {
    const row = scoreSchool(school());
    expect(row.status).toBe('NOT_STARTED');
    expect(row.percent).toBe(0);
  });

  it('is DONE only when every check is fully met', () => {
    const row = scoreSchool(
      school({
        faculties: 3,
        programs: [programs('BACHELOR', 4), programs('MASTER', 2, 2)],
        intakes: [intake('BACHELOR'), intake('MASTER')],
      }),
    );
    expect(row.checks).toEqual({ intakes: 1, programs: 1, faculties: 1, tuition: 1, scholarship: 1 });
    expect(row.status).toBe('DONE');
    expect(row.percent).toBe(100);
  });

  it('counts a past round as entered but not as an intake for the next cycle', () => {
    const row = scoreSchool(school({ intakes: [intake('BACHELOR', 0)] }));
    expect(row.status).toBe('IN_PROGRESS');
    expect(row.checks.intakes).toBe(0);
  });

  it('does not hold language-prep programmes to a scholarship figure', () => {
    const row = scoreSchool(
      school({
        acceptsLanguagePrep: true,
        programs: [
          { ...programs('LANGUAGE_PREP', 1), withScholarship: 0 },
          programs('BACHELOR', 2),
          programs('MASTER', 1),
        ],
      }),
    );
    expect(row.degreePrograms).toBe(3);
    expect(row.checks.scholarship).toBe(1);
  });

  it('holds only bachelor programmes to having a college', () => {
    const row = scoreSchool(
      school({ programs: [programs('BACHELOR', 2), { ...programs('MASTER', 4), withFaculty: 0 }] }),
    );
    expect(row.checks.faculties).toBe(1);
  });

  it('scores a half-filled school proportionally', () => {
    const row = scoreSchool(
      school({
        programs: [programs('BACHELOR', 4, 2)],
        intakes: [intake('BACHELOR')],
      }),
    );
    // intakes ½, programmes ½, colleges ½; tuition and scholarship ½ at
    // bachelor, 0 at master (no programmes) → ¼ each
    expect(row.checks.tuition).toBe(0.25);
    expect(row.percent).toBe(40);
    expect(row.status).toBe('IN_PROGRESS');
  });

  it('does not call tuition complete when only a language-prep course is priced', () => {
    const row = scoreSchool(
      school({ acceptsLanguagePrep: true, programs: [programs('LANGUAGE_PREP', 1)] }),
    );
    expect(row.checks.tuition).toBeCloseTo(1 / 3);
    expect(row.checks.scholarship).toBe(0);
  });

  it('keeps a school with language-prep intakes but no flag within 100% per level', () => {
    const rows = [scoreSchool(school({ intakes: [intake('LANGUAGE_PREP')] }))];
    expect(summarise(rows).levels.LANGUAGE_PREP).toEqual({ expected: 1, withIntake: 1, withPrograms: 0 });
  });
});

describe('summarise', () => {
  it('counts statuses, complete checks and per-level coverage', () => {
    const rows = [
      scoreSchool(school({ id: 'a' })),
      scoreSchool(
        school({
          id: 'b',
          acceptsLanguagePrep: true,
          programs: [programs('LANGUAGE_PREP', 1), programs('BACHELOR', 1), programs('MASTER', 1)],
          intakes: [intake('LANGUAGE_PREP'), intake('BACHELOR'), intake('MASTER')],
        }),
      ),
    ];
    const summary = summarise(rows);
    expect(summary.byStatus).toEqual({ NOT_STARTED: 1, IN_PROGRESS: 0, DONE: 1 });
    expect(summary.checksComplete.intakes).toBe(1);
    expect(summary.levels.LANGUAGE_PREP).toEqual({ expected: 1, withIntake: 1, withPrograms: 1 });
    expect(summary.levels.BACHELOR).toEqual({ expected: 2, withIntake: 1, withPrograms: 1 });
    expect(summary.averagePercent).toBe(50);
  });
});
