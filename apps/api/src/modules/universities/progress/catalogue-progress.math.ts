import type {
  CatalogueCheck,
  CatalogueLevelCell,
  CatalogueProgressRow,
  CatalogueProgressStatus,
  CatalogueProgressSummary,
} from './catalogue-progress.types.js';
import type { ProgramLevel } from '../../../prisma/client.js';

/**
 * 1A-43 — what "this school's data is filled in" means, as numbers.
 *
 * Kept free of queries so the rule the office reads its progress by is one
 * tested function, not a query that drifts every time somebody adds a filter.
 */

export const PROGRAM_LEVELS: readonly ProgramLevel[] = ['LANGUAGE_PREP', 'BACHELOR', 'MASTER', 'PHD'];

export const CATALOGUE_CHECKS: readonly CatalogueCheck[] = [
  'intakes',
  'programs',
  'faculties',
  'tuition',
  'scholarship',
];

/**
 * The levels a school is expected to have intakes and programmes for.
 *
 * Bachelor and master are the office's core brokerage at every school. Language
 * prep only where the school runs it (`acceptsLanguagePrep`, from the office's
 * own sheet). PhD is counted and shown but never demanded — a handful of
 * clients a year, and asking for it would keep all 135 schools below 100%.
 */
export function expectedLevels(school: { acceptsLanguagePrep: boolean }): ProgramLevel[] {
  return school.acceptsLanguagePrep ? ['LANGUAGE_PREP', 'BACHELOR', 'MASTER'] : ['BACHELOR', 'MASTER'];
}

/** Programme counts per school and level, straight off one GROUP BY. */
export interface ProgramAggregate {
  level: ProgramLevel;
  total: number;
  withTuition: number;
  withScholarship: number;
  withFaculty: number;
  verified: number;
}

export interface IntakeAggregate {
  level: ProgramLevel;
  /** Every round on file, past ones included — "has anything been entered". */
  total: number;
  upcoming: number;
  upcomingVerified: number;
}

export interface SchoolInput {
  id: string;
  slug: string;
  nameEn: string;
  nameMn: string;
  nameKo: string;
  logoPath: string | null;
  isPublished: boolean;
  acceptsLanguagePrep: boolean;
  faculties: number;
  programs: ProgramAggregate[];
  intakes: IntakeAggregate[];
  lastActivityAt: Date | null;
  lastActivityBy: string | null;
}

const ratio = (part: number, whole: number) => (whole > 0 ? Math.min(1, part / whole) : 0);
const sum = <T>(rows: T[], pick: (row: T) => number) => rows.reduce((total, row) => total + pick(row), 0);

export function scoreSchool(school: SchoolInput): CatalogueProgressRow {
  const expected = expectedLevels(school);

  const levels: CatalogueLevelCell[] = PROGRAM_LEVELS.map((level) => ({
    level,
    expected: expected.includes(level),
    programs: school.programs.find((row) => row.level === level)?.total ?? 0,
    upcomingIntakes: school.intakes.find((row) => row.level === level)?.upcoming ?? 0,
  }));
  const expectedCells = levels.filter((cell) => cell.expected);

  const programs = sum(school.programs, (row) => row.total);
  const programsWithTuition = sum(school.programs, (row) => row.withTuition);
  // Language prep is a flat course fee; a school almost never discounts it, so
  // asking for a scholarship figure there would be asking for a number that
  // does not exist.
  const degree = school.programs.filter((row) => row.level !== 'LANGUAGE_PREP');
  const degreePrograms = sum(degree, (row) => row.total);
  const programsWithScholarship = sum(degree, (row) => row.withScholarship);
  // Graduate departments usually sit under 대학원, not a college, so only the
  // bachelor rows are held to having one (CLAUDE.md, the catalogue rule).
  const bachelor = school.programs.find((row) => row.level === 'BACHELOR');
  const bachelorPrograms = bachelor?.total ?? 0;
  const bachelorWithFaculty = bachelor?.withFaculty ?? 0;

  const checks: Record<CatalogueCheck, number> = {
    intakes: ratio(expectedCells.filter((cell) => cell.upcomingIntakes > 0).length, expectedCells.length),
    programs: ratio(expectedCells.filter((cell) => cell.programs > 0).length, expectedCells.length),
    faculties: ratio(bachelorWithFaculty, bachelorPrograms),
    tuition: ratio(programsWithTuition, programs),
    scholarship: ratio(programsWithScholarship, degreePrograms),
  };

  const mean = sum([...CATALOGUE_CHECKS], (check) => checks[check]) / CATALOGUE_CHECKS.length;
  const percent = Math.round(mean * 100);
  const anythingEntered = programs > 0 || school.faculties > 0 || sum(school.intakes, (row) => row.total) > 0;
  const status: CatalogueProgressStatus =
    CATALOGUE_CHECKS.every((check) => checks[check] === 1) ? 'DONE' : anythingEntered ? 'IN_PROGRESS' : 'NOT_STARTED';

  return {
    id: school.id,
    slug: school.slug,
    nameEn: school.nameEn,
    nameMn: school.nameMn,
    nameKo: school.nameKo,
    logoPath: school.logoPath,
    isPublished: school.isPublished,
    acceptsLanguagePrep: school.acceptsLanguagePrep,
    levels,
    faculties: school.faculties,
    programs,
    programsWithTuition,
    degreePrograms,
    programsWithScholarship,
    bachelorPrograms,
    bachelorWithFaculty,
    programsVerified: sum(school.programs, (row) => row.verified),
    upcomingIntakes: sum(school.intakes, (row) => row.upcoming),
    upcomingIntakesVerified: sum(school.intakes, (row) => row.upcomingVerified),
    checks,
    percent,
    status,
    lastActivityAt: school.lastActivityAt?.toISOString() ?? null,
    lastActivityBy: school.lastActivityBy,
  };
}

export function summarise(rows: CatalogueProgressRow[]): CatalogueProgressSummary {
  const byStatus: Record<CatalogueProgressStatus, number> = { NOT_STARTED: 0, IN_PROGRESS: 0, DONE: 0 };
  for (const row of rows) byStatus[row.status] += 1;

  const checksComplete = Object.fromEntries(
    CATALOGUE_CHECKS.map((check) => [check, rows.filter((row) => row.checks[check] === 1).length]),
  ) as Record<CatalogueCheck, number>;

  const levels = Object.fromEntries(
    PROGRAM_LEVELS.map((level) => {
      const cells = rows.map((row) => row.levels.find((cell) => cell.level === level)!);
      return [
        level,
        {
          expected: cells.filter((cell) => cell.expected).length,
          withIntake: cells.filter((cell) => cell.upcomingIntakes > 0).length,
          withPrograms: cells.filter((cell) => cell.programs > 0).length,
        },
      ];
    }),
  ) as CatalogueProgressSummary['levels'];

  return {
    schools: rows.length,
    byStatus,
    checksComplete,
    averagePercent: rows.length ? Math.round(sum(rows, (row) => row.percent) / rows.length) : 0,
    levels,
    programs: {
      total: sum(rows, (row) => row.programs),
      withTuition: sum(rows, (row) => row.programsWithTuition),
      withScholarship: sum(rows, (row) => row.programsWithScholarship),
      verified: sum(rows, (row) => row.programsVerified),
    },
    intakes: {
      upcoming: sum(rows, (row) => row.upcomingIntakes),
      verified: sum(rows, (row) => row.upcomingIntakesVerified),
    },
  };
}
