import { describe, expect, it } from 'vitest';
import {
  RECEIVABLE_BUCKET_LABELS,
  REPORT_PRESET_OPTIONS,
  barMax,
  barWidth,
  describeChange,
  formatDaysLeft,
  formatRate,
  formatReportMonth,
  reportQueryString,
} from '../app/utils/reports';

/**
 * The report screens are unmockable in this test setup (`$fetch` cannot be
 * stubbed), so everything they decide lives in `utils/reports.ts` and is
 * checked here instead — above all the two things a wrong answer would put in
 * front of a manager as fact: which way a change reads, and a rate that does
 * not exist yet.
 */

const metric = (value: number, previous: number, changePercent: number | null) => ({
  value,
  previous,
  changePercent,
});

describe('describeChange', () => {
  it('reads a rise as good where more is better', () => {
    expect(describeChange(metric(118, 100, 18))).toEqual({ text: '+18%', direction: 'up', tone: 'good' });
  });

  it('reads the same rise as bad where more is worse', () => {
    // Refunds and overdue receivables both go up in the wrong direction.
    expect(describeChange(metric(118, 100, 18), false)).toEqual({ text: '+18%', direction: 'up', tone: 'bad' });
  });

  it('reads a fall as good where less is better', () => {
    expect(describeChange(metric(50, 200, -75), false)).toEqual({ text: '−75%', direction: 'down', tone: 'good' });
  });

  it('says there was nothing to compare rather than inventing a percentage', () => {
    expect(describeChange(metric(4_000_000, 0, null))).toMatchObject({
      text: 'Өмнөх үед бүртгэлгүй',
      tone: 'neutral',
    });
  });

  it('calls a pair of zeroes unchanged, not unrecorded', () => {
    expect(describeChange(metric(0, 0, null)).text).toBe('Өөрчлөлтгүй');
  });
});

describe('formatRate', () => {
  it('shows a rate that does not exist yet as an em dash, never as 0%', () => {
    expect(formatRate(null)).toBe('—');
    expect(formatRate(undefined)).toBe('—');
  });

  it('shows a real zero as zero', () => {
    expect(formatRate(0)).toBe('0%');
    expect(formatRate(62.5)).toBe('62.5%');
  });
});

describe('formatReportMonth', () => {
  it('writes the month out rather than trusting a locale Chrome does not ship', () => {
    expect(formatReportMonth('2026-09')).toBe('2026 оны 9 сар');
    expect(formatReportMonth('2026-12')).toBe('2026 оны 12 сар');
  });

  it('leaves anything it does not recognise alone', () => {
    expect(formatReportMonth('—')).toBe('—');
  });
});

describe('formatDaysLeft', () => {
  it('counts down, and counts past', () => {
    expect(formatDaysLeft(12)).toBe('12 хоног үлдсэн');
    expect(formatDaysLeft(0)).toBe('Өнөөдөр');
    expect(formatDaysLeft(-3)).toBe('3 хоногоор хэтэрсэн');
  });

  it('admits when there is no deadline to count to', () => {
    expect(formatDaysLeft(null)).toBe('Хугацаа тодорхойгүй');
  });
});

describe('bars', () => {
  it('draws nothing when every value is zero', () => {
    expect(barWidth(0, barMax([0, 0]))).toBe('0%');
  });

  it('scales against the largest value in the set', () => {
    const max = barMax([10, 40]);
    expect(barWidth(10, max)).toBe('25%');
    expect(barWidth(40, max)).toBe('100%');
  });
});

describe('reportQueryString', () => {
  it('sends dates only on a custom range, so no preset looks like it used them', () => {
    expect(reportQueryString({ preset: 'month', from: '2026-01-01', to: '2026-02-01' })).toBe('preset=month');
    expect(reportQueryString({ preset: 'custom', from: '2026-01-01', to: '2026-02-01' })).toBe(
      'preset=custom&from=2026-01-01&to=2026-02-01',
    );
  });

  it('carries the thresholds the screen let the user move', () => {
    expect(reportQueryString({ preset: 'month', stallDays: 14, horizonDays: 60 })).toBe(
      'preset=month&stallDays=14&horizonDays=60',
    );
  });

  it('takes extra parameters, which is how the export names its report', () => {
    expect(reportQueryString({ preset: 'quarter' }, { report: 'receivables' })).toContain('report=receivables');
  });
});

describe('the vocabulary', () => {
  it('names every preset the API accepts', () => {
    expect(REPORT_PRESET_OPTIONS.map((option) => option.value)).toEqual([
      'month',
      'last-month',
      'quarter',
      'year',
      'last-12-months',
      'custom',
    ]);
  });

  it('names every aging bucket', () => {
    expect(Object.keys(RECEIVABLE_BUCKET_LABELS)).toHaveLength(5);
  });
});
