import type { AdminUniversityDetail, AgentContractStatus, UniversityType } from '@gks/shared';

/**
 * The university form's shape, validation and payload, shared by the create and
 * edit screens (1A-25/1A-26) so the two can never drift apart.
 *
 * Every numeric field is held as a string: an empty box means "unknown", which
 * the API stores as `null` and the site renders as "мэдээлэл шинэчлэгдэж байна".
 * Writing 0 there would be a lie (CLAUDE.md).
 */

export const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export interface UniversityForm {
  slug: string;
  nameMn: string;
  nameEn: string;
  nameKo: string;
  type: UniversityType;

  cityMn: string;
  cityEn: string;
  regionMn: string;
  regionEn: string;
  address: string;
  lat: string;
  lon: string;
  distanceFromSeoulKm: string;
  travelTimeFromSeoul: string;
  nearestTransit: string;

  foundedYear: string;
  studentsTotal: string;
  internationalStudents: string;
  mongolianStudents: string;
  numCampuses: string;
  campusInfo: string;

  logoPath: string;
  coverPath: string;
  shortIntroMn: string;
  detailedIntroMn: string;
  advantages: string[];

  officialWebsite: string;
  wikipedia: string;
  wikidata: string;
  coverUrl: string;
  googleMaps: string;

  /** '' = unknown, 'true'/'false' = a staff answer. */
  dormAvailable: '' | 'true' | 'false';
  dormRoomTypes: string;
  dormPricePerMonthKrw: string;
  dormPricePerSemesterKrw: string;
  dormMealIncluded: '' | 'true' | 'false';
  dormDepositKrw: string;
  dormNote: string;

  acceptsLanguagePrep: boolean;
  acceptsFromMongolia: boolean;
  isGksEligible: boolean;
  agentContractStatus: AgentContractStatus;
  commissionNote: string;
  internalNote: string;
  isPublished: boolean;

  /**
   * THE South Korea rank. Normally written by `pnpm ranking:import`; the boxes
   * exist for a school the table names but the importer could not match.
   */
  theKoreaRank: string;
  theWorldRank: string;
  theRankYear: string;
  /** Staff nudge to the GKS score, in points. `gksScore`/`gksRank` are computed. */
  gksRankBoost: string;
}

export function emptyUniversityForm(): UniversityForm {
  return {
    slug: '', nameMn: '', nameEn: '', nameKo: '', type: 'PRIVATE',
    cityMn: '', cityEn: '', regionMn: '', regionEn: '', address: '', lat: '', lon: '',
    distanceFromSeoulKm: '', travelTimeFromSeoul: '', nearestTransit: '',
    foundedYear: '', studentsTotal: '', internationalStudents: '', mongolianStudents: '',
    numCampuses: '', campusInfo: '',
    logoPath: '', coverPath: '', shortIntroMn: '', detailedIntroMn: '', advantages: [],
    officialWebsite: '', wikipedia: '', wikidata: '', coverUrl: '', googleMaps: '',
    dormAvailable: '', dormRoomTypes: '', dormPricePerMonthKrw: '', dormPricePerSemesterKrw: '',
    dormMealIncluded: '', dormDepositKrw: '', dormNote: '',
    acceptsLanguagePrep: false, acceptsFromMongolia: true, isGksEligible: false,
    agentContractStatus: 'NONE', commissionNote: '', internalNote: '', isPublished: false,
    theKoreaRank: '', theWorldRank: '', theRankYear: '', gksRankBoost: '0',
  };
}

const str = (value: string | null | undefined) => value ?? '';
const num = (value: number | null | undefined) => (value === null || value === undefined ? '' : String(value));
const tri = (value: boolean | null | undefined): '' | 'true' | 'false' =>
  value === null || value === undefined ? '' : value ? 'true' : 'false';

export function fillFromUniversity(form: UniversityForm, u: AdminUniversityDetail): void {
  form.slug = u.slug;
  form.nameMn = u.nameMn;
  form.nameEn = u.nameEn;
  form.nameKo = u.nameKo;
  form.type = u.type;

  form.cityMn = u.cityMn;
  form.cityEn = u.cityEn;
  form.regionMn = u.regionMn;
  form.regionEn = u.regionEn;
  form.address = str(u.address);
  form.lat = num(u.lat);
  form.lon = num(u.lon);
  form.distanceFromSeoulKm = num(u.distanceFromSeoulKm);
  form.travelTimeFromSeoul = str(u.travelTimeFromSeoul);
  form.nearestTransit = str(u.nearestTransit);

  form.foundedYear = num(u.foundedYear);
  form.studentsTotal = num(u.studentsTotal);
  form.internationalStudents = num(u.internationalStudents);
  form.mongolianStudents = num(u.mongolianStudents);
  form.numCampuses = num(u.numCampuses);
  form.campusInfo = str(u.campusInfo);

  form.logoPath = str(u.logoPath);
  form.coverPath = str(u.coverPath);
  form.shortIntroMn = str(u.shortIntroMn);
  form.detailedIntroMn = str(u.detailedIntroMn);
  form.advantages = [...u.advantages];

  form.officialWebsite = str(u.links?.officialWebsite);
  form.wikipedia = str(u.links?.wikipedia);
  form.wikidata = str(u.links?.wikidata);
  form.coverUrl = str(u.links?.coverUrl);
  form.googleMaps = str(u.links?.googleMaps);

  form.dormAvailable = tri(u.dormitory?.available);
  form.dormRoomTypes = (u.dormitory?.roomTypes ?? []).join(', ');
  form.dormPricePerMonthKrw = num(u.dormitory?.pricePerMonthKrw);
  form.dormPricePerSemesterKrw = num(u.dormitory?.pricePerSemesterKrw);
  form.dormMealIncluded = tri(u.dormitory?.mealIncluded);
  form.dormDepositKrw = num(u.dormitory?.depositKrw);
  form.dormNote = str(u.dormitory?.note);

  form.acceptsLanguagePrep = u.acceptsLanguagePrep;
  form.acceptsFromMongolia = u.acceptsFromMongolia;
  form.isGksEligible = u.isGksEligible;
  form.agentContractStatus = u.agentContractStatus;
  form.commissionNote = str(u.commissionNote);
  form.internalNote = str(u.internalNote);
  form.isPublished = u.isPublished;

  form.theKoreaRank = num(u.theKoreaRank);
  form.theWorldRank = str(u.theWorldRank);
  form.theRankYear = num(u.theRankYear);
  form.gksRankBoost = String(u.gksRankBoost ?? 0);
}

/** Required text fields, by form key → label used in the error message. */
const REQUIRED: [keyof UniversityForm, string][] = [
  ['slug', 'Slug'],
  ['nameMn', 'Монгол нэр'],
  ['nameEn', 'Англи нэр'],
  ['nameKo', 'Солонгос нэр'],
  ['cityMn', 'Хот (монгол)'],
  ['cityEn', 'Хот (англи)'],
  ['regionMn', 'Бүс (монгол)'],
  ['regionEn', 'Бүс (англи)'],
];

/** Numeric fields, with the range the API will accept. */
const NUMERIC: [keyof UniversityForm, { min: number; max: number; integer: boolean }][] = [
  ['foundedYear', { min: 1300, max: new Date().getFullYear() + 1, integer: true }],
  ['lat', { min: -90, max: 90, integer: false }],
  ['lon', { min: -180, max: 180, integer: false }],
  ['distanceFromSeoulKm', { min: 0, max: 2000, integer: false }],
  ['studentsTotal', { min: 0, max: 1_000_000, integer: true }],
  ['internationalStudents', { min: 0, max: 1_000_000, integer: true }],
  ['mongolianStudents', { min: 0, max: 1_000_000, integer: true }],
  ['numCampuses', { min: 0, max: 100, integer: true }],
  ['dormPricePerMonthKrw', { min: 0, max: 100_000_000, integer: true }],
  ['dormPricePerSemesterKrw', { min: 0, max: 100_000_000, integer: true }],
  ['dormDepositKrw', { min: 0, max: 100_000_000, integer: true }],
  ['theKoreaRank', { min: 1, max: 2000, integer: true }],
  ['theRankYear', { min: 2000, max: new Date().getFullYear() + 1, integer: true }],
  // Mirrors `MAX_RANK_BOOST` on the API — a bigger number is rejected there.
  ['gksRankBoost', { min: -25, max: 25, integer: false }],
];

export function validateUniversityForm(form: UniversityForm, errors: Record<string, string>): boolean {
  for (const key of Object.keys(errors)) Reflect.deleteProperty(errors, key);

  for (const [key, label] of REQUIRED) {
    if (!String(form[key]).trim()) errors[key] = `${label} заавал бөглөнө`;
  }

  if (form.slug.trim() && !SLUG_PATTERN.test(form.slug.trim())) {
    errors.slug = 'Латин жижиг үсэг, тоо, зураас (жишээ: ajou-university)';
  }

  for (const [key, rule] of NUMERIC) {
    const raw = String(form[key]).trim();
    if (!raw) continue;
    const value = Number(raw);
    if (!Number.isFinite(value) || (rule.integer && !Number.isInteger(value))) {
      errors[key] = rule.integer ? 'Бүхэл тоо оруулна уу' : 'Тоо оруулна уу';
    } else if (value < rule.min || value > rule.max) {
      errors[key] = `${rule.min}–${rule.max} хооронд байна`;
    }
  }

  return Object.keys(errors).length === 0;
}

const text = (value: string) => (value.trim() ? value.trim() : null);
const number = (value: string) => (value.trim() ? Number(value) : null);
const bool = (value: '' | 'true' | 'false') => (value === '' ? null : value === 'true');

/** `null` everywhere the box is empty — that is the API's "unknown". */
export function universityPayload(form: UniversityForm): Record<string, unknown> {
  const dormitory = {
    available: bool(form.dormAvailable),
    roomTypes: form.dormRoomTypes.split(',').map((s) => s.trim()).filter(Boolean),
    pricePerMonthKrw: number(form.dormPricePerMonthKrw),
    pricePerSemesterKrw: number(form.dormPricePerSemesterKrw),
    mealIncluded: bool(form.dormMealIncluded),
    depositKrw: number(form.dormDepositKrw),
    note: text(form.dormNote),
  };
  // Nothing filled in at all means "we still have not asked the school".
  const dormitoryTouched = dormitory.available !== null
    || dormitory.roomTypes.length > 0
    || dormitory.pricePerMonthKrw !== null
    || dormitory.pricePerSemesterKrw !== null
    || dormitory.mealIncluded !== null
    || dormitory.depositKrw !== null
    || dormitory.note !== null;

  return {
    slug: form.slug.trim(),
    nameMn: form.nameMn.trim(),
    nameEn: form.nameEn.trim(),
    nameKo: form.nameKo.trim(),
    type: form.type,

    cityMn: form.cityMn.trim(),
    cityEn: form.cityEn.trim(),
    regionMn: form.regionMn.trim(),
    regionEn: form.regionEn.trim(),
    address: text(form.address),
    lat: number(form.lat),
    lon: number(form.lon),
    distanceFromSeoulKm: number(form.distanceFromSeoulKm),
    travelTimeFromSeoul: text(form.travelTimeFromSeoul),
    nearestTransit: text(form.nearestTransit),

    foundedYear: number(form.foundedYear),
    studentsTotal: number(form.studentsTotal),
    internationalStudents: number(form.internationalStudents),
    mongolianStudents: number(form.mongolianStudents),
    numCampuses: number(form.numCampuses),
    campusInfo: text(form.campusInfo),

    logoPath: text(form.logoPath),
    coverPath: text(form.coverPath),
    shortIntroMn: text(form.shortIntroMn),
    detailedIntroMn: text(form.detailedIntroMn),
    advantages: form.advantages.map((a) => a.trim()).filter(Boolean),

    links: {
      officialWebsite: text(form.officialWebsite),
      wikipedia: text(form.wikipedia),
      wikidata: text(form.wikidata),
      coverUrl: text(form.coverUrl),
      googleMaps: text(form.googleMaps),
    },
    dormitory: dormitoryTouched ? dormitory : null,

    acceptsLanguagePrep: form.acceptsLanguagePrep,
    acceptsFromMongolia: form.acceptsFromMongolia,
    isGksEligible: form.isGksEligible,
    agentContractStatus: form.agentContractStatus,
    commissionNote: text(form.commissionNote),
    internalNote: text(form.internalNote),
    isPublished: form.isPublished,

    theKoreaRank: number(form.theKoreaRank),
    theWorldRank: text(form.theWorldRank),
    theRankYear: number(form.theRankYear),
    // NOT NULL on the column, so an empty box means "no nudge", not "unknown".
    gksRankBoost: number(form.gksRankBoost) ?? 0,
  };
}
