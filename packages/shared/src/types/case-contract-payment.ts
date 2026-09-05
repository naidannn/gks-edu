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
  qpayInvoiceId: string | null;
  qrText: string | null;
  qrImage: string | null;
  paidAt: string | null;
  refundOfId: string | null;
  createdAt: string;
}

export interface PaymentListItem extends PaymentItem {
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
}

export interface CaseDetail extends CaseListItem {
  assignedConsultant: { id: string; name: string | null } | null;
  assignedDocOfficer: { id: string; name: string | null } | null;
  contract: ContractDetail | null;
  payments: PaymentItem[];
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
