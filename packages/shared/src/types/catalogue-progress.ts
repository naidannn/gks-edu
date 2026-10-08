import type { ProgramLevel } from './university';

/**
 * 1A-43 — how far the office has got filling in the 135 schools.
 *
 * One screen answers two questions the list pages cannot: which schools still
 * have no intakes, programmes, colleges, tuition or scholarship data, and who
 * on the team has been doing the filling in.
 */

/** The five things a school needs before a consultant can quote it. */
export type CatalogueCheck = 'intakes' | 'programs' | 'faculties' | 'tuition' | 'scholarship';

export type CatalogueProgressStatus = 'NOT_STARTED' | 'IN_PROGRESS' | 'DONE';

/**
 * Where one school stands on one check — the bucket each tab of the page sorts
 * it into. `NOT_FOUND` is intakes only: the school's pages were read and no
 * round was published. `NO_BASE` means the check has nothing to measure yet
 * (tuition with no programmes, colleges with no bachelor programmes).
 */
export type CatalogueGapState = 'COMPLETE' | 'PARTIAL' | 'MISSING' | 'NOT_FOUND' | 'NO_BASE';

/** One upcoming round, enough to place it on the term filter and the level grid. */
export interface CatalogueIntakeRound {
  level: ProgramLevel;
  year: number;
  month: number;
  internalDeadline: string | null;
  verified: boolean;
  /** Written by the research import rather than typed by staff. */
  aiResearched: boolean;
}

/** A round the research looked for and did not publish, with the office's note why. */
export interface CatalogueResearchPending {
  level: ProgramLevel;
  year: number;
  month: number;
  reason: string;
  checkUrl: string | null;
}

/** What the last read of the school's admissions pages found beyond the rounds. */
export interface CatalogueIntakeResearch {
  researchedAt: string;
  notOffered: ProgramLevel[];
  /** Pending rounds that have not since been entered. */
  pending: CatalogueResearchPending[];
}

/** One level of one school — the matrix cell on the table. */
export interface CatalogueLevelCell {
  level: ProgramLevel;
  /** Whether the completeness score asks for this level at this school. */
  expected: boolean;
  /** The research found the school does not run this level for foreigners. */
  notOffered: boolean;
  programs: number;
  /** Rounds not cancelled whose internal deadline has not passed yet. */
  upcomingIntakes: number;
}

export interface CatalogueProgressRow {
  id: string;
  slug: string;
  nameEn: string;
  nameMn: string;
  nameKo: string;
  logoPath: string | null;
  isPublished: boolean;
  acceptsLanguagePrep: boolean;
  levels: CatalogueLevelCell[];
  faculties: number;
  programs: number;
  programsWithTuition: number;
  /** Priced off a table older than last year's — the quote that turns out wrong. */
  programsStaleTuition: number;
  /** Degree programmes (no language prep) — the scholarship check's base. */
  degreePrograms: number;
  programsWithScholarship: number;
  /** Bachelor programmes — the college check's base; graduate ones rarely have one. */
  bachelorPrograms: number;
  bachelorWithFaculty: number;
  programsVerified: number;
  upcomingIntakes: number;
  upcomingIntakesVerified: number;
  /** Upcoming rounds, oldest term first. */
  rounds: CatalogueIntakeRound[];
  /** Null when nobody has researched this school's intakes. */
  research: CatalogueIntakeResearch | null;
  /** Each check as a share, 0 … 1. */
  checks: Record<CatalogueCheck, number>;
  states: Record<CatalogueCheck, CatalogueGapState>;
  /** Mean of the five checks, 0 … 100. */
  percent: number;
  status: CatalogueProgressStatus;
  /** Last write anyone made to this school's catalogue data. */
  lastActivityAt: string | null;
  /** Who made it — null when only a row timestamp is known (older edits, imports). */
  lastActivityBy: string | null;
}

export interface CatalogueProgressSummary {
  schools: number;
  byStatus: Record<CatalogueProgressStatus, number>;
  /** Schools whose check is fully met. */
  checksComplete: Record<CatalogueCheck, number>;
  /** Schools per bucket, per check. */
  states: Record<CatalogueCheck, Record<CatalogueGapState, number>>;
  /** Every intake term with an upcoming round, oldest first. */
  terms: { year: number; month: number; schools: number; rounds: number }[];
  averagePercent: number;
  /** Per level: how many schools expect it, and how many have it filled. */
  levels: Record<ProgramLevel, { expected: number; withIntake: number; withPrograms: number }>;
  programs: { total: number; withTuition: number; withScholarship: number; verified: number };
  intakes: { upcoming: number; verified: number };
}

/** One staff member's catalogue work over the period. */
export interface CatalogueStaffActivity {
  actorId: string | null;
  name: string;
  email: string | null;
  programsCreated: number;
  programsUpdated: number;
  intakesCreated: number;
  intakesUpdated: number;
  facultiesChanged: number;
  universitiesUpdated: number;
  deleted: number;
  researchRuns: number;
  /** Programmes and intake rounds this person marked as checked against the school. */
  verified: number;
  schoolsTouched: number;
  lastActiveAt: string | null;
}

export interface CatalogueActivityEntry {
  id: string;
  at: string;
  actorName: string;
  /** Dotted audit action, e.g. `program.create`; labelled on the frontend. */
  action: string;
  /** Rows a bulk save wrote; 1 otherwise. */
  count: number;
  university: { id: string; nameMn: string } | null;
}

export interface CatalogueProgress {
  generatedAt: string;
  periodDays: number;
  summary: CatalogueProgressSummary;
  rows: CatalogueProgressRow[];
  staff: CatalogueStaffActivity[];
  recent: CatalogueActivityEntry[];
}
