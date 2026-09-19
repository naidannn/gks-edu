import { describe, expect, it } from 'vitest';
import {
  GKS_ROUNDS,
  featuredGksRound,
  getGksRoundPhase,
  gksDaysUntil,
  gksQuickVerdict,
  gksRoundHeadline,
} from '../app/utils/gks-rounds';

const at = (iso: string) => new Date(iso).getTime();
const embassy = GKS_ROUNDS.find((round) => round.id === 'bachelor-embassy-2027')!;
const graduate = GKS_ROUNDS.find((round) => round.id === 'graduate-2027')!;

describe('GKS rounds', () => {
  it('closes the embassy track at 18:00 KST — 17:00 in Ulaanbaatar, not midnight', () => {
    expect(getGksRoundPhase(embassy, at('2026-09-30T16:59:59+08:00'))).toBe('OPEN');
    expect(getGksRoundPhase(embassy, at('2026-09-30T17:00:00+08:00'))).toBe('CLOSED');
  });

  it('is upcoming before 11:00 KST on the opening day', () => {
    expect(getGksRoundPhase(embassy, at('2026-09-15T09:59:00+08:00'))).toBe('UPCOMING');
  });

  it('leads with the open round that has a real countdown', () => {
    expect(featuredGksRound(GKS_ROUNDS, at('2026-09-19T12:00:00+08:00'))?.id).toBe('bachelor-embassy-2027');
    // Once the embassy track has closed, the school track (still open) leads.
    expect(featuredGksRound(GKS_ROUNDS, at('2026-10-05T12:00:00+08:00'))?.id).toBe('bachelor-uic-2027');
    // After every bachelor round, the graduate round that opens next leads.
    expect(featuredGksRound(GKS_ROUNDS, at('2026-12-15T12:00:00+08:00'))?.id).toBe('graduate-2027');
  });

  it('says "now accepting" while open and marks an estimated opening as approximate', () => {
    expect(gksRoundHeadline(embassy, at('2026-09-19T12:00:00+08:00'))).toBe('Одоо бакалаврын элсэлт авч байна');
    expect(gksRoundHeadline(graduate, at('2026-09-19T12:00:00+08:00'))).toMatch(/^Магистр · Доктор — ~\d+ хоногийн дараа/);
  });

  it('rounds the days left down, like the clock beside it', () => {
    expect(gksDaysUntil('2026-09-30T18:00:00+09:00', at('2026-09-29T18:00:00+09:00'))).toBe(1);
    expect(gksDaysUntil('2026-09-30T18:00:00+09:00', at('2026-09-29T18:00:01+09:00'))).toBe(0);
    expect(gksDaysUntil('2026-09-30T18:00:00+09:00', at('2026-10-01T00:00:00+09:00'))).toBe(0);
  });

  it.each([
    ['BACHELOR', 24, 80, 'OK'],
    ['BACHELOR', 25, 90, 'AGE'],
    ['BACHELOR', 18, 79, 'GPA'],
    ['GRADUATE', 39, 85, 'OK'],
    ['GRADUATE', 40, 70, 'BOTH'],
  ] as const)('quick check %s age %i gpa %i → %s', (degree, age, gpa, expected) => {
    expect(gksQuickVerdict(degree, age, gpa)).toBe(expected);
  });
});
