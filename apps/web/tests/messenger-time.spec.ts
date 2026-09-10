import { describe, expect, it } from 'vitest';
import { messageDay, messageTime, threadTime } from '../app/utils/messenger';

/**
 * The messenger's clock used to go through `toLocaleDateString('mn-MN')`,
 * which answers in English on a Chrome with no Mongolian data — the thread
 * separators and the inbox rows were the two most-read places it showed.
 */
function daysAgo(days: number, hour = 12, minute = 0): string {
  const at = new Date();
  at.setDate(at.getDate() - days);
  at.setHours(hour, minute, 0, 0);
  return at.toISOString();
}

describe('messenger timestamps', () => {
  it('shows a clock for today', () => {
    expect(messageTime(daysAgo(0, 14, 32))).toBe('14:32');
    expect(threadTime(daysAgo(0, 14, 32))).toBe('14:32');
  });

  it('names today and yesterday rather than dating them', () => {
    expect(messageDay(daysAgo(0))).toBe('Өнөөдөр');
    expect(messageDay(daysAgo(1))).toBe('Өчигдөр');
    expect(threadTime(daysAgo(1))).toBe('Өчигдөр');
  });

  it('uses a Mongolian weekday inside the week', () => {
    const at = new Date();
    at.setDate(at.getDate() - 3);
    const expected = ['Ням', 'Даваа', 'Мягмар', 'Лхагва', 'Пүрэв', 'Баасан', 'Бямба'][at.getDay()];
    expect(messageDay(daysAgo(3))).toBe(expected);
  });

  it('says nothing at all about an unreadable timestamp', () => {
    expect(messageTime('nonsense')).toBe('');
    expect(messageDay('nonsense')).toBe('');
    expect(threadTime('nonsense')).toBe('');
  });
});
