import type { EducationLevel, ServiceType } from '../schemas/lead';
import type { CaseStage, ContractStatus } from './case-contract-payment';
import type { ClientAttention } from './client-workspace';
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

/**
 * How a school is named wherever it appears inside another record.
 *
 * Both names travel together: the office works from paperwork, which is in
 * English, so that is what the CRM leads with (`universityName`), while the
 * Mongolian one stays available for the line underneath it.
 */
export interface UniversityRef {
  id: string;
  nameMn: string;
  nameEn: string;
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
  /** Where the live case sits on its service's flow, 0–100 (1G-17). */
  progressPercent: number;
  /** Missing paperwork, unpaid invoices, overdue work and the next deadline. */
  attention: ClientAttention;
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

/**
 * Whether the client can actually get into their own cabinet (1B-19).
 *
 * `NO_EMAIL`      — no address on file, so nothing was ever sent.
 * `NOT_INVITED`   — an address, but no invitation outstanding.
 * `INVITED`       — a live invitation; `invitedUntil` says how long.
 * `EXPIRED`       — the invitation lapsed; staff re-send from the client page.
 * `ACTIVE`        — a password (or Google) they own; they are already in.
 */
export type ClientPortalStatus = 'NO_EMAIL' | 'NOT_INVITED' | 'INVITED' | 'EXPIRED' | 'ACTIVE';

export interface ClientPortalAccess {
  /** The address on the login itself, which staff may have corrected. */
  email: string | null;
  status: ClientPortalStatus;
  /** When the outstanding invitation dies. Null unless one is outstanding. */
  invitedUntil: string | null;
  claimedAt: string | null;
  viaGoogle: boolean;
}

export interface ClientDetail extends ClientListItem {
  /** Cabinet access — read-only here; the invitation is re-sent from `/users`. */
  portal: ClientPortalAccess;

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
