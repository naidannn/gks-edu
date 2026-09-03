import { describe, expect, it } from 'vitest';
import {
  buildRoadmap,
  formatFullDate,
  nextIntakeDates,
  registrationDeadline,
} from '../app/utils/roadmap';

describe('homepage roadmap dates', () => {
  it.each([
    [3, 2027, 0, 31],
    [6, 2027, 3, 30],
    [9, 2027, 6, 31],
    [12, 2027, 9, 31],
  ])('closes language-prep registration two calendar months before month %i', (month, year, deadlineMonth, day) => {
    const deadline = registrationDeadline('LANGUAGE_PREP', new Date(year, month - 1, 1, 12));
    expect([deadline.getFullYear(), deadline.getMonth(), deadline.getDate()]).toEqual([
      year,
      deadlineMonth,
      day,
    ]);
  });

  it('uses the same two-month registration lead for degree programmes', () => {
    const intake = new Date(2027, 8, 1, 12);
    expect(formatFullDate(buildRoadmap('BACHELOR', intake).registrationDeadline)).toBe(
      '2027 оны 7-р сарын 31',
    );
    expect(formatFullDate(buildRoadmap('MASTER', intake).registrationDeadline)).toBe(
      '2027 оны 7-р сарын 31',
    );
  });

  it('shows the calendar days between registration and arrival', () => {
    expect(buildRoadmap('LANGUAGE_PREP', new Date(2026, 11, 1, 12)).durationDays).toBe(31);
    expect(buildRoadmap('BACHELOR', new Date(2027, 2, 1, 12)).durationDays).toBe(29);
  });

  it('keeps an intake available through its final registration day', () => {
    const intakes = nextIntakeDates('LANGUAGE_PREP', new Date(2026, 9, 31, 12), 1);
    expect(intakes[0] && [intakes[0].getFullYear(), intakes[0].getMonth()]).toEqual([2026, 11]);
  });

  it('moves to the next intake after registration closes', () => {
    const intakes = nextIntakeDates('LANGUAGE_PREP', new Date(2026, 10, 1, 12), 1);
    expect(intakes[0] && [intakes[0].getFullYear(), intakes[0].getMonth()]).toEqual([2027, 2]);
  });
});
