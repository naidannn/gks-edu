import type { EducationLevel, ServiceType } from '../schemas/lead';

/** Staff-side CRM payloads (1B-01 … 1B-04). */

export type LeadStage =
  | 'NEW'
  | 'CONTACTED'
  | 'CONSULTED'
  | 'PROPOSAL_SENT'
  | 'CONTRACT_PENDING'
  | 'WON'
  | 'LOST';

export type LeadSource =
  | 'WEBSITE'
  | 'AI_CHAT'
  | 'PHONE'
  | 'SOCIAL'
  | 'OFFICE'
  | 'LANGUAGE_CENTER'
  | 'REFERRAL'
  | 'OTHER';

export type LeadActivityType = 'NOTE' | 'CALL' | 'MEETING' | 'MESSAGE' | 'EMAIL' | 'CHAT' | 'STAGE_CHANGE';

/** Every stage a lead in this stage may legally move to next (mirrors the API's LEAD_STAGE_TRANSITIONS). */
export const LEAD_STAGE_TRANSITIONS: Record<LeadStage, LeadStage[]> = {
  NEW: ['CONTACTED', 'LOST'],
  CONTACTED: ['CONSULTED', 'LOST'],
  CONSULTED: ['PROPOSAL_SENT', 'LOST'],
  PROPOSAL_SENT: ['CONTRACT_PENDING', 'LOST'],
  CONTRACT_PENDING: ['WON', 'LOST'],
  WON: [],
  LOST: ['CONTACTED'],
};

export interface StaffRef {
  id: string;
  name: string | null;
  email: string | null;
}

export interface LeadListItem {
  id: string;
  firstName: string;
  lastName: string;
  phone: string;
  email: string | null;
  source: LeadSource;
  stage: LeadStage;
  assignedToId: string | null;
  assignedTo: StaffRef | null;
  nextContactAt: string | null;
  winProbability: number | null;
  /** Set once the lead was converted into a client (1B-10). */
  client: { id: string; code: string } | null;
  createdAt: string;
  updatedAt: string;
}

export interface LeadActivityItem {
  id: string;
  leadId: string;
  type: LeadActivityType;
  body: string | null;
  meta: Record<string, unknown>;
  actorId: string | null;
  actor: { id: string; name: string | null } | null;
  occurredAt: string;
  createdAt: string;
}

export interface LeadDetail {
  id: string;
  userId: string | null;
  firstName: string;
  lastName: string;
  phone: string;
  email: string | null;
  age: number | null;
  educationLevel: EducationLevel | null;
  gpa: number | null;
  gpaScale: string | null;
  koreanLevel: string | null;
  englishLevel: string | null;
  interestedServices: ServiceType[];
  interestedUniversityIds: string[];
  interestedMajor: string | null;
  source: LeadSource;
  stage: LeadStage;
  assignedToId: string | null;
  assignedTo: StaffRef | null;
  nextContactAt: string | null;
  winProbability: number | null;
  lostReason: string | null;
  note: string | null;
  /** Set once the lead was converted into a client (1B-10). */
  client: { id: string; code: string; createdAt: string } | null;
  createdAt: string;
  updatedAt: string;
  activities: LeadActivityItem[];
}

/** `/admin` dashboard counters (1B-08). */
export interface LeadStats {
  total: number;
  byStage: Record<LeadStage, number>;
  /** Leads with no `assignedTo`. */
  unassigned: number;
  /** This staff member's own open (non-WON/LOST) leads. */
  mineOpen: number;
  newLast7Days: number;
  recent: LeadListItem[];
}

/** Funnel order — NEW through the two terminal stages, for the dashboard breakdown. */
export const LEAD_STAGE_ORDER: LeadStage[] = [
  'NEW',
  'CONTACTED',
  'CONSULTED',
  'PROPOSAL_SENT',
  'CONTRACT_PENDING',
  'WON',
  'LOST',
];
