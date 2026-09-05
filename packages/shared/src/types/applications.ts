import type { ServiceType } from '../schemas/lead';
import type { CaseStage } from './case-contract-payment';
import type { DocumentStatus } from './documents';

/** Application → school invoice → invitation payloads (1E-01 … 1E-12). */

export type ApplicationStatus =
  | 'PREPARING'
  | 'READY'
  | 'SUBMITTED'
  | 'UNDER_REVIEW'
  | 'ADDITIONAL_DOCS_REQUESTED'
  | 'INTERVIEW_SCHEDULED'
  | 'ACCEPTED'
  | 'REJECTED'
  | 'DEFERRED';

export type ApplicationDecision = 'PASSED' | 'FAILED' | 'WAITLISTED' | 'DEFERRED';
export type SchoolInvoiceStatus = 'DRAFT' | 'ISSUED' | 'PAID' | 'CONFIRMED_BY_SCHOOL' | 'CANCELLED';
export type InvoiceItemKind = 'TUITION' | 'DORMITORY' | 'INSURANCE' | 'ADMISSION_FEE' | 'OTHER';

export interface ApplicationResult {
  id: string;
  round: number;
  decision: ApplicationDecision;
  decidedAt: string;
  note: string | null;
}

export interface Application {
  id: string;
  caseId: string;
  status: ApplicationStatus;
  applicationNo: string | null;
  admissionFeeKrw: string | null;
  submittedAt: string | null;
  interviewAt: string | null;
  interviewNote: string | null;
  decidedAt: string | null;
  note: string | null;
  university: { id: string; nameMn: string; nameEn: string; nameKo: string; logoPath: string | null } | null;
  program: { id: string; nameMn: string; level: string } | null;
  intake: { id: string; year: number; month: number } | null;
  results: ApplicationResult[];
  case: {
    id: string;
    code: string;
    serviceType: ServiceType;
    stage: CaseStage;
    userId: string;
    user?: { id: string; name: string | null };
  };
}

/** 1E-03 — what still blocks the application from being submitted. */
export interface ApplicationReadiness {
  isReady: boolean;
  requiredTotal: number;
  missing: { id: string; code: string; nameMn: string; status: DocumentStatus }[];
}

export interface ApplicationView {
  application: Application | null;
  readiness: ApplicationReadiness;
}

export interface SchoolInvoiceItem {
  id: string;
  kind: InvoiceItemKind;
  labelMn: string;
  amountKrw: string;
  sortOrder: number;
}

export interface SchoolInvoice {
  id: string;
  caseId: string;
  status: SchoolInvoiceStatus;
  totalKrw: string;
  fxRate: string;
  amountMnt: string;
  transferFeeMnt: string;
  dueAt: string | null;
  paidAt: string | null;
  receiptPath: string | null;
  receivedBySchoolAt: string | null;
  note: string | null;
  items: SchoolInvoiceItem[];
  createdAt: string;
}

export interface Invitation {
  id: string;
  caseId: string;
  number: string | null;
  issuedAt: string | null;
  receivedAt: string;
  filePath: string | null;
  note: string | null;
}

export interface FxRate {
  rate: number;
  date: string;
  source: string;
}

export interface UniversityApplicationReportRow {
  universityId: string | null;
  university: { id: string; nameMn: string; nameEn: string; nameKo: string } | null;
  status: ApplicationStatus;
  count: number;
}
