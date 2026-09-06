/**
 * Programmes and tuition (ARCHITECTURE.md §3.3).
 *
 * The module answers one question — "who teaches marketing, and what does it
 * cost?" — and it can only answer it because a programme is filed under a
 * canonical `StudyField` while keeping the school's own wording for display.
 * Every school words the same subject differently; the taxonomy is what makes
 * them one row on a filter panel.
 *
 * Nullable money is genuinely unknown, never zero. A tuition figure with no
 * `tuitionYear` on it is shown as "мэдээлэл шинэчлэгдэж байна", not as current:
 * Korean schools republish their fee table annually, and a stale price is the
 * one a consultant quotes and a family then budgets against.
 */

import type { ProgramLevel, UniversityType } from './university';

/** What language a programme is actually taught in. */
export type InstructionLanguage = 'KOREAN' | 'ENGLISH' | 'KOREAN_ENGLISH';

/** Where a programme's figures came from. `AI_ASSISTED` means a human saved them. */
export type ProgramSource = 'MANUAL' | 'AI_ASSISTED' | 'IMPORTED';

/** One canonical subject, as it appears on a programme row. */
export interface StudyFieldRef {
  id: string;
  slug: string;
  nameMn: string;
  nameEn: string;
  nameKo: string | null;
  /** Null on a group. Groups are headings; programmes hang off the subjects. */
  parentId: string | null;
}

/** A subject with its programme count, as the filter panel needs it. */
export interface StudyField extends StudyFieldRef {
  aliases: string[];
  sortOrder: number;
  isActive: boolean;
  programCount: number;
}

/** A group with the subjects inside it. `programCount` rolls its children up. */
export interface StudyFieldGroup extends StudyField {
  children: StudyField[];
}

/** The school columns a programme row carries — less than a catalogue card. */
export interface ProgramUniversity {
  id: string;
  slug: string;
  nameMn: string;
  nameEn: string;
  nameKo: string;
  logoPath: string | null;
  type: UniversityType;
  cityMn: string;
  regionMn: string;
  regionEn: string;
  isGksEligible: boolean;
  acceptsLanguagePrep: boolean;
  /** THE South Korea rank — the only rank shown publicly; null = "рэйтингд ороогүй". */
  theKoreaRank: number | null;
}

/** One programme as a visitor sees it. */
export interface ProgramListItem {
  id: string;
  universityId: string;
  level: ProgramLevel;
  /** The school's own wording, in the three languages we have it in. */
  nameMn: string;
  nameEn: string | null;
  nameKo: string | null;
  /** The school's own college (경영대학), free text beside the canonical subject. */
  faculty: string | null;
  durationYears: number | null;

  /** Per semester, KRW — the figure Korean schools publish. */
  tuitionPerTermKrw: number | null;
  tuitionPerYearKrw: number | null;
  /** 입학금 — the one-off entrance fee, paid in the first semester only. */
  admissionFeeKrw: number | null;
  /** Which academic year the figures above are from. Null = unknown. */
  tuitionYear: number | null;
  /** Largest discount a foreign applicant can realistically get, in percent. */
  scholarshipMaxPercent: number | null;
  scholarshipNote: string | null;

  topikLevel: number | null;
  ieltsScore: number | null;
  otherRequirements: string | null;
  language: InstructionLanguage;
  acceptsInternational: boolean;
  sourceUrl: string | null;

  studyField: StudyFieldRef | null;
  university: ProgramUniversity;
}

export interface ProgramFacets {
  total: number;
  levels: { value: ProgramLevel; count: number }[];
  languages: { value: InstructionLanguage; count: number }[];
  regions: { value: string; label: string; count: number }[];
  /** Across every priced programme — the axis a budget filter is drawn on. */
  tuition: { minKrw: number | null; maxKrw: number | null; avgKrw: number | null };
}

/* ------------------------------------------------------------------------- *
 * Staff-side
 * ------------------------------------------------------------------------- */

export interface AdminProgram extends ProgramListItem {
  studyFieldId: string | null;
  sourceType: ProgramSource;
  /** No `verifiedAt` means nobody has checked this against the school. */
  verifiedAt: string | null;
  verifiedBy: { id: string; name: string | null } | null;
  /** Internal — never on a public payload. */
  internalNote: string | null;
  isPublished: boolean;
  createdAt: string;
  updatedAt: string;
  _count: { cases: number; applications: number };
}

/** The three gaps that are invisible on the list itself. */
export interface AdminProgramStats {
  total: number;
  published: number;
  draft: number;
  /** No tuition figure at all — the row cannot answer the question it exists for. */
  missingTuition: number;
  /** Not filed under a subject, so a subject search will never find it. */
  unclassified: number;
  unverified: number;
  /** Priced against a fee table older than last year's. */
  staleTuition: number;
}

/** What `POST /admin/programs/bulk` did — a duplicate is skipped, not failed. */
export interface BulkProgramResult {
  created: number;
  skipped: number;
  createdNames: string[];
  skippedNames: string[];
}

/** What `POST /admin/study-fields/:id/assign` did. */
export interface AssignStudyFieldResult {
  assigned: number;
  /** Wordings now remembered, so the next school naming it this way is matched. */
  learnedAliases: string[];
}

export interface RematchRow {
  programId: string;
  programName: string;
  universityNameMn: string;
  fieldId: string;
  fieldSlug: string;
  score: number;
  /** The alias or name that matched — the answer to "why this subject?". */
  matchedOn: string;
  wasClassified: boolean;
}

/** `POST /admin/study-fields/rematch`. Defaults to a dry run, and says which it was. */
export interface RematchResult {
  dryRun: boolean;
  scanned: number;
  matched: number;
  unmatched: number;
  /** Capped at 300 — the counters above are the whole picture. */
  rows: RematchRow[];
}

/* ------------------------------------------------------------------------- *
 * Gemini research (LLM-assisted entry)
 *
 * A run proposes candidates. Staff read them next to their source links, tick
 * the ones they believe, and save. Nothing here ever writes a programme by
 * itself — that is the whole point of the feature, and the same contract the
 * intake search runs under.
 * ------------------------------------------------------------------------- */

export type ProgramResearchStatus = 'QUEUED' | 'RUNNING' | 'SUCCEEDED' | 'FAILED';

/** How far the model would stand behind one candidate. */
export type ProgramCandidateConfidence = 'HIGH' | 'MEDIUM' | 'LOW';

export interface ProgramCandidate {
  level: ProgramLevel;
  /** The department name as the school writes it. One of these two is always set. */
  nameKo: string | null;
  nameEn: string | null;
  /** A slug from the taxonomy we sent the model, or null. Never one it coined. */
  fieldSlug: string | null;
  faculty: string | null;
  durationYears: number | null;
  tuitionPerTermKrw: number | null;
  tuitionPerYearKrw: number | null;
  admissionFeeKrw: number | null;
  tuitionYear: number | null;
  scholarshipMaxPercent: number | null;
  scholarshipNote: string | null;
  topikLevel: number | null;
  language: InstructionLanguage;
  confidence: ProgramCandidateConfidence;
  /** The page the figures were read off. Null when the model cited nothing. */
  sourceUrl: string | null;
  /** Why the model is unsure, in Mongolian — shown next to the candidate. */
  note: string | null;
}

export interface ProgramResearchRun {
  id: string;
  universityId: string;
  universityNameMn: string;
  universityNameEn: string;
  levels: ProgramLevel[];
  year: number;
  status: ProgramResearchStatus;
  model: string;
  candidates: ProgramCandidate[] | null;
  sources: string[];
  error: string | null;
  /** How many candidates from this run a human went on to save. */
  acceptedCount: number;
  startedAt: string | null;
  finishedAt: string | null;
  createdAt: string;
  requestedBy: { id: string; name: string | null } | null;
}
