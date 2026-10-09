import { describe, expect, it } from 'vitest';
import { resolveFacebookPeriod, windowDays } from './facebook-report-period.js';

// 2026-10-09 01:30 in Ulaanbaatar is still 2026-10-08 in UTC — the office's day wins.
const NOW = new Date('2026-10-08T17:30:00Z');

describe('resolveFacebookPeriod (2F-10)', () => {
  it('today is the office-local day, compared with yesterday', () => {
    const period = resolveFacebookPeriod('today', {}, NOW);
    expect(period).toMatchObject({ from: '2026-10-09', to: '2026-10-10', previousFrom: '2026-10-08', previousTo: '2026-10-09' });
    expect(period.labelMn).toContain('Өнөөдөр');
  });

  it('yesterday compares with the day before', () => {
    expect(resolveFacebookPeriod('yesterday', {}, NOW)).toMatchObject({
      from: '2026-10-08',
      to: '2026-10-09',
      previousFrom: '2026-10-07',
    });
  });

  it('7d ends today inclusive and is seven days long', () => {
    const period = resolveFacebookPeriod('7d', {}, NOW);
    expect(period).toMatchObject({ from: '2026-10-03', to: '2026-10-10', previousFrom: '2026-09-26', previousTo: '2026-10-03' });
    expect(windowDays(period)).toBe(7);
  });

  it('30d crosses a month boundary by calendar days', () => {
    const period = resolveFacebookPeriod('30d', {}, NOW);
    expect(period).toMatchObject({ from: '2026-09-10', to: '2026-10-10' });
    expect(windowDays(period)).toBe(30);
  });

  it('month compares against the previous calendar month', () => {
    expect(resolveFacebookPeriod('month', {}, NOW)).toMatchObject({
      preset: 'month',
      from: '2026-10-01',
      to: '2026-11-01',
      previousFrom: '2026-09-01',
    });
  });

  it('custom takes an inclusive last day', () => {
    const period = resolveFacebookPeriod('custom', { from: '2026-10-01', to: '2026-10-05' }, NOW);
    expect(period).toMatchObject({ from: '2026-10-01', to: '2026-10-06', previousFrom: '2026-09-26' });
  });
});
