import type {
  ApplicationDecision,
  CaseStage,
  LeadSource,
  PaymentKind,
  PaymentMethod,
  ProgramLevel,
  Role,
  ServiceType,
  VisaType,
} from '../../prisma/client.js';
import type { ReportPreset } from './report-period.js';

/**
 * The shapes `/reports/*` returns.
 *
 * `packages/shared/src/types/reports.ts` mirrors these as string unions for the
 * web app, the way every other module in this repo does — the API never imports
 * the shared package, and the shared package never imports Prisma. Change one,
 * change the other.
 *
 * Two ideas run through every shape, because they are what make the numbers
 * usable rather than merely present:
 *
 * - **Урсгал vs байдал.** A flow figure ("this month's income") belongs to a
 *   period and carries the previous period beside it. A stock figure ("what is
 *   owed to us") belongs to *now* and has no period at all. Mixing the two is
 *   how a dashboard ends up describing no moment in time.
 * - **Орлого vs дамжин өнгөрөх мөнгө.** Tuition a client sends to a Korean
 *   school through us is the school's money; only the brokerage fee and the
 *   transfer fee (§8) are income. They are never added together.
 */

export interface ReportPeriodInfo {
  preset: ReportPreset;
  /** Office-local `YYYY-MM-DD`, inclusive. */
  from: string;
  /** Office-local `YYYY-MM-DD`, **exclusive**. */
  to: string;
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

export interface StageLoad {
  stage: CaseStage;
  count: number;
  medianDaysInStage: number;
  stalledCount: number;
}

export interface ManagementOverview {
  period: ReportPeriodInfo;
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
    top: ReceivableRow[];
  };
  /** Signed contract value with no invoice raised against it yet. */
  committed: { caseCount: number; amountMnt: number };
}

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
  cohortSize: number;
  stallThresholdDays: number;
  funnel: FunnelStep[];
  byService: { serviceType: ServiceType; cohortSize: number; funnel: FunnelStep[] }[];
  current: StageLoad[];
  stalled: StalledCaseRow[];
  attrition: {
    cancelled: number;
    rejected: number;
    onHold: number;
    reasons: { reason: string; count: number }[];
  };
}

export interface UniversityOutcomeRow {
  universityId: string | null;
  nameMn: string;
  nameKo: string | null;
  submitted: number;
  accepted: number;
  rejected: number;
  pending: number;
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
  byService: {
    serviceType: ServiceType;
    submitted: number;
    accepted: number;
    rejected: number;
    successRate: number | null;
  }[];
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

export interface StaffReportRow {
  staffId: string;
  name: string | null;
  email: string | null;
  role: Role;
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
