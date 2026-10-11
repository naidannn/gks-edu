import { describe, expect, it } from 'vitest';
import type { PrismaService } from '../../prisma/prisma.service.js';
import { costMicros } from '../ai/llm/llm.types.js';
import { eachDay, FacebookAiCostService } from './facebook-ai-cost.service.js';

/**
 * `$queryRaw` is a tagged template: the leads query is told apart by its SQL,
 * the two cost queries by the order `Promise.all` starts them in — current
 * period first, then the previous one.
 */
function serviceWith(current: object[], previous: object[], leads: number) {
  let costCalls = 0;
  const prisma = {
    $queryRaw: async (strings: TemplateStringsArray) => {
      if (strings.join('').includes('fb_leads')) return [{ n: leads }];
      costCalls += 1;
      return costCalls === 1 ? current : previous;
    },
  } as unknown as PrismaService;
  return new FacebookAiCostService(prisma);
}

const range = { from: '2026-10-09', to: '2026-10-10' };

describe('FacebookAiCostService', () => {
  it('uses the stored cost when the answer recorded one, and list price when it did not', async () => {
    const service = serviceWith(
      [
        // Recorded: 12,000 micro-dollars, whatever list price would say.
        { day: '2026-10-09', model: 'gemini-3.1-flash-lite', measured: true, answers: 2, prompt: 20_000n, cached: 12_000n, completion: 400n, cost: 3_000n },
        // Older answer, nothing recorded: priced as if nothing were cached.
        { day: '2026-10-10', model: 'gemini-3.1-flash-lite', measured: false, answers: 1, prompt: 10_000n, cached: 0n, completion: 200n, cost: null },
      ],
      [],
      2,
    );

    const report = await service.build('custom', range);
    const estimated = costMicros('gemini-3.1-flash-lite', 10_000, 200) / 1_000_000;

    expect(report.totals.answers).toBe(3);
    expect(report.totals.estimatedAnswers).toBe(1);
    expect(report.totals.costUsd).toBeCloseTo(0.003 + estimated, 6);
    expect(report.costPerAnswerUsd).toBeCloseTo((0.003 + estimated) / 3, 6);
    expect(report.costPerAiLeadUsd).toBeCloseTo((0.003 + estimated) / 2, 6);
    // Only answers that recorded their cache count say anything about the cache.
    expect(report.cachedSharePercent).toBe(60);
  });

  it('zero-fills the days and ranks models by cost', async () => {
    const service = serviceWith(
      [
        { day: '2026-10-10', model: 'deepseek-flash:nothink', measured: true, answers: 1, prompt: 1_000n, cached: 0n, completion: 10n, cost: 500n },
        { day: '2026-10-10', model: 'gemini-3.1-flash-lite', measured: true, answers: 1, prompt: 1_000n, cached: 0n, completion: 10n, cost: 900n },
      ],
      [],
      0,
    );

    const report = await service.build('custom', range);

    expect(report.days.map((day) => [day.day, day.answers])).toEqual([
      ['2026-10-09', 0],
      ['2026-10-10', 2],
    ]);
    expect(report.models.map((row) => row.model)).toEqual(['gemini-3.1-flash-lite', 'deepseek-flash:nothink']);
    expect(report.costPerAiLeadUsd).toBeNull();
  });

  it('compares the cost with the previous period', async () => {
    const row = { day: '2026-10-09', model: 'gemini-3.1-flash-lite', measured: true, answers: 1, prompt: 0n, cached: 0n, completion: 0n };
    const service = serviceWith([{ ...row, cost: 3_000n }], [{ ...row, cost: 2_000n }], 0);

    const report = await service.build('custom', range);

    expect(report.previous.costUsd).toBeCloseTo(0.002, 6);
    expect(report.costChangePercent).toBe(50);
  });
});

describe('eachDay', () => {
  it('lists the days of a half-open window', () => {
    expect(eachDay('2026-09-30', '2026-10-02')).toEqual(['2026-09-30', '2026-10-01']);
    expect(eachDay('2026-10-01', '2026-10-01')).toEqual([]);
  });
});
