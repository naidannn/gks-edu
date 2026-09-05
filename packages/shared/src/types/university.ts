/**
 * University catalogue payloads (API 1A-04 / 1A-05).
 *
 * Nullable fields are genuinely unknown in the source dataset — the UI renders
 * them as "мэдээлэл шинэчлэгдэж байна", never as 0 (ARCHITECTURE.md §3).
 */

import type { IntakePhase, IntakeProgramOverride } from './admissions';

export type UniversityType = 'NATIONAL' | 'PUBLIC' | 'PRIVATE';
export type ProgramLevel = 'LANGUAGE_PREP' | 'BACHELOR' | 'MASTER' | 'PHD';
export type IntakeStatus = 'PLANNED' | 'OPEN' | 'CLOSED' | 'CANCELLED';
export type IntakeSource = 'MANUAL' | 'AI_ASSISTED' | 'IMPORTED';

export interface LivingCost {
  tier?: string;
  tierLabelMn?: string;
  currency?: string;
  monthlyTotalMin?: number | null;
  monthlyTotalMax?: number | null;
  housing?: [number, number] | null;
  food?: [number, number] | null;
  transport?: [number, number] | null;
  other?: [number, number] | null;
  note?: string | null;
  isEstimate?: boolean;
}

export interface Dormitory {
  available?: boolean | null;
  roomTypes?: string[] | null;
  pricePerMonthKrw?: number | null;
  pricePerSemesterKrw?: number | null;
  mealIncluded?: boolean | null;
  depositKrw?: number | null;
  note?: string | null;
}

export interface UniversityLinks {
  officialWebsite?: string | null;
  wikipedia?: string | null;
  wikidata?: string | null;
  coverUrl?: string | null;
  googleMaps?: string | null;
}

/** Per-field provenance: which values are verified, editorial or estimated. */
export type UniversityQuality = Record<string, string>;

/**
 * Per-component contributions behind one school's `gksScore`, each 0-100
 * before weighting. Staff-only — it is the answer to "why is this school
 * fourth?" (ARCHITECTURE.md §3.1).
 */
export interface GksScoreParts {
  base: number;
  partnership: number;
  fit: number;
  demand: number;
  practical: number;
}

export interface UniversityCard {
  id: string;
  slug: string;
  nameMn: string;
  nameEn: string;
  nameKo: string;
  type: UniversityType;
  cityMn: string;
  regionMn: string;
  regionEn: string;
  foundedYear: number | null;
  studentsTotal: number | null;
  logoPath: string | null;
  shortIntroMn: string | null;
  acceptsLanguagePrep: boolean;
  isGksEligible: boolean;
  livingCost: LivingCost | null;
  /**
   * Times Higher Education "South Korea Rank" — the base rank, and the only
   * one shown publicly. `null` means "рэйтингд ороогүй", never "worst".
   */
  theKoreaRank: number | null;
  /** THE world rank as published — "=58", "251-300", "1501+". A band, not a number. */
  theWorldRank: string | null;
  theRankYear: number | null;
}

export interface UniversityProgram {
  id: string;
  level: ProgramLevel;
  nameMn: string;
  nameEn: string | null;
  faculty: string | null;
  durationYears: number | null;
  tuitionPerYearKrw: number | null;
  tuitionPerTermKrw: number | null;
  topikLevel: number | null;
  ieltsScore: number | null;
  otherRequirements: string | null;
}

/**
 * One intake round as a client sees it.
 *
 * `internalDeadline` is the only deadline here — OUR last day, which is
 * `AdmissionConfig.internalLeadDays` before the school's. The school's own date
 * exists in the database but never reaches a client payload: given two
 * deadlines people work to the later one. Staff get both via `AdminIntakeTerm`.
 */
export interface IntakeTerm {
  id: string;
  level: ProgramLevel;
  year: number;
  month: number;
  openAt: string | null;
  internalDeadline: string | null;
  classStartDate: string | null;
  resultAnnouncedAt: string | null;
  quota: number | null;
  admissionFeeKrw: number | null;
  requirementNote: string | null;
  status: IntakeStatus;
  note: string | null;
  sourceUrl: string | null;
  /** Derived from the dates — see `IntakePhase` in `./admissions`. */
  phase: IntakePhase;
  /** Days until `internalDeadline`; negative once it has passed, null with no date. */
  daysUntilInternalDeadline: number | null;
}

export interface UniversityDetail extends UniversityCard {
  address: string | null;
  cityEn: string;
  lat: number | null;
  lon: number | null;
  coverPath: string | null;
  detailedIntroMn: string | null;
  internationalStudents: number | null;
  mongolianStudents: number | null;
  numCampuses: number | null;
  campusInfo: string | null;
  distanceFromSeoulKm: number | null;
  travelTimeFromSeoul: string | null;
  nearestTransit: string | null;
  advantages: string[];
  dormitory: Dormitory | null;
  links: UniversityLinks;
  quality: UniversityQuality;
  acceptsFromMongolia: boolean;
  updatedAt: string;
  programs: UniversityProgram[];
  intakes: IntakeTerm[];
}

export interface UniversityFacets {
  total: number;
  regions: { value: string; label: string; count: number }[];
  types: { value: UniversityType; count: number }[];
  languagePrep: number;
  gks: number;
}

/** One row of a logged-in visitor's shortlist (1A-18). */
export interface SavedUniversityEntry {
  savedAt: string;
  university: UniversityCard;
}

/* ------------------------------------------------------------------------- *
 * Staff catalogue management (admin 1A-25 … 1A-27)
 *
 * The public payloads above hide `commissionNote`, `internalNote` and every
 * unpublished school. These do not — they back `/admin/universities`, which is
 * behind `RolesGuard`.
 * ------------------------------------------------------------------------- */

export type AgentContractStatus = 'NONE' | 'IN_TALKS' | 'SIGNED' | 'EXPIRED';

/** One row of the staff list. */
export interface AdminUniversityRow {
  id: string;
  slug: string;
  nameMn: string;
  nameEn: string;
  nameKo: string;
  type: UniversityType;
  cityMn: string;
  regionMn: string;
  regionEn: string;
  foundedYear: number | null;
  studentsTotal: number | null;
  logoPath: string | null;
  shortIntroMn: string | null;
  acceptsLanguagePrep: boolean;
  acceptsFromMongolia: boolean;
  isGksEligible: boolean;
  agentContractStatus: AgentContractStatus;
  isPublished: boolean;
  updatedAt: string;
  theKoreaRank: number | null;
  theWorldRank: string | null;
  theRankYear: number | null;
  /** Our own 0-100 recommendation score. Computed; never public. */
  gksScore: number | null;
  /** Position by `gksScore`, 1 = shown first. The catalogue's default order. */
  gksRank: number | null;
  /** The staff thumb on the scale, in score points. */
  gksRankBoost: number;
  gksScoredAt: string | null;
  _count: { programs: number; intakes: number; cases: number };
}

export interface AdminUniversityProgram extends UniversityProgram {
  universityId: string;
  nameKo: string | null;
  isPublished: boolean;
}

export interface AdminIntakeTerm extends IntakeTerm {
  universityId: string;
  /** The school's own published last day — staff-only; it is the buffer they manage. */
  applicationDeadline: string | null;
  /** True while `internalDeadline` was typed by a human and is never recomputed. */
  internalDeadlineIsManual: boolean;
  sourceType: IntakeSource;
  verifiedAt: string | null;
  verifiedBy: { id: string; name: string | null } | null;
  programOverrides: IntakeProgramOverride[];
  _count: { cases: number; applications: number };
}

/** The list and detail payloads carry the school; a save response does not. */
export interface AdminIntakeTermWithUniversity extends AdminIntakeTerm {
  university: UniversityCard;
}

export interface AdminUniversityDetail extends Omit<AdminUniversityRow, '_count'> {
  cityEn: string;
  address: string | null;
  lat: number | null;
  lon: number | null;
  coverPath: string | null;
  detailedIntroMn: string | null;
  internationalStudents: number | null;
  mongolianStudents: number | null;
  numCampuses: number | null;
  campusInfo: string | null;
  distanceFromSeoulKm: number | null;
  travelTimeFromSeoul: string | null;
  nearestTransit: string | null;
  advantages: string[];
  livingCost: LivingCost | null;
  dormitory: Dormitory | null;
  links: UniversityLinks;
  quality: UniversityQuality;
  /** Internal — commission terms; never exposed on a public endpoint. */
  commissionNote: string | null;
  /** Internal — staff notes; never exposed on a public endpoint. */
  internalNote: string | null;
  /** Why this school sits where it does; null until the first recompute. */
  gksScoreParts: GksScoreParts | null;
  createdAt: string;
  programs: AdminUniversityProgram[];
  intakes: AdminIntakeTerm[];
  /** What references this school — the reason a delete may be refused. */
  _count: {
    programs: number;
    intakes: number;
    cases: number;
    clients: number;
    applications: number;
    requirementRules: number;
    savedBy: number;
  };
}

export interface AdminUniversityStats {
  total: number;
  published: number;
  draft: number;
  languagePrep: number;
  gks: number;
  agentSigned: number;
  /** Schools with no `shortIntroMn` — the catalogue card has nothing to say. */
  missingIntro: number;
  byType: { value: UniversityType; count: number }[];
}

export interface UniversityRegionOption {
  value: string;
  label: string;
  count: number;
}

/* ------------------------------------------------------------------------- *
 * GKS ranking (admin 1A-29 … 1A-31)
 *
 * Two ranks sit on a university. `theKoreaRank` is Times Higher Education's,
 * imported and citable. `gksRank` is ours: a weighted blend of the outside
 * rank, the agent contract, fit for a Mongolian applicant, our own demand and
 * success history, and practical factors — and it is what orders the catalogue
 * and the search results for every visitor.
 * ------------------------------------------------------------------------- */

/** The five weights plus the neutral floor, as the office tunes them. */
export interface GksRankingConfig {
  id: string;
  weightBaseRank: number;
  weightPartnership: number;
  weightFit: number;
  weightDemand: number;
  weightPractical: number;
  /** Base-component score for a school THE does not rank. Neutral, not zero. */
  unrankedBaseScore: number;
  updatedAt: string;
  updatedById: string | null;
}

export type GksRankingWeights = Omit<GksRankingConfig, 'id' | 'updatedAt' | 'updatedById'>;

export interface GksRankingPreviewRow {
  rank: number;
  nameMn: string;
  nameEn: string;
  score: number;
  boost: number;
  theKoreaRank: number | null;
  parts: GksScoreParts;
}

/** A dry run: what the catalogue would look like under different weights. */
export interface GksRankingPreview {
  weights: GksRankingWeights;
  total: number;
  rows: GksRankingPreviewRow[];
}

export interface GksRankingRecomputeSummary {
  scored: number;
  /** Distinct positions handed out — fewer than `scored` when schools tie. */
  ranked: number;
  durationMs: number;
  top: { rank: number; nameMn: string; nameEn: string; score: number }[];
}
