/**
 * Programmes and tuition (ARCHITECTURE.md §3.3).
 *
 * The catalogue is three levels and no more: a university, the colleges it is
 * organised into (танхим / 단과대학), and the departments inside them with what
 * each one costs. There is deliberately no canonical subject taxonomy above
 * that — every school words the same subject differently, so a canonical list
 * is a second vocabulary somebody maintains forever. What a visitor types is a
 * word, and the search answers it off the names the schools publish.
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

/** One college of one university, as it appears on a programme row. */
export interface FacultyRef {
  id: string;
  nameMn: string;
  nameEn: string | null;
  /** The school's own word for it — 공과대학 — and what staff match a prospectus against. */
  nameKo: string | null;
}

/** A college as the admin screen lists it, with how many departments sit in it. */
export interface Faculty extends FacultyRef {
  universityId: string;
  sortOrder: number;
  programCount: number;
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

/** One programme as a visitor sees it, without the school it belongs to. */
export interface ProgramRow {
  id: string;
  universityId: string;
  level: ProgramLevel;
  /** The school's own wording, in the three languages we have it in. */
  nameMn: string;
  nameEn: string | null;
  nameKo: string | null;
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

  /** The college this department sits in. Null is normal, not a defect. */
  faculty: FacultyRef | null;
}

/** A programme row with its school on it — what `/programs` returns. */
export interface ProgramListItem extends ProgramRow {
  university: ProgramUniversity;
}

export interface ProgramFacets {
  total: number;
  levels: { value: ProgramLevel; count: number }[];
  languages: { value: InstructionLanguage; count: number }[];
  regions: { value: string; label: string; count: number }[];
  /** Schools by slug — the "just this university's departments" cut. */
  universities: { value: string; label: string; count: number }[];
  /** Across every priced programme — the axis a budget filter is drawn on. */
  tuition: { minKrw: number | null; maxKrw: number | null; avgKrw: number | null };
}

/* ------------------------------------------------------------------------- *
 * Staff-side
 * ------------------------------------------------------------------------- */

export interface AdminProgram extends ProgramListItem {
  facultyId: string | null;
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
  /** Not filed under any college yet. */
  noFaculty: number;
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
  /** The college, as the school writes it. Null when the school publishes none. */
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
  /**
   * True when no `GEMINI_API_KEY` is configured: the run is a fixture, not a
   * search, and the same thirteen candidates come back for every school.
   */
  mock: boolean;
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
