import type { EducationLevel, ServiceType } from '../schemas/lead';

/** Material requirement engine payloads (1D-01 … 1D-19). */

export type DocStage = 'ADMISSION' | 'VISA';
export type GuarantorType = 'NONE' | 'EMPLOYEE' | 'COMPANY_DIRECTOR' | 'SELF_EMPLOYED';
export type GuarantorRelation = 'PARENT' | 'SIBLING' | 'UNCLE_AUNT' | 'OTHER';
export type Necessity = 'REQUIRED' | 'CONDITIONAL' | 'OPTIONAL';

export type DocumentStatus =
  | 'NOT_STARTED'
  | 'IN_PROGRESS'
  | 'SUBMITTED'
  | 'UNDER_REVIEW'
  | 'NEEDS_FIX'
  | 'RESUBMIT_REQUIRED'
  | 'ACCEPTED'
  | 'IN_TRANSLATION'
  | 'TRANSLATED'
  | 'CERTIFIED'
  | 'READY'
  | 'SENT_TO_UNIVERSITY';

export type WorkTaskType =
  | 'TRANSLATION'
  | 'NOTARISATION'
  | 'FORM_FILLING'
  | 'STUDY_PLAN'
  | 'SELF_INTRODUCTION'
  | 'SCHOLARSHIP_ESSAY'
  | 'COMPLETENESS_CHECK'
  | 'FILE_MERGE'
  | 'FINAL_REVIEW'
  | 'OTHER';

export type WorkTaskStatus = 'TODO' | 'IN_PROGRESS' | 'DONE' | 'CANCELLED';
export type AppointmentStatus = 'SCHEDULED' | 'COMPLETED' | 'CANCELLED' | 'NO_SHOW';

export interface DocumentTemplate {
  id: string;
  code: string;
  nameMn: string;
  descriptionMn: string | null;
  sourceHint: string | null;
  issuerHint: string | null;
  validityDays: number | null;
  needsTranslation: boolean;
  needsNotary: boolean;
  needsApostille: boolean;
  needsPhysicalOriginal: boolean;
  acceptedFileTypes: string[];
  sampleFilePath: string | null;
  tipsMn: string | null;
  isActive: boolean;
  _count?: { rules: number };
}

/**
 * A material typed onto one client's checklist (1D-22). The API saves it as a
 * `DocumentTemplate`, so the next client is given it from the picker instead of
 * having it retyped; no rule points at it, so the engine never issues it.
 */
export interface NewDocumentTemplateInput {
  nameMn: string;
  descriptionMn?: string;
  sourceHint?: string;
  issuerHint?: string;
  needsTranslation?: boolean;
  needsNotary?: boolean;
  needsApostille?: boolean;
  needsPhysicalOriginal?: boolean;
  tipsMn?: string;
}

/** Adding a material to one case: pick a template, or write one out. */
export interface CreateCaseDocumentInput {
  templateId?: string;
  template?: NewDocumentTemplateInput;
  stage: DocStage;
  necessity?: Necessity;
  conditionNote?: string;
  dueAt?: string;
}

export interface RequirementRule {
  id: string;
  templateId: string;
  stage: DocStage;
  serviceTypes: ServiceType[];
  educationLevels: EducationLevel[];
  guarantorTypes: GuarantorType[];
  guarantorRelations: GuarantorRelation[];
  universityId: string | null;
  necessity: Necessity;
  conditionNote: string | null;
  sortOrder: number;
  isActive: boolean;
  template?: Pick<DocumentTemplate, 'id' | 'code' | 'nameMn' | 'needsTranslation' | 'needsPhysicalOriginal'>;
  university?: { id: string; nameMn: string; nameEn: string } | null;
}

export interface CaseConditions {
  id: string;
  caseId: string;
  educationLevel: EducationLevel | null;
  guarantorType: GuarantorType;
  guarantorRelation: GuarantorRelation | null;
  guarantorName: string | null;
  guarantorPhone: string | null;
  note: string | null;
  updatedAt: string;
}

export interface DocumentFile {
  id: string;
  caseDocumentId: string;
  version: number;
  originalName: string;
  sizeBytes: number;
  mimeType: string;
  isFinal: boolean;
  createdAt: string;
}

export interface DocumentReviewNote {
  id: string;
  body: string;
  fromStatus: DocumentStatus | null;
  toStatus: DocumentStatus | null;
  isInternal: boolean;
  createdAt: string;
  author: { id: string; name: string | null } | null;
}

export interface CaseDocument {
  id: string;
  caseId: string;
  templateId: string;
  stage: DocStage;
  necessity: Necessity;
  conditionNote: string | null;
  status: DocumentStatus;
  sortOrder: number;
  dueAt: string | null;
  submittedAt: string | null;
  acceptedAt: string | null;
  template: DocumentTemplate;
  files: DocumentFile[];
  notes?: DocumentReviewNote[];
  workTasks?: WorkTask[];
}

export interface StageProgress {
  stage: DocStage;
  requiredTotal: number;
  requiredDone: number;
  percent: number;
  awaitingReview: number;
  needsFix: number;
}

export interface DocumentChecklist {
  documents: CaseDocument[];
  progress: StageProgress;
}

/** A row of the staff review queue (1D-16). */
export interface ReviewQueueItem {
  id: string;
  stage: DocStage;
  status: DocumentStatus;
  necessity: Necessity;
  dueAt: string | null;
  submittedAt: string | null;
  template: Pick<DocumentTemplate, 'id' | 'code' | 'nameMn' | 'needsTranslation' | 'needsPhysicalOriginal'>;
  files: DocumentFile[];
  case: {
    id: string;
    code: string;
    serviceType: ServiceType;
    user: { id: string; name: string | null; email: string | null };
    assignedDocOfficer: { id: string; name: string | null } | null;
  };
}

export interface WorkTask {
  id: string;
  caseId: string;
  caseDocumentId: string | null;
  type: WorkTaskType;
  title: string;
  description: string | null;
  status: WorkTaskStatus;
  assigneeId: string | null;
  dueAt: string | null;
  completedAt: string | null;
  createdAt: string;
  assignee?: { id: string; name: string | null } | null;
  case?: { id: string; code: string; user: { id: string; name: string | null } };
  caseDocument?: { id: string; template: { code: string; nameMn: string } } | null;
}

export interface OfficeAppointment {
  id: string;
  caseId: string;
  scheduledAt: string;
  status: AppointmentStatus;
  note: string | null;
}

export interface OfficeAppointmentView {
  appointments: OfficeAppointment[];
  physicalOriginals: { id: string; status: DocumentStatus; template: { id: string; code: string; nameMn: string } }[];
}

/** Short-lived signed download token minted by the API (§9). */
export interface SignedFile {
  token: string;
  expiresAt: string;
  originalName?: string;
  mimeType?: string;
}

export interface ResolutionSummary {
  stage: DocStage;
  created: number;
  updated: number;
  removed: number;
  keptDespiteUnmatched: number;
}
