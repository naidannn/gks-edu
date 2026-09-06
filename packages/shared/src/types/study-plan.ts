/**
 * Суралцах төлөвлөгөө — the study planner (ARCHITECTURE.md §3.4).
 *
 * The question the planner answers is the one every first conversation in the
 * office starts with: *"хэзээ явж болох вэ, хаана, хэдэн төгрөгөөр?"* Four taps
 * in, it answers all three from the same tables the catalogue is built on —
 * `IntakeTerm` for the date, `UniversityProgram` for the schools and the
 * tuition, `ServicePricing` for our fee, `University.livingCost` for the rest.
 *
 * Two rules carry over from the modules underneath and must not be softened
 * here:
 *
 *   1. The only deadline in this payload is **ours** (`registerBy`, from
 *      `IntakeTerm.internalDeadline`). The school's own last day never leaves
 *      the staff endpoints — given two dates a person works to the later one.
 *   2. Every figure that is a regional estimate says so (`isEstimate`), and an
 *      unknown one is `null`, never zero. A family budgets against these.
 */

import type { EducationLevel, ServiceType } from '../schemas/lead';
import type { ProgramListItem } from './programs';
import type { ProgramLevel } from './university';

/** TOPIK 1–6, or 0 for "Солонгос хэл мэдэхгүй". */
export type TopikLevel = 0 | 1 | 2 | 3 | 4 | 5 | 6;

/** What the visitor chose, normalised — the planner echoes it back. */
export interface StudyPlanInput {
  education: EducationLevel;
  goal: ProgramLevel;
  topik: TopikLevel;
  /** Canonical `StudyField` slug, or null for "хараахан шийдээгүй". */
  field: string | null;
  /** `regionEn`, set by the region chips on the result itself. */
  region: string | null;
  /** Annual tuition ceiling in KRW, set by the budget chips on the result. */
  budgetKrw: number | null;
}

/**
 * Where a date came from.
 *
 *   `REAL`      — a published `IntakeTerm`, deadline included
 *   `ESTIMATED` — the Korean academic calendar, because no round is entered yet
 *
 * The distinction is shown, not hidden: an estimated month is planning
 * guidance, a real one is a date somebody can miss.
 */
export type StudyPlanDateSource = 'REAL' | 'ESTIMATED';

/** One intake month a stage could start in. */
export interface StudyPlanIntake {
  year: number;
  month: number;
  /**
   * **Our** registration deadline — `IntakeTerm.internalDeadline`, and the
   * earliest one in the month, because after it schools start dropping out of
   * the list. Never the school's own date.
   */
  registerBy: string | null;
  daysToRegister: number | null;
  classStartDate: string | null;
  /** Published rounds in this month at this level. 0 when the month is estimated. */
  intakeCount: number;
  source: StudyPlanDateSource;
}

/**
 * A step of the journey. One stage for somebody whose Korean already clears
 * the door; two when language prep has to come first, which is the single most
 * useful thing the planner tells anybody.
 */
export interface StudyPlanStage {
  kind: 'LANGUAGE_PREP' | 'DEGREE';
  level: ProgramLevel;
  titleMn: string;
  /** Why this stage is in the path at all, in one sentence. */
  reasonMn: string;
  durationMonths: number | null;
  start: StudyPlanIntake;
}

/** A dated step of the process, for the rail under the headline. */
export interface StudyPlanMilestone {
  key: 'REGISTER' | 'DOCUMENTS' | 'APPLY' | 'INVITATION' | 'VISA' | 'DEPARTURE';
  titleMn: string;
  textMn: string;
  date: string | null;
}

/**
 * One entry requirement, checked against what the visitor told us.
 * `met: null` means we do not know — an unpublished TOPIK requirement is not
 * thereby satisfied, and it is not thereby a wall either.
 */
export interface StudyPlanRequirement {
  key: 'EDUCATION' | 'TOPIK' | 'BUDGET' | 'DOCUMENTS';
  labelMn: string;
  valueMn: string;
  met: boolean | null;
}

export type StudyPlanCostKey = 'SERVICE_FEE' | 'TUITION' | 'ADMISSION_FEE' | 'LIVING';

/**
 * One line of the first-year cost. Korean items carry ₩ and the ₮ they convert
 * to; our own fee is billed in ₮ and has no ₩ side.
 */
export interface StudyPlanCostItem {
  key: StudyPlanCostKey;
  labelMn: string;
  noteMn: string | null;
  minKrw: number | null;
  maxKrw: number | null;
  minMnt: number | null;
  maxMnt: number | null;
  /** A regional average rather than a quoted price — the card says so. */
  isEstimate: boolean;
}

/** What the first year in Korea costs, in the currency the family budgets in. */
export interface StudyPlanCost {
  items: StudyPlanCostItem[];
  totalMinMnt: number | null;
  totalMaxMnt: number | null;
  /** MNT per 1 KRW, and the day that rate is from (`FxRate`). */
  krwToMnt: number;
  fxDate: string;
  /** The degree's own annual tuition, when language prep comes first. */
  nextStage: { titleMn: string; minKrw: number | null; maxKrw: number | null } | null;
}

/**
 * Whether the schools listed are open now or only after the language stage.
 * The list is never silently one or the other — a plan that shows unreachable
 * schools without saying so is worse than no plan.
 */
export type StudyPlanSchoolGate = 'NOW' | 'AFTER_PREP';

export interface StudyPlanSchools {
  gate: StudyPlanSchoolGate;
  /** Matching programmes at the goal level, across every published school. */
  total: number;
  /** The first few in our own recommendation order (`gksRank`). */
  items: ProgramListItem[];
  /** Counts for the region chips on the result — the "хот солих" control. */
  regions: { value: string; label: string; count: number }[];
  /** How many more programmes one more TOPIK level would open. Null at 6. */
  unlockedByNextTopik: { topik: TopikLevel; count: number } | null;
}

/** `GET /study-plan` — the whole answer, in one round trip. */
export interface StudyPlanResult {
  input: StudyPlanInput;
  /** The service line this plan would be sold as. */
  serviceType: ServiceType;
  /** The headline: when this person can actually be in Korea. */
  departure: StudyPlanIntake | null;
  stages: StudyPlanStage[];
  timeline: StudyPlanMilestone[];
  requirements: StudyPlanRequirement[];
  schools: StudyPlanSchools;
  cost: StudyPlanCost;
  /** Prefill for `/consultation`, so the CTA carries the plan into the lead. */
  consultationNote: string;
}

/**
 * What a person may apply to, given the diploma they already hold.
 *
 * Mirrors `GOALS_FOR_EDUCATION` in the API's `study-plan.rules.ts` — the API
 * does not import this package (DTOs and Prisma are its contract), so the two
 * are kept in step by hand, exactly as `IntakePhase` is. The API is the
 * authority: it re-checks the pair and falls back to language prep rather than
 * trusting the query.
 */
export const STUDY_PLAN_GOALS: Record<EducationLevel, readonly ProgramLevel[]> = {
  SECONDARY_SCHOOL: ['LANGUAGE_PREP', 'BACHELOR'],
  VOCATIONAL: ['LANGUAGE_PREP', 'BACHELOR'],
  BACHELOR: ['LANGUAGE_PREP', 'BACHELOR', 'MASTER'],
  MASTER: ['LANGUAGE_PREP', 'MASTER', 'PHD'],
  PHD: ['LANGUAGE_PREP', 'PHD'],
};
