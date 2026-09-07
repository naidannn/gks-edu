/**
 * The arithmetic behind `gksRank` (ARCHITECTURE.md §3.1).
 *
 * Kept free of Nest and Prisma so it can be unit-tested on plain objects and
 * so the rules stay readable as rules: five components, each scored 0–100 on
 * its own terms, then blended by the weights the office configures.
 *
 * Two invariants worth stating out loud:
 *
 *  1. **Unknown is never worst.** A missing number scores the neutral middle of
 *     its component, not zero. The catalogue is full of nulls by design
 *     (dormitory prices, international-student counts), and a school must not
 *     sink because nobody has typed its tuition in yet.
 *  2. **Nothing here reads `isPublished`.** Draft schools are scored too — the
 *     admin preview is the reason the ranking is worth tuning before launch.
 */
import type { AgentContractStatus, GksRankingMode } from '../../../prisma/client.js';
import { THE_KOREA_RANK_FLOOR } from './the-korea-ranking.js';

/** The five weights plus the one tunable constant, as stored in `GksRankingConfig`. */
export interface RankingWeights {
  weightBaseRank: number;
  weightPartnership: number;
  weightFit: number;
  weightDemand: number;
  weightPractical: number;
  unrankedBaseScore: number;
}

export const DEFAULT_RANKING_WEIGHTS: RankingWeights = {
  weightBaseRank: 40,
  weightPartnership: 20,
  weightFit: 15,
  weightDemand: 15,
  weightPractical: 10,
  unrankedBaseScore: 45,
};

/** Everything one school contributes to its own score. */
export interface RankingInput {
  id: string;
  nameMn: string;
  nameEn: string;
  theKoreaRank: number | null;
  agentContractStatus: AgentContractStatus;
  isGksEligible: boolean;
  acceptsLanguagePrep: boolean;
  acceptsFromMongolia: boolean;
  mongolianStudents: number | null;
  savedCount: number;
  caseCount: number;
  /** Applications that reached a decision — the denominator of the pass rate. */
  decidedApplications: number;
  acceptedApplications: number;
  /** Cheapest published yearly tuition across the school's programmes, in KRW. */
  minTuitionKrw: number | null;
  /** Upper end of the monthly living-cost estimate, in KRW. */
  livingCostMonthlyMax: number | null;
  distanceFromSeoulKm: number | null;
  hasShortIntro: boolean;
  hasDetailedIntro: boolean;
  advantagesCount: number;
  hasLogo: boolean;
  programCount: number;
  intakeCount: number;
  gksRankBoost: number;
  /** The position a human typed, or null. Read only in MANUAL mode. */
  gksManualRank: number | null;
}

/** Dataset-wide extremes, so the relative components compare like with like. */
export interface RankingContext {
  maxSaved: number;
  maxCases: number;
  maxMongolianStudents: number;
  minTuitionKrw: number | null;
  maxTuitionKrw: number | null;
  minLivingCostKrw: number | null;
  maxLivingCostKrw: number | null;
}

export interface ScoreParts {
  base: number;
  partnership: number;
  fit: number;
  demand: number;
  practical: number;
}

export interface ScoredUniversity {
  id: string;
  nameMn: string;
  nameEn: string;
  score: number;
  parts: ScoreParts;
  boost: number;
  /** What staff typed, echoed back so the admin list can show hand vs formula. */
  manualRank: number | null;
  theKoreaRank: number | null;
  rank: number;
}

/** Staff may nudge a school by at most this many score points, either way. */
export const MAX_RANK_BOOST = 25;

/** Beyond this the "close to Seoul" component bottoms out — Jeju is 450 km off. */
const FAR_FROM_SEOUL_KM = 400;

/**
 * Laplace prior on the acceptance rate: one imaginary pass out of two imaginary
 * decisions. A school with no history scores 0.5, not 0 — and one that is 1-for-1
 * does not outrank one that is 40-for-45.
 */
const PASS_RATE_PRIOR_ACCEPTED = 1;
const PASS_RATE_PRIOR_DECIDED = 2;

const NEUTRAL = 50;

const clamp = (value: number, min = 0, max = 100): number =>
  Math.min(max, Math.max(min, value));

/**
 * A weight, made safe to multiply by. A missing or malformed weight counts as
 * zero rather than poisoning the whole score with NaN — `gksScore` is written
 * straight to the database, and a null there would silently unrank a school.
 */
const weightOf = (value: number): number => (Number.isFinite(value) ? Math.max(0, value) : 0);

/**
 * Counts compress logarithmically: the tenth saved shortlist says far less than
 * the first. Returns 0–1 against the dataset's own maximum.
 */
function logShare(value: number, max: number): number {
  if (max <= 0 || value <= 0) return 0;
  return Math.min(1, Math.log1p(value) / Math.log1p(max));
}

/** 0–1 where *lower is better* — cheaper, closer. Neutral when the range is unusable. */
function inverseShare(value: number | null, min: number | null, max: number | null): number {
  if (value === null || min === null || max === null || max <= min) return 0.5;
  return clamp((max - value) / (max - min), 0, 1);
}

/** Component 1 — the outside opinion: THE's South Korea rank. */
export function baseComponent(theKoreaRank: number | null, unrankedBaseScore: number): number {
  const floor = clamp(unrankedBaseScore, 0, 100);
  if (theKoreaRank === null) return floor;

  const span = Math.max(1, THE_KOREA_RANK_FLOOR - 1);
  const position = Math.min(theKoreaRank, THE_KOREA_RANK_FLOOR) - 1;
  return clamp(100 - (position / span) * (100 - floor), floor, 100);
}

/** Component 2 — what the school is worth to the brokerage. */
export function partnershipComponent(status: AgentContractStatus): number {
  switch (status) {
    case 'SIGNED':
      return 100;
    case 'IN_TALKS':
      return 60;
    case 'EXPIRED':
      return 25;
    default:
      return 10;
  }
}

/** Component 3 — how well the school fits a Mongolian applicant. */
export function fitComponent(input: RankingInput, context: RankingContext): number {
  let score = 0;
  if (input.isGksEligible) score += 35;
  if (input.acceptsLanguagePrep) score += 30;
  if (input.acceptsFromMongolia) score += 20;
  score += 15 * logShare(input.mongolianStudents ?? 0, context.maxMongolianStudents);
  return clamp(score);
}

/** Component 4 — what our own users and our own case history say. */
export function demandComponent(input: RankingInput, context: RankingContext): number {
  const passRate =
    (input.acceptedApplications + PASS_RATE_PRIOR_ACCEPTED) /
    (input.decidedApplications + PASS_RATE_PRIOR_DECIDED);

  return clamp(
    40 * logShare(input.savedCount, context.maxSaved) +
      35 * logShare(input.caseCount, context.maxCases) +
      25 * clamp(passRate, 0, 1),
  );
}

/** Component 5 — cost, distance, and whether we have anything to show. */
export function practicalComponent(input: RankingInput, context: RankingContext): number {
  const affordability = inverseShare(input.minTuitionKrw, context.minTuitionKrw, context.maxTuitionKrw);
  const living = inverseShare(input.livingCostMonthlyMax, context.minLivingCostKrw, context.maxLivingCostKrw);

  const proximity =
    input.distanceFromSeoulKm === null
      ? 0.5
      : clamp(1 - input.distanceFromSeoulKm / FAR_FROM_SEOUL_KM, 0, 1);

  // A card with no intro, no logo and no programmes cannot sensibly lead the
  // catalogue however good the school is — this is the one component that
  // measures us rather than them.
  const completeness =
    ((input.hasShortIntro ? 1 : 0) +
      (input.hasDetailedIntro ? 1 : 0) +
      (input.advantagesCount > 0 ? 1 : 0) +
      (input.hasLogo ? 1 : 0) +
      (input.programCount > 0 ? 1 : 0) +
      (input.intakeCount > 0 ? 1 : 0)) /
    6;

  return clamp(30 * affordability + 25 * living + 20 * proximity + 25 * completeness);
}

export function scoreParts(input: RankingInput, context: RankingContext, weights: RankingWeights): ScoreParts {
  return {
    base: baseComponent(input.theKoreaRank, weights.unrankedBaseScore),
    partnership: partnershipComponent(input.agentContractStatus),
    fit: fitComponent(input, context),
    demand: demandComponent(input, context),
    practical: practicalComponent(input, context),
  };
}

/**
 * Blends the parts by weight and applies the staff boost. Weights need not sum
 * to 100 — they are normalised by their own total, so the office can raise one
 * without having to rebalance the rest by hand. All-zero weights fall back to
 * the neutral middle rather than dividing by zero.
 */
export function blend(parts: ScoreParts, weights: RankingWeights, boost: number): number {
  const pairs: [number, number][] = [
    [parts.base, weights.weightBaseRank],
    [parts.partnership, weights.weightPartnership],
    [parts.fit, weights.weightFit],
    [parts.demand, weights.weightDemand],
    [parts.practical, weights.weightPractical],
  ];

  const total = pairs.reduce((sum, [, weight]) => sum + weightOf(weight), 0);
  const weighted = total === 0
    ? NEUTRAL
    : pairs.reduce((sum, [value, weight]) => sum + clamp(value) * weightOf(weight), 0) / total;

  const nudge = Number.isFinite(boost) ? clamp(boost, -MAX_RANK_BOOST, MAX_RANK_BOOST) : 0;
  return clamp(weighted + nudge);
}

/**
 * Scores every school and hands back the order the catalogue will be shown in.
 *
 * `mode` decides what that order means (ARCHITECTURE.md §3.1):
 *
 *  - `AUTO` — the score alone, as a **dense** ranking (1, 2, 2, 3): two schools
 *    that genuinely tie should read as tied, and the secondary sort by name
 *    keeps the page order stable anyway. Scores are rounded to two decimals
 *    *before* the comparison so a tie is a real tie and not a float artefact.
 *  - `MANUAL` — the numbers staff typed lead, in that order, and the score is
 *    left to place whatever nobody has numbered yet, below them. Positions are
 *    1…n with no ties here: the office put these schools in an order on
 *    purpose, and sharing a number would quietly undo half of it.
 *
 * Every school is scored either way. The score is what the admin screen shows
 * as the reason a school sits where it does, and in MANUAL mode it is still
 * the only thing placing a school nobody has got to yet.
 */
export function rankAll(
  inputs: RankingInput[],
  context: RankingContext,
  weights: RankingWeights,
  mode: GksRankingMode = 'AUTO',
): ScoredUniversity[] {
  const scored = inputs.map((input) => {
    const parts = scoreParts(input, context, weights);
    return {
      id: input.id,
      nameMn: input.nameMn,
      nameEn: input.nameEn,
      score: Math.round(blend(parts, weights, input.gksRankBoost) * 100) / 100,
      parts,
      boost: input.gksRankBoost,
      manualRank: normaliseManualRank(input.gksManualRank),
      theKoreaRank: input.theKoreaRank,
      rank: 0,
    } satisfies ScoredUniversity;
  });

  return mode === 'MANUAL' ? rankByHand(scored) : rankByScore(scored);
}

/** A position is a whole number ≥ 1; anything else means "not numbered". */
function normaliseManualRank(value: number | null): number | null {
  if (value === null || !Number.isFinite(value)) return null;
  const rounded = Math.round(value);
  return rounded >= 1 ? rounded : null;
}

/**
 * Best score first. Ties fall back to the outside rank and then the name, so
 * two runs over unchanged data always produce the same list.
 */
function byScoreDesc(a: ScoredUniversity, b: ScoredUniversity): number {
  if (b.score !== a.score) return b.score - a.score;
  const aRank = a.theKoreaRank ?? Number.MAX_SAFE_INTEGER;
  const bRank = b.theKoreaRank ?? Number.MAX_SAFE_INTEGER;
  if (aRank !== bRank) return aRank - bRank;
  return a.nameMn.localeCompare(b.nameMn, 'mn');
}

/** AUTO: dense ranking over the score. */
function rankByScore(scored: ScoredUniversity[]): ScoredUniversity[] {
  scored.sort(byScoreDesc);

  let rank = 0;
  let previousScore = Number.NaN;
  for (const row of scored) {
    if (row.score !== previousScore) {
      rank += 1;
      previousScore = row.score;
    }
    row.rank = rank;
  }

  return scored;
}

/**
 * MANUAL: the numbered schools in the order they were numbered, then the rest
 * by score. Two schools left on the same number — the price of letting one be
 * typed straight into the edit form — are separated by their score, so the
 * order is still deterministic and the office can tidy the numbers later.
 */
function rankByHand(scored: ScoredUniversity[]): ScoredUniversity[] {
  const numbered = scored.filter((row) => row.manualRank !== null);
  const rest = scored.filter((row) => row.manualRank === null);

  numbered.sort((a, b) => (a.manualRank! - b.manualRank!) || byScoreDesc(a, b));
  rest.sort(byScoreDesc);

  const ordered = [...numbered, ...rest];
  ordered.forEach((row, index) => {
    row.rank = index + 1;
  });

  // The caller hands the array straight to the writer, so keep it one array.
  scored.length = 0;
  scored.push(...ordered);
  return scored;
}

/** Dataset extremes, derived from the same rows that are about to be scored. */
export function buildContext(inputs: RankingInput[]): RankingContext {
  const tuitions = inputs.map((i) => i.minTuitionKrw).filter((v): v is number => v !== null && v > 0);
  const living = inputs.map((i) => i.livingCostMonthlyMax).filter((v): v is number => v !== null && v > 0);

  return {
    maxSaved: Math.max(0, ...inputs.map((i) => i.savedCount)),
    maxCases: Math.max(0, ...inputs.map((i) => i.caseCount)),
    maxMongolianStudents: Math.max(0, ...inputs.map((i) => i.mongolianStudents ?? 0)),
    minTuitionKrw: tuitions.length ? Math.min(...tuitions) : null,
    maxTuitionKrw: tuitions.length ? Math.max(...tuitions) : null,
    minLivingCostKrw: living.length ? Math.min(...living) : null,
    maxLivingCostKrw: living.length ? Math.max(...living) : null,
  };
}
