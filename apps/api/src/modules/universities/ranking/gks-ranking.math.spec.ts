import { describe, expect, it } from 'vitest';
import {
  DEFAULT_RANKING_WEIGHTS,
  MAX_RANK_BOOST,
  baseComponent,
  blend,
  buildContext,
  partnershipComponent,
  practicalComponent,
  rankAll,
  type RankingInput,
} from './gks-ranking.math.js';

/** A school with nothing filled in — the state 135 of 135 rows start from. */
function blankSchool(overrides: Partial<RankingInput> = {}): RankingInput {
  return {
    id: overrides.id ?? 'a',
    nameMn: overrides.nameMn ?? 'Тест сургууль',
    nameEn: overrides.nameEn ?? 'Test University',
    theKoreaRank: null,
    agentContractStatus: 'NONE',
    isGksEligible: false,
    acceptsLanguagePrep: false,
    acceptsFromMongolia: true,
    mongolianStudents: null,
    savedCount: 0,
    caseCount: 0,
    decidedApplications: 0,
    acceptedApplications: 0,
    minTuitionKrw: null,
    livingCostMonthlyMax: null,
    distanceFromSeoulKm: null,
    hasShortIntro: false,
    hasDetailedIntro: false,
    advantagesCount: 0,
    hasLogo: false,
    programCount: 0,
    intakeCount: 0,
    gksRankBoost: 0,
    ...overrides,
  };
}

/** ARCHITECTURE.md §3.1 — the base component is THE's South Korea rank. */
describe('base component', () => {
  const floor = DEFAULT_RANKING_WEIGHTS.unrankedBaseScore;

  it('gives the top school a perfect 100', () => {
    expect(baseComponent(1, floor)).toBe(100);
  });

  it('lands the last ranked school exactly on the unranked floor', () => {
    expect(baseComponent(40, floor)).toBeCloseTo(floor, 6);
  });

  it('treats "not in the table" as neutral, never as worst', () => {
    // The decision the business made: an unranked school starts level with the
    // 40th, and climbs or sinks on the other four components.
    expect(baseComponent(null, floor)).toBe(floor);
    expect(baseComponent(null, floor)).toBeGreaterThan(0);
  });

  it('is monotonic — a better rank never scores lower', () => {
    for (let rank = 2; rank <= 40; rank += 1) {
      expect(baseComponent(rank - 1, floor)).toBeGreaterThan(baseComponent(rank, floor));
    }
  });
});

describe('partnership component', () => {
  it('ranks a signed contract above talks above nothing', () => {
    expect(partnershipComponent('SIGNED')).toBeGreaterThan(partnershipComponent('IN_TALKS'));
    expect(partnershipComponent('IN_TALKS')).toBeGreaterThan(partnershipComponent('EXPIRED'));
    expect(partnershipComponent('EXPIRED')).toBeGreaterThan(partnershipComponent('NONE'));
  });
});

describe('practical component', () => {
  it('scores an all-null school at the neutral middle, not zero', () => {
    const context = buildContext([blankSchool()]);
    // Cost and distance unknown → 0.5 each; completeness genuinely 0.
    expect(practicalComponent(blankSchool(), context)).toBeCloseTo(30 * 0.5 + 25 * 0.5 + 20 * 0.5, 6);
  });

  it('rewards a school we can actually show', () => {
    const filled = blankSchool({
      hasShortIntro: true,
      hasDetailedIntro: true,
      advantagesCount: 4,
      hasLogo: true,
      programCount: 3,
      intakeCount: 2,
    });
    const context = buildContext([filled, blankSchool({ id: 'b' })]);
    expect(practicalComponent(filled, context)).toBeGreaterThan(practicalComponent(blankSchool(), context));
  });
});

describe('blend', () => {
  const parts = { base: 100, partnership: 0, fit: 0, demand: 0, practical: 0 };

  it('normalises by the weight total, so weights need not sum to 100', () => {
    const half = blend(parts, { ...DEFAULT_RANKING_WEIGHTS, weightBaseRank: 50, weightPartnership: 50, weightFit: 0, weightDemand: 0, weightPractical: 0 }, 0);
    expect(half).toBeCloseTo(50, 6);

    // Same ratio, ten times the numbers — same answer.
    const scaled = blend(parts, { ...DEFAULT_RANKING_WEIGHTS, weightBaseRank: 500, weightPartnership: 500, weightFit: 0, weightDemand: 0, weightPractical: 0 }, 0);
    expect(scaled).toBeCloseTo(half, 6);
  });

  it('clamps the staff boost to its stated range', () => {
    const unboosted = blend(parts, DEFAULT_RANKING_WEIGHTS, 0);
    // A hundred points of boost is still worth only MAX_RANK_BOOST.
    expect(blend(parts, DEFAULT_RANKING_WEIGHTS, MAX_RANK_BOOST * 10)).toBeCloseTo(
      unboosted + MAX_RANK_BOOST,
      6,
    );
    expect(blend(parts, DEFAULT_RANKING_WEIGHTS, MAX_RANK_BOOST)).toBeCloseTo(
      unboosted + MAX_RANK_BOOST,
      6,
    );
  });

  it('keeps the final score inside 0-100', () => {
    const allHigh = { base: 100, partnership: 100, fit: 100, demand: 100, practical: 100 };
    expect(blend(allHigh, DEFAULT_RANKING_WEIGHTS, MAX_RANK_BOOST)).toBe(100);
    expect(blend({ ...parts, base: 0 }, DEFAULT_RANKING_WEIGHTS, -MAX_RANK_BOOST)).toBe(0);
  });

  it('never produces a NaN score from a malformed weight', () => {
    // `gksScore` goes straight into the database, and a null there would
    // unrank the school; a missing weight has to count as zero instead.
    const broken = { ...DEFAULT_RANKING_WEIGHTS, weightBaseRank: undefined as unknown as number };
    const score = blend({ base: 100, partnership: 100, fit: 100, demand: 100, practical: 100 }, broken, 0);
    expect(Number.isFinite(score)).toBe(true);
    expect(score).toBe(100);
  });

  it('falls back to neutral rather than dividing by zero', () => {
    const zeroed = { weightBaseRank: 0, weightPartnership: 0, weightFit: 0, weightDemand: 0, weightPractical: 0, unrankedBaseScore: 45 };
    expect(blend(parts, zeroed, 0)).toBe(50);
  });
});

describe('rankAll', () => {
  it('puts the better school first and hands out dense ranks', () => {
    const seoul = blankSchool({ id: 'snu', nameMn: 'Сөүлийн их сургууль', theKoreaRank: 1 });
    const twinA = blankSchool({ id: 'x', nameMn: 'Аа сургууль' });
    const twinB = blankSchool({ id: 'y', nameMn: 'Яя сургууль' });

    const ranked = rankAll([twinB, seoul, twinA], buildContext([seoul, twinA, twinB]), DEFAULT_RANKING_WEIGHTS);

    expect(ranked.map((row) => row.id)).toEqual(['snu', 'x', 'y']);
    expect(ranked.map((row) => row.rank)).toEqual([1, 2, 2]);
  });

  it('lets a signed contract lift an unranked school over a ranked one', () => {
    // The point of having our own rank: a partner school we can actually place
    // students at outranks a famous school we have no relationship with.
    const famous = blankSchool({ id: 'famous', nameMn: 'Алдартай', theKoreaRank: 12 });
    const partner = blankSchool({
      id: 'partner',
      nameMn: 'Түнш',
      agentContractStatus: 'SIGNED',
      isGksEligible: true,
      acceptsLanguagePrep: true,
      hasShortIntro: true,
      hasLogo: true,
      programCount: 4,
      intakeCount: 2,
    });

    const ranked = rankAll([famous, partner], buildContext([famous, partner]), DEFAULT_RANKING_WEIGHTS);
    expect(ranked[0]!.id).toBe('partner');
  });

  it('is stable — the same input always produces the same order', () => {
    const schools = [
      blankSchool({ id: 'a', nameMn: 'Аа' }),
      blankSchool({ id: 'b', nameMn: 'Бб' }),
      blankSchool({ id: 'c', nameMn: 'Вв' }),
    ];
    const context = buildContext(schools);

    const first = rankAll(schools, context, DEFAULT_RANKING_WEIGHTS).map((row) => row.id);
    const second = rankAll([...schools].reverse(), context, DEFAULT_RANKING_WEIGHTS).map((row) => row.id);
    expect(second).toEqual(first);
  });

  it('does not punish a school for having no application history', () => {
    // Laplace prior: 0 of 0 scores the same as a coin flip, so a brand-new
    // school is not last simply for being new.
    const fresh = blankSchool({ id: 'fresh' });
    const unlucky = blankSchool({ id: 'unlucky', decidedApplications: 10, acceptedApplications: 0 });

    const ranked = rankAll([fresh, unlucky], buildContext([fresh, unlucky]), DEFAULT_RANKING_WEIGHTS);
    expect(ranked[0]!.id).toBe('fresh');
  });
});
