import type { ServiceType } from '../schemas/lead';
import type { BalanceTrigger, CaseStage } from './case-contract-payment';
import type { DocumentChecklist } from './documents';

/** Visa and pre-departure payloads (1F-01 … 1F-10). */

export type VisaStatus =
  | 'COLLECTING'
  | 'REVIEWING'
  | 'READY'
  | 'SUBMITTED'
  | 'ADDITIONAL_DOCS_REQUESTED'
  | 'APPROVED'
  | 'REJECTED'
  | 'REAPPLY';

export type VisaType = 'D2' | 'D4' | 'OTHER';

export interface VisaCase {
  id: string;
  caseId: string;
  status: VisaStatus;
  visaType: VisaType;
  appointmentAt: string | null;
  submittedAt: string | null;
  decidedAt: string | null;
  visaNumber: string | null;
  expiresAt: string | null;
  rejectionReason: string | null;
  note: string | null;
  case: {
    id: string;
    code: string;
    serviceType: ServiceType;
    stage: CaseStage;
    userId: string;
    user: { id: string; name: string | null; phone: string | null };
    university: { id: string; nameMn: string } | null;
  };
}

export interface VisaView {
  visaCase: VisaCase | null;
  checklist: DocumentChecklist | null;
}

/** What `POST /cases/:id/visa/decision` answers with (1F-05). */
export interface VisaDecisionResult {
  visaCase: VisaCase;
  balance: { amountMnt: number; isDueNow: boolean; trigger: BalanceTrigger } | null;
  refundPolicy: unknown | null;
}

export interface DepartureChecklistItem {
  id: string;
  planId: string;
  templateCode: string | null;
  titleMn: string;
  descriptionMn: string | null;
  guideUrl: string | null;
  videoUrl: string | null;
  dueAt: string | null;
  isDone: boolean;
  doneAt: string | null;
  sortOrder: number;
}

export interface DeparturePlan {
  id: string;
  caseId: string;
  departureAt: string | null;
  flightNo: string | null;
  arrivalAt: string | null;
  pickupRequested: boolean;
  dormitoryInfo: string | null;
  emergencyNote: string | null;
  note: string | null;
  items: DepartureChecklistItem[];
  case: { id: string; code: string; userId: string; university: { id: string; nameMn: string; cityMn: string } | null };
  progress: { total: number; done: number; percent: number };
}
