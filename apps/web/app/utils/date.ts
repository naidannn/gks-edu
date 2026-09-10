/**
 * Every date the UI writes out, in one place.
 *
 * Before this file, thirty-odd pages and components each carried their own
 * `formatDate` — same locale, same options, copied. The cost was not the
 * duplication itself but that the copies had quietly diverged: some rendered a
 * missing date as `'—'`, some as `''`, some crashed on an invalid one, and two
 * read their date in UTC while the rest read it locally. A reader could not
 * tell which by looking at the call.
 *
 * The shapes below are the ones the app actually uses; anything genuinely
 * one-off (a relative "3 өдрийн өмнө", a countdown) stays where it is used,
 * because it is presentation logic and not a date format.
 */

/** Anything an API payload hands us for a date, including "we don't have one". */
export type DateLike = string | number | Date | null | undefined;

/** The house placeholder for a date that is absent or unreadable. */
export const NO_DATE = '—';

function parse(value: DateLike): Date | null {
  if (value === null || value === undefined || value === '') return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function render(value: DateLike, options: Intl.DateTimeFormatOptions): string {
  const date = parse(value);
  return date === null ? NO_DATE : date.toLocaleString('mn-MN', options);
}

const DATE = { year: 'numeric', month: 'short', day: 'numeric' } as const;
const LONG_DATE = { year: 'numeric', month: 'long', day: 'numeric' } as const;
const DAY_MONTH = { month: 'short', day: 'numeric' } as const;
const TIME = { hour: '2-digit', minute: '2-digit' } as const;

/** `2026 1-р сар 24` — the default for a table cell or a detail row. */
export function formatDate(value: DateLike): string {
  return render(value, DATE);
}

/** The month spelled out; for prose and for dates a client reads once. */
export function formatLongDate(value: DateLike): string {
  return render(value, LONG_DATE);
}

/** No year — for a queue where everything is within weeks either way. */
export function formatDayMonth(value: DateLike): string {
  return render(value, DAY_MONTH);
}

/** `2026 1-р сар 24 09:30` — when the hour is part of the record. */
export function formatDateTime(value: DateLike): string {
  return render(value, { ...DATE, ...TIME });
}

export function formatLongDateTime(value: DateLike): string {
  return render(value, { ...LONG_DATE, ...TIME });
}

export function formatDayMonthTime(value: DateLike): string {
  return render(value, { ...DAY_MONTH, ...TIME });
}

/** `2026.01.24` — fixed width, for a list where dates line up in a column. */
export function formatNumericDate(value: DateLike): string {
  return render(value, { year: 'numeric', month: '2-digit', day: '2-digit' });
}

/**
 * The same day as {@link formatDate}, read in UTC rather than locally.
 *
 * Two kinds of value need it. A date the API stamped as the end of its day in
 * UTC (`23:59:59Z`) — an intake deadline, a payment confirmed by hand — reads
 * as *the next day* in Ulaanbaatar's +08, and for a deadline that is the
 * expensive direction to be wrong in. Which of the two readings the whole app
 * should adopt is an open question (`ARCHITECTURE.md` §18, task `1J-11`); until
 * it is settled the two live side by side and the call site says which it meant.
 * That is the point of the separate name.
 */
export function formatDateUtc(value: DateLike): string {
  return render(value, { ...DATE, timeZone: 'UTC' });
}

/**
 * `2027.01.24` — the same day as {@link formatDateUtc}, written without asking
 * the platform for a locale.
 *
 * Everything above goes through `toLocaleString('mn-MN')`, which is correct
 * where the runtime carries Mongolian locale data and silently falls back to
 * English ("Jan 24, 2027") where it does not — some Chrome builds ship no `mn`
 * at all. A public page in Mongolian cannot take that chance for a date a
 * client has to work to, so a deadline is written in digits, which read the
 * same in every locale and line up in a column.
 */
export function formatNumericDateUtc(value: DateLike): string {
  const date = parse(value);
  if (date === null) return NO_DATE;
  const pad = (part: number) => String(part).padStart(2, '0');
  return `${date.getUTCFullYear()}.${pad(date.getUTCMonth() + 1)}.${pad(date.getUTCDate())}`;
}

/**
 * `2026.09.09` — the same digits as {@link formatNumericDateUtc}, read in the
 * viewer's own time zone.
 *
 * The two are not interchangeable. A deadline the API stamped at the end of its
 * day in UTC must be read in UTC or it reads a day late; a timestamp that
 * records when something *happened* — a payment fell due, a visa was decided,
 * a report was computed — must be read locally or it reads a day early for
 * anything after 16:00 UTC, which in Ulaanbaatar is most of the working day.
 * Both are written in digits for the same reason: some Chrome builds ship no
 * `mn` locale data and answer in English.
 */
export function formatNumericDateLocal(value: DateLike): string {
  const date = parse(value);
  if (date === null) return NO_DATE;
  const pad = (part: number) => String(part).padStart(2, '0');
  return `${date.getFullYear()}.${pad(date.getMonth() + 1)}.${pad(date.getDate())}`;
}

/** `2026.09.09 22:31` — {@link formatNumericDateLocal} with the clock on it. */
export function formatNumericDateTimeLocal(value: DateLike): string {
  const date = parse(value);
  if (date === null) return NO_DATE;
  const pad = (part: number) => String(part).padStart(2, '0');
  return `${formatNumericDateLocal(date)} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}
