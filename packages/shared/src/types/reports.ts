import type { ServiceType } from '../schemas/lead';
import type { UserRole } from '../schemas/user';
import type { ApplicationDecision } from './applications';
import type { CaseStage, PaymentKind, PaymentMethod } from './case-contract-payment';
import type { LeadSource } from './lead-crm';
import type { ProgramLevel } from './university';
import type { VisaType } from './visa-departure';

/**
 * Reporting (gksedu.md §19, ARCHITECTURE.md §13).
 *
 * Two ideas run through every shape here, because they are what make the
 * numbers usable rather than merely present:
 *
 * - **Урсгал vs байдал.** A flow figure ("this month's revenue") belongs to a
 *   period and carries the previous period beside it. A stock figure ("what is
 *   owed to us") belongs to *now* and has no period at all. Mixing the two is
 *   how a dashboard ends up saying things that are true of no moment in time.
 * - **Орлого vs дамжин өнгөрөх мөнгө.** Tuition a client pays through us is the
 *   Korean school's money, not ours; only the brokerage fee and the transfer
 *   fee (§8) are income. They are never added together.
 */

export type ReportPreset = 'month' | 'last-month' | 'quarter' | 'year' | 'last-12-months' | 'custom';

export interface ReportPeriodInfo {
  preset: ReportPreset;
  /** Office-local `YYYY-MM-DD`, inclusive. */
  from: string;
  /** Office-local `YYYY-MM-DD`, **exclusive**. */
  to: string;
  /** The equal-shape window ending where `from` begins. */
  previousFrom: string;
  previousTo: string;
  labelMn: string;
  /** When these figures were computed — every report screen stamps it. */
  generatedAt: string;
}

/** A flow figure and the same figure one period earlier. */
export interface ReportMetric {
  value: number;
  previous: number;
  /** `null` when the previous window was zero — no "∞%" on a manager's screen. */
  changePercent: number | null;
}

// ── Overview ────────────────────────────────────────────────────────────────

export interface StageLoad {
  stage: CaseStage;
  count: number;
  /** Days the median case in this stage has already been sitting in it. */
  medianDaysInStage: number;
  /** How many have been in it longer than the stall threshold. */
  stalledCount: number;
}

export interface ManagementOverview {
  period: ReportPeriodInfo;
  /** What happened during the period. */
  flow: {
    newLeads: ReportMetric;
    newClients: ReportMetric;
    signedContracts: ReportMetric;
    contractValueMnt: ReportMetric;
    netIncomeMnt: ReportMetric;
    refundedMnt: ReportMetric;
    applicationsSubmitted: ReportMetric;
    admitted: ReportMetric;
    visaApproved: ReportMetric;
    departed: ReportMetric;
  };
  /** Where the business stands right now. Never period-bound. */
  stock: {
    activeCases: number;
    openLeads: number;
    unassignedLeads: number;
    receivableMnt: number;
    overdueReceivableMnt: number;
    uninvoicedContractMnt: number;
    casesCollectingDocuments: number;
    overdueDocuments: number;
    deadlineRiskCases: number;
    casesByStage: StageLoad[];
  };
  leadsBySource: { source: LeadSource; leads: number; won: number; conversionRate: number }[];
  incomeByService: { serviceType: ServiceType; netMnt: number; previousMnt: number; changePercent: number | null }[];
  incomeByMonth: { month: string; netMnt: number; refundMnt: number; passThroughMnt: number }[];
}

// ── Finance ─────────────────────────────────────────────────────────────────

export type ReceivableBucket = 'UPCOMING' | 'OVERDUE_1_7' | 'OVERDUE_8_30' | 'OVERDUE_31_60' | 'OVERDUE_60_PLUS';

export interface ReceivableRow {
  paymentId: string;
  caseId: string;
  caseCode: string;
  clientName: string | null;
  consultantName: string | null;
  serviceType: ServiceType;
  kind: PaymentKind;
  amountMnt: number;
  dueAt: string | null;
  /** 0 while it is merely upcoming. */
  daysOverdue: number;
}

export interface FinanceReport {
  period: ReportPeriodInfo;
  /** GKS's own income, collected inside the period. */
  income: {
    prepaymentMnt: number;
    balanceMnt: number;
    extraServiceMnt: number;
    /** Шилжүүлгийн шимтгэл (§8) — ours, and it comes off the school invoice. */
    transferFeeMnt: number;
    grossMnt: number;
    refundMnt: number;
    netMnt: number;
    previousNetMnt: number;
    changePercent: number | null;
  };
  /** The school's money that merely passed through our account. */
  passThrough: {
    invoiceCount: number;
    collectedMnt: number;
    /** Collected from the client but not yet confirmed received by the school. */
    awaitingSchoolMnt: number;
  };
  byMonth: {
    month: string;
    prepaymentMnt: number;
    balanceMnt: number;
    otherMnt: number;
    refundMnt: number;
    netMnt: number;
    passThroughMnt: number;
  }[];
  byService: {
    serviceType: ServiceType;
    netMnt: number;
    previousMnt: number;
    changePercent: number | null;
    paymentCount: number;
    caseCount: number;
  }[];
  byMethod: { method: PaymentMethod; amountMnt: number; count: number }[];
  /** Stock, as of `generatedAt` — receivables are never a night old. */
  receivables: {
    totalMnt: number;
    overdueMnt: number;
    aging: { bucket: ReceivableBucket; count: number; amountMnt: number }[];
    /** The largest and latest, for the person who has to chase them. */
    top: ReceivableRow[];
  };
  /** Signed contract value with no invoice raised against it yet. */
  committed: { caseCount: number; amountMnt: number };
}

// ── Pipeline ────────────────────────────────────────────────────────────────

export type PipelineMilestone =
  | 'CASE_OPENED'
  | 'CONTRACT_SIGNED'
  | 'PREPAYMENT_PAID'
  | 'DOCUMENTS'
  | 'APPLICATION_SUBMITTED'
  | 'ADMITTED'
  | 'INVITATION_RECEIVED'
  | 'VISA_APPROVED'
  | 'DEPARTED';

export interface FunnelStep {
  milestone: PipelineMilestone;
  reached: number;
  /** Share of the cohort that got this far. */
  reachedPercent: number;
  /** Share of the *previous* milestone that got here — where the leak is. */
  stepPercent: number;
  /** Median days from case opening to this milestone. */
  medianDays: number | null;
}

export interface StalledCaseRow {
  caseId: string;
  caseCode: string;
  clientName: string | null;
  consultantName: string | null;
  serviceType: ServiceType;
  stage: CaseStage;
  daysInStage: number;
  lastMovedAt: string | null;
}

export interface PipelineReport {
  period: ReportPeriodInfo;
  /** Cases opened inside the period — the cohort the funnel follows. */
  cohortSize: number;
  /** Days in one stage past which a case counts as stalled (admin-visible). */
  stallThresholdDays: number;
  funnel: FunnelStep[];
  byService: { serviceType: ServiceType; cohortSize: number; funnel: FunnelStep[] }[];
  /** Stock: the live pipeline, stage by stage. */
  current: StageLoad[];
  stalled: StalledCaseRow[];
  attrition: {
    cancelled: number;
    rejected: number;
    onHold: number;
    /** Хаясан шалтгаан — from the transition reason staff typed. */
    reasons: { reason: string; count: number }[];
  };
}

// ── Outcomes ────────────────────────────────────────────────────────────────

export interface UniversityOutcomeRow {
  universityId: string | null;
  nameMn: string;
  nameKo: string | null;
  submitted: number;
  accepted: number;
  rejected: number;
  pending: number;
  /** accepted / (accepted + rejected); `null` until something is decided. */
  successRate: number | null;
}

export interface VisaRejectionRow {
  caseId: string;
  caseCode: string;
  clientName: string | null;
  visaType: VisaType;
  decidedAt: string | null;
  reason: string | null;
}

export interface OutcomesReport {
  period: ReportPeriodInfo;
  applications: {
    submitted: number;
    accepted: number;
    rejected: number;
    pending: number;
    deferred: number;
    successRate: number | null;
    previousSuccessRate: number | null;
  };
  byUniversity: UniversityOutcomeRow[];
  byService: { serviceType: ServiceType; submitted: number; accepted: number; rejected: number; successRate: number | null }[];
  /** GKS decides in two rounds (§7); everything else only ever has round 1. */
  gksRounds: { round: number; counts: { decision: ApplicationDecision; count: number }[] }[];
  visa: {
    approved: number;
    rejected: number;
    pending: number;
    approvalRate: number | null;
    previousApprovalRate: number | null;
    byType: { visaType: VisaType; approved: number; rejected: number; pending: number }[];
    rejections: VisaRejectionRow[];
  };
}

// ── Intake deadline risk ────────────────────────────────────────────────────

export interface IntakeRiskCaseRow {
  caseId: string;
  caseCode: string;
  clientName: string | null;
  consultantName: string | null;
  docOfficerName: string | null;
  serviceType: ServiceType;
  stage: CaseStage;
  universityNameMn: string | null;
  /** Ours, never the school's — the only deadline anything runs on. */
  internalDeadline: string | null;
  daysLeft: number | null;
  requiredDocsTotal: number;
  requiredDocsDone: number;
  overdueDocs: number;
}

export interface IntakeRiskTermRow {
  intakeId: string;
  universityId: string;
  universityNameMn: string;
  level: ProgramLevel;
  year: number;
  month: number;
  internalDeadline: string | null;
  daysLeft: number | null;
  caseCount: number;
  submittedCount: number;
  documentsReadyCount: number;
  atRiskCount: number;
}

/** A "now" report: deadlines do not belong to a reporting period. */
export interface IntakeRiskReport {
  generatedAt: string;
  horizonDays: number;
  terms: IntakeRiskTermRow[];
  cases: IntakeRiskCaseRow[];
  /** Cases with no intake chosen — nobody can say when they are late. */
  casesWithoutIntake: number;
}

// ── Staff ───────────────────────────────────────────────────────────────────

export interface StaffReportRow {
  staffId: string;
  name: string | null;
  email: string | null;
  role: UserRole;
  // Flow, inside the period.
  leadsAssigned: number;
  leadsWon: number;
  leadsLost: number;
  conversionRate: number | null;
  contractsSigned: number;
  contractValueMnt: number;
  collectedMnt: number;
  casesAdvanced: number;
  tasksCompleted: number;
  documentsReviewed: number;
  // Stock, right now.
  activeCases: number;
  openTasks: number;
  overdueTasks: number;
}

export interface StaffReport {
  period: ReportPeriodInfo;
  rows: StaffReportRow[];
}

/** What `GET /reports/export` will render. */
export const REPORT_EXPORTS = ['receivables', 'income', 'outcomes', 'staff', 'intake-risk', 'stalled-cases'] as const;
export type ReportExport = (typeof REPORT_EXPORTS)[number];
