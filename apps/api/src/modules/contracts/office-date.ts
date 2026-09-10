/**
 * Dates on a contract are the office's dates, not the server's (1N-11).
 *
 * Production runs UTC and the office sits at UTC+8, so a contract issued after
 * 16:00 UTC carried yesterday on paper, and one issued on the evening of 31
 * December took its sequence number from the year that had just ended. Every
 * date that reaches paper, and both ends of the numbering year, go through
 * here.
 */

const OFFICE_TIME_ZONE = 'Asia/Ulaanbaatar';

/**
 * Mongolia has been on UTC+8 all year round since 2016 — there is no DST to
 * track, so the year boundary is arithmetic. The formatter below still asks
 * the time zone database, which is what would notice if that ever changed.
 */
const OFFICE_UTC_OFFSET_MS = 8 * 60 * 60 * 1000;

const OFFICE_DATE_FORMAT = new Intl.DateTimeFormat('en-CA', {
  timeZone: OFFICE_TIME_ZONE,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

export interface OfficeDateParts {
  year: number;
  month: number;
  day: number;
}

/** `2027-01-01` — the ISO date it is in Ulaanbaatar at this instant. */
export function formatOfficeDateIso(date: Date): string {
  return OFFICE_DATE_FORMAT.format(date);
}

/** `2027/01/01` — the form the signed Word file puts beside a signature. */
export function formatOfficeDateSlash(date: Date): string {
  return formatOfficeDateIso(date).replace(/-/g, '/');
}

export function officeDateParts(date: Date): OfficeDateParts {
  const [year, month, day] = formatOfficeDateIso(date).split('-').map(Number);
  return { year: year!, month: month!, day: day! };
}

/** The UTC instants the office's calendar year opens and closes at. */
export function officeYearBounds(year: number): { start: Date; end: Date } {
  return {
    start: new Date(Date.UTC(year, 0, 1) - OFFICE_UTC_OFFSET_MS),
    end: new Date(Date.UTC(year + 1, 0, 1) - OFFICE_UTC_OFFSET_MS),
  };
}
