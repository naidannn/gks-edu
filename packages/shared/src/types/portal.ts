import type { EducationLevel, ServiceType } from '../schemas/lead';
import type {
  BalanceTrigger,
  CaseStage,
  CaseTransitionItem,
  ContractDetail,
  PaymentItem,
} from './case-contract-payment';
import type { ClientDetail, UniversityRef } from './client';
import type { StageProgress } from './documents';
import type { UserRole } from '../schemas/user';

/**
 * Client-portal payloads (`/me/*`) — 1B-18, 1C-23, 1G-15.
 *
 * The portal answers one question per case: "юу хийх ёстой вэ?". That answer
 * is computed on the server so the dashboard, the case header and any later
 * notification all phrase it identically.
 */

export type NextActionActor = 'CLIENT' | 'STAFF' | 'SCHOOL' | 'NONE';

/** Which case tab the action lives on; the web app maps these to its routes. */
export type CaseTab = 'overview' | 'contract' | 'payment' | 'documents' | 'application' | 'visa' | 'departure';

export interface NextAction {
  key: string;
  actor: NextActionActor;
  label: string;
  description: string;
  tab: CaseTab;
}

export interface MissingProfileField {
  field: string;
  label: string;
}

export interface ProfileCompleteness {
  exists: boolean;
  isComplete: boolean;
  isMinor: boolean;
  missing: MissingProfileField[];
}

export interface PortalAccount {
  id: string;
  email: string | null;
  name: string | null;
  phone: string | null;
  role: UserRole;
  createdAt: string;
}

export interface MyProfileResponse {
  account: PortalAccount;
  client: ClientDetail | null;
  completeness: ProfileCompleteness;
}

/** One service the client may sign up for, priced from `ServicePricing`. */
export interface ServiceOption {
  serviceType: ServiceType;
  /** False when the price or the contract template is not configured yet. */
  available: boolean;
  totalAmount: string | null;
  prepaymentAmount: number | null;
  balanceAmount: number | null;
  balanceTrigger: BalanceTrigger | null;
}

export interface PortalCase {
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
  /** Stage sequence for this service, read from `CaseFlowDefinition` (§5). */
  journey: CaseStage[];
  documents: { admission: StageProgress; visa: StageProgress };
  nextAction: NextAction;
}

export interface PortalCaseDetail extends PortalCase {
  assignedConsultant: { id: string; name: string | null } | null;
  assignedDocOfficer: { id: string; name: string | null } | null;
  transitions: CaseTransitionItem[];
}

export interface PortalOverview {
  account: PortalAccount;
  profile: ProfileCompleteness & { code: string | null; fullName: string | null };
  cases: PortalCase[];
  activeCaseId: string | null;
  /** Services with a live case — a second one for the same service is refused. */
  openServiceTypes: ServiceType[];
}

/** The self-service profile form's payload (`PUT /me/profile`). */
export interface MyProfileInput {
  lastName: string;
  firstName: string;
  birthDate: string;
  registerNumber: string;
  gender?: string;
  phone: string;
  phoneAlt?: string;
  email?: string;
  address?: string;
  guardianLastName?: string;
  guardianFirstName?: string;
  guardianRegisterNumber?: string;
  guardianPhone?: string;
  guardianRelation?: string;
  educationLevel?: EducationLevel;
  schoolName?: string;
  gpa?: number;
  gpaScale?: string;
  koreanLevel?: string;
  englishLevel?: string;
  passportNumber?: string;
  passportExpiry?: string;
  primaryServiceType: ServiceType;
  targetUniversityId?: string;
  targetMajor?: string;
  plannedIntakeId?: string;
}
