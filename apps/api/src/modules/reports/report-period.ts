/**
 * The reporting period, and the office's calendar.
 *
 * Every flow figure in a report answers "хэдэн төгрөг, хэдэн хэрэг — ХЭЗЭЭ",
 * so a period is not optional decoration: without one, "нийт орлого" is a
 * number nobody can act on. Two rules make the periods trustworthy:
 *
 * 1. **The month is the office's month, not UTC's.** Ulaanbaatar is +08 all
 *    year (Mongolia dropped DST in 2017), so a payment taken at 09:00 on the
 *    1st is 01:00 UTC the same day — but one taken at 02:00 on the 1st is
 *    18:00 UTC on the *last day of the previous month*. Bucketing on the raw
 *    UTC timestamp therefore posts the first and last hours of every month to
 *    the wrong month. Boundaries are built from a local calendar date here and
 *    handed to Postgres as `AT TIME ZONE`, so the split is the office's.
 * 2. **Every period carries the one before it**, of equal length and ending
 *    where it begins. "3.4 сая₮" means nothing; "3.4 сая₮, өнгөрсөн сараас
 *    18% дээш" is a decision.
 */

/** Mongolia keeps +08 year-round; named rather than hard-coded as an offset. */
export const OFFICE_TIME_ZONE = 'Asia/Ulaanbaatar';

/** What the caller may ask for. `custom` reads `from`/`to`. */
export const REPORT_PRESETS = ['month', 'last-month', 'quarter', 'year', 'last-12-months', 'custom'] as const;
export type ReportPreset = (typeof REPORT_PRESETS)[number];

/**
 * A period, as office-local calendar dates. `from` is inclusive, `to`
 * **exclusive** — a half-open range is the only shape that never double-counts
 * a payment on a boundary midnight, and it makes "one month" and "one year"
 * the same expression.
 */
export interface ReportPeriod {
  preset: ReportPreset;
  /** `YYYY-MM-DD`, office-local, inclusive. */
  from: string;
  /** `YYYY-MM-DD`, office-local, exclusive. */
  to: string;
  /** The equal-length window ending where `from` begins. */
  previousFrom: string;
  previousTo: string;
  /** Human label for the report head: "2026 оны 9 сар". */
  labelMn: string;
}

/** A local calendar date, kept as three numbers so no `Date` can shift it. */
interface CalendarDate {
  year: number;
  month: number;
  day: number;
}

const MONTHS_IN_QUARTER = 3;

/** Today, as the office sees it. */
export function officeToday(now: Date = new Date()): CalendarDate {
  // `en-CA` renders `YYYY-MM-DD`, which is the one thing we need from it.
  const [year, month, day] = new Intl.DateTimeFormat('en-CA', {
    timeZone: OFFICE_TIME_ZONE,
    dateStyle: 'short',
  })
    .format(now)
    .split('-')
    .map(Number);
  return { year: year!, month: month!, day: day! };
}

function iso({ year, month, day }: CalendarDate): string {
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

/** Calendar arithmetic on a first-of-month date: no `Date`, no drift. */
function addMonths(date: CalendarDate, months: number): CalendarDate {
  const zeroBased = date.year * 12 + (date.month - 1) + months;
  const year = Math.floor(zeroBased / 12);
  const month = (zeroBased % 12) + 1;
  // Clamp so the 31st of a 30-day month lands on the 30th rather than rolling
  // into the next month. Every caller here passes day 1, but a `custom` range
  // does not, and a silently rolled-over month is the kind of bug nobody sees.
  const day = Math.min(date.day, daysInMonth(year, month));
  return { year, month, day };
}

function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

function addDays(date: CalendarDate, days: number): CalendarDate {
  const shifted = new Date(Date.UTC(date.year, date.month - 1, date.day + days));
  return { year: shifted.getUTCFullYear(), month: shifted.getUTCMonth() + 1, day: shifted.getUTCDate() };
}

function parse(value: string): CalendarDate {
  const [year, month, day] = value.split('-').map(Number);
  return { year: year!, month: month!, day: day! };
}

/** Whole days between two local dates — the half-open length of a period. */
function daysBetween(from: CalendarDate, to: CalendarDate): number {
  const a = Date.UTC(from.year, from.month - 1, from.day);
  const b = Date.UTC(to.year, to.month - 1, to.day);
  return Math.round((b - a) / 86_400_000);
}

const MONTH_LABEL = (date: CalendarDate) => `${date.year} оны ${date.month} сар`;

/** How far the office clock is ahead of UTC at a given instant. */
function officeOffsetMs(instant: Date): number {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: OFFICE_TIME_ZONE,
    hour12: false,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).formatToParts(instant);

  const read = (type: string) => Number(parts.find((part) => part.type === type)?.value);
  // `hour12: false` renders midnight as 24 in some ICU versions.
  const hour = read('hour') % 24;
  const local = Date.UTC(read('year'), read('month') - 1, read('day'), hour, read('minute'), read('second'));
  return local - instant.getTime();
}

/**
 * The instant an office-local calendar date begins, as a real `Date`.
 *
 * The SQL side does this with `AT TIME ZONE` (`report-sql.localInstant`); this
 * is the same boundary for the queries that go through the typed Prisma client
 * instead. Computed rather than assumed: Mongolia is +08 all year today, but a
 * hard-coded eight is a number nobody would think to check if that changed.
 */
export function officeDayStart(day: string): Date {
  const { year, month, day: date } = parse(day);
  const naive = Date.UTC(year, month - 1, date);
  // Guess with the offset at the naive instant, then re-read it at the guess:
  // the second reading is the offset that actually applies on that date.
  const guess = new Date(naive - officeOffsetMs(new Date(naive)));
  return new Date(naive - officeOffsetMs(guess));
}

/**
 * A `createdFrom`/`createdTo` filter pair as the half-open instant range every
 * report already uses (1N-38).
 *
 * `to` is the last day the caller means — inclusive, because that is what a
 * human types into a date field — so it becomes `lt` the start of the day
 * after. Feeding the bare string to `lte` instead cut "up to today" off at
 * 08:00 in the office and dropped the rest of the day, which is how the CRM
 * list and the report came to disagree about "this week".
 *
 * A full ISO timestamp is passed through as an instant: it already says exactly
 * which moment it means.
 */
export function officeDateRange(
  from?: string,
  to?: string,
): { gte?: Date; lt?: Date } | undefined {
  if (!from && !to) return undefined;

  const start = (value: string) => (isCalendarDate(value) ? officeDayStart(value) : new Date(value));
  const endExclusive = (value: string) =>
    isCalendarDate(value) ? officeDayStart(iso(addDays(parse(value), 1))) : new Date(value);

  return {
    ...(from ? { gte: start(from) } : {}),
    ...(to ? { lt: endExclusive(to) } : {}),
  };
}

function isCalendarDate(value: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(value);
}

/**
 * Resolve a preset (or an explicit range) into a period plus its comparison
 * window. `from`/`to` are only read for `custom`, and `to` there is the last
 * day the caller means — inclusive, because that is what a human types into a
 * date field — and is pushed out by one day to become the exclusive bound.
 */
export function resolvePeriod(
  preset: ReportPreset = 'month',
  range: { from?: string; to?: string } = {},
  now: Date = new Date(),
): ReportPeriod {
  const today = officeToday(now);
  const thisMonth: CalendarDate = { ...today, day: 1 };

  let from: CalendarDate;
  let to: CalendarDate;
  let labelMn: string;

  switch (preset) {
    case 'last-month':
      from = addMonths(thisMonth, -1);
      to = thisMonth;
      labelMn = MONTH_LABEL(from);
      break;
    case 'quarter': {
      const quarterStartMonth = Math.floor((today.month - 1) / MONTHS_IN_QUARTER) * MONTHS_IN_QUARTER + 1;
      from = { year: today.year, month: quarterStartMonth, day: 1 };
      to = addMonths(from, MONTHS_IN_QUARTER);
      labelMn = `${today.year} оны ${Math.floor((today.month - 1) / MONTHS_IN_QUARTER) + 1}-р квартал`;
      break;
    }
    case 'year':
      from = { year: today.year, month: 1, day: 1 };
      to = { year: today.year + 1, month: 1, day: 1 };
      labelMn = `${today.year} он`;
      break;
    case 'last-12-months':
      // Ends tomorrow, so today's takings are inside the window.
      to = addDays(today, 1);
      from = addMonths({ ...to, day: 1 }, -11);
      labelMn = `${MONTH_LABEL(from)} – ${MONTH_LABEL(today)}`;
      break;
    case 'custom': {
      from = range.from ? parse(range.from) : thisMonth;
      const lastDay = range.to ? parse(range.to) : addDays(addMonths(thisMonth, 1), -1);
      to = addDays(lastDay, 1);
      labelMn = `${iso(from)} – ${iso(lastDay)}`;
      break;
    }
    case 'month':
    default:
      from = thisMonth;
      to = addMonths(thisMonth, 1);
      labelMn = MONTH_LABEL(thisMonth);
      break;
  }

  // The comparison window is the same *shape*, not the same number of days: a
  // month compares against the previous month even though one has 30 days and
  // the other 31, because "өнгөрсөн сартай харьцуулбал" is what the office
  // means. Only a custom or rolling range falls back to counting days.
  const monthAligned = from.day === 1 && to.day === 1;
  const previousFrom = monthAligned
    ? addMonths(from, -monthsBetween(from, to))
    : addDays(from, -daysBetween(from, to));

  return {
    preset,
    from: iso(from),
    to: iso(to),
    previousFrom: iso(previousFrom),
    previousTo: iso(from),
    labelMn,
  };
}

function monthsBetween(from: CalendarDate, to: CalendarDate): number {
  return (to.year - from.year) * 12 + (to.month - from.month);
}

/**
 * Percentage change against the comparison window, rounded to one decimal.
 * `null` when the previous window was zero — "∞% growth" from a standing start
 * is noise, and the UI shows the previous figure instead.
 */
export function changePercent(current: number, previous: number): number | null {
  if (previous === 0) return null;
  return Math.round(((current - previous) / previous) * 1000) / 10;
}
