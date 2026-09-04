import type { ServiceType } from '../schemas/lead';
import type { ApplicationStatus } from './applications';
import type {
  CaseStage,
  CaseTransitionItem,
  ContractDetail,
  PaymentItem,
  PersonRef,
} from './case-contract-payment';
import type { ClientDetail, UniversityRef } from './client';
import type { StageProgress } from './documents';
import type { NextAction } from './portal';
import type { VisaStatus } from './visa-departure';

/**
 * CRM client workspace payloads (`/clients/:id/workspace`, `/clients/:id/activity`) — 1G-17.
 *
 * The staff answer to "энэ хүнд юу болж байна вэ?". It reuses the portal's own
 * `NextAction` and the `CaseFlowDefinition` journey, so the office and the
 * client read the same sentence about the same case.
 */

export type ClientWorkspaceTab = 'overview' | 'process' | 'documents' | 'payments' | 'activity';

export type AlertLevel = 'danger' | 'warning' | 'info';

export interface ClientAlert {
  key: string;
  level: AlertLevel;
  label: string;
  /** ISO date for a deadline, an amount for a payment, or null. */
  detail: string | null;
  tab: ClientWorkspaceTab;
  caseId: string | null;
}

export type ActivityKind = 'LEAD' | 'STAGE' | 'DOCUMENT' | 'PAYMENT' | 'TASK' | 'APPLICATION' | 'VISA';

export interface ClientActivityEntry {
  id: string;
  kind: ActivityKind;
  at: string;
  title: string;
  body: string | null;
  actor: { id: string; name: string | null } | null;
  caseId: string | null;
}

/** One of the client's service cycles, decorated for the workspace. */
export interface WorkspaceCase {
  id: string;
  code: string;
  userId: string;
  serviceType: ServiceType;
  stage: CaseStage;
  createdAt: string;
  updatedAt: string;
  university: UniversityRef | null;
  intake: { id: string; year: number; month: number } | null;
  contract: ContractDetail | null;
  payments: PaymentItem[];
  assignedConsultant: PersonRef | null;
  assignedDocOfficer: PersonRef | null;
  application: { id: string; status: ApplicationStatus; submittedAt: string | null; interviewAt: string | null } | null;
  invitation: { id: string; issuedAt: string | null; receivedAt: string | null } | null;
  visaCase: {
    id: string;
    status: VisaStatus;
    appointmentAt: string | null;
    visaNumber: string | null;
    decidedAt: string | null;
  } | null;
  departurePlan: { id: string; departureAt: string | null } | null;
  transitions: CaseTransitionItem[];
  /** Stage sequence for this service, read from `CaseFlowDefinition` (§5). */
  journey: CaseStage[];
  /** Position of `stage` on `journey`, 0–100. */
  progressPercent: number;
  documents: { admission: StageProgress; visa: StageProgress };
  nextAction: NextAction;
}

export interface ClientWorkspace {
  client: ClientDetail;
  cases: WorkspaceCase[];
  activeCaseId: string | null;
  alerts: ClientAlert[];
}

/** Row-level operational state on the client list (1G-17). */
export interface ClientAttention {
  missingDocuments: number;
  pendingPayments: number;
  overdueTasks: number;
  nextDeadline: string | null;
  overdue: boolean;
}

export const CLIENT_ATTENTION_FILTERS = ['MISSING_DOCS', 'PENDING_PAYMENT', 'OVERDUE_TASK', 'DEADLINE_SOON'] as const;
export type ClientAttentionFilter = (typeof CLIENT_ATTENTION_FILTERS)[number];
