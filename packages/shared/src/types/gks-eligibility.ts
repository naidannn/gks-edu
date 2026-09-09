/**
 * GKS боломжийн шалгуур — the scholarship self-check (ARCHITECTURE.md §3.5).
 *
 * The page this types exists to answer one fear, and it is the fear that keeps
 * most of our clients from applying at all: *"Засгийн газрын тэтгэлэг гэдэг
 * чинь — би тэнцэхгүй биз дээ."* The honest answer has three parts, and the
 * payload keeps them apart on purpose, because blending them is what produces
 * either false hope or false despair:
 *
 *   1. **`eligibility`** — may this person apply at all? A small set of hard
 *      rules from the GKS guideline (age, degree held, grade floor, citizenship,
 *      a previous GKS). Binary, checkable, and usually *passed*.
 *   2. **`readiness`** — how strong is the application they would file today?
 *      Five parts, each read as one of four words, and one overall stage. There
 *      is deliberately **no number anywhere**: a mark invites the reader to
 *      compare themselves to it instead of acting on the advice beside it, and
 *      the fear this page exists to answer is exactly the fear a mark confirms.
 *      Weights still exist inside the API — they order the advice — and they
 *      never leave it.
 *   3. **`dualTrack`** — what happens if the scholarship does not come through.
 *      This is the business's actual concept (`gksedu.md` §4.3): the scholarship
 *      file and a regular admission file go out in the same season, so a "no"
 *      from NIIED costs a season, not the year.
 *
 * Nothing here is stored. The whole input is the query string, so a result is a
 * link a visitor can reload and a consultant can send back with a change made.
 */

import type { EducationLevel, ServiceType } from '../schemas/lead';

/** GKS funds degrees. Language prep is inside the award, never the target. */
export type GksDegree = 'BACHELOR' | 'MASTER' | 'PHD';

/**
 * The grading scales Mongolian transcripts actually arrive on. The GKS
 * guideline itself names 4.0 / 4.3 / 4.5 / 5.0 and the 100-point scale, and
 * gives the passing mark on each — which is why these five and no others.
 */
export type GpaScale = '4.0' | '4.3' | '4.5' | '5.0' | '100';

/** English evidence, in the three bands an application is actually read in. */
export type EnglishLevel = 'NONE' | 'INTERMEDIATE' | 'ADVANCED';

/**
 * Things that make an application stronger, as a visitor can honestly report
 * them about themselves. `TOP_20_PERCENT` is the odd one out: it is not a
 * strength but the guideline's *alternative* to the grade floor, and it saves
 * the eligibility answer for people whose university grades on a harsh curve.
 */
export type GksStrength =
  | 'TOP_20_PERCENT'
  | 'AWARD'
  | 'RESEARCH'
  | 'WORK'
  | 'VOLUNTEER'
  | 'KOREAN_STUDY'
  | 'DOCS_STARTED';

/** The five conditions that end an application before it starts. */
export type GksBlocker = 'KOREAN_CITIZEN' | 'PREVIOUS_GKS' | 'DEGREE_IN_KOREA' | 'HEALTH';

/** What the visitor told us, normalised — the result echoes it back. */
export interface GksCheckInput {
  degree: GksDegree;
  age: number;
  education: EducationLevel;
  /** Still studying at `education` level and finishing this academic year. */
  graduating: boolean;
  gpa: number;
  gpaScale: GpaScale;
  /** The same 0–6 ladder the planner uses; 0 = no Korean at all. */
  topik: number;
  english: EnglishLevel;
  strengths: GksStrength[];
  blockers: GksBlocker[];
}

/**
 * The verdict on the hard rules.
 *
 *   `PASS`    — every rule we can check is met.
 *   `REVIEW`  — one rule lands on its own boundary (an age that depends on the
 *               visitor's birth date, a grade we cannot convert with certainty).
 *               Not a "no": it is the case a consultant settles in one call.
 *   `BLOCKED` — a rule is failed outright, and no amount of preparation moves it.
 */
export type GksEligibilityVerdict = 'PASS' | 'REVIEW' | 'BLOCKED';

export type GksCriterionKey = 'AGE' | 'EDUCATION' | 'GPA' | 'CITIZENSHIP' | 'PREVIOUS_AWARD' | 'HEALTH';

/** One hard rule, checked. `met: null` is "we cannot tell from what you told us". */
export interface GksCriterion {
  key: GksCriterionKey;
  labelMn: string;
  /** What the guideline asks for, in one line. */
  requirementMn: string;
  /** What the visitor's own answer amounts to against it. */
  valueMn: string;
  met: boolean | null;
  /** Present only when the row is the reason the verdict is not `PASS`. */
  adviceMn: string | null;
}

export type GksFactorKey = 'GPA' | 'TOPIK' | 'ENGLISH' | 'ACHIEVEMENTS' | 'DOCUMENTS';

/** How one part of the application stands — four words, never a mark. */
export type GksFactorLevel = 'FULL' | 'GOOD' | 'PARTIAL' | 'NONE';

/** One part of the application, as the page reads it back. */
export interface GksFactor {
  key: GksFactorKey;
  labelMn: string;
  level: GksFactorLevel;
  /** That level in Mongolian: "Хүчтэй", "Сайн", "Дунд", "Хараахан үгүй". */
  levelMn: string;
  /** Their own answer, worded back at them: "TOPIK 3", "88/100". */
  valueMn: string;
  /** One sentence on why this part matters to the selection. */
  noteMn: string;
}

/** The overall stage. A stage, not a grade — every one of them may apply. */
export type GksReadinessBand = 'STRONG' | 'MODERATE' | 'DEVELOPING';

/** How much a next step would move things. */
export type GksImpact = 'HIGH' | 'MEDIUM' | 'LOW';

/**
 * One concrete thing to do next.
 *
 * Sorted so the first card is always the biggest move available to this
 * person, and the weight behind that order is said in words — "хамгийн их
 * нөлөөтэй" — because what the reader needs is which move to make first, not
 * an arithmetic to do in their head.
 */
export interface GksImprovement {
  factor: GksFactorKey;
  titleMn: string;
  detailMn: string;
  impact: GksImpact;
  impactMn: string;
  /** Realistic time to do it — "3–6 сар". Null when it is not about time. */
  effortMn: string | null;
}

/**
 * The GKS round this person would be applying to.
 *
 * Month-level on purpose. NIIED publishes exact dates only when the year's
 * notice comes out, and the one thing this page must never do is invent a
 * deadline: a person plans around a date they were shown. `isEstimated` is
 * therefore always true today, and stays in the payload so the day the office
 * enters a real notice the UI needs no change.
 */
export interface GksRound {
  /** Application window, as months of the year. */
  applyFromYear: number;
  applyFromMonth: number;
  applyToYear: number;
  applyToMonth: number;
  /** When classes in Korea would start if it goes through. */
  entryYear: number;
  entryMonth: number;
  /** Days until the application window opens; negative once it is open. */
  daysToApply: number;
  /** The month a file this size has to be started in to be ready in time. */
  prepareFromYear: number;
  prepareFromMonth: number;
  /** True while the window is open or already this close. */
  isOpenNow: boolean;
  isEstimated: boolean;
}

/**
 * Which of the two GKS routes fits this person better (`gksedu.md` §4.3).
 *
 * Embassy: three universities, one national quota, and the route most Mongolian
 * applicants take. University: one university, its own quota, and the better
 * odds for somebody whose profile fits one department precisely.
 */
export interface GksTrackAdvice {
  key: 'EMBASSY' | 'UNIVERSITY';
  labelMn: string;
  reasonMn: string;
  /** How many universities this route lets them name. */
  choices: number;
}

/** One priced line of the dual-track plan. */
export interface GksDualTrackLine {
  serviceType: ServiceType;
  labelMn: string;
  /** ₮, from `ServicePricing` — never a constant (`gksedu.md` §5.4). */
  totalAmount: number | null;
  prepaymentAmount: number | null;
  /** When the balance falls due, in words. The order differs by service (§9). */
  balanceWhenMn: string;
}

/**
 * The answer to "тэнцэхгүй бол яах вэ" — the reason this page converts.
 *
 * `noExtraFee` carries the clause from `gksedu.md` §4.3: a scholarship client
 * files the regular admission alongside it without a second brokerage fee. It
 * is a payload field rather than a sentence in the template because it is a
 * business term, and the day it changes it changes here.
 */
export interface GksDualTrack {
  scholarship: GksDualTrackLine;
  regular: GksDualTrackLine;
  noExtraFee: boolean;
}

/** The whole answer. */
export interface GksCheckResult {
  input: GksCheckInput;
  /** GPA converted to the 100-point scale the guideline states its floor on. */
  gpaPercent: number;
  eligibility: {
    verdict: GksEligibilityVerdict;
    /** The headline, already written — one sentence, no hedging. */
    headlineMn: string;
    summaryMn: string;
    criteria: GksCriterion[];
  };
  readiness: {
    band: GksReadinessBand;
    labelMn: string;
    summaryMn: string;
    factors: GksFactor[];
  };
  improvements: GksImprovement[];
  round: GksRound;
  track: GksTrackAdvice;
  dualTrack: GksDualTrack;
  /** Prefilled into the consultation form, so the office reads the profile. */
  consultationNote: string;
  /** The degree this person should actually be checking, when it is not theirs. */
  suggestedDegree: GksDegree | null;
}
