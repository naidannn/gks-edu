import { describe, expect, it } from 'vitest';
import {
  addDays,
  gridBounds,
  mondayOf,
  placeBlocks,
  slotTimes,
  ubInstant,
  ubParts,
  weekDays,
} from '../app/utils/consultation-calendar';

const HOURS = { 0: null, 1: [9, 18], 2: [9, 18], 3: [9, 18], 4: [9, 18], 5: [9, 18], 6: null } as const;

describe('consultation calendar arithmetic (1B-30)', () => {
  it('reads the Ulaanbaatar clock, not the laptop’s', () => {
    // 17:30 UTC Sunday is already 01:30 Monday in Ulaanbaatar.
    expect(ubParts('2026-11-22T17:30:00Z')).toMatchObject({ key: '2026-11-23', weekday: 1, minutes: 90 });
    expect(ubInstant('2026-11-23', 14 * 60).toISOString()).toBe('2026-11-23T06:00:00.000Z');
  });

  it('starts the week on Monday, also from a Sunday', () => {
    expect(mondayOf('2026-11-25T04:00:00Z')).toBe('2026-11-23');
    expect(mondayOf('2026-11-29T04:00:00Z')).toBe('2026-11-23');
    expect(addDays('2026-11-30', -1)).toBe('2026-11-29');
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
  });

  it('marks Saturday and Sunday as days off', () => {
    const days = weekDays('2026-11-23', HOURS as never);
    expect(days.map((day) => day.weekday)).toEqual([1, 2, 3, 4, 5, 6, 0]);
    expect(days[5]!.hours).toBeNull();
    expect(days[6]!.hours).toBeNull();
    expect(days[0]!.hours).toEqual([9, 18]);
  });

  it('draws only the hours somebody is in', () => {
    expect(gridBounds(HOURS as never)).toEqual({ start: 540, end: 1080 });
    expect(slotTimes(540, 660)).toEqual([540, 570, 600, 630]);
  });

  it('puts overlapping blocks side by side, and touching ones in one lane', () => {
    const placed = placeBlocks([
      { id: 'a', start: 840, end: 870 },
      { id: 'b', start: 840, end: 900 },
      { id: 'c', start: 870, end: 900 },
      { id: 'd', start: 900, end: 930 },
    ]);
    const by = Object.fromEntries(placed.map((item) => [item.block.id, item]));

    expect(by.a).toMatchObject({ lanes: 2 });
    expect(by.b).toMatchObject({ lanes: 2 });
    expect(by.a!.lane).not.toBe(by.b!.lane);
    // c starts when a ends, so it reuses a's lane.
    expect(by.c!.lane).toBe(by.a!.lane);
    // d touches nothing still open: a group of its own.
    expect(by.d).toMatchObject({ lane: 0, lanes: 1 });
  });
});
