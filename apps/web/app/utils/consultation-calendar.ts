import type { OfficeWeekHours } from '@gks/shared';

/**
 * The consultation calendar's arithmetic (1B-30), kept out of the page so it
 * can be tested without a browser.
 *
 * Everything is on the Ulaanbaatar wall clock, whatever the viewer's laptop
 * says: the office is in one city and a booking is "Tuesday at 14:00" there.
 * Mongolia has had no daylight saving since 2017, so the offset is a constant
 * and a day is always 24 hours — no `Intl` time-zone data is needed, which
 * matters because some Chrome builds here ship none (see `date.ts`).
 */
const UB_OFFSET_MS = 8 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

const pad = (n: number) => String(n).padStart(2, '0');

export interface UbParts {
  /** `YYYY-MM-DD`. */
  key: string;
  year: number;
  month: number;
  day: number;
  /** `0` is Sunday, as `Date#getDay()`. */
  weekday: number;
  /** Minutes since midnight. */
  minutes: number;
}

export function ubParts(value: Date | string): UbParts {
  const shifted = new Date(new Date(value).getTime() + UB_OFFSET_MS);
  const year = shifted.getUTCFullYear();
  const month = shifted.getUTCMonth() + 1;
  const day = shifted.getUTCDate();

  return {
    key: `${year}-${pad(month)}-${pad(day)}`,
    year,
    month,
    day,
    weekday: shifted.getUTCDay(),
    minutes: shifted.getUTCHours() * 60 + shifted.getUTCMinutes(),
  };
}

/** The instant a Ulaanbaatar day + minute-of-day names. */
export function ubInstant(key: string, minutes: number): Date {
  return new Date(`${key}T${pad(Math.floor(minutes / 60))}:${pad(minutes % 60)}:00+08:00`);
}

export function addDays(key: string, days: number): string {
  return ubParts(new Date(ubInstant(key, 12 * 60).getTime() + days * DAY_MS)).key;
}

/** The Monday of the week `value` falls in — Mongolian weeks start on Monday. */
export function mondayOf(value: Date | string): string {
  const parts = ubParts(value);
  return addDays(parts.key, -((parts.weekday + 6) % 7));
}

export interface CalendarDay {
  key: string;
  weekday: number;
  day: number;
  month: number;
  /** `null` is a day off. */
  hours: [number, number] | null;
}

export function weekDays(monday: string, hours: OfficeWeekHours): CalendarDay[] {
  return Array.from({ length: 7 }, (_, index) => {
    const key = addDays(monday, index);
    const parts = ubParts(ubInstant(key, 12 * 60));
    return { key, weekday: parts.weekday, day: parts.day, month: parts.month, hours: hours[parts.weekday] ?? null };
  });
}

/** The rows the grid draws: the earliest opening to the latest closing of the week, in minutes. */
export function gridBounds(hours: OfficeWeekHours): { start: number; end: number } {
  const open = Object.values(hours).filter((range): range is [number, number] => Array.isArray(range));
  if (!open.length) return { start: 9 * 60, end: 18 * 60 };
  return {
    start: Math.min(...open.map((range) => range[0])) * 60,
    end: Math.max(...open.map((range) => range[1])) * 60,
  };
}

/** `09:00`, `09:30`, … up to but not including `end`. */
export function slotTimes(start: number, end: number, step = 30): number[] {
  const slots: number[] = [];
  for (let minute = start; minute < end; minute += step) slots.push(minute);
  return slots;
}

export function minutesLabel(minutes: number): string {
  return `${pad(Math.floor(minutes / 60))}:${pad(minutes % 60)}`;
}

export interface TimedBlock {
  id: string;
  start: number;
  end: number;
}

export interface PlacedBlock<T extends TimedBlock> {
  block: T;
  /** Which side-by-side lane, from 0. */
  lane: number;
  /** How many lanes its overlap group needs. */
  lanes: number;
}

/**
 * Side-by-side lanes for blocks that overlap — two consultants seeing two
 * people at 14:00 is normal, and the second block must not hide the first.
 *
 * Blocks are grouped into runs that transitively overlap; each run gets as
 * many lanes as its busiest moment, and each block the first lane free at its
 * start. Touching blocks (one ends at 14:00, the next starts at 14:00) do not
 * overlap.
 */
export function placeBlocks<T extends TimedBlock>(blocks: T[]): PlacedBlock<T>[] {
  const sorted = [...blocks].sort((a, b) => a.start - b.start || b.end - a.end);
  const placed: PlacedBlock<T>[] = [];
  let group: PlacedBlock<T>[] = [];
  let laneEnds: number[] = [];
  let groupEnd = -Infinity;

  const close = () => {
    for (const item of group) item.lanes = laneEnds.length;
    placed.push(...group);
    group = [];
    laneEnds = [];
  };

  for (const block of sorted) {
    if (block.start >= groupEnd) close();
    let lane = laneEnds.findIndex((end) => end <= block.start);
    if (lane === -1) lane = laneEnds.length;
    laneEnds[lane] = block.end;
    groupEnd = Math.max(groupEnd, block.end);
    group.push({ block, lane, lanes: 0 });
  }
  close();

  return placed;
}
