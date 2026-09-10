import { describe, expect, it } from 'vitest';
import {
  DEADLINE_SOON_DAYS,
  DEADLINE_URGENT_DAYS,
  annualTuitionKrw,
  deadlineCountdownLabel,
  deadlineCountdownShort,
  deadlineCountdownTone,
} from '../app/utils/labels';

/**
 * Six screens each carried their own deadline countdown, with six wordings and
 * three sets of thresholds; the point of one helper is that the same number of
 * days now reads and colours the same everywhere, so that is what is checked.
 */
describe('deadlineCountdownLabel', () => {
  it('counts down, and counts past', () => {
    expect(deadlineCountdownLabel(12)).toBe('12 хоног үлдлээ');
    expect(deadlineCountdownLabel(0)).toBe('Өнөөдөр хаагдана');
    expect(deadlineCountdownLabel(-3)).toBe('3 хоногоор хэтэрсэн');
  });

  it('admits when there is no deadline to count to', () => {
    expect(deadlineCountdownLabel(null)).toBe('Хугацаа тодорхойгүй');
    expect(deadlineCountdownLabel(undefined)).toBe('Хугацаа тодорхойгүй');
  });

  it('has a narrow form for a table column', () => {
    expect(deadlineCountdownShort(12)).toBe('12 хоног');
    expect(deadlineCountdownShort(-3)).toBe('3 хоног хэтэрсэн');
    expect(deadlineCountdownShort(null)).toBe('—');
  });
});

describe('deadlineCountdownTone', () => {
  it('reddens at the urgent threshold and ambers at the soon one', () => {
    expect(deadlineCountdownTone(DEADLINE_URGENT_DAYS)).toBe('danger');
    expect(deadlineCountdownTone(DEADLINE_URGENT_DAYS + 1)).toBe('warning');
    expect(deadlineCountdownTone(DEADLINE_SOON_DAYS)).toBe('warning');
    expect(deadlineCountdownTone(DEADLINE_SOON_DAYS + 1)).toBe('success');
  });

  it('treats a passed deadline as urgent, and a missing one as unknown', () => {
    expect(deadlineCountdownTone(-1)).toBe('danger');
    expect(deadlineCountdownTone(null)).toBe('neutral');
  });
});

describe('annualTuitionKrw', () => {
  it('prefers the school’s own annual figure', () => {
    expect(annualTuitionKrw({ level: 'BACHELOR', tuitionPerYearKrw: 7_000_000, tuitionPerTermKrw: 3_000_000 }))
      .toBe(7_000_000);
  });

  it('doubles a degree term but quadruples a language-prep one', () => {
    expect(annualTuitionKrw({ level: 'MASTER', tuitionPerYearKrw: null, tuitionPerTermKrw: 4_000_000 }))
      .toBe(8_000_000);
    // A language institute's year is four 10-week terms, not two semesters.
    expect(annualTuitionKrw({ level: 'LANGUAGE_PREP', tuitionPerYearKrw: null, tuitionPerTermKrw: 1_500_000 }))
      .toBe(6_000_000);
  });

  it('is null, never zero, when neither figure is published', () => {
    expect(annualTuitionKrw({ level: 'PHD', tuitionPerYearKrw: null, tuitionPerTermKrw: null })).toBeNull();
  });
});
