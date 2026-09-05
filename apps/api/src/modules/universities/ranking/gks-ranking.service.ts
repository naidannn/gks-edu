import { InjectQueue } from '@nestjs/bullmq';
import { Injectable, Logger } from '@nestjs/common';
import type { Queue } from 'bullmq';
import { Prisma } from '../../../prisma/client.js';
import { PrismaService } from '../../../prisma/prisma.service.js';
import { CacheService } from '../../../redis/cache.service.js';
import { GKS_RANKING_JOB, GKS_RANKING_QUEUE } from '../../../queue/queue.constants.js';
import { LIST_CACHE_PATTERN } from '../universities.service.js';
import type { UpdateRankingConfigDto } from '../dto/ranking-config.dto.js';
import {
  buildContext,
  rankAll,
  type RankingInput,
  type RankingWeights,
  type ScoredUniversity,
} from './gks-ranking.math.js';

/** The singleton row's primary key — there is exactly one config. */
const CONFIG_ID = 'default';

/**
 * Applications whose outcome is known. `DEFERRED` is deliberately absent: a
 * postponed decision is not a failure and should not drag a school's pass rate.
 */
const DECIDED_STATUSES = ['ACCEPTED', 'REJECTED'] as const;

export interface RecomputeSummary {
  scored: number;
  ranked: number;
  durationMs: number;
  top: { rank: number; nameMn: string; nameEn: string; score: number }[];
}

/**
 * 1A-29 / 1A-30 — computes `gksScore` and `gksRank` for every school.
 *
 * The whole catalogue is scored in one pass: the components are relative to
 * each other (a school's saved-shortlist count only means something next to the
 * busiest school's), so there is no such thing as rescoring one row.
 *
 * 135 rows is small enough that the pass is one read and one write. The write
 * is a single `UPDATE … FROM (VALUES …)` rather than 135 statements — against
 * the Supabase pooler in ap-southeast-1 that is the difference between ~115 ms
 * and a quarter of a minute (CLAUDE.md, hard rule 8).
 */
@Injectable()
export class GksRankingService {
  private readonly logger = new Logger(GksRankingService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly cache: CacheService,
    @InjectQueue(GKS_RANKING_QUEUE) private readonly queue: Queue,
  ) {}

  /** The live weights, creating the row with its defaults on first read. */
  async getConfig() {
    return this.prisma.gksRankingConfig.upsert({
      where: { id: CONFIG_ID },
      create: { id: CONFIG_ID },
      update: {},
    });
  }

  /** Retuning the weights reshuffles every school, so it recomputes right away. */
  async updateConfig(dto: UpdateRankingConfigDto, updatedById?: string) {
    const config = await this.prisma.gksRankingConfig.upsert({
      where: { id: CONFIG_ID },
      create: { id: CONFIG_ID, ...dto, updatedById: updatedById ?? null },
      update: { ...dto, updatedById: updatedById ?? null },
    });

    await this.recompute();
    return config;
  }

  /**
   * Queues a recompute instead of running it inline. Admin writes call this:
   * an edit to one school shifts the dataset extremes every other school is
   * measured against, but the editor should not wait for 135 rows to rescore.
   */
  async scheduleRecompute(): Promise<void> {
    try {
      // A fixed jobId collapses a burst of edits into one run.
      await this.queue.add(GKS_RANKING_JOB, {}, { jobId: 'recompute', removeOnComplete: true, delay: 5_000 });
    } catch (error) {
      // Redis being down must not fail a catalogue edit; the nightly run catches up.
      this.logger.warn(`Could not queue a ranking recompute: ${(error as Error).message}`);
    }
  }

  /** Scores every school and writes `gksScore` / `gksRank` / `gksScoreParts`. */
  async recompute(): Promise<RecomputeSummary> {
    const startedAt = Date.now();
    const [config, inputs] = await Promise.all([this.getConfig(), this.collectInputs()]);

    const scored = rankAll(inputs, buildContext(inputs), this.toWeights(config));
    await this.persist(scored);
    await this.invalidate();

    const summary: RecomputeSummary = {
      scored: scored.length,
      ranked: scored.length ? scored[scored.length - 1]!.rank : 0,
      durationMs: Date.now() - startedAt,
      top: scored.slice(0, 10).map((row) => ({
        rank: row.rank,
        nameMn: row.nameMn,
        nameEn: row.nameEn,
        score: row.score,
      })),
    };

    this.logger.log(`GKS ranking recomputed: ${summary.scored} schools in ${summary.durationMs} ms`);
    return summary;
  }

  /**
   * Scores without writing, so the office can see what a weight change would do
   * before committing to it (1A-31).
   */
  async preview(overrides: Partial<RankingWeights>, limit = 30) {
    const [config, inputs] = await Promise.all([this.getConfig(), this.collectInputs()]);
    // A validated DTO carries every declared property, `undefined` included, so
    // a plain spread would blank out the weights the caller did not override.
    const weights = { ...this.toWeights(config), ...stripUndefined(overrides) };
    const scored = rankAll(inputs, buildContext(inputs), weights);

    return {
      weights,
      total: scored.length,
      rows: scored.slice(0, limit).map((row) => ({
        rank: row.rank,
        nameMn: row.nameMn,
        nameEn: row.nameEn,
        score: row.score,
        boost: row.boost,
        theKoreaRank: row.theKoreaRank,
        parts: row.parts,
      })),
    };
  }

  // --- Internals ---

  private toWeights(config: {
    weightBaseRank: number;
    weightPartnership: number;
    weightFit: number;
    weightDemand: number;
    weightPractical: number;
    unrankedBaseScore: number;
  }): RankingWeights {
    return {
      weightBaseRank: config.weightBaseRank,
      weightPartnership: config.weightPartnership,
      weightFit: config.weightFit,
      weightDemand: config.weightDemand,
      weightPractical: config.weightPractical,
      unrankedBaseScore: config.unrankedBaseScore,
    };
  }

  /**
   * One read of everything the score needs. Four independent queries under
   * `Promise.all` — read-only, so no `$transaction` (CLAUDE.md, hard rule 8).
   *
   * Drafts are included: the admin preview exists so the ranking can be tuned
   * before a school goes live.
   */
  private async collectInputs(): Promise<RankingInput[]> {
    const [universities, tuitionByUniversity, decisions] = await Promise.all([
      this.prisma.university.findMany({
        select: {
          id: true,
          nameMn: true,
          nameEn: true,
          theKoreaRank: true,
          agentContractStatus: true,
          isGksEligible: true,
          acceptsLanguagePrep: true,
          acceptsFromMongolia: true,
          mongolianStudents: true,
          distanceFromSeoulKm: true,
          shortIntroMn: true,
          detailedIntroMn: true,
          advantages: true,
          logoPath: true,
          livingCost: true,
          gksRankBoost: true,
          _count: { select: { savedBy: true, cases: true, programs: true, intakes: true } },
        },
      }),
      this.prisma.universityProgram.groupBy({
        by: ['universityId'],
        where: { isPublished: true, tuitionPerYearKrw: { gt: 0 } },
        _min: { tuitionPerYearKrw: true },
      }),
      this.prisma.application.groupBy({
        by: ['universityId', 'status'],
        where: { universityId: { not: null }, status: { in: [...DECIDED_STATUSES] } },
        _count: { _all: true },
      }),
    ]);

    const minTuition = new Map(
      tuitionByUniversity.map((row) => [row.universityId, row._min.tuitionPerYearKrw ?? null]),
    );

    const decided = new Map<string, { decided: number; accepted: number }>();
    for (const row of decisions) {
      if (!row.universityId) continue;
      const entry = decided.get(row.universityId) ?? { decided: 0, accepted: 0 };
      entry.decided += row._count._all;
      if (row.status === 'ACCEPTED') entry.accepted += row._count._all;
      decided.set(row.universityId, entry);
    }

    return universities.map((university) => {
      const outcomes = decided.get(university.id) ?? { decided: 0, accepted: 0 };

      return {
        id: university.id,
        nameMn: university.nameMn,
        nameEn: university.nameEn,
        theKoreaRank: university.theKoreaRank,
        agentContractStatus: university.agentContractStatus,
        isGksEligible: university.isGksEligible,
        acceptsLanguagePrep: university.acceptsLanguagePrep,
        acceptsFromMongolia: university.acceptsFromMongolia,
        mongolianStudents: university.mongolianStudents,
        savedCount: university._count.savedBy,
        caseCount: university._count.cases,
        decidedApplications: outcomes.decided,
        acceptedApplications: outcomes.accepted,
        minTuitionKrw: minTuition.get(university.id) ?? null,
        livingCostMonthlyMax: readMonthlyCostMax(university.livingCost),
        distanceFromSeoulKm: university.distanceFromSeoulKm,
        hasShortIntro: Boolean(university.shortIntroMn?.trim()),
        hasDetailedIntro: Boolean(university.detailedIntroMn?.trim()),
        advantagesCount: university.advantages.length,
        hasLogo: Boolean(university.logoPath),
        programCount: university._count.programs,
        intakeCount: university._count.intakes,
        gksRankBoost: university.gksRankBoost,
      } satisfies RankingInput;
    });
  }

  /** One statement for the whole catalogue — see the class comment. */
  private async persist(scored: ScoredUniversity[]): Promise<void> {
    if (!scored.length) return;

    const rows = scored.map(
      (row) => Prisma.sql`(${row.id}::uuid, ${row.score}::double precision, ${row.rank}::integer, ${JSON.stringify(row.parts)}::jsonb)`,
    );

    await this.prisma.$executeRaw`
      UPDATE "universities" AS u
         SET "gksScore" = v.score,
             "gksRank" = v.rnk,
             "gksScoreParts" = v.parts,
             "gksScoredAt" = now()
        FROM (VALUES ${Prisma.join(rows)}) AS v(id, score, rnk, parts)
       WHERE u."id" = v.id
    `;
  }

  /** The catalogue's default order just changed, so every cached page is wrong. */
  private async invalidate(): Promise<void> {
    await this.cache.delByPattern(LIST_CACHE_PATTERN);
  }
}

/** Drops keys whose value is `undefined`, so a spread cannot erase a default. */
function stripUndefined<T extends object>(value: T): Partial<T> {
  return Object.fromEntries(
    Object.entries(value).filter(([, entry]) => entry !== undefined),
  ) as Partial<T>;
}

/**
 * Upper end of the monthly living-cost estimate, from the untyped `livingCost`
 * JSON. Returns null for anything unexpected — the score treats that as
 * "unknown", which is neutral, not expensive.
 */
function readMonthlyCostMax(livingCost: Prisma.JsonValue | null): number | null {
  if (!livingCost || typeof livingCost !== 'object' || Array.isArray(livingCost)) return null;
  const value = (livingCost as Record<string, unknown>).monthlyTotalMax;
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : null;
}
