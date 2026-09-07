/**
 * Admissions — the intake calendar (gksedu.md §4.1, §4.2).
 *
 * The whole module turns on four dates per intake round. Two of them look
 * alike and must never be swapped:
 *
 *   `applicationDeadline` — the SCHOOL's published last day
 *   `internalDeadline`    — OURS, `AdmissionConfig.internalLeadDays` earlier
 *                           (7 days by default)
 *
 * Every case, reminder and countdown is driven by the internal one, and it is
 * the **only** deadline a client is ever shown: the school's later date lives
 * on the staff types alone, because a person given two deadlines works to the
 * later one. Staff keep it because the gap between them is the buffer they
 * manage.
 */

import type { CaseStage } from './case-contract-payment';
import type { ServiceType } from '../schemas/lead';
import type { IntakeStatus, ProgramLevel, UniversityCard } from './university';

/**
 * Where an intake sits right now, derived from its dates — never stored.
 *
 *   `OPEN`       — we are taking registrations; our own deadline has not passed
 *   `FINAL_CALL` — our deadline passed, the school's has not. A case can still
 *                  be pushed through, but only on a staff decision, and the
 *                  round is no longer offered publicly.
 *   `CLOSED`     — the school's deadline passed, or staff closed/cancelled it
 *
 * There is no "not open yet": `openAt` is when the *school* starts accepting,
 * and GKS registers a client for a published round at any point before its own
 * deadline.
 */
export type IntakePhase = 'OPEN' | 'FINAL_CALL' | 'CLOSED';

export interface IntakeProgramOverride {
  id: string;
  programId: string;
  programNameMn: string;
  openAt: string | null;
  applicationDeadline: string | null;
  internalDeadline: string | null;
  internalDeadlineIsManual: boolean;
  classStartDate: string | null;
  quota: number | null;
  note: string | null;
}

/**
 * One row of the public admissions list — an intake plus its school.
 *
 * There is deliberately no `applicationDeadline`: the school's own date never
 * leaves the staff payloads. A client is given one date to work to,
 * `internalDeadline`.
 */
export interface AdmissionListItem {
  id: string;
  level: ProgramLevel;
  year: number;
  month: number;
  openAt: string | null;
  internalDeadline: string | null;
  classStartDate: string | null;
  quota: number | null;
  admissionFeeKrw: number | null;
  requirementNote: string | null;
  note: string | null;
  phase: IntakePhase;
  daysUntilInternalDeadline: number | null;
  university: UniversityCard;
}

export interface AdmissionFacets {
  total: number;
  levels: { value: ProgramLevel; count: number }[];
  months: { value: number; count: number }[];
  years: { value: number; count: number }[];
  regions: { value: string; label: string; count: number }[];
  /** Rounds whose internal deadline is inside the next 14 days. */
  closingSoon: number;
}

/** `GET /admissions/calendar?year=` — one bucket per intake month. */
export interface AdmissionCalendarMonth {
  year: number;
  month: number;
  /** Intakes whose classes start this month. */
  intakes: AdmissionListItem[];
}

/* ------------------------------------------------------------------------- *
 * Staff-side
 * ------------------------------------------------------------------------- */

/**
 * Admissions business configuration — one row. Like `ServicePricing`, these
 * are current values the office retunes, not constants.
 */
export interface AdmissionConfig {
  internalLeadDays: number;
  clientReminderOffsets: number[];
  staffReminderOffsets: number[];
  riskReadinessThreshold: number;
  /** The intake-calendar search's model — Gemini, because that search is grounded. */
  researchModel: string;
  /**
   * The programme search's model. A `deepseek-` prefix routes the call to
   * DeepSeek: enumerating a school's sixty departments is a big-model job that
   * nothing grounds in practice, so it is not worth Gemini Pro's price.
   */
  programResearchModel: string;
  updatedAt: string;
  updatedBy: { id: string; name: string | null } | null;
}

/** The school columns the board carries — less than a full catalogue card. */
export interface AdmissionBoardUniversity {
  id: string;
  slug: string;
  nameMn: string;
  nameEn: string;
  logoPath: string | null;
  cityMn: string;
}

/** The intake heading one board group. */
export interface AdmissionBoardIntake {
  id: string;
  universityId: string;
  level: ProgramLevel;
  year: number;
  month: number;
  openAt: string | null;
  applicationDeadline: string | null;
  internalDeadline: string | null;
  classStartDate: string | null;
  quota: number | null;
  admissionFeeKrw: number | null;
  requirementNote: string | null;
  note: string | null;
  status: IntakeStatus;
  phase: IntakePhase;
  daysUntilInternalDeadline: number | null;
  university: AdmissionBoardUniversity;
}

/** One case seen from the intake calendar — the answer to "who might miss it". */
export interface AdmissionBoardCase {
  caseId: string;
  code: string;
  stage: CaseStage;
  clientName: string;
  serviceType: ServiceType;
  /** Approved required documents ÷ required documents, 0-100. */
  readiness: number;
  requiredDocuments: number;
  approvedDocuments: number;
  missingDocuments: number;
  daysUntilInternalDeadline: number | null;
  /** Readiness below the configured threshold with the deadline in sight. */
  atRisk: boolean;
  assignedConsultant: { id: string; name: string | null } | null;
  assignedDocOfficer: { id: string; name: string | null } | null;
}

/** One intake with the cases riding on it (`GET /admin/admissions/board`). */
export interface AdmissionBoardGroup {
  intake: AdmissionBoardIntake;
  cases: AdmissionBoardCase[];
  atRiskCount: number;
}

/* ------------------------------------------------------------------------- *
 * Gemini research (LLM-assisted entry)
 *
 * A run proposes candidates. Staff read them, drop them into the form and
 * save. Nothing here ever writes an `IntakeTerm` by itself — that is the whole
 * point of the feature.
 * ------------------------------------------------------------------------- */

export type IntakeResearchStatus = 'QUEUED' | 'RUNNING' | 'SUCCEEDED' | 'FAILED';

/** How far the model would stand behind one candidate. */
export type IntakeCandidateConfidence = 'HIGH' | 'MEDIUM' | 'LOW';

export interface IntakeCandidate {
  level: ProgramLevel;
  year: number;
  /** 3, 6, 9 or 12. */
  month: number;
  /** ISO date (YYYY-MM-DD) or null when the model could not find it. */
  openAt: string | null;
  applicationDeadline: string | null;
  classStartDate: string | null;
  resultAnnouncedAt: string | null;
  quota: number | null;
  admissionFeeKrw: number | null;
  requirementNote: string | null;
  confidence: IntakeCandidateConfidence;
  /** The page the dates were read off. Empty when the model cited nothing. */
  sourceUrl: string | null;
  /** Why the model is unsure, in Mongolian — shown next to the candidate. */
  note: string | null;
}

export interface IntakeResearchRun {
  id: string;
  universityId: string;
  universityNameMn: string;
  universityNameEn: string;
  levels: ProgramLevel[];
  year: number;
  status: IntakeResearchStatus;
  model: string;
  candidates: IntakeCandidate[] | null;
  sources: string[];
  error: string | null;
  startedAt: string | null;
  finishedAt: string | null;
  createdAt: string;
  requestedBy: { id: string; name: string | null } | null;
}
