import type { ServiceType } from '../schemas/lead';

/** Case/contract/payment payloads (1C-02 … 1C-16). */

export type CaseStage =
  | 'CONTRACT_DRAFT'
  | 'CONTRACT_SIGNED'
  | 'PREPAYMENT_PAID'
  | 'DOCUMENTS'
  | 'APPLICATION_SUBMITTED'
  | 'ADMITTED'
  | 'TUITION_INVOICED'
  | 'INVITATION_RECEIVED'
  | 'GKS_ROUND1_PASSED'
  | 'GKS_ROUND2_PASSED'
  | 'VISA'
  | 'VISA_APPROVED'
  | 'BALANCE_PAID'
  | 'COLLATERAL_CONTRACT'
  | 'PRE_DEPARTURE'
  | 'DEPARTED'
  | 'COMPLETED'
  | 'ON_HOLD'
  | 'CANCELLED'
  | 'REJECTED';

export type PrepaymentMode = 'PERCENT' | 'FIXED';
export type BalanceTrigger = 'AFTER_VISA_APPROVED' | 'AFTER_SCHOLARSHIP_RESULT';
export type ContractType = 'ELECTRONIC' | 'PHYSICAL';
export type ContractStatus = 'DRAFT' | 'SENT' | 'SIGNED' | 'ACTIVE' | 'COMPLETED' | 'TERMINATED';
export type PaymentKind = 'PREPAYMENT' | 'BALANCE' | 'SCHOOL_TUITION' | 'TRANSFER_FEE' | 'EXTRA_SERVICE' | 'REFUND';
export type PaymentStatus = 'PENDING' | 'PAID' | 'FAILED' | 'EXPIRED' | 'REFUNDED';
/** How the money reached us (1C-27) — everything but `QPAY` is registered by staff. */
export type PaymentMethod = 'QPAY' | 'BANK_TRANSFER' | 'CARD' | 'CASH';

export interface PersonRef {
  id: string;
  name: string | null;
  email: string | null;
}

export interface ServicePricing {
  id: string;
  serviceType: ServiceType;
  totalAmount: string;
  prepaymentMode: PrepaymentMode;
  prepaymentValue: string;
  balanceTrigger: BalanceTrigger;
  /** Days a client is given to pay an invoice raised under this pricing (drives `PaymentItem.dueAt`). */
  paymentDueDays: number;
  effectiveFrom: string;
  effectiveTo: string | null;
}

export interface ContractTemplate {
  id: string;
  serviceType: ServiceType;
  version: number;
  isActive: boolean;
  bodyMn: string;
  createdAt: string;
  updatedAt: string;
}

export interface CollateralContract {
  id: string;
  contractId: string;
  isSigned: boolean;
  startDate: string | null;
  endDate: string | null;
  filePath: string | null;
}

export interface ContractDetail {
  id: string;
  caseId: string;
  userId: string;
  /** `СГ/26/001` — the number printed on the signed paper. */
  number: string;
  type: ContractType;
  status: ContractStatus;
  totalAmountSnapshot: string;
  prepaymentModeSnapshot: PrepaymentMode;
  prepaymentValueSnapshot: string;
  balanceTriggerSnapshot: BalanceTrigger;
  bodyMn: string;
  pdfPath: string | null;
  acceptedAt: string | null;
  otpVerifiedAt: string | null;
  signedAt: string | null;
  signedIp: string | null;
  physicalScanPath: string | null;
  collateralContract?: CollateralContract | null;
  createdAt: string;
  updatedAt: string;
}

export interface ContractListItem extends ContractDetail {
  user: PersonRef;
  case: { id: string; code: string; serviceType: ServiceType };
}

/** Compact operational summary for the staff contracts workspace. */
export interface ContractStats {
  total: number;
  byStatus: Partial<Record<ContractStatus, number>>;
}

export interface PaymentItem {
  id: string;
  caseId: string;
  kind: PaymentKind;
  amountMnt: string;
  status: PaymentStatus;
  method: PaymentMethod;
  /** Bank transaction / POS slip number, on a manually registered payment. */
  reference: string | null;
  qpayInvoiceId: string | null;
  qrText: string | null;
  qrImage: string | null;
  paidAt: string | null;
  /** When this invoice falls due — set from `ServicePricing.paymentDueDays` when it is raised. */
  dueAt: string | null;
  refundOfId: string | null;
  createdAt: string;
}

/**
 * What staff screens see on top of the client's own view (1C-27). `note` is an
 * internal remark written at the desk and `receiptPath` is a storage path, so
 * neither is ever selected into a `/me/*` payload.
 */
export interface StaffPaymentItem extends PaymentItem {
  note: string | null;
  /** Never fetched directly — `GET /payments/:id/receipt-url` mints the token (§9). */
  receiptPath: string | null;
}

export interface PaymentListItem extends StaffPaymentItem {
  case: { id: string; code: string; user: PersonRef };
}

export interface PaymentStats {
  pendingByKind: { kind: PaymentKind; totalMnt: string | number; count: number }[];
  overdueCount: number;
}

export interface CaseTransitionItem {
  id: string;
  fromStage: CaseStage;
  toStage: CaseStage;
  reason: string | null;
  actor: { id: string; name: string | null } | null;
  createdAt: string;
}

/**
 * Which side of a case a chosen school sits on. A GKS case runs the scholarship
 * application on `SCHOLARSHIP` schools and the one free ordinary-brokerage
 * school the contract grants (§3.11) on `REGULAR`; every other service is
 * `REGULAR` throughout.
 */
export type CaseChoiceTrack = 'SCHOLARSHIP' | 'REGULAR';

/** One school picked on a case, in preference order (§5.1). */
export interface CaseUniversityChoice {
  id: string;
  universityId: string;
  university: { id: string; nameMn: string; nameEn: string; slug?: string } | null;
  programId: string | null;
  program: { id: string; nameMn: string; nameKo: string | null; level: string } | null;
  track: CaseChoiceTrack;
  /** 0 is the first preference, and mirrors the case's own `universityId`. */
  sortOrder: number;
  major: string | null;
  note: string | null;
}

/** How many schools one case may name, per track — the server decides, the form obeys. */
export interface CaseChoiceLimits {
  scholarship: number;
  regular: number;
}

export const GKS_SCHOLARSHIP_CHOICE_LIMITS: CaseChoiceLimits = { scholarship: 2, regular: 1 };
export const REGULAR_CHOICE_LIMITS: CaseChoiceLimits = { scholarship: 0, regular: 3 };

/** Mirrors `choiceLimits()` on the API — kept here so the form can size itself. */
export function caseChoiceLimits(serviceType: ServiceType): CaseChoiceLimits {
  return serviceType === 'GKS_SCHOLARSHIP' ? GKS_SCHOLARSHIP_CHOICE_LIMITS : REGULAR_CHOICE_LIMITS;
}

export interface CaseListItem {
  id: string;
  code: string;
  userId: string;
  serviceType: ServiceType;
  universityId: string | null;
  stage: CaseStage;
  assignedConsultantId: string | null;
  assignedDocOfficerId: string | null;
  createdAt: string;
  updatedAt: string;
  user: PersonRef;
  university: { id: string; nameMn: string; nameEn: string } | null;
  universityChoices: CaseUniversityChoice[];
}

export interface CaseDetail extends CaseListItem {
  assignedConsultant: { id: string; name: string | null } | null;
  assignedDocOfficer: { id: string; name: string | null } | null;
  contract: ContractDetail | null;
  payments: StaffPaymentItem[];
  transitions: CaseTransitionItem[];
}

/** 1A-10 — what the public service pages quote (`GET /pricing/public`). */
export interface PublicServicePricing {
  serviceType: ServiceType;
  totalAmount: number;
  prepaymentMode: PrepaymentMode;
  prepaymentValue: number;
  /** The first payment in ₮, with PERCENT modes already resolved. */
  prepaymentAmount: number;
}
