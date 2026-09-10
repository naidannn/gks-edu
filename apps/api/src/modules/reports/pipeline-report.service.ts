import { Injectable } from '@nestjs/common';
import type { CaseStage, ServiceType } from '../../prisma/client.js';
import type {
  FunnelStep,
  PipelineMilestone,
  PipelineReport,
  ReportPeriodInfo,
  StageLoad,
  StalledCaseRow,
} from './report-types.js';
import { Prisma } from '../../prisma/client.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import type { ReportPeriod } from './report-period.js';
import {
  CLOSED_STAGES,
  FURTHEST_MILESTONE,
  MILESTONES_CTE,
  daysBetween,
  days,
  inPeriod,
  median,
  percent,
} from './report-sql.js';

/**
 * 1M-03 — where cases stop moving.
 *
 * The old report had a *lead* funnel, which ends at the signature. What the
 * office actually loses money to happens after it: a case that sat in
 * DOCUMENTS for two months, an application nobody submitted, a visa file that
 * was never assembled. This report follows the production line the business
 * runs on — гэрээ → урьдчилгаа → материал → мэдүүлэг → тэнцсэн → урилга → виз
 * → явсан — in two views that answer different questions:
 *
 * - **Юүлүүр (cohort, period)** — of the cases opened in this period, what
 *   share reached each milestone and how long it took. Answers "бид хаана
 *   алдаж байна".
 * - **Одоогийн ачаалал (stock, now)** — how many cases sit in each stage today
 *   and how long they have been sitting. Answers "өнөөдөр хэнд туслах вэ".
 *
 * Milestones come from `case_transitions`, the same trail the case timeline
 * shows, so a number here can always be traced to a row somebody wrote.
 */

/** The production line, in order. Index matches `FURTHEST_MILESTONE` in the SQL. */
const MILESTONES: PipelineMilestone[] = [
  'CASE_OPENED',
  'CONTRACT_SIGNED',
  'PREPAYMENT_PAID',
  'DOCUMENTS',
  'APPLICATION_SUBMITTED',
  'ADMITTED',
  'INVITATION_RECEIVED',
  'VISA_APPROVED',
  'DEPARTED',
];

/**
 * Default days in one stage before a case is called stalled. A display
 * threshold, not a rule from the spec — the caller can slide it, and the
 * report says which value it used.
 */
export const DEFAULT_STALL_DAYS = 30;

/** Enough stalled cases to work through, not so many the screen becomes a queue. */
const STALLED_LIMIT = 30;

interface CohortRow {
  service_type: string | null;
  cohort: number;
  m1: number;
  m2: number;
  m3: number;
  m4: number;
  m5: number;
  m6: number;
  m7: number;
  m8: number;
  d1: number | null;
  d2: number | null;
  d3: number | null;
  d4: number | null;
  d5: number | null;
  d6: number | null;
  d7: number | null;
  d8: number | null;
}

@Injectable()
export class PipelineReportService {
  constructor(private readonly prisma: PrismaService) {}

  async build(period: ReportPeriod, periodInfo: ReportPeriodInfo, stallDays: number): Promise<PipelineReport> {
    const opened = Prisma.sql`c."createdAt"`;
    // A case that has never moved has been sitting since it was opened.
    const sinceLastMove = Prisma.sql`COALESCE(m.last_moved_at, c."createdAt")`;

    const [overall, byService, current, stalled, attrition, reasons] = await Promise.all([
      this.cohort(period, Prisma.sql`NULL::text`, opened),
      this.cohort(period, Prisma.sql`c."serviceType"::text`, opened),
      this.stageLoad(stallDays),
      this.prisma.$queryRaw<
        {
          case_id: string;
          case_code: string;
          client_name: string | null;
          consultant_name: string | null;
          service_type: string;
          stage: string;
          days_in_stage: number;
          last_moved_at: Date | null;
        }[]
      >`
        WITH ${MILESTONES_CTE}
        SELECT
          c.id                  AS case_id,
          c.code                AS case_code,
          COALESCE(NULLIF(TRIM(CONCAT(cl."lastName", ' ', cl."firstName")), ''), u.name) AS client_name,
          cons.name             AS consultant_name,
          c."serviceType"::text AS service_type,
          c.stage::text         AS stage,
          FLOOR(${daysBetween(sinceLastMove, Prisma.sql`now()`)})::int AS days_in_stage,
          m.last_moved_at       AS last_moved_at
        FROM "cases" c
        LEFT JOIN milestones m ON m.case_id = c.id
        JOIN "users" u ON u.id = c."userId"
        LEFT JOIN "clients" cl ON cl."userId" = c."userId"
        LEFT JOIN "users" cons ON cons.id = c."assignedConsultantId"
        WHERE c.stage NOT IN ${CLOSED_STAGES}
          AND ${sinceLastMove} < now() - make_interval(days => ${stallDays})
        ORDER BY ${sinceLastMove} ASC
        LIMIT ${STALLED_LIMIT}
      `,
      this.prisma.$queryRaw<{ stage: string; count: number }[]>`
        SELECT c.stage::text AS stage, count(*)::int AS count
        FROM "cases" c
        WHERE c.stage IN ('CANCELLED', 'REJECTED', 'ON_HOLD')
        GROUP BY c.stage
      `,
      // Why cases were dropped, in the words staff typed on the transition.
      this.prisma.$queryRaw<{ reason: string; count: number }[]>`
        SELECT TRIM(t.reason) AS reason, count(*)::int AS count
        FROM "case_transitions" t
        WHERE t."toStage" IN ('CANCELLED', 'REJECTED')
          AND t.reason IS NOT NULL
          AND TRIM(t.reason) <> ''
          AND ${inPeriod(Prisma.sql`t."createdAt"`, period)}
        GROUP BY 1
        ORDER BY 2 DESC
        LIMIT 10
      `,
    ]);

    const closed = new Map(attrition.map((row) => [row.stage, row.count]));

    return {
      period: periodInfo,
      cohortSize: overall[0]?.cohort ?? 0,
      stallThresholdDays: stallDays,
      funnel: toFunnel(overall[0]),
      byService: byService
        .map((row) => ({
          serviceType: row.service_type as ServiceType,
          cohortSize: row.cohort,
          funnel: toFunnel(row),
        }))
        .sort((a, b) => b.cohortSize - a.cohortSize),
      current,
      stalled: stalled.map(
        (row): StalledCaseRow => ({
          caseId: row.case_id,
          caseCode: row.case_code,
          clientName: row.client_name,
          consultantName: row.consultant_name,
          serviceType: row.service_type as ServiceType,
          stage: row.stage as CaseStage,
          daysInStage: row.days_in_stage,
          lastMovedAt: row.last_moved_at ? row.last_moved_at.toISOString() : null,
        }),
      ),
      attrition: {
        cancelled: closed.get('CANCELLED') ?? 0,
        rejected: closed.get('REJECTED') ?? 0,
        onHold: closed.get('ON_HOLD') ?? 0,
        reasons: reasons.map((row) => ({ reason: row.reason, count: row.count })),
      },
    };
  }

  /**
   * The live pipeline: how many cases sit in each open stage, how long the
   * median one has been there, and how many are past the stall threshold.
   *
   * Shared with the overview, which shows the same load as a strip of tiles —
   * two screens disagreeing about how many cases are in DOCUMENTS would be
   * worse than either of them being absent.
   */
  async stageLoad(stallDays: number = DEFAULT_STALL_DAYS): Promise<StageLoad[]> {
    const sinceLastMove = Prisma.sql`COALESCE(m.last_moved_at, c."createdAt")`;
    const rows = await this.prisma.$queryRaw<{ stage: string; count: number; median_days: number | null; stalled: number }[]>`
      WITH ${MILESTONES_CTE}
      SELECT
        c.stage::text  AS stage,
        count(*)::int  AS count,
        ${median(daysBetween(sinceLastMove, Prisma.sql`now()`))} AS median_days,
        count(*) FILTER (
          WHERE ${sinceLastMove} < now() - make_interval(days => ${stallDays})
        )::int AS stalled
      FROM "cases" c
      LEFT JOIN milestones m ON m.case_id = c.id
      WHERE c.stage NOT IN ${CLOSED_STAGES}
      GROUP BY c.stage
    `;

    return rows
      .map(
        (row): StageLoad => ({
          stage: row.stage as CaseStage,
          count: row.count,
          medianDaysInStage: days(row.median_days) ?? 0,
          stalledCount: row.stalled,
        }),
      )
      .sort((a, b) => b.count - a.count);
  }

  /**
   * One cohort row per `groupBy` value: how many cases opened in the period,
   * how many reached each milestone, and the median days each took.
   *
   * `FURTHEST_MILESTONE` is what makes the counts monotonic — a funnel that
   * widens halfway down is a funnel nobody trusts again.
   */
  private cohort(period: ReportPeriod, groupBy: Prisma.Sql, opened: Prisma.Sql) {
    const reached = (index: number) =>
      Prisma.sql`count(*) FILTER (WHERE ${FURTHEST_MILESTONE} >= ${index})::int`;
    const elapsed = (column: string) => median(daysBetween(opened, Prisma.raw(`m.${column}`)));

    return this.prisma.$queryRaw<CohortRow[]>`
      WITH ${MILESTONES_CTE}
      SELECT
        ${groupBy}     AS service_type,
        count(*)::int  AS cohort,
        ${reached(1)}  AS m1,
        ${reached(2)}  AS m2,
        ${reached(3)}  AS m3,
        ${reached(4)}  AS m4,
        ${reached(5)}  AS m5,
        ${reached(6)}  AS m6,
        ${reached(7)}  AS m7,
        ${reached(8)}  AS m8,
        ${elapsed('contract_signed_at')} AS d1,
        ${elapsed('prepayment_at')}      AS d2,
        ${elapsed('documents_at')}       AS d3,
        ${elapsed('submitted_at')}       AS d4,
        ${elapsed('admitted_at')}        AS d5,
        ${elapsed('invited_at')}         AS d6,
        ${elapsed('visa_approved_at')}   AS d7,
        ${elapsed('departed_at')}        AS d8
      FROM "cases" c
      LEFT JOIN milestones m ON m.case_id = c.id
      WHERE ${inPeriod(opened, period)}
      GROUP BY 1
    `;
  }
}

/**
 * Turn one cohort row into the nine funnel steps.
 *
 * `stepPercent` — the share of the *previous* milestone that got here — is the
 * number worth reading: 90% of the cohort reaching DOCUMENTS is meaningless
 * next to 40% of DOCUMENTS reaching APPLICATION_SUBMITTED.
 */
function toFunnel(row: CohortRow | undefined): FunnelStep[] {
  const cohort = row?.cohort ?? 0;
  const counts = [cohort, row?.m1 ?? 0, row?.m2 ?? 0, row?.m3 ?? 0, row?.m4 ?? 0, row?.m5 ?? 0, row?.m6 ?? 0, row?.m7 ?? 0, row?.m8 ?? 0];
  const medians = [null, row?.d1, row?.d2, row?.d3, row?.d4, row?.d5, row?.d6, row?.d7, row?.d8];

  return MILESTONES.map((milestone, index) => ({
    milestone,
    reached: counts[index]!,
    reachedPercent: percent(counts[index]!, cohort),
    stepPercent: index === 0 ? 100 : percent(counts[index]!, counts[index - 1]!),
    medianDays: days(medians[index] ?? null),
  }));
}
