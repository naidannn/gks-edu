import type { EducationLevel, ServiceType } from '../schemas/lead';
import type {
  BalanceTrigger,
  CaseStage,
  CaseTransitionItem,
  ContractDetail,
  PaymentItem,
} from './case-contract-payment';
import type { IntakePhase } from './admissions';
import type { ClientDetail, UniversityRef } from './client';
import type { IntakeStatus, ProgramLevel } from './university';
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
  /**
   * Days until the intake's internal deadline — set only while the ball is
   * with the client and the date is close (1H-09). Negative once it has
   * passed; absent when there is no intake or no hurry.
   */
  urgentDaysLeft?: number | null;
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
  /**
   * The round this case is racing (1H-09). One deadline only: `internalDeadline`
   * is ours, and it is the date the case is actually driven to. The school's
   * later date is staff-side and never reaches the portal.
   */
  intake: {
    id: string;
    level: ProgramLevel;
    year: number;
    month: number;
    openAt: string | null;
    internalDeadline: string | null;
    classStartDate: string | null;
    resultAnnouncedAt: string | null;
    requirementNote: string | null;
    status: IntakeStatus;
    phase: IntakePhase;
    daysUntilInternalDeadline: number | null;
  } | null;
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
