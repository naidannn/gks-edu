import { describe, expect, it } from 'vitest';
import {
  NO_DATE,
  formatDate,
  formatLongDate,
  formatNumericDateLocal,
  formatNumericDateUtc,
  formatPaymentDate,
  fromDatetimeLocal,
  monthNameMn,
  todayDateInput,
  toDatetimeLocal,
  weekdayNameMn,
} from '../app/utils/date';

/**
 * Chrome on some machines ships no Mongolian locale data and answers
 * `toLocaleString('mn-MN')` in English without saying so, which is how a page
 * written in Mongolian came to print "Jan 24, 2027". Nothing here asks the
 * platform, so these are assertions about our own table.
 */
describe('Mongolian names', () => {
  it('numbers the months and spells them out', () => {
    expect(monthNameMn(1)).toBe('1-р сар');
    expect(monthNameMn(12)).toBe('12-р сар');
    expect(monthNameMn(1, 'long')).toBe('нэгдүгээр сар');
    expect(monthNameMn(11, 'long')).toBe('арван нэгдүгээр сар');
  });

  it('names the weekdays, Sunday first as `getDay()` counts them', () => {
    expect(weekdayNameMn(0)).toBe('Ням');
    expect(weekdayNameMn(1)).toBe('Даваа');
    expect(weekdayNameMn(1, 'short')).toBe('Да');
  });

  it('writes a date without asking for a locale', () => {
    const at = new Date(2026, 0, 24, 9, 30);
    expect(formatDate(at)).toBe('2026 1-р сар 24');
    expect(formatLongDate(at)).toBe('2026 оны нэгдүгээр сарын 24');
  });

  it('says so when there is no date', () => {
    expect(formatDate(null)).toBe(NO_DATE);
    expect(formatDate('not a date')).toBe(NO_DATE);
    expect(formatNumericDateUtc(undefined)).toBe(NO_DATE);
  });
});

/**
 * The deadline rule: a date stamped at the end of its day in UTC reads as the
 * *next* day east of Greenwich, and for a deadline that is the expensive
 * direction — given two dates people work to the later one.
 */
describe('UTC versus local', () => {
  const endOfDayUtc = '2027-01-24T23:59:59.999Z';

  it('reads an end-of-day deadline in UTC', () => {
    expect(formatNumericDateUtc(endOfDayUtc)).toBe('2027.01.24');
  });

  it('reads a timestamp of something that happened locally', () => {
    const at = new Date(2026, 8, 9, 22, 31);
    expect(formatNumericDateLocal(at)).toBe('2026.09.09');
  });
});

/**
 * `datetime-local` speaks the viewer's wall clock and nothing else. Slicing a
 * UTC string into it and re-serialising with `toISOString()` shifted the
 * instant by the offset on every save, including one that changed nothing.
 */
describe('datetime-local round trip', () => {
  it('returns the instant it was given when nothing was edited', () => {
    const instant = new Date(2026, 5, 14, 7, 45).toISOString();
    expect(fromDatetimeLocal(toDatetimeLocal(instant))).toBe(instant);
  });

  it('writes the local wall clock, not the UTC one', () => {
    const at = new Date(2026, 5, 14, 7, 45);
    expect(toDatetimeLocal(at)).toBe('2026-06-14T07:45');
  });

  it('has nothing to say about an absent value', () => {
    expect(toDatetimeLocal(null)).toBe('');
    expect(fromDatetimeLocal('')).toBeNull();
    expect(fromDatetimeLocal('nonsense')).toBeNull();
  });

  it("dates today by the office's clock, not UTC's", () => {
    const now = new Date();
    const expected = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
    expect(todayDateInput()).toBe(expected);
  });
});

describe('formatPaymentDate', () => {
  it('shows a QPay payment to the minute, read locally', () => {
    const paidAt = new Date(2026, 2, 3, 14, 5).toISOString();
    expect(formatPaymentDate({ method: 'QPAY', paidAt, createdAt: paidAt })).toBe('2026 3-р сар 3 14:05');
  });

  it('shows a hand-registered date in UTC, the way it was stored', () => {
    expect(
      formatPaymentDate({
        method: 'BANK_TRANSFER',
        paidAt: '2026-03-03T00:00:00.000Z',
        createdAt: '2026-03-04T09:00:00.000Z',
      }),
    ).toBe('2026 3-р сар 3');
  });

  it('falls back to when the row was created', () => {
    const createdAt = new Date(2026, 2, 4, 9, 0).toISOString();
    expect(formatPaymentDate({ method: 'BANK_TRANSFER', paidAt: null, createdAt })).toBe('2026 3-р сар 4 09:00');
  });
});
