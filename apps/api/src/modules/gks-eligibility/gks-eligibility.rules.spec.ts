import { describe, expect, it } from 'vitest';
import { EducationLevel } from '../../prisma/client.js';
import {
  GPA_FLOOR_BY_SCALE,
  buildImprovements,
  checkAge,
  checkEducation,
  degreeForEducation,
  factorLevel,
  nextRound,
  readinessBand,
  scoreGpa,
  scoreTopik,
  toGpaPercent,
} from './gks-eligibility.rules.js';

describe('toGpaPercent', () => {
  it('reads every scale floor as exactly the guideline s 80', () => {
    for (const [scale, floor] of Object.entries(GPA_FLOOR_BY_SCALE)) {
      expect(toGpaPercent(floor, scale as keyof typeof GPA_FLOOR_BY_SCALE)).toBe(80);
    }
  });

  it('reads the top of every scale as 100', () => {
    expect(toGpaPercent(4, '4.0')).toBe(100);
    expect(toGpaPercent(4.3, '4.3')).toBe(100);
    expect(toGpaPercent(100, '100')).toBe(100);
  });

  it('stays monotone below the floor rather than going negative', () => {
    expect(toGpaPercent(0, '4.0')).toBe(0);
    expect(toGpaPercent(2, '4.0')).toBeGreaterThan(0);
    expect(toGpaPercent(2, '4.0')).toBeLessThan(80);
  });

  it('clamps a grade above the scale instead of scoring over 100', () => {
    expect(toGpaPercent(4.9, '4.0')).toBe(100);
  });
});

describe('checkAge', () => {
  it('passes clearly under the cap and fails at it', () => {
    expect(checkAge(19, 'BACHELOR')).toBe(true);
    expect(checkAge(25, 'BACHELOR')).toBe(false);
    expect(checkAge(41, 'MASTER')).toBe(false);
  });

  // The cap is read on the entry date and we only asked for an age — the year
  // below it genuinely cannot be decided here, and must not be guessed.
  it('returns unknown for the year immediately below the cap', () => {
    expect(checkAge(24, 'BACHELOR')).toBeNull();
    expect(checkAge(39, 'PHD')).toBeNull();
  });
});

describe('checkEducation', () => {
  it('lets a school leaver take the undergraduate award', () => {
    expect(checkEducation(EducationLevel.SECONDARY_SCHOOL, 'BACHELOR')).toEqual({
      met: true,
      overqualified: false,
    });
  });

  it('closes the undergraduate award to somebody who already holds a degree', () => {
    expect(checkEducation(EducationLevel.BACHELOR, 'BACHELOR')).toEqual({ met: false, overqualified: true });
  });

  it('requires the degree below the one applied for', () => {
    expect(checkEducation(EducationLevel.SECONDARY_SCHOOL, 'MASTER').met).toBe(false);
    expect(checkEducation(EducationLevel.BACHELOR, 'MASTER').met).toBe(true);
    expect(checkEducation(EducationLevel.BACHELOR, 'PHD').met).toBe(false);
    expect(checkEducation(EducationLevel.MASTER, 'PHD').met).toBe(true);
  });

  it('points a mismatched visitor at the award their diploma opens', () => {
    expect(degreeForEducation(EducationLevel.BACHELOR)).toBe('MASTER');
    expect(degreeForEducation(EducationLevel.VOCATIONAL)).toBe('BACHELOR');
    expect(degreeForEducation(EducationLevel.MASTER)).toBe('PHD');
  });
});

describe('levels', () => {
  // The weights are internal; what a reader sees is one of four words, and the
  // thresholds are proportions so "хүчтэй" means the same on every factor.
  it('reads a maxed factor as strong and an untouched one as absent', () => {
    expect(factorLevel(30, 30)).toBe('FULL');
    expect(factorLevel(0, 25)).toBe('NONE');
  });

  it('scales the same way on a factor worth 10 as on one worth 30', () => {
    expect(factorLevel(6, 10)).toBe(factorLevel(18, 30));
  });

  it('never calls a real answer nothing', () => {
    expect(factorLevel(3, 25)).toBe('PARTIAL');
  });
});

describe('scoring', () => {
  it('scores nothing for a grade under the floor', () => {
    expect(scoreGpa(79)).toBe(0);
    expect(scoreGpa(80)).toBeGreaterThan(0);
  });

  it('rises with the grade and tops out at the factor maximum', () => {
    expect(scoreGpa(88)).toBeGreaterThan(scoreGpa(82));
    expect(scoreGpa(95)).toBe(30);
    expect(scoreGpa(100)).toBe(30);
  });

  it('jumps at TOPIK 3 and again at 5 — the two doors that matter', () => {
    expect(scoreTopik(3) - scoreTopik(2)).toBeGreaterThan(scoreTopik(2) - scoreTopik(1));
    expect(scoreTopik(0)).toBe(0);
    expect(scoreTopik(6)).toBe(25);
  });

  it('bands the score without ever calling the bottom one a refusal', () => {
    expect(readinessBand(72)).toBe('STRONG');
    expect(readinessBand(50)).toBe('MODERATE');
    expect(readinessBand(20)).toBe('DEVELOPING');
  });
});

describe('buildImprovements', () => {
  const base = { gpaPercent: 85, topik: 0, english: 'NONE' as const, strengths: [], graduating: false };

  const IMPACT_ORDER = { HIGH: 3, MEDIUM: 2, LOW: 1 } as const;

  it('leads with the biggest available move', () => {
    const rows = buildImprovements(base);
    expect(rows.length).toBeGreaterThan(0);
    expect(IMPACT_ORDER[rows[0]!.impact]).toBeGreaterThanOrEqual(IMPACT_ORDER[rows[rows.length - 1]!.impact]);
  });

  // The whole reason the weights exist is to rank advice; the reader is told
  // which move is biggest in words, never in points to add up.
  it('names each move s weight instead of scoring it', () => {
    for (const row of buildImprovements(base)) {
      expect(row.impactMn).toBeTruthy();
      expect(row).not.toHaveProperty('points');
    }
  });

  it('never tells a graduate to raise a transcript they have closed', () => {
    expect(buildImprovements(base).some((row) => row.factor === 'GPA')).toBe(false);
    expect(buildImprovements({ ...base, graduating: true }).some((row) => row.factor === 'GPA')).toBe(true);
  });

  it('drops a factor that is already at its maximum', () => {
    const maxed = buildImprovements({
      ...base,
      topik: 6,
      english: 'ADVANCED',
      strengths: ['AWARD', 'RESEARCH', 'WORK', 'VOLUNTEER', 'KOREAN_STUDY', 'DOCS_STARTED'],
    });
    expect(maxed.some((row) => row.factor === 'TOPIK')).toBe(false);
    expect(maxed.some((row) => row.factor === 'ENGLISH')).toBe(false);
    expect(maxed.some((row) => row.factor === 'ACHIEVEMENTS')).toBe(false);
  });

  it('puts the document package first for somebody who has not started one', () => {
    const rows = buildImprovements(base);
    expect(rows[0]!.factor).toBe('DOCUMENTS');
    expect(rows[0]!.impact).toBe('HIGH');
  });
});

describe('nextRound', () => {
  it('answers the autumn round for an undergraduate asking in June', () => {
    const round = nextRound('BACHELOR', new Date('2026-06-15T00:00:00Z'));
    expect(round.applyFromYear).toBe(2026);
    expect(round.applyFromMonth).toBe(9);
    // The undergraduate award admits in the March after the application.
    expect(round.entryYear).toBe(2027);
    expect(round.entryMonth).toBe(3);
    expect(round.isOpenNow).toBe(false);
    expect(round.daysToApply).toBeGreaterThan(0);
  });

  it('keeps answering the open round while its window is still running', () => {
    const round = nextRound('BACHELOR', new Date('2026-10-05T00:00:00Z'));
    expect(round.applyFromYear).toBe(2026);
    expect(round.isOpenNow).toBe(true);
    expect(round.daysToApply).toBeLessThan(0);
  });

  it('rolls to next year once the window has closed', () => {
    const round = nextRound('BACHELOR', new Date('2026-11-01T00:00:00Z'));
    expect(round.applyFromYear).toBe(2027);
    expect(round.entryYear).toBe(2028);
  });

  it('puts the graduate round in the spring, admitting the same September', () => {
    const round = nextRound('MASTER', new Date('2026-09-08T00:00:00Z'));
    expect(round.applyFromYear).toBe(2027);
    expect(round.applyFromMonth).toBe(2);
    expect(round.entryYear).toBe(2027);
    expect(round.entryMonth).toBe(9);
  });

  it('starts the preparation window three months before the application one', () => {
    const round = nextRound('MASTER', new Date('2026-09-08T00:00:00Z'));
    expect(round.prepareFromYear).toBe(2026);
    expect(round.prepareFromMonth).toBe(11);
  });

  it('never claims a GKS date is confirmed', () => {
    expect(nextRound('PHD', new Date('2026-09-08T00:00:00Z')).isEstimated).toBe(true);
  });
});
