import { describe, expect, it } from 'vitest';
import { changePercent, officeDateRange, officeDayStart, officeToday, resolvePeriod } from './report-period.js';

/** 2026-09-09, 13:58 UTC — 21:58 the same day in Ulaanbaatar. */
const MIDDAY = new Date('2026-09-09T13:58:00.000Z');

describe('officeToday', () => {
  it('reads the calendar date the office is on, not UTC', () => {
    // 23:30 UTC on the 8th is already 07:30 on the 9th in Ulaanbaatar.
    expect(officeToday(new Date('2026-09-08T23:30:00.000Z'))).toEqual({ year: 2026, month: 9, day: 9 });
  });

  it('does not roll the month early', () => {
    // 15:00 UTC on 31 Aug is 23:00 on 31 Aug locally — still August.
    expect(officeToday(new Date('2026-08-31T15:00:00.000Z'))).toEqual({ year: 2026, month: 8, day: 31 });
    // 16:00 UTC is midnight on 1 Sep locally.
    expect(officeToday(new Date('2026-08-31T16:00:00.000Z'))).toEqual({ year: 2026, month: 9, day: 1 });
  });
});

describe('resolvePeriod', () => {
  it('defaults to the current office month, compared with the previous one', () => {
    expect(resolvePeriod('month', {}, MIDDAY)).toMatchObject({
      from: '2026-09-01',
      to: '2026-10-01',
      previousFrom: '2026-08-01',
      previousTo: '2026-09-01',
      labelMn: '2026 оны 9 сар',
    });
  });

  it('compares a month against the previous month even when their lengths differ', () => {
    // March has 31 days, February 28 — a day-count comparison would start the
    // previous window on 1 February and miss three days of it.
    const period = resolvePeriod('month', {}, new Date('2027-03-15T04:00:00.000Z'));
    expect(period).toMatchObject({ from: '2027-03-01', to: '2027-04-01', previousFrom: '2027-02-01' });
  });

  it('resolves the previous month', () => {
    expect(resolvePeriod('last-month', {}, MIDDAY)).toMatchObject({
      from: '2026-08-01',
      to: '2026-09-01',
      previousFrom: '2026-07-01',
      labelMn: '2026 оны 8 сар',
    });
  });

  it('resolves the calendar quarter the office is in', () => {
    expect(resolvePeriod('quarter', {}, MIDDAY)).toMatchObject({
      from: '2026-07-01',
      to: '2026-10-01',
      previousFrom: '2026-04-01',
      labelMn: '2026 оны 3-р квартал',
    });
  });

  it('resolves the calendar year', () => {
    expect(resolvePeriod('year', {}, MIDDAY)).toMatchObject({
      from: '2026-01-01',
      to: '2027-01-01',
      previousFrom: '2025-01-01',
      labelMn: '2026 он',
    });
  });

  it('includes today in a rolling twelve months', () => {
    expect(resolvePeriod('last-12-months', {}, MIDDAY)).toMatchObject({
      from: '2025-10-01',
      to: '2026-09-10',
    });
  });

  it('treats a custom `to` as the last day the caller means', () => {
    expect(resolvePeriod('custom', { from: '2026-04-15', to: '2026-04-20' }, MIDDAY)).toMatchObject({
      from: '2026-04-15',
      to: '2026-04-21',
      // Six days, so the comparison window is the six before it.
      previousFrom: '2026-04-09',
      previousTo: '2026-04-15',
    });
  });
});

describe('changePercent', () => {
  it('reports the move against the previous window', () => {
    expect(changePercent(118, 100)).toBe(18);
    expect(changePercent(50, 200)).toBe(-75);
  });

  it('refuses to divide by a standing start', () => {
    expect(changePercent(4_000_000, 0)).toBeNull();
  });
});

/**
 * 1N-38 — the CRM list filters used to hand a date-only string straight to
 * `lte`, which is midnight UTC: "up to today" stopped at 08:00 in the office and
 * dropped the rest of the working day. Reports already answered the same
 * question with an office-local half-open range, so the two disagreed about
 * "this week".
 */
describe('officeDayStart', () => {
  it('starts the day when the office clock says midnight, not UTC', () => {
    expect(officeDayStart('2026-09-11').toISOString()).toBe('2026-09-10T16:00:00.000Z');
  });
});

describe('officeDateRange', () => {
  it('is undefined when neither bound was given', () => {
    expect(officeDateRange()).toBeUndefined();
  });

  it('makes `to` the last day the caller means, exclusive at the next midnight', () => {
    const range = officeDateRange('2026-09-01', '2026-09-11');

    expect(range?.gte?.toISOString()).toBe('2026-08-31T16:00:00.000Z');
    // The whole of the 11th is inside the window — 23:59 local is 15:59 UTC.
    expect(range?.lt?.toISOString()).toBe('2026-09-11T16:00:00.000Z');
    expect(new Date('2026-09-11T15:59:00.000Z') < range!.lt!).toBe(true);
  });

  it('takes one bound on its own', () => {
    expect(officeDateRange('2026-09-01')).toEqual({ gte: new Date('2026-08-31T16:00:00.000Z') });
    expect(officeDateRange(undefined, '2026-09-01')).toEqual({ lt: new Date('2026-09-01T16:00:00.000Z') });
  });

  it('passes a full timestamp through — it already says which moment it means', () => {
    const range = officeDateRange('2026-09-01T09:30:00.000Z');
    expect(range?.gte?.toISOString()).toBe('2026-09-01T09:30:00.000Z');
  });
});
