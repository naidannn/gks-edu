import type { ProgramLevel } from '../../../prisma/client.js';

/**
 * The shapes `GET /admin/universities/progress` returns.
 *
 * `packages/shared/src/types/catalogue-progress.ts` mirrors these for the web
 * app, the way every other module in this repo does — the API never imports
 * the shared package. Change one, change the other.
 */
/** The five things a school needs before a consultant can quote it. */
export type CatalogueCheck = 'intakes' | 'programs' | 'faculties' | 'tuition' | 'scholarship';

export type CatalogueProgressStatus = 'NOT_STARTED' | 'IN_PROGRESS' | 'DONE';

/** One level of one school — the matrix cell on the table. */
export interface CatalogueLevelCell {
  level: ProgramLevel;
  /** Whether the completeness score asks for this level at this school. */
  expected: boolean;
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
  /** Degree programmes (no language prep) — the scholarship check's base. */
  degreePrograms: number;
  programsWithScholarship: number;
  /** Bachelor programmes — the college check's base; graduate ones rarely have one. */
  bachelorPrograms: number;
  bachelorWithFaculty: number;
  programsVerified: number;
  upcomingIntakes: number;
  upcomingIntakesVerified: number;
  /** Each check as a share, 0 … 1. */
  checks: Record<CatalogueCheck, number>;
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
