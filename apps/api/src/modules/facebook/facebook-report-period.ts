import { officeTodayIso, resolvePeriod, shiftIsoDay, type ReportPeriod } from '../reports/report-period.js';

/**
 * The windows the Facebook report (2F-10) offers.
 *
 * Day-sized first, unlike the management reports: the Page is watched the way
 * a shop counter is — "how many wrote today, how many left a number" — and a
 * month is the long view, not the default. Every window is still the office's
 * calendar and still carries the window before it, so the same rules as
 * `report-period.ts` hold; this only adds the day presets on top of it.
 */
export const FACEBOOK_REPORT_PRESETS = ['today', 'yesterday', '7d', '30d', 'month', 'last-month', 'custom'] as const;
export type FacebookReportPreset = (typeof FACEBOOK_REPORT_PRESETS)[number];

/** A daily chart past a year stops being a chart. */
export const FACEBOOK_REPORT_MAX_DAYS = 366;

export interface FacebookReportWindow extends Omit<ReportPeriod, 'preset'> {
  preset: FacebookReportPreset;
}

/**
 * `to` in a custom range is the last day the caller means (inclusive), as in
 * every report; the returned `to` is exclusive.
 */
export function resolveFacebookPeriod(
  preset: FacebookReportPreset = 'today',
  range: { from?: string; to?: string } = {},
  now: Date = new Date(),
): FacebookReportWindow {
  const today = officeTodayIso(now);

  const days = (from: string, lastDay: string, labelMn: string): FacebookReportWindow => ({
    ...resolvePeriod('custom', { from, to: lastDay }, now),
    preset,
    labelMn,
  });

  switch (preset) {
    case 'yesterday': {
      const yesterday = shiftIsoDay(today, -1);
      return days(yesterday, yesterday, `Өчигдөр (${yesterday})`);
    }
    case '7d':
      return days(shiftIsoDay(today, -6), today, 'Сүүлийн 7 хоног');
    case '30d':
      return days(shiftIsoDay(today, -29), today, 'Сүүлийн 30 хоног');
    case 'month':
    case 'last-month':
      return { ...resolvePeriod(preset, {}, now), preset };
    case 'custom': {
      const window = resolvePeriod('custom', range, now);
      return { ...window, preset };
    }
    case 'today':
    default:
      return days(today, today, `Өнөөдөр (${today})`);
  }
}

/** Whole days in a half-open window. */
export function windowDays(window: { from: string; to: string }): number {
  const start = Date.parse(`${window.from}T00:00:00Z`);
  const end = Date.parse(`${window.to}T00:00:00Z`);
  return Math.round((end - start) / 86_400_000);
}
