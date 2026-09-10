import type { PipelineMilestone, ReceivableBucket, ReportMetric, ReportPreset } from '@gks/shared';

/**
 * Labels and pure helpers for the management reports (1M).
 *
 * Everything a report screen computes lives here rather than in a component:
 * the Nuxt test setup cannot mock `$fetch`, so a page is untestable while a
 * plain function is not (see the report tests in `apps/web/tests`).
 */

export const REPORT_PRESET_OPTIONS: { value: ReportPreset; label: string }[] = [
  { value: 'month', label: 'Энэ сар' },
  { value: 'last-month', label: 'Өнгөрсөн сар' },
  { value: 'quarter', label: 'Энэ улирал' },
  { value: 'year', label: 'Энэ он' },
  { value: 'last-12-months', label: 'Сүүлийн 12 сар' },
  { value: 'custom', label: 'Сонгосон хугацаа' },
];

/** The production line, named the way the office names it. */
export const MILESTONE_LABELS: Record<PipelineMilestone, string> = {
  CASE_OPENED: 'Хэрэг нээгдсэн',
  CONTRACT_SIGNED: 'Гэрээ байгуулсан',
  PREPAYMENT_PAID: 'Урьдчилгаа төлсөн',
  DOCUMENTS: 'Материал бүрдүүлж эхэлсэн',
  APPLICATION_SUBMITTED: 'Сургуульд мэдүүлсэн',
  ADMITTED: 'Тэнцсэн',
  INVITATION_RECEIVED: 'Урилга авсан',
  VISA_APPROVED: 'Виз гарсан',
  DEPARTED: 'Солонгос руу явсан',
};

export const RECEIVABLE_BUCKET_LABELS: Record<ReceivableBucket, string> = {
  UPCOMING: 'Хугацаа болоогүй',
  OVERDUE_1_7: '1–7 хоног',
  OVERDUE_8_30: '8–30 хоног',
  OVERDUE_31_60: '31–60 хоног',
  OVERDUE_60_PLUS: '60+ хоног',
};

/** `2026-09` → `2026 оны 9 сар`. Written out because Chrome here has no `mn` locale. */
export function formatReportMonth(month: string): string {
  const [year, monthNumber] = month.split('-');
  return year && monthNumber ? `${year} оны ${Number(monthNumber)} сар` : month;
}

/**
 * How a change against the previous period reads on a tile.
 *
 * `direction` is the arrow; `tone` is deliberately *not* derived from the sign,
 * because for refunds and overdue receivables "up" is bad. The caller says
 * which way is good.
 */
export interface ChangeDisplay {
  text: string;
  direction: 'up' | 'down' | 'flat';
  tone: 'good' | 'bad' | 'neutral';
}

export function describeChange(metric: ReportMetric, higherIsBetter = true): ChangeDisplay {
  const { value, previous, changePercent } = metric;

  // Nothing to compare against: say so rather than inventing a percentage.
  if (changePercent === null) {
    return {
      text: previous === 0 && value === 0 ? 'Өөрчлөлтгүй' : 'Өмнөх үед бүртгэлгүй',
      direction: 'flat',
      tone: 'neutral',
    };
  }

  if (changePercent === 0) return { text: 'Өөрчлөлтгүй', direction: 'flat', tone: 'neutral' };

  const rising = changePercent > 0;
  return {
    text: `${rising ? '+' : '−'}${Math.abs(changePercent)}%`,
    direction: rising ? 'up' : 'down',
    tone: rising === higherIsBetter ? 'good' : 'bad',
  };
}

/** Bar width as a share of the largest value in the set; never divides by zero. */
export function barWidth(value: number, max: number): string {
  return `${max > 0 ? Math.round((Math.max(value, 0) / max) * 100) : 0}%`;
}

/** The largest value in a set, floored at 1 so an all-zero set draws no bars. */
export function barMax(values: number[]): number {
  return Math.max(1, ...values);
}

/**
 * A percentage that may not exist yet. `null` is "—", never "0%": a school we
 * have not heard back from has no success rate, and printing zero would read
 * as one.
 */
export function formatRate(rate: number | null | undefined): string {
  return rate === null || rate === undefined ? '—' : `${rate}%`;
}


/**
 * Query string for `/reports/*` and the CSV export, built from one period so
 * every screen and every download describe the same window.
 */
export interface ReportQuery {
  preset: ReportPreset;
  from?: string;
  to?: string;
  stallDays?: number;
  horizonDays?: number;
}

export function reportQueryString(query: ReportQuery, extra: Record<string, string> = {}): string {
  const params = new URLSearchParams({ preset: query.preset, ...extra });
  // `from`/`to` only mean anything on a custom range; sending them otherwise
  // would suggest the server used them.
  if (query.preset === 'custom') {
    if (query.from) params.set('from', query.from);
    if (query.to) params.set('to', query.to);
  }
  if (query.stallDays) params.set('stallDays', String(query.stallDays));
  if (query.horizonDays) params.set('horizonDays', String(query.horizonDays));
  return params.toString();
}
