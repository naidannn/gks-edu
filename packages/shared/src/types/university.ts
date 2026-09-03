/**
 * University catalogue payloads (API 1A-04 / 1A-05).
 *
 * Nullable fields are genuinely unknown in the source dataset — the UI renders
 * them as "мэдээлэл шинэчлэгдэж байна", never as 0 (ARCHITECTURE.md §3).
 */

export type UniversityType = 'NATIONAL' | 'PUBLIC' | 'PRIVATE';
export type ProgramLevel = 'LANGUAGE_PREP' | 'BACHELOR' | 'MASTER' | 'PHD';
export type IntakeStatus = 'PLANNED' | 'OPEN' | 'CLOSED';

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

export interface IntakeTerm {
  id: string;
  level: ProgramLevel;
  year: number;
  month: number;
  applicationDeadline: string | null;
  status: IntakeStatus;
  note: string | null;
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
