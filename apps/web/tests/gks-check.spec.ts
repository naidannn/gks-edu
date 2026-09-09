import { describe, expect, it } from 'vitest';
import {
  BLOCKER_CHOICES,
  GKS_EDUCATION_CHOICES,
  GPA_FLOOR_HINT,
  GPA_SCALE_OPTIONS,
  STRENGTH_CHOICES,
  educationKey,
  formatMonth,
} from '../app/utils/gks-check';

/**
 * The GKS self-check's question sheet is one half of a contract whose other
 * half is `gks-eligibility.rules.ts` in the API. Nothing type-checks across
 * that line — the API deliberately does not depend on `packages/shared` — so
 * these tests hold the vocabulary in place: a value added on one side and
 * forgotten on the other becomes a 400 on a page a Facebook ad points at.
 */
describe('the question sheet', () => {
  it('offers every scale the API knows a passing mark for', () => {
    for (const option of GPA_SCALE_OPTIONS) {
      expect(GPA_FLOOR_HINT[option.value]).toBeTruthy();
    }
  });

  it('states each scale s floor as the guideline publishes it', () => {
    expect(GPA_FLOOR_HINT['100']).toContain('80');
    expect(GPA_FLOOR_HINT['4.0']).toContain('2.64');
    expect(GPA_FLOOR_HINT['4.3']).toContain('2.80');
    expect(GPA_FLOOR_HINT['4.5']).toContain('2.91');
    expect(GPA_FLOOR_HINT['5.0']).toContain('3.23');
  });

  it('sends the top-fifth tick first, since it is the one that rescues a verdict', () => {
    expect(STRENGTH_CHOICES[0]!.value).toBe('TOP_20_PERCENT');
  });

  it('keeps every choice distinct, so no answer overwrites another', () => {
    const strengths = STRENGTH_CHOICES.map((row) => row.value);
    const blockers = BLOCKER_CHOICES.map((row) => row.value);
    expect(new Set(strengths).size).toBe(strengths.length);
    expect(new Set(blockers).size).toBe(blockers.length);
  });
});

describe('educationKey', () => {
  // The wizard asks one question ("би 12-т сурч байна") and the API takes two
  // fields; this is the round trip between them, and a mismatch silently resets
  // the answer on the way back.
  it('round-trips every choice the wizard offers', () => {
    for (const choice of GKS_EDUCATION_CHOICES) {
      expect(educationKey(choice.education, choice.graduating)).toBe(choice.value);
    }
  });

  it('returns nothing for a pair the wizard never produces', () => {
    expect(educationKey('MASTER', true)).toBe('');
    expect(educationKey('PHD', false)).toBe('');
  });
});

describe('formatMonth', () => {
  it('writes a month the way the rest of the site does', () => {
    expect(formatMonth(2027, 3)).toBe('2027 оны 3-р сар');
  });
});
