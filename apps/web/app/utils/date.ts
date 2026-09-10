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
 *
 * Nothing here asks the platform for a locale. `toLocaleString('mn-MN')` is
 * correct only where the runtime carries Mongolian date data, and some Chrome
 * builds ship none at all — they answer in English without saying so, which is
 * how a Mongolian page came to print "Jan 24, 2027". The month and weekday
 * names below are the app's own, so every screen reads the same in every
 * browser.
 */

/** Anything an API payload hands us for a date, including "we don't have one". */
export type DateLike = string | number | Date | null | undefined;

/** The house placeholder for a date that is absent or unreadable. */
export const NO_DATE = '—';

/** `1-р сар` … `12-р сар` — how a Mongolian calendar names its months. */
export const MONTHS_SHORT_MN = [
  '1-р сар', '2-р сар', '3-р сар', '4-р сар', '5-р сар', '6-р сар',
  '7-р сар', '8-р сар', '9-р сар', '10-р сар', '11-р сар', '12-р сар',
] as const;

/** The spelled-out month, for prose. Adding `ын` gives the genitive. */
export const MONTHS_LONG_MN = [
  'нэгдүгээр сар', 'хоёрдугаар сар', 'гуравдугаар сар', 'дөрөвдүгээр сар',
  'тавдугаар сар', 'зургаадугаар сар', 'долоодугаар сар', 'наймдугаар сар',
  'есдүгээр сар', 'аравдугаар сар', 'арван нэгдүгээр сар', 'арван хоёрдугаар сар',
] as const;

/** Indexed by `Date#getDay()`, so Sunday first. */
export const WEEKDAYS_LONG_MN = ['Ням', 'Даваа', 'Мягмар', 'Лхагва', 'Пүрэв', 'Баасан', 'Бямба'] as const;

export const WEEKDAYS_SHORT_MN = ['Ня', 'Да', 'Мя', 'Лх', 'Пү', 'Ба', 'Бя'] as const;

/** `month` is 1–12, the way a human writes it, not `getMonth()`'s 0–11. */
export function monthNameMn(month: number, style: 'short' | 'long' = 'short'): string {
  const names = style === 'long' ? MONTHS_LONG_MN : MONTHS_SHORT_MN;
  return names[month - 1] ?? `${month}-р сар`;
}

/** `day` is `Date#getDay()` — 0 is Sunday. */
export function weekdayNameMn(day: number, style: 'short' | 'long' = 'long'): string {
  const names = style === 'long' ? WEEKDAYS_LONG_MN : WEEKDAYS_SHORT_MN;
  return names[day] ?? '';
}

function parse(value: DateLike): Date | null {
  if (value === null || value === undefined || value === '') return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

const pad = (part: number) => String(part).padStart(2, '0');

interface Parts {
  year: number;
  /** 1–12. */
  month: number;
  day: number;
  hour: number;
  minute: number;
}

function partsOf(date: Date, utc: boolean): Parts {
  return utc
    ? {
        year: date.getUTCFullYear(),
        month: date.getUTCMonth() + 1,
        day: date.getUTCDate(),
        hour: date.getUTCHours(),
        minute: date.getUTCMinutes(),
      }
    : {
        year: date.getFullYear(),
        month: date.getMonth() + 1,
        day: date.getDate(),
        hour: date.getHours(),
        minute: date.getMinutes(),
      };
}

type Shape = 'date' | 'longDate' | 'dayMonth' | 'longDayMonth';

function body(parts: Parts, shape: Shape): string {
  switch (shape) {
    case 'longDate':
      return `${parts.year} оны ${monthNameMn(parts.month, 'long')}ын ${parts.day}`;
    case 'dayMonth':
      return `${monthNameMn(parts.month)} ${parts.day}`;
    case 'longDayMonth':
      return `${monthNameMn(parts.month, 'long')}ын ${parts.day}`;
    default:
      return `${parts.year} ${monthNameMn(parts.month)} ${parts.day}`;
  }
}

function render(value: DateLike, shape: Shape, options: { time?: boolean; utc?: boolean } = {}): string {
  const date = parse(value);
  if (date === null) return NO_DATE;
  const parts = partsOf(date, options.utc === true);
  const text = body(parts, shape);
  return options.time === true ? `${text} ${pad(parts.hour)}:${pad(parts.minute)}` : text;
}

/** `2026 1-р сар 24` — the default for a table cell or a detail row. */
export function formatDate(value: DateLike): string {
  return render(value, 'date');
}

/** The month spelled out; for prose and for dates a client reads once. */
export function formatLongDate(value: DateLike): string {
  return render(value, 'longDate');
}

/** No year — for a queue where everything is within weeks either way. */
export function formatDayMonth(value: DateLike): string {
  return render(value, 'dayMonth');
}

/** `2026 1-р сар 24 09:30` — when the hour is part of the record. */
export function formatDateTime(value: DateLike): string {
  return render(value, 'date', { time: true });
}

export function formatLongDateTime(value: DateLike): string {
  return render(value, 'longDate', { time: true });
}

export function formatDayMonthTime(value: DateLike): string {
  return render(value, 'dayMonth', { time: true });
}

/** `нэгдүгээр сарын 24 14:30` — a slot close enough that the year is noise. */
export function formatLongDayMonthTime(value: DateLike): string {
  return render(value, 'longDayMonth', { time: true });
}

/**
 * `2027.01.24` — the same day as {@link formatDateUtc}, in digits.
 *
 * Two kinds of value need the UTC reading. A date the API stamped as the end of
 * its day in UTC (`23:59:59Z`) — an intake deadline above all — reads as *the
 * next day* in Ulaanbaatar's +08, and for a deadline that is the expensive
 * direction to be wrong in: given two dates people work to the later one.
 * Digits rather than words because they line up in a column.
 */
export function formatNumericDateUtc(value: DateLike): string {
  const date = parse(value);
  if (date === null) return NO_DATE;
  const parts = partsOf(date, true);
  return `${parts.year}.${pad(parts.month)}.${pad(parts.day)}`;
}

/**
 * The same day as {@link formatDate}, read in UTC rather than locally — for the
 * rare place that wants a deadline spelled out rather than in digits.
 */
export function formatDateUtc(value: DateLike): string {
  return render(value, 'date', { utc: true });
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
 */
export function formatNumericDateLocal(value: DateLike): string {
  const date = parse(value);
  if (date === null) return NO_DATE;
  const parts = partsOf(date, false);
  return `${parts.year}.${pad(parts.month)}.${pad(parts.day)}`;
}

/** `2026.01.24` — fixed width, for a list where dates line up in a column. */
export function formatNumericDate(value: DateLike): string {
  return formatNumericDateLocal(value);
}

/** `2026.09.09 22:31` — {@link formatNumericDateLocal} with the clock on it. */
export function formatNumericDateTimeLocal(value: DateLike): string {
  const date = parse(value);
  if (date === null) return NO_DATE;
  const parts = partsOf(date, false);
  return `${formatNumericDateLocal(date)} ${pad(parts.hour)}:${pad(parts.minute)}`;
}

/** `14:32` — the clock alone, read locally. */
export function formatTime(value: DateLike): string {
  const date = parse(value);
  if (date === null) return NO_DATE;
  const parts = partsOf(date, false);
  return `${pad(parts.hour)}:${pad(parts.minute)}`;
}

/**
 * When a payment happened, read the way it was recorded (1C-27).
 *
 * A QPay payment happened at a moment we recorded, so it is shown to the
 * minute. A manual registration is a *date* somebody typed — stored as UTC
 * midnight, and so read back in UTC. Formatting it locally would print an
 * 08:00 nobody entered, and west of UTC it would print the day before.
 *
 * Structurally typed rather than tied to a payload shape: the staff list and
 * the client workspace each had their own copy of exactly these two lines.
 */
export function formatPaymentDate(payment: {
  method: string;
  paidAt: string | null;
  createdAt: string;
}): string {
  if (payment.method === 'QPAY' || !payment.paidAt) return formatDateTime(payment.paidAt ?? payment.createdAt);
  return formatDateUtc(payment.paidAt);
}

/* -------------------------------------------------------------------------- *
 * `<input type="date">` and `<input type="datetime-local">`
 *
 * Both inputs speak local wall-clock time and nothing else: the value they hold
 * has no zone, and the browser reads it as the viewer's. Feeding one a UTC
 * wall-clock string (`iso.slice(0, 16)`) and reading it back through
 * `toISOString()` therefore shifts the instant by the viewer's offset every
 * round trip — in Ulaanbaatar, eight hours earlier each time the form is saved,
 * including a save that changed nothing. The pair below converts rather than
 * slices, so a value that was not edited comes back the instant it went in.
 * -------------------------------------------------------------------------- */

/** An instant as the `datetime-local` wall clock that denotes it here. */
export function toDatetimeLocal(value: DateLike): string {
  const date = parse(value);
  if (date === null) return '';
  const p = partsOf(date, false);
  return `${p.year}-${pad(p.month)}-${pad(p.day)}T${pad(p.hour)}:${pad(p.minute)}`;
}

/** The inverse: a `datetime-local` value back to an ISO instant. */
export function fromDatetimeLocal(value: string | null | undefined): string | null {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

/**
 * Today, as the office reckons it, as an `<input type="date">` value.
 *
 * `new Date().toISOString().slice(0, 10)` is yesterday between midnight and
 * 08:00 in Ulaanbaatar, which is exactly when someone recording last night's
 * transfer would find today missing from the picker. (Not to be confused with
 * `intake-form.ts`'s `toDateInput`, which reads in UTC on purpose: an intake
 * date is stamped at the end of its day there.)
 */
export function todayDateInput(): string {
  const p = partsOf(new Date(), false);
  return `${p.year}-${pad(p.month)}-${pad(p.day)}`;
}
