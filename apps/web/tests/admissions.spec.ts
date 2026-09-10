import { describe, expect, it } from 'vitest';
import {
  formatAdmissionDate,
  getAdmissionCountdown,
  getAdmissionProgress,
  getAdmissionStatus,
} from '../app/utils/admissions';

describe('homepage active admissions', () => {
  it('splits the remaining time into countdown units', () => {
    const now = new Date('2026-09-04T03:00:00+08:00').getTime();
    expect(getAdmissionCountdown('2026-09-12T18:32:18+08:00', now)).toMatchObject({
      days: 8,
      hours: 15,
      minutes: 32,
      seconds: 18,
    });
  });

  it.each([
    [22, 'OPEN'],
    [21, 'CLOSING_SOON'],
    [20, 'CLOSING_SOON'],
    [8, 'CLOSING_SOON'],
    [7, 'URGENT'],
    [0, 'URGENT'],
  ] as const)('maps %i remaining days to %s', (days, expected) => {
    expect(getAdmissionStatus(days)).toBe(expected);
  });

  it('clamps progress before and after the application window', () => {
    const start = '2026-09-01T09:00:00+08:00';
    const end = '2026-09-11T09:00:00+08:00';
    expect(getAdmissionProgress(start, end, new Date('2026-08-30T09:00:00+08:00').getTime())).toBe(0);
    expect(getAdmissionProgress(start, end, new Date('2026-09-06T09:00:00+08:00').getTime())).toBe(50);
    expect(getAdmissionProgress(start, end, new Date('2026-09-20T09:00:00+08:00').getTime())).toBe(100);
  });

  it('formats admission dates as month/day', () => {
    expect(formatAdmissionDate('2026-09-05T09:00:00+08:00')).toBe('09/05');
  });

  // A deadline is stamped at the end of its day in UTC; reading it locally in
  // Ulaanbaatar (+08) would print the next day, which is the expensive way to
  // be wrong about a deadline.
  it('reads an end-of-day deadline in UTC, not locally', () => {
    expect(formatAdmissionDate('2026-09-05T23:59:59.999Z')).toBe('09/05');
  });
});
