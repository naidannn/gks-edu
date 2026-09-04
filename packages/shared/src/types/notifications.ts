import type { ServiceType } from '../schemas/lead';
import type { UserRole } from '../schemas/user';
import type { LeadSource, LeadStage } from './lead-crm';
import type { CaseStage, PaymentKind, PaymentStatus } from './case-contract-payment';

/**
 * Notification and reporting payloads — 1G-05, 1G-08…1G-11.
 *
 * The enums mirror the Prisma ones; keeping them as string unions here means
 * the web app never imports the generated Prisma client.
 */

export type NotificationEvent =
  | 'DOCUMENT_DEADLINE_NEAR'
  | 'DOCUMENT_MISSING'
  | 'DOCUMENT_REJECTED'
  | 'DOCUMENT_FIX_REQUIRED'
  | 'CONTRACT_CONFIRMED'
  | 'PAYMENT_DUE'
  | 'PAYMENT_CONFIRMED'
  | 'APPLICATION_RESULT'
  | 'APPLICATION_EXTRA_DOCS'
  | 'INVITATION_RECEIVED'
  | 'VISA_STAGE_STARTED'
  | 'VISA_APPOINTMENT_DUE'
  | 'VISA_RESULT'
  | 'VISA_RENEWAL_NEAR'
  | 'DEPARTURE_NEAR'
  | 'FLIGHT_INFO_UPDATED'
  | 'LEAD_CREATED'
  | 'LEAD_FOLLOW_UP_DUE';

export type NotificationChannel = 'IN_APP' | 'EMAIL' | 'SMS' | 'PUSH';
export type NotificationStatus = 'PENDING' | 'SENT' | 'FAILED' | 'SKIPPED';

export interface NotificationItem {
  id: string;
  event: NotificationEvent;
  channel: NotificationChannel;
  title: string;
  body: string;
  link: string | null;
  caseId: string | null;
  leadId: string | null;
  status: NotificationStatus;
  readAt: string | null;
  createdAt: string;
}

export interface NotificationListResponse {
  items: NotificationItem[];
  meta: { page: number; limit: number; total: number; totalPages: number };
  unread: number;
}

export interface NotificationPreference {
  channel: NotificationChannel;
  enabled: boolean;
}

export interface NotificationTemplateItem {
  id: string;
  event: NotificationEvent;
  channel: NotificationChannel;
  titleMn: string;
  bodyMn: string;
  linkMn: string | null;
  isActive: boolean;
  updatedAt: string;
}

export interface SmsUsage {
  date: string;
  sent: number;
  failed: number;
  dailyLimit: number;
  perUserLimit: number;
}

// ── Reports (1G-08…1G-11) ───────────────────────────────────────────────────

export interface FunnelBySource {
  source: LeadSource;
  total: number;
  won: number;
  lost: number;
  unassigned: number;
  conversionRate: number;
}

export interface SalesFunnelReport {
  total: number;
  won: number;
  conversionRate: number;
  byStage: { stage: LeadStage; count: number }[];
  bySource: FunnelBySource[];
  byMonth: { month: string; total: number; won: number }[];
}

export interface FinanceReport {
  totals: {
    revenue: number;
    prepayment: number;
    balance: number;
    receivable: number;
    overdue: number;
    refunded: number;
    netRevenue: number;
  };
  byService: { serviceType: ServiceType; revenue: number; receivable: number; refunded: number; count: number }[];
  byMonth: { month: string; revenue: number; receivable: number }[];
}

export interface StaffPerformanceRow {
  staffId: string;
  name: string | null;
  email: string | null;
  role: UserRole;
  leadsAssigned: number;
  leadsWon: number;
  leadsLost: number;
  conversionRate: number;
  casesAsConsultant: number;
  casesAsDocOfficer: number;
  openTasks: number;
  overdueTasks: number;
  completedTasks: number;
  reviewNotes: number;
  revenueMnt: number;
}

export interface DocumentProgressRow {
  caseId: string;
  caseCode: string;
  serviceType: ServiceType;
  caseStage: CaseStage;
  userId: string;
  docOfficerId: string | null;
  requiredTotal: number;
  requiredDone: number;
  percent: number;
  overdueCount: number;
  nextDueAt: string | null;
}

/** The 21 figures of gksedu.md §19 (1G-09). */
export interface ManagementDashboard {
  totalLeads: number;
  newLeadsThisMonth: number;
  contractedClients: number;
  conversionRate: number;
  salesByService: { serviceType: ServiceType; revenue: number }[];
  applicationsByUniversity: number;
  totalRevenue: number;
  prepaymentTotal: number;
  balanceTotal: number;
  receivable: number;
  overdueReceivable: number;
  refunded: number;
  collectingDocuments: number;
  overdueDocuments: number;
  submittedToUniversity: number;
  admitted: number;
  rejected: number;
  invited: number;
  visaApproved: number;
  departed: number;
  staffPerformance: StaffPerformanceRow[];
  leadsBySource: FunnelBySource[];
}

/** Unused-but-declared re-exports keep the payment enums reachable from one place. */
export type { PaymentKind, PaymentStatus };
