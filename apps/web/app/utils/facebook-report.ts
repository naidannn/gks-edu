import type { FacebookReportPreset, FacebookReportSource } from '@gks/shared';

/**
 * Labels and pure helpers for the Facebook Page report (2F-10) — kept out of
 * the component because the web tests cannot mock `$fetch`, so a plain
 * function is the only thing on that screen a test can reach.
 */

export const FACEBOOK_REPORT_PRESET_OPTIONS: { value: FacebookReportPreset; label: string }[] = [
  { value: 'today', label: 'Өнөөдөр' },
  { value: 'yesterday', label: 'Өчигдөр' },
  { value: '7d', label: 'Сүүлийн 7 хоног' },
  { value: '30d', label: 'Сүүлийн 30 хоног' },
  { value: 'month', label: 'Энэ сар' },
  { value: 'last-month', label: 'Өнгөрсөн сар' },
  { value: 'custom', label: 'Сонгосон хугацаа' },
];

export const FACEBOOK_SOURCE_LABELS: Record<FacebookReportSource, string> = {
  AD: 'Реклам (click-to-Messenger)',
  COMMENT: 'Постны сэтгэгдлээс',
  LINK: 'Холбоос / QR (m.me)',
  DIRECT: 'Page-ээс шууд бичсэн',
};

/** What the tile compares against, in words — "өчигдөр", not a date range. */
export function facebookPreviousLabel(preset: FacebookReportPreset): string {
  switch (preset) {
    case 'today':
      return 'өчигдөр';
    case 'yesterday':
      return 'уржигдар';
    case '7d':
      return 'өмнөх 7 хоног';
    case '30d':
      return 'өмнөх 30 хоног';
    case 'month':
    case 'last-month':
      return 'өмнөх сар';
    default:
      return 'өмнөх ижил хугацаа';
  }
}

export function facebookReportQuery(preset: FacebookReportPreset, from: string, to: string): string {
  const params = new URLSearchParams({ preset });
  if (preset === 'custom') {
    if (from) params.set('from', from);
    if (to) params.set('to', to);
  }
  return params.toString();
}

/**
 * A reply time as people say it. The assistant answers in seconds and a person
 * in minutes or hours, so one unit cannot carry both.
 */
export function formatReplyMinutes(minutes: number | null | undefined): string {
  if (minutes === null || minutes === undefined) return '—';
  if (minutes < 1) return `${Math.max(1, Math.round(minutes * 60))} сек`;
  if (minutes < 60) return `${Math.round(minutes)} мин`;
  const hours = Math.floor(minutes / 60);
  const rest = Math.round(minutes - hours * 60);
  return rest ? `${hours} цаг ${rest} мин` : `${hours} цаг`;
}

const WEEKDAYS = ['Ня', 'Да', 'Мя', 'Лх', 'Пү', 'Ба', 'Бя'];

/** `2026-10-09` → `10/09 Ба`. Read as a calendar date — no time zone can move it. */
export function formatReportDay(day: string): string {
  const [year, month, date] = day.split('-').map(Number);
  if (!year || !month || !date) return day;
  const weekday = WEEKDAYS[new Date(Date.UTC(year, month - 1, date)).getUTCDay()];
  return `${String(month).padStart(2, '0')}/${String(date).padStart(2, '0')} ${weekday}`;
}

/** The busiest office hours, most messages first, as `14:00–15:00` ranges. Empty hours never make the list. */
export function busiestHours(hours: number[], limit = 3): { hour: number; label: string; count: number }[] {
  return hours
    .map((count, hour) => ({ hour, count, label: `${String(hour).padStart(2, '0')}:00–${String((hour + 1) % 24).padStart(2, '0')}:00` }))
    .filter((row) => row.count > 0)
    .sort((a, b) => b.count - a.count || a.hour - b.hour)
    .slice(0, limit);
}

/**
 * Dollars at the precision AI spend needs: one answer costs a fraction of a
 * cent, so below a dollar four decimals, above it two. (2F-11)
 */
export function formatUsd(value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return '—';
  if (value === 0) return '$0';
  return `$${value.toFixed(Math.abs(value) < 1 ? 4 : 2)}`;
}

/** Token counts the way the providers' consoles print them: `2.07M`, `45.8K`, `912`. */
export function formatTokens(value: number): string {
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(2)}M`;
  if (value >= 1_000) return `${(value / 1_000).toFixed(1)}K`;
  return String(value);
}

/** A model id as the office reads it: `deepseek-flash:nothink` → `DeepSeek Flash (thinking-гүй)`. */
export function aiModelLabel(model: string): string {
  const [base = model, mode] = model.split(':');
  const name = base
    .split('-')
    .map((part) => (part === 'deepseek' ? 'DeepSeek' : part === 'lite' ? 'Lite' : part.charAt(0).toUpperCase() + part.slice(1)))
    .join(' ')
    .replace(/ Lite$/, '-Lite');
  const modes: Record<string, string> = { nothink: 'thinking-гүй', low: 'бага thinking' };
  return mode ? `${name} (${modes[mode] ?? mode})` : name;
}
