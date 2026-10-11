import { BadRequestException, Injectable } from '@nestjs/common';
import { Prisma } from '../../prisma/client.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import { costMicros } from '../ai/llm/llm.types.js';
import { changePercent } from '../reports/report-period.js';
import { count, localDay, rateOrNull, within } from '../reports/report-sql.js';
import {
  FACEBOOK_REPORT_MAX_DAYS,
  resolveFacebookPeriod,
  windowDays,
  type FacebookReportPreset,
} from './facebook-report-period.js';
import { FACEBOOK_LEADS_CTE } from './facebook-report.service.js';

/** Mirrors `FacebookAiCostUsage` in `@gks/shared`, which the web reads this through. */
interface FacebookAiCostUsage {
  answers: number;
  promptTokens: number;
  cachedPromptTokens: number;
  completionTokens: number;
  costUsd: number;
}

interface CostRow {
  day: string;
  model: string;
  /** False for answers stored before the cost was recorded per answer. */
  measured: boolean;
  answers: number;
  prompt: bigint | number | null;
  cached: bigint | number | null;
  completion: bigint | number | null;
  cost: bigint | number | null;
}

const empty = (): FacebookAiCostUsage => ({
  answers: 0,
  promptTokens: 0,
  cachedPromptTokens: 0,
  completionTokens: 0,
  costUsd: 0,
});

/**
 * What the assistant's Messenger answers cost (2F-11), kept apart from the
 * Page report itself: that one counts people, this one counts money.
 *
 * Every answer since 2F-11 stores what its turn cost with the provider's cache
 * discount — the figure Google and DeepSeek bill. Older answers only stored
 * token counts, so they are priced at list price as if nothing were cached;
 * on 2026-10-08..10 that read 1.8× the AI Studio bill. They are counted apart
 * (`estimatedAnswers`) so the screen can say so rather than pass them off.
 */
@Injectable()
export class FacebookAiCostService {
  constructor(private readonly prisma: PrismaService) {}

  async build(preset: FacebookReportPreset, range: { from?: string; to?: string }) {
    if (preset === 'custom' && range.from && range.to && range.from > range.to) {
      throw new BadRequestException('Эхлэх огноо дуусах огнооноос хойш байна');
    }
    const period = resolveFacebookPeriod(preset, range);
    if (windowDays(period) > FACEBOOK_REPORT_MAX_DAYS) {
      throw new BadRequestException(`Хугацаа ${FACEBOOK_REPORT_MAX_DAYS} хоногоос урт байж болохгүй`);
    }

    const [rows, previousRows, aiLeads] = await Promise.all([
      this.rows(period.from, period.to),
      this.rows(period.previousFrom, period.previousTo),
      this.aiLeads(period.from, period.to),
    ]);

    const totals = { ...empty(), estimatedAnswers: 0 };
    const previous = empty();
    const byDay = new Map<string, FacebookAiCostUsage>();
    const byModel = new Map<string, FacebookAiCostUsage>();
    let measuredPrompt = 0;
    let measuredCached = 0;

    for (const row of rows) {
      const usage = usageOf(row);
      add(totals, usage);
      if (!row.measured) totals.estimatedAnswers += usage.answers;
      else {
        measuredPrompt += usage.promptTokens;
        measuredCached += usage.cachedPromptTokens;
      }
      add(slot(byDay, row.day), usage);
      add(slot(byModel, row.model), usage);
    }
    for (const row of previousRows) add(previous, usageOf(row));

    return {
      period,
      generatedAt: new Date().toISOString(),
      totals: rounded(totals),
      previous: rounded(previous),
      costChangePercent: changePercent(totals.costUsd, previous.costUsd),
      costPerAnswerUsd: totals.answers ? totals.costUsd / totals.answers : null,
      aiLeads,
      costPerAiLeadUsd: aiLeads ? totals.costUsd / aiLeads : null,
      cachedSharePercent: rateOrNull(measuredCached, measuredPrompt),
      days: eachDay(period.from, period.to).map((day) => ({ day, ...rounded(byDay.get(day) ?? empty()) })),
      models: [...byModel.entries()]
        .map(([model, usage]) => ({ model, ...rounded(usage) }))
        .sort((a, b) => b.costUsd - a.costUsd),
    };
  }

  /**
   * The assistant's answers on Facebook, by office day, model, and whether the
   * answer recorded its own cost. Comments answered by private reply live in
   * the same `FACEBOOK` sessions, so they are in here too.
   */
  private rows(from: string, to: string): Promise<CostRow[]> {
    return this.prisma.$queryRaw<CostRow[]>`
      SELECT to_char(${localDay(Prisma.sql`m."createdAt"`)}, 'YYYY-MM-DD') AS day,
             m.model                                                     AS model,
             (m."costMicros" IS NOT NULL)                                AS measured,
             count(*)::int                                               AS answers,
             sum(COALESCE(m."promptTokens", 0))                          AS prompt,
             sum(COALESCE(m."cachedPromptTokens", 0))                    AS cached,
             sum(COALESCE(m."completionTokens", 0))                      AS completion,
             sum(m."costMicros")                                         AS cost
      FROM "chat_messages" m
      JOIN "chat_sessions" s ON s.id = m."sessionId"
      WHERE s.channel = 'FACEBOOK'
        AND m.role = 'ASSISTANT'
        AND m.model IS NOT NULL
        AND ${within(Prisma.sql`m."createdAt"`, from, to)}
      GROUP BY 1, 2, 3
    `;
  }

  /** Leads the assistant captured from a Messenger thread — the same definition as the Page report's. */
  private async aiLeads(from: string, to: string): Promise<number> {
    const [row] = await this.prisma.$queryRaw<{ n: number }[]>`
      WITH ${FACEBOOK_LEADS_CTE}
      SELECT count(*)::int AS n FROM fb_leads fl
      WHERE fl.captured_by = 'AI' AND ${within(Prisma.sql`fl.created_at`, from, to)}
    `;
    return count(row?.n);
  }
}

function usageOf(row: CostRow): FacebookAiCostUsage {
  const promptTokens = count(row.prompt as number);
  const cachedPromptTokens = count(row.cached as number);
  const completionTokens = count(row.completion as number);
  const micros = row.measured
    ? count(row.cost as number)
    : costMicros(row.model, promptTokens, completionTokens);
  return { answers: count(row.answers), promptTokens, cachedPromptTokens, completionTokens, costUsd: micros / 1_000_000 };
}

function add(into: FacebookAiCostUsage, usage: FacebookAiCostUsage): void {
  into.answers += usage.answers;
  into.promptTokens += usage.promptTokens;
  into.cachedPromptTokens += usage.cachedPromptTokens;
  into.completionTokens += usage.completionTokens;
  into.costUsd += usage.costUsd;
}

function slot(map: Map<string, FacebookAiCostUsage>, key: string): FacebookAiCostUsage {
  let usage = map.get(key);
  if (!usage) map.set(key, (usage = empty()));
  return usage;
}

/** Six decimals: a single answer costs a fraction of a cent, and the screen shows four. */
function rounded<T extends FacebookAiCostUsage>(usage: T): T {
  return { ...usage, costUsd: Math.round(usage.costUsd * 1_000_000) / 1_000_000 };
}

/** Office-local `YYYY-MM-DD` days from `from` (inclusive) to `to` (exclusive). */
export function eachDay(from: string, to: string): string[] {
  const days: string[] = [];
  for (let day = new Date(`${from}T00:00:00Z`); day < new Date(`${to}T00:00:00Z`); day.setUTCDate(day.getUTCDate() + 1)) {
    days.push(day.toISOString().slice(0, 10));
  }
  return days;
}
