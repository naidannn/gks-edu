import { describe, expect, it } from 'vitest';
import {
  busiestHours,
  facebookPreviousLabel,
  facebookReportQuery,
  formatReplyMinutes,
  formatReportDay,
  aiModelLabel,
  formatTokens,
  formatUsd,
} from '../app/utils/facebook-report';

describe('Facebook report helpers (2F-10)', () => {
  it('formats reply times in the unit people use', () => {
    expect(formatReplyMinutes(null)).toBe('—');
    expect(formatReplyMinutes(0.25)).toBe('15 сек');
    expect(formatReplyMinutes(0)).toBe('1 сек');
    expect(formatReplyMinutes(12.4)).toBe('12 мин');
    expect(formatReplyMinutes(130)).toBe('2 цаг 10 мин');
    expect(formatReplyMinutes(120)).toBe('2 цаг');
  });

  it('reads a report day as a calendar date with its weekday', () => {
    // 2026-10-09 is a Friday (Баасан).
    expect(formatReportDay('2026-10-09')).toBe('10/09 Ба');
    expect(formatReportDay('2026-10-11')).toBe('10/11 Ня');
  });

  it('ranks the busiest hours and skips empty ones', () => {
    const hours = Array.from({ length: 24 }, () => 0);
    hours[21] = 9;
    hours[10] = 4;
    hours[14] = 9;
    hours[23] = 1;
    expect(busiestHours(hours).map((row) => row.label)).toEqual(['14:00–15:00', '21:00–22:00', '10:00–11:00']);
    expect(busiestHours(hours, 10).at(-1)?.label).toBe('23:00–00:00');
    expect(busiestHours(Array.from({ length: 24 }, () => 0))).toEqual([]);
  });

  it('sends a range only for a custom window', () => {
    expect(facebookReportQuery('today', '2026-10-01', '2026-10-05')).toBe('preset=today');
    expect(facebookReportQuery('custom', '2026-10-01', '2026-10-05')).toBe('preset=custom&from=2026-10-01&to=2026-10-05');
  });

  it('names the comparison window', () => {
    expect(facebookPreviousLabel('today')).toBe('өчигдөр');
    expect(facebookPreviousLabel('month')).toBe('өмнөх сар');
  });
});

describe('AI cost formatting (2F-11)', () => {
  it('shows fractions of a cent, and cents above a dollar', () => {
    expect(formatUsd(null)).toBe('—');
    expect(formatUsd(0)).toBe('$0');
    expect(formatUsd(0.00166)).toBe('$0.0017');
    expect(formatUsd(0.812)).toBe('$0.8120');
    expect(formatUsd(12.345)).toBe('$12.35');
  });

  it('prints token counts like the provider consoles', () => {
    expect(formatTokens(912)).toBe('912');
    expect(formatTokens(45_782)).toBe('45.8K');
    expect(formatTokens(2_070_000)).toBe('2.07M');
  });

  it('names the models the way the office reads them', () => {
    expect(aiModelLabel('gemini-3.1-flash-lite')).toBe('Gemini 3.1 Flash-Lite');
    expect(aiModelLabel('deepseek-flash:nothink')).toBe('DeepSeek Flash (thinking-гүй)');
    expect(aiModelLabel('deepseek-v4-pro')).toBe('DeepSeek V4 Pro');
  });
});
