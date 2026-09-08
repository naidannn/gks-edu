import { describe, expect, it } from 'vitest';
import { reminderOffsetFor } from './reminder-ladder.js';

/**
 * The regression this guards: every ladder in `reminder-sweeps.service.ts` was
 * `OFFSETS.find((c) => daysLeft <= c)` over a descending list, which always
 * matched the *widest* rung. Because the rung is the dedupe key, that turned
 * "a week out, three days out, the day before" into one reminder a week out —
 * across documents, payments, visa appointments, visa renewals and departures.
 */
describe('reminderOffsetFor', () => {
  const DOCUMENTS = [7, 3, 1];

  it('returns the tightest rung reached, not the widest one that matches', () => {
    expect(reminderOffsetFor(DOCUMENTS, 7)).toBe(7);
    expect(reminderOffsetFor(DOCUMENTS, 5)).toBe(7);
    expect(reminderOffsetFor(DOCUMENTS, 3)).toBe(3);
    expect(reminderOffsetFor(DOCUMENTS, 2)).toBe(3);
    expect(reminderOffsetFor(DOCUMENTS, 1)).toBe(1);
  });

  it('walks the whole ladder as the days count down — one reminder per rung', () => {
    const rungs = [10, 7, 6, 4, 3, 2, 1].map((daysLeft) => reminderOffsetFor(DOCUMENTS, daysLeft));
    // undefined until the first rung is reached, then each rung appears, and a
    // repeat of the same rung is what the dedupe key silences.
    expect(rungs).toEqual([undefined, 7, 7, 7, 3, 3, 1]);
    expect(new Set(rungs.filter((rung) => rung !== undefined))).toEqual(new Set([7, 3, 1]));
  });

  it('stays silent while the deadline is further out than the widest rung', () => {
    expect(reminderOffsetFor(DOCUMENTS, 8)).toBeUndefined();
    expect(reminderOffsetFor([30, 14], 31)).toBeUndefined();
  });

  it('holds a past deadline on the tightest rung rather than nagging nightly', () => {
    expect(reminderOffsetFor(DOCUMENTS, 0)).toBe(1);
    expect(reminderOffsetFor(DOCUMENTS, -9)).toBe(1);
    // A payment ladder carries a rung for the day itself, so being late maps
    // there instead.
    expect(reminderOffsetFor([3, 0], 0)).toBe(0);
    expect(reminderOffsetFor([3, 0], -9)).toBe(0);
  });

  it('does not depend on the order the ladder is written in', () => {
    expect(reminderOffsetFor([1, 3, 7], 3)).toBe(3);
    expect(reminderOffsetFor([3, 7, 1], 3)).toBe(3);
    expect(reminderOffsetFor([7, 3, 1], 3)).toBe(3);
  });

  it('leaves the caller`s array alone', () => {
    const offsets = [7, 3, 1];
    reminderOffsetFor(offsets, 2);
    expect(offsets).toEqual([7, 3, 1]);
  });

  it('handles a one-rung ladder and an empty one', () => {
    expect(reminderOffsetFor([1], 1)).toBe(1);
    expect(reminderOffsetFor([1], 2)).toBeUndefined();
    expect(reminderOffsetFor([], 1)).toBeUndefined();
  });
});
