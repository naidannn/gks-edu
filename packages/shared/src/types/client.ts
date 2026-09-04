import type { EducationLevel, ServiceType } from '../schemas/lead';
import type { CaseStage, ContractStatus } from './case-contract-payment';
import type { LeadSource } from './lead-crm';

/**
 * Client (гэрээт харилцагч) payloads — 1B-14.
 *
 * A `Lead` is a pre-contract enquiry and a `Client` is a person the office has
 * taken on; they are separate records, and converting one into the other copies
 * data rather than moving it.
 */

export type Gender = 'MALE' | 'FEMALE' | 'OTHER';
export type ClientStatus = 'ACTIVE' | 'INACTIVE' | 'ARCHIVED';

export interface UniversityRef {
  id: string;
  nameMn: string;
}

export interface ConsultantRef {
  id: string;
  name: string | null;
  email: string | null;
}

/** The service cycle staff are currently working for this client. */
export interface ClientActiveCase {
  id: string;
  code: string;
  stage: CaseStage;
  serviceType: ServiceType;
  university: UniversityRef | null;
}

export interface ClientListItem {
  id: string;
  code: string;
  userId: string;
  lastName: string;
  firstName: string;
  phone: string;
  email: string | null;
  registerNumber: string;
  birthDate: string;
  status: ClientStatus;
  source: LeadSource;
  primaryServiceType: ServiceType;
  targetMajor: string | null;
  targetUniversity: UniversityRef | null;
  assignedConsultant: ConsultantRef | null;
  activeCase: ClientActiveCase | null;
  contractStatus: ContractStatus | null;
  /** Signature date once signed, the draft date before that, null with no contract. */
  contractDate: string | null;
  caseCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface ClientCaseSummary {
  id: string;
  code: string;
  stage: CaseStage;
  serviceType: ServiceType;
  createdAt: string;
  university: UniversityRef | null;
  contract: {
    id: string;
    status: ContractStatus;
    type: 'ELECTRONIC' | 'PHYSICAL';
    signedAt: string | null;
    createdAt: string;
  } | null;
}

export interface ClientDetail extends ClientListItem {
  gender: Gender | null;
  phoneAlt: string | null;
  address: string | null;

  guardianLastName: string | null;
  guardianFirstName: string | null;
  guardianRegisterNumber: string | null;
  guardianPhone: string | null;
  guardianRelation: string | null;
  /** Derived from `birthDate` on the server — a minor needs a guardian to sign. */
  isMinor: boolean;

  educationLevel: EducationLevel | null;
  schoolName: string | null;
  gpa: number | null;
  gpaScale: string | null;
  koreanLevel: string | null;
  englishLevel: string | null;
  passportNumber: string | null;
  passportExpiry: string | null;

  targetUniversityId: string | null;
  plannedIntakeId: string | null;
  assignedConsultantId: string | null;
  note: string | null;

  leadId: string | null;
  lead: { id: string; stage: string; source: LeadSource; createdAt: string } | null;
  createdBy: ConsultantRef | null;
  cases: ClientCaseSummary[];
}

export interface ClientStats {
  total: number;
  byStatus: Partial<Record<ClientStatus, number>>;
  withContract: number;
  unassigned: number;
}

/** Guardian details become mandatory below this age (§6.2). */
export const ADULT_AGE = 18;

/** Age in whole years — the same rule the API applies before saving. */
export function ageOn(birthDate: string | Date, on: Date = new Date()): number {
  const birth = typeof birthDate === 'string' ? new Date(birthDate) : birthDate;
  let age = on.getFullYear() - birth.getFullYear();
  const monthDelta = on.getMonth() - birth.getMonth();
  if (monthDelta < 0 || (monthDelta === 0 && on.getDate() < birth.getDate())) age -= 1;
  return age;
}

export const REGISTER_PATTERN = /^[А-ЯӨҮЁ]{2}\d{8}$/;
