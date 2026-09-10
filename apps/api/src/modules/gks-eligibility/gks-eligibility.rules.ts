import { EducationLevel, ServiceType } from '../../prisma/client.js';
import { MONTHS_PER_TOPIK_LEVEL } from '../study-plan/study-plan.rules.js';

/**
 * The arithmetic behind the GKS self-check (ARCHITECTURE.md §3.5).
 *
 * Pure, and with no clock of its own, for the same reason `intake-deadline.ts`
 * and `study-plan.rules.ts` are: there has to be exactly one answer to "may
 * this person apply, and how strong are they", and it has to be testable
 * against a fixed `now`.
 *
 * Two different kinds of number live in this file and must not be confused:
 *
 *   - **The guideline's own rules** — the age caps, the grade floor and its
 *     conversion table, the two application seasons. These are NIIED's, not
 *     ours; they move when the yearly notice moves, and every one of them is
 *     marked below with what it comes from.
 *   - **Our weighting** — how much a TOPIK level or a research paper is worth
 *     out of 100. That is the office's reading of what wins a scholarship, and
 *     it is a judgement, not a published fact. The page says so.
 *
 * Nothing here computes a probability of winning. We do not know one, and a
 * page that showed a percentage would be making a promise the office cannot
 * keep — the score is a *readiness* score, and the wording keeps that line.
 */

/* ---------------------------------------------------------------------- *
 * The vocabulary
 *
 * Declared here rather than imported: `packages/shared` is the web app's copy
 * of these shapes and the API does not depend on it, the same arrangement the
 * planner works under. `types/gks-eligibility.ts` mirrors this file, and the
 * two are kept in step by hand when a value is added.
 * ---------------------------------------------------------------------- */

/** GKS funds degrees. Language prep is inside the award, never the target. */
export type GksDegree = 'BACHELOR' | 'MASTER' | 'PHD';

/** The grading scales the guideline itself names, plus the 100-point one. */
export type GpaScale = '4.0' | '4.3' | '4.5' | '5.0' | '100';

export type EnglishLevel = 'NONE' | 'INTERMEDIATE' | 'ADVANCED';

export type GksStrength =
  | 'TOP_20_PERCENT'
  | 'AWARD'
  | 'RESEARCH'
  | 'WORK'
  | 'VOLUNTEER'
  | 'KOREAN_STUDY'
  | 'DOCS_STARTED';

export type GksBlocker = 'KOREAN_CITIZEN' | 'PREVIOUS_GKS' | 'DEGREE_IN_KOREA' | 'HEALTH';

export type GksFactorKey = 'GPA' | 'TOPIK' | 'ENGLISH' | 'ACHIEVEMENTS' | 'DOCUMENTS';

export type GksReadinessBand = 'STRONG' | 'MODERATE' | 'DEVELOPING';

/**
 * How one part of an application stands, in four words rather than a mark.
 *
 * The weights below still decide which word this is — but the number itself
 * never leaves this file. A person reading "17/30 таны голч" is being graded,
 * and a page that grades somebody who came to it afraid is a page that
 * confirms the fear it exists to answer. The words say the same thing without
 * inviting anyone to add them up.
 */
export type GksFactorLevel = 'FULL' | 'GOOD' | 'PARTIAL' | 'NONE';

/** How much a next step would move things. The ordering, said out loud. */
export type GksImpact = 'HIGH' | 'MEDIUM' | 'LOW';

export interface GksFactor {
  key: GksFactorKey;
  labelMn: string;
  level: GksFactorLevel;
  levelMn: string;
  valueMn: string;
  noteMn: string;
}

export interface GksImprovement {
  factor: GksFactorKey;
  titleMn: string;
  detailMn: string;
  impact: GksImpact;
  impactMn: string;
  effortMn: string | null;
}

export interface GksRound {
  applyFromYear: number;
  applyFromMonth: number;
  applyToYear: number;
  applyToMonth: number;
  entryYear: number;
  entryMonth: number;
  daysToApply: number;
  prepareFromYear: number;
  prepareFromMonth: number;
  isOpenNow: boolean;
  isEstimated: boolean;
}

const DAY_MS = 24 * 60 * 60 * 1000;
const MONTHS_PER_YEAR = 12;

/* ---------------------------------------------------------------------- *
 * Grades
 * ---------------------------------------------------------------------- */

/**
 * The guideline's own passing mark on each scale — 80/100 and its published
 * equivalents. `gksedu.md` §24 question 1 asks the office which scale our
 * clients' transcripts use; the answer here is that we stopped guessing and
 * ask the visitor, which is why `gpaScale` travels with every grade.
 */
export const GPA_FLOOR_BY_SCALE: Record<GpaScale, number> = {
  '4.0': 2.64,
  '4.3': 2.8,
  '4.5': 2.91,
  '5.0': 3.23,
  '100': 80,
};

/** The top of each scale, for the conversion above the floor. */
export const GPA_MAX_BY_SCALE: Record<GpaScale, number> = {
  '4.0': 4,
  '4.3': 4.3,
  '4.5': 4.5,
  '5.0': 5,
  '100': 100,
};

/**
 * A grade on any scale, read onto the 100-point one the floor is stated in.
 *
 * Piecewise linear through the two points the guideline actually publishes:
 * the scale's floor is 80, its maximum is 100. Below the floor it runs down to
 * zero. It is an approximation and only claims to be exact at the one place
 * that decides anything — the 80 line. A transcript is never converted this way
 * for a real application; NIIED reads the university's own certified average.
 */
export function toGpaPercent(gpa: number, scale: GpaScale): number {
  const floor = GPA_FLOOR_BY_SCALE[scale];
  const max = GPA_MAX_BY_SCALE[scale];
  const value = Math.min(Math.max(gpa, 0), max);
  const percent = value >= floor
    ? 80 + ((value - floor) / (max - floor)) * 20
    : (value / floor) * 80;
  return Math.round(percent * 10) / 10;
}

/* ---------------------------------------------------------------------- *
 * The hard rules
 * ---------------------------------------------------------------------- */

/**
 * The age ceiling, in years, on the reference date of each track: under 25 for
 * the undergraduate award, under 40 for the graduate one. (The guideline lifts
 * the graduate cap to 45 for descendants of Korean-war veterans — a case the
 * office handles by hand, and one this page mentions rather than models.)
 */
export const AGE_CAP: Record<GksDegree, number> = { BACHELOR: 25, MASTER: 40, PHD: 40 };

/**
 * Whether an age clears the cap.
 *
 * The cap is measured on 1 March (undergraduate) or 1 September (graduate) of
 * the entry year, which is 13 to 16 months out for somebody checking in
 * November — so it is the age *at entry* that decides, not the age today.
 * Comparing today's age told a 24-year-old they clear the undergraduate cap in
 * a season they would sit at 25 or 26, which is the expensive direction (§3.5).
 *
 * We asked for an age, not a birth date, so only the birthdays that are certain
 * are counted: whole years to entry. The year immediately below the cap is then
 * genuinely undecidable and comes back as `null` rather than guessed — guessing
 * *up* turns away somebody eligible, guessing *down* sends somebody into a
 * season that cannot accept them.
 */
export function checkAge(age: number, degree: GksDegree, monthsToEntry = 0): boolean | null {
  const cap = AGE_CAP[degree];
  const ageAtEntry = age + Math.floor(Math.max(monthsToEntry, 0) / MONTHS_PER_YEAR);
  if (ageAtEntry >= cap) return false;
  if (ageAtEntry === cap - 1) return null;
  return true;
}

/** Whole months from `now` to the round's entry month; never negative. */
export function monthsToEntry(round: Pick<GksRound, 'entryYear' | 'entryMonth'>, now: Date): number {
  const months =
    (round.entryYear - now.getUTCFullYear()) * MONTHS_PER_YEAR + (round.entryMonth - 1 - now.getUTCMonth());
  return Math.max(months, 0);
}

/**
 * The diploma each award is built on top of, and the tier order the check runs
 * in. `VOCATIONAL` sits level with secondary school: an МСҮТ certificate is
 * accepted for the undergraduate award when it completes twelve years of
 * schooling, and whether a particular one does is a document question the
 * office settles from the certificate itself.
 */
export const EDUCATION_TIER: Record<EducationLevel, number> = {
  [EducationLevel.SECONDARY_SCHOOL]: 1,
  [EducationLevel.VOCATIONAL]: 1,
  [EducationLevel.BACHELOR]: 2,
  [EducationLevel.MASTER]: 3,
  [EducationLevel.PHD]: 4,
};

export const REQUIRED_TIER: Record<GksDegree, number> = { BACHELOR: 1, MASTER: 2, PHD: 3 };

/**
 * Does the diploma this person holds — or finishes this year — open this award?
 *
 * Expected graduation counts: the guideline asks for the degree by the entry
 * date, not by the application date, and half of every undergraduate cohort
 * applies from the twelfth grade.
 *
 * Being *over*-qualified closes the undergraduate award and only that one: a
 * person who already holds a bachelor's degree cannot take GKS-U, and the page
 * answers them by pointing at the master's award instead of by saying no.
 */
export function checkEducation(
  education: EducationLevel,
  degree: GksDegree,
): { met: boolean; overqualified: boolean } {
  const tier = EDUCATION_TIER[education];
  const required = REQUIRED_TIER[degree];
  const overqualified = degree === 'BACHELOR' && tier >= EDUCATION_TIER[EducationLevel.BACHELOR];
  return { met: tier >= required && !overqualified, overqualified };
}

/** The award somebody's own diploma actually points at. */
export function degreeForEducation(education: EducationLevel): GksDegree {
  const tier = EDUCATION_TIER[education];
  if (tier >= EDUCATION_TIER[EducationLevel.MASTER]) return 'PHD';
  if (tier >= EDUCATION_TIER[EducationLevel.BACHELOR]) return 'MASTER';
  return 'BACHELOR';
}

/** Which brokerage line the regular half of the dual track would be sold as. */
export const SERVICE_FOR_DEGREE: Record<GksDegree, ServiceType> = {
  BACHELOR: ServiceType.BACHELOR,
  MASTER: ServiceType.MASTER,
  PHD: ServiceType.PHD,
};

/* ---------------------------------------------------------------------- *
 * The readiness score — our weighting, not the guideline's
 * ---------------------------------------------------------------------- */

/**
 * The weights.
 *
 * These are the office's reading of what wins a scholarship, and they are the
 * whole mechanism behind the levels and the ordering below — but they are
 * **not** part of the payload. Nothing outside this file sees a number, which
 * is the point: the weights are a way of ranking advice, not a mark to hand
 * somebody. See ARCHITECTURE.md §3.5.
 */
export const FACTOR_MAX: Record<GksFactorKey, number> = {
  GPA: 30,
  TOPIK: 25,
  ENGLISH: 10,
  ACHIEVEMENTS: 20,
  DOCUMENTS: 15,
};

/**
 * What each TOPIK level is worth.
 *
 * Not a straight line, because the selection is not: level 3 is the first one
 * that lets a department teach you, and 5 is where the language score starts
 * carrying real weight in the review. The two jumps in this ladder are those
 * two doors.
 */
export const TOPIK_POINTS = [0, 3, 6, 12, 17, 22, 25] as const;

export const ENGLISH_POINTS: Record<EnglishLevel, number> = { NONE: 0, INTERMEDIATE: 6, ADVANCED: 10 };

/**
 * What a self-reported strength adds, capped at the factor's own maximum.
 *
 * `TOP_20_PERCENT` weighs nothing on purpose — it is the guideline's
 * alternative to the grade floor and is already read there, and counting it
 * twice would let one fact about a transcript carry a fifth of the ranking.
 */
export const STRENGTH_POINTS: Record<GksStrength, number> = {
  TOP_20_PERCENT: 0,
  AWARD: 7,
  RESEARCH: 7,
  WORK: 4,
  VOLUNTEER: 3,
  KOREAN_STUDY: 3,
  DOCS_STARTED: 0,
};

/** A file the visitor has begun themselves is worth roughly half of a finished one. */
export const DOCS_STARTED_POINTS = 7;

export function scoreGpa(percent: number): number {
  if (percent < 80) return 0;
  const above = Math.min(Math.max((percent - 80) / 15, 0), 1);
  return Math.round(FACTOR_MAX.GPA * (0.35 + 0.65 * above));
}

export function scoreTopik(topik: number): number {
  return TOPIK_POINTS[Math.min(Math.max(Math.trunc(topik), 0), 6)] ?? 0;
}

export function scoreAchievements(strengths: readonly GksStrength[]): number {
  const raw = strengths.reduce((sum, key) => sum + (STRENGTH_POINTS[key] ?? 0), 0);
  return Math.min(raw, FACTOR_MAX.ACHIEVEMENTS);
}

export function scoreDocuments(strengths: readonly GksStrength[]): number {
  return strengths.includes('DOCS_STARTED') ? DOCS_STARTED_POINTS : 0;
}

/**
 * Where an application stands overall, in three stages.
 *
 * Stages, not grades: every one of them is a person who may still apply this
 * season, and the bottom one is named for the work ahead rather than for what
 * is missing. The page's job there is to show the moves that lift somebody out
 * of it — not to talk them out of the year.
 */
export function readinessBand(score: number): GksReadinessBand {
  if (score >= 70) return 'STRONG';
  if (score >= 45) return 'MODERATE';
  return 'DEVELOPING';
}

export const BAND_LABEL: Record<GksReadinessBand, string> = {
  STRONG: 'Өрсөлдөхүйц',
  MODERATE: 'Суурь нь бүрдсэн',
  DEVELOPING: 'Бэлтгэл эхлэх үе',
};

/**
 * A weight, read as one of four words.
 *
 * The thresholds are proportions of the factor's own maximum, so "хүчтэй" means
 * the same thing on a factor worth 10 as on one worth 30.
 */
export function factorLevel(score: number, max: number): GksFactorLevel {
  if (score <= 0) return 'NONE';
  const share = score / max;
  if (share >= 0.85) return 'FULL';
  if (share >= 0.55) return 'GOOD';
  return 'PARTIAL';
}

/**
 * The four words, and why the last one is not "хараахан үгүй": several factors
 * already *say* that in their own value line ("Хараахан эхлээгүй"), and a chip
 * repeating it back reads like a stutter rather than a verdict.
 */
export const FACTOR_LEVEL_LABEL: Record<GksFactorLevel, string> = {
  FULL: 'Хүчтэй',
  GOOD: 'Сайн',
  PARTIAL: 'Дунд',
  NONE: 'Дутуу',
};

/** A move's weight, read as one of three words. */
export function impactOf(points: number): GksImpact {
  if (points >= 12) return 'HIGH';
  if (points >= 6) return 'MEDIUM';
  return 'LOW';
}

export const IMPACT_LABEL: Record<GksImpact, string> = {
  HIGH: 'Хамгийн их нөлөөтэй',
  MEDIUM: 'Их нөлөөтэй',
  LOW: 'Нөлөөтэй',
};

export interface ScoreInput {
  gpaPercent: number;
  topik: number;
  english: EnglishLevel;
  strengths: readonly GksStrength[];
}

/** The weight of every factor, in one place — the input to both the levels and the band. */
export function factorScores(input: ScoreInput): Record<GksFactorKey, number> {
  return {
    GPA: scoreGpa(input.gpaPercent),
    TOPIK: scoreTopik(input.topik),
    ENGLISH: ENGLISH_POINTS[input.english],
    ACHIEVEMENTS: scoreAchievements(input.strengths),
    DOCUMENTS: scoreDocuments(input.strengths),
  };
}

/** How strong the whole application is, for the band alone. Never rendered. */
export function totalScore(input: ScoreInput): number {
  return Object.values(factorScores(input)).reduce((sum, value) => sum + value, 0);
}

export function buildFactors(input: ScoreInput): GksFactor[] {
  const { gpaPercent, topik, english, strengths } = input;
  const scores = factorScores(input);
  const level = (key: GksFactorKey) => factorLevel(scores[key], FACTOR_MAX[key]);
  const row = (key: GksFactorKey) => ({ level: level(key), levelMn: FACTOR_LEVEL_LABEL[level(key)] });

  return [
    {
      key: 'GPA',
      labelMn: 'Голч дүн',
      ...row('GPA'),
      valueMn: `${gpaPercent}/100`,
      noteMn:
        'Шалгуурын доод хязгаар 80 — түүнээс дээш хэсэг нь өрсөлдөөнд шууд нөлөөлнө.',
    },
    {
      key: 'TOPIK',
      labelMn: 'Солонгос хэл',
      ...row('TOPIK'),
      valueMn: topik > 0 ? `TOPIK ${topik}` : 'Хараахан үгүй',
      noteMn:
        'TOPIK шаардлага биш, гэхдээ 3-аас дээш түвшин сургууль, мэргэжлийн сонголтыг өргөжүүлдэг.',
    },
    {
      key: 'ENGLISH',
      labelMn: 'Англи хэл',
      ...row('ENGLISH'),
      valueMn:
        english === 'ADVANCED' ? 'IELTS 6.5+ түвшин' : english === 'INTERMEDIATE' ? 'IELTS 5.5–6.0 түвшин' : 'Хараахан үгүй',
      noteMn: 'Англи хэлээр заадаг хөтөлбөрүүд TOPIK-гүй ч нээлттэй байдаг.',
    },
    {
      key: 'ACHIEVEMENTS',
      labelMn: 'Нэмэлт амжилт',
      ...row('ACHIEVEMENTS'),
      valueMn: achievementSummary(strengths),
      noteMn: 'Шагнал, судалгаа, ажлын туршлага — эсээ, тодорхойлолтыг бодитой болгодог хэсэг.',
    },
    {
      key: 'DOCUMENTS',
      labelMn: 'Материалын бэлтгэл',
      ...row('DOCUMENTS'),
      valueMn: strengths.includes('DOCS_STARTED') ? 'Бичиж эхэлсэн' : 'Хараахан эхлээгүй',
      noteMn:
        'Суралцах төлөвлөгөө, зорилгын захидал, тодорхойлолт — шалгаруулалтын хамгийн их эргэлздэг хэсэг.',
    },
  ];
}

const ACHIEVEMENT_LABELS: Partial<Record<GksStrength, string>> = {
  AWARD: 'шагнал',
  RESEARCH: 'судалгаа',
  WORK: 'ажлын туршлага',
  VOLUNTEER: 'сайн дурын ажил',
  KOREAN_STUDY: 'солонгос хэлний сургалт',
};

function achievementSummary(strengths: readonly GksStrength[]): string {
  const named = strengths.map((key) => ACHIEVEMENT_LABELS[key]).filter(Boolean) as string[];
  if (!named.length) return 'Тэмдэглээгүй';
  return named.join(', ');
}

/* ---------------------------------------------------------------------- *
 * What to do next
 * ---------------------------------------------------------------------- */

/**
 * The moves available to this person, biggest first.
 *
 * Only things they can actually still do: a finished transcript is never on
 * this list, because telling a graduate to raise their average is advice they
 * can do nothing with, and it costs the page the trust the other three cards
 * need.
 *
 * The weight of each move is what orders the list and what names its impact —
 * "хамгийн их нөлөөтэй" rather than "+15". The reader needs to know which move
 * to make first, and that is an ordering, not an arithmetic they should be
 * doing in their head.
 */
export function buildImprovements(input: ScoreInput & { graduating: boolean }): GksImprovement[] {
  const weighted: (Omit<GksImprovement, 'impact' | 'impactMn'> & { points: number })[] = [];
  const { gpaPercent, topik, english, strengths, graduating } = input;
  const out = weighted;

  const docs = scoreDocuments(strengths);
  if (docs < FACTOR_MAX.DOCUMENTS) {
    out.push({
      factor: 'DOCUMENTS',
      titleMn: 'Эсээ, суралцах төлөвлөгөөгөө бэлдэх',
      detailMn:
        'Суралцах төлөвлөгөө, зорилгын захидал, багшийн тодорхойлолт — GKS-ийн шалгаруулалтад хамгийн их жинтэй, зөвлөхтэй хамт хийхэд хамгийн их өөрчлөгддөг хэсэг.',
      points: FACTOR_MAX.DOCUMENTS - docs,
      effortMn: '2–3 сар',
    });
  }

  const topikNow = Math.min(Math.max(Math.trunc(topik), 0), 6);
  const target = topikNow < 3 ? 3 : topikNow < 5 ? 5 : topikNow < 6 ? 6 : null;
  if (target !== null) {
    const levels = target - topikNow;
    out.push({
      factor: 'TOPIK',
      titleMn: `TOPIK ${target} авах`,
      detailMn:
        target === 3
          ? 'TOPIK 3-аас эхлээд солонгос хэлээр заадаг ихэнх хөтөлбөр танд нээгдэнэ.'
          : 'Дээд түвшний TOPIK нь тэтгэлгийн шалгаруулалтад шууд нэмэлт үнэлгээ болдог.',
      points: TOPIK_POINTS[target] - TOPIK_POINTS[topikNow],
      effortMn: `${levels * MONTHS_PER_TOPIK_LEVEL}–${levels * MONTHS_PER_TOPIK_LEVEL + levels} сар`,
    });
  }

  if (english !== 'ADVANCED') {
    const next: EnglishLevel = english === 'NONE' ? 'INTERMEDIATE' : 'ADVANCED';
    out.push({
      factor: 'ENGLISH',
      titleMn: next === 'INTERMEDIATE' ? 'IELTS 5.5–6.0 өгөх' : 'IELTS 6.5-д хүрэх',
      detailMn: 'Англи хэлээр заадаг хөтөлбөрт өгвөл солонгос хэлний түвшин саад болохгүй.',
      points: ENGLISH_POINTS[next] - ENGLISH_POINTS[english],
      effortMn: '2–4 сар',
    });
  }

  const achievements = scoreAchievements(strengths);
  if (achievements < FACTOR_MAX.ACHIEVEMENTS) {
    const missing = (['RESEARCH', 'AWARD', 'WORK', 'VOLUNTEER'] as const).filter(
      (key) => !strengths.includes(key),
    );
    out.push({
      factor: 'ACHIEVEMENTS',
      titleMn: 'Нэмэлт амжилтаа баримтжуулах',
      detailMn: missing.length
        ? `Судалгаа, шагнал, ажлын туршлага, сайн дурын ажил — ${missing.length} чиглэлээр баримт нэмэх боломж танд байна.`
        : 'Одоо байгаа амжилтуудаа гэрчилгээ, тодорхойлолтоор баталгаажуулна.',
      points: Math.min(FACTOR_MAX.ACHIEVEMENTS - achievements, STRENGTH_POINTS.RESEARCH),
      effortMn: '1–6 сар',
    });
  }

  // A transcript that is still open is the one place a grade can still move.
  if (graduating && gpaPercent >= 80 && gpaPercent < 95) {
    out.push({
      factor: 'GPA',
      titleMn: 'Үлдсэн улиралдаа голчоо өсгөх',
      detailMn: 'Голч 80-аас дээш хэсэг бүр өрсөлдөөнд тоологддог — төгсөх хүртэл энэ хөшүүрэг таны гарт байна.',
      points: Math.min(scoreGpa(gpaPercent + 5) - scoreGpa(gpaPercent), FACTOR_MAX.GPA),
      effortMn: '1 хичээлийн жил',
    });
  }

  return weighted
    .filter((row) => row.points > 0)
    .sort((a, b) => b.points - a.points)
    .map(({ points, ...row }) => ({ ...row, impact: impactOf(points), impactMn: IMPACT_LABEL[impactOf(points)] }));
}

/* ---------------------------------------------------------------------- *
 * The calendar
 * ---------------------------------------------------------------------- */

/**
 * The two GKS seasons, as months.
 *
 * The undergraduate award is advertised in September for a March start; the
 * graduate one in February for a September start. Month-level and nothing
 * finer: NIIED publishes the exact days only with each year's notice, and a
 * date invented here would be a date somebody plans a year around. That is why
 * `isEstimated` is true on every round this file returns.
 */
export const GKS_SEASON: Record<GksDegree, { applyFrom: number; applyTo: number; entryMonth: number; entryNextYear: boolean }> = {
  BACHELOR: { applyFrom: 9, applyTo: 10, entryMonth: 3, entryNextYear: true },
  MASTER: { applyFrom: 2, applyTo: 3, entryMonth: 9, entryNextYear: false },
  PHD: { applyFrom: 2, applyTo: 3, entryMonth: 9, entryNextYear: false },
};

/**
 * How long before the window opens a file of this size has to be started.
 *
 * Three months, and it is the same gap `internalDeadline` exists for elsewhere
 * in this system: translation, notarisation, an apostille and two recommendation
 * letters from people who have their own calendars. A person who starts in the
 * month the window opens is already late.
 */
export const PREP_MONTHS = 3;

/** The GKS round this person would be applying to, from a fixed `now`. */
export function nextRound(degree: GksDegree, now: Date): GksRound {
  const season = GKS_SEASON[degree];

  // The round is "next" until its own window has closed, so somebody checking
  // in the middle of October is answered about the round they can still enter.
  let year = now.getUTCFullYear();
  for (let guard = 0; guard < 3; guard += 1) {
    const closes = Date.UTC(year, season.applyTo, 0, 23, 59, 59, 999);
    if (closes >= now.getTime()) break;
    year += 1;
  }

  const opens = new Date(Date.UTC(year, season.applyFrom - 1, 1, 12));
  const prepare = new Date(Date.UTC(year, season.applyFrom - 1 - PREP_MONTHS, 1, 12));

  return {
    applyFromYear: year,
    applyFromMonth: season.applyFrom,
    applyToYear: year,
    applyToMonth: season.applyTo,
    entryYear: season.entryNextYear ? year + 1 : year,
    entryMonth: season.entryMonth,
    daysToApply: Math.ceil((opens.getTime() - now.getTime()) / DAY_MS),
    prepareFromYear: prepare.getUTCFullYear(),
    prepareFromMonth: prepare.getUTCMonth() + 1,
    isOpenNow: now.getTime() >= opens.getTime(),
    isEstimated: true,
  };
}
