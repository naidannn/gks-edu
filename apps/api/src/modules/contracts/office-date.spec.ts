import { describe, expect, it } from 'vitest';
import { formatOfficeDateIso, formatOfficeDateSlash, officeDateParts, officeYearBounds } from './office-date.js';

/**
 * Production runs UTC and the office is UTC+8, so everything below is a
 * contract issued on the evening of 31 December that has to read as the new
 * year on paper (1N-11).
 */
const NEW_YEARS_EVE_EVENING = new Date('2026-12-31T20:00:00.000Z');

describe('office-date — a contract carries the office`s date, not the server`s', () => {
  it('reads 31 December 20:00 UTC as 1 January in Ulaanbaatar', () => {
    expect(officeDateParts(NEW_YEARS_EVE_EVENING)).toEqual({ year: 2027, month: 1, day: 1 });
    expect(formatOfficeDateIso(NEW_YEARS_EVE_EVENING)).toBe('2027-01-01');
    expect(formatOfficeDateSlash(NEW_YEARS_EVE_EVENING)).toBe('2027/01/01');
  });

  it('puts the office year`s boundaries where UTC+8 midnight is', () => {
    const { start, end } = officeYearBounds(2027);

    expect(start.toISOString()).toBe('2026-12-31T16:00:00.000Z');
    expect(end.toISOString()).toBe('2027-12-31T16:00:00.000Z');
    // The contract above falls inside its own year, which is the whole point:
    // its sequence number must not be counted out of 2026.
    expect(NEW_YEARS_EVE_EVENING >= start && NEW_YEARS_EVE_EVENING < end).toBe(true);
  });

  it('leaves a plain daytime instant alone', () => {
    expect(formatOfficeDateIso(new Date('2026-09-02T03:00:00.000Z'))).toBe('2026-09-02');
  });
});
