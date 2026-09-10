import { Injectable } from '@nestjs/common';
import type { LeadSource } from '../../prisma/client.js';
import type {
  FinanceReport,
  IntakeRiskReport,
  ManagementOverview,
  OutcomesReport,
  PipelineReport,
  ReportPeriodInfo,
  StaffReport,
} from './report-types.js';
import { Prisma } from '../../prisma/client.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import { CacheService } from '../../redis/cache.service.js';
import { FinanceReportService } from './finance-report.service.js';
import { IntakeRiskReportService, DEFAULT_HORIZON_DAYS } from './intake-risk-report.service.js';
import { OutcomesReportService } from './outcomes-report.service.js';
import { DEFAULT_STALL_DAYS, PipelineReportService } from './pipeline-report.service.js';
import { changePercent, resolvePeriod, type ReportPeriod, type ReportPreset } from './report-period.js';
import { CASE_DOC_PROGRESS, CLOSED_STAGES, inPeriod, inPreviousPeriod, money, percent } from './report-sql.js';
import { StaffReportService } from './staff-report.service.js';

/**
 * Reporting (gksedu.md §19, ARCHITECTURE.md §13).
 *
 * **Why there are no materialized views any more.** The first version read four
 * nightly `mv_*` views, which bought nothing this business needs and cost the
 * one thing it cannot do without: a number a manager can act on this morning.
 * "Авлага 4.2 сая₮" is a lie if somebody paid at nine. The tables these reports
 * aggregate are small — thousands of cases, thousands of payments — and the
 * expense against a Supabase pooler is the round trip, not the scan, so every
 * report fires its queries in one `Promise.all` and reads live rows.
 *
 * What replaces the nightly refresh is a short Redis cache, keyed by report and
 * period. Ten staff opening the same screen in the same minute compute it once;
 * nothing is ever more than {@link REPORT_CACHE_TTL_MS} old, and the refresh
 * button drops the key rather than rebuilding a view.
 *
 * Each report is its own service. They share one vocabulary — `report-sql.ts`
 * for "when does a month start", "which document statuses are done", "what
 * counts as income" — because two reports quietly disagreeing about a
 * definition is how a dashboard loses the office's trust for good.
 */

/** Long enough to absorb a morning rush, short enough that nobody rings a client who paid. */
export const REPORT_CACHE_TTL_MS = 3 * 60 * 1000;

const CACHE_PREFIX = 'reports';

export interface ReportRequest {
  preset?: ReportPreset;
  from?: string;
  to?: string;
  stallDays?: number;
  horizonDays?: number;
}

@Injectable()
export class ReportsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly cache: CacheService,
    private readonly finance: FinanceReportService,
    private readonly pipeline: PipelineReportService,
    private readonly outcomes: OutcomesReportService,
    private readonly intakeRisk: IntakeRiskReportService,
    private readonly staff: StaffReportService,
  ) {}

  /** Drops every cached report; the "Одоо шинэчлэх" button and nothing else. */
  async invalidate(): Promise<{ clearedAt: string }> {
    await this.cache.delByPattern(`${CACHE_PREFIX}:*`);
    return { clearedAt: new Date().toISOString() };
  }

  financeReport(request: ReportRequest): Promise<FinanceReport> {
    return this.cached('finance', request, (period, info) => this.finance.build(period, info));
  }

  pipelineReport(request: ReportRequest): Promise<PipelineReport> {
    const stallDays = request.stallDays ?? DEFAULT_STALL_DAYS;
    return this.cached('pipeline', { ...request, stallDays }, (period, info) =>
      this.pipeline.build(period, info, stallDays),
    );
  }

  outcomesReport(request: ReportRequest): Promise<OutcomesReport> {
    return this.cached('outcomes', request, (period, info) => this.outcomes.build(period, info));
  }

  staffReport(request: ReportRequest): Promise<StaffReport> {
    return this.cached('staff', request, (period, info) => this.staff.build(period, info));
  }

  /** No period: a deadline does not belong to a reporting month. */
  intakeRiskReport(horizonDays: number = DEFAULT_HORIZON_DAYS): Promise<IntakeRiskReport> {
    return this.cache.wrap(
      `${CACHE_PREFIX}:intake-risk:${horizonDays}`,
      () => this.intakeRisk.build(horizonDays),
      REPORT_CACHE_TTL_MS,
    );
  }

  // ── The management overview (§19) ─────────────────────────────────────────

  /**
   * The one screen a manager opens first, and the reason it is split in two:
   *
   * - **Урсгал** — what happened in the period, each figure beside the same
   *   figure one period earlier. A number with nothing to compare it to is a
   *   number nobody can act on.
   * - **Байдал** — where the business stands right now: cases in flight, money
   *   owed, deadlines closing. These carry no period, because they are not
   *   about one.
   *
   * The old version mixed the two — an all-time lead count next to a 12-month
   * revenue figure next to a live stage count — and so described no moment in
   * time at all.
   */
  overview(request: ReportRequest): Promise<ManagementOverview> {
    return this.cached('overview', request, async (period, periodInfo) => {
      const [flow, finance, stageLoad, deadlineRisk, stock, sources] = await Promise.all([
        this.flowCounters(period),
        this.finance.build(period, periodInfo),
        this.pipeline.stageLoad(request.stallDays ?? DEFAULT_STALL_DAYS),
        this.intakeRisk.atRiskCount(request.horizonDays ?? DEFAULT_HORIZON_DAYS),
        this.stockCounters(),
        this.leadsBySource(period),
      ]);

      return {
        period: periodInfo,
        flow: {
          newLeads: metric(flow.new_leads, flow.prev_new_leads),
          newClients: metric(flow.new_clients, flow.prev_new_clients),
          signedContracts: metric(flow.signed_contracts, flow.prev_signed_contracts),
          contractValueMnt: metric(money(flow.contract_value), money(flow.prev_contract_value)),
          netIncomeMnt: metric(finance.income.netMnt, finance.income.previousNetMnt),
          refundedMnt: metric(finance.income.refundMnt, money(flow.prev_refunded)),
          applicationsSubmitted: metric(flow.applications, flow.prev_applications),
          admitted: metric(flow.admitted, flow.prev_admitted),
          visaApproved: metric(flow.visa_approved, flow.prev_visa_approved),
          departed: metric(flow.departed, flow.prev_departed),
        },
        stock: {
          activeCases: stock.active_cases,
          openLeads: stock.open_leads,
          unassignedLeads: stock.unassigned_leads,
          receivableMnt: finance.receivables.totalMnt,
          overdueReceivableMnt: finance.receivables.overdueMnt,
          uninvoicedContractMnt: finance.committed.amountMnt,
          casesCollectingDocuments: stock.collecting_documents,
          overdueDocuments: stock.overdue_documents,
          deadlineRiskCases: deadlineRisk,
          casesByStage: stageLoad,
        },
        leadsBySource: sources.map((row) => ({
          source: row.source as LeadSource,
          leads: row.leads,
          won: row.won,
          conversionRate: percent(row.won, row.leads),
        })),
        incomeByService: finance.byService.map((row) => ({
          serviceType: row.serviceType,
          netMnt: row.netMnt,
          previousMnt: row.previousMnt,
          changePercent: row.changePercent,
        })),
        incomeByMonth: finance.byMonth.map((row) => ({
          month: row.month,
          netMnt: row.netMnt,
          refundMnt: row.refundMnt,
          passThroughMnt: row.passThroughMnt,
        })),
      };
    });
  }

  /** Everything that happened in the period, beside the same period before it. */
  private async flowCounters(period: ReportPeriod) {
    const created = Prisma.sql`l."createdAt"`;
    const clientCreated = Prisma.sql`cl."createdAt"`;
    const signed = Prisma.sql`ct."signedAt"`;
    const submitted = Prisma.sql`a."submittedAt"`;
    const transition = Prisma.sql`t."createdAt"`;
    const paid = Prisma.sql`p."paidAt"`;

    const rows = await this.prisma.$queryRaw<
      Record<
        | 'new_leads'
        | 'prev_new_leads'
        | 'new_clients'
        | 'prev_new_clients'
        | 'signed_contracts'
        | 'prev_signed_contracts'
        | 'contract_value'
        | 'prev_contract_value'
        | 'prev_refunded'
        | 'applications'
        | 'prev_applications'
        | 'admitted'
        | 'prev_admitted'
        | 'visa_approved'
        | 'prev_visa_approved'
        | 'departed'
        | 'prev_departed',
        number
      >[]
    >`
      SELECT
        (SELECT count(*)::int FROM "leads" l WHERE l."mergedIntoId" IS NULL AND ${inPeriod(created, period)})         AS new_leads,
        (SELECT count(*)::int FROM "leads" l WHERE l."mergedIntoId" IS NULL AND ${inPreviousPeriod(created, period)}) AS prev_new_leads,
        (SELECT count(*)::int FROM "clients" cl WHERE ${inPeriod(clientCreated, period)})                             AS new_clients,
        (SELECT count(*)::int FROM "clients" cl WHERE ${inPreviousPeriod(clientCreated, period)})                     AS prev_new_clients,
        (SELECT count(*)::int FROM "contracts" ct WHERE ct."signedAt" IS NOT NULL AND ${inPeriod(signed, period)})         AS signed_contracts,
        (SELECT count(*)::int FROM "contracts" ct WHERE ct."signedAt" IS NOT NULL AND ${inPreviousPeriod(signed, period)}) AS prev_signed_contracts,
        (SELECT COALESCE(sum(ct."totalAmountSnapshot"), 0)::float8 FROM "contracts" ct
          WHERE ct."signedAt" IS NOT NULL AND ${inPeriod(signed, period)})                                            AS contract_value,
        (SELECT COALESCE(sum(ct."totalAmountSnapshot"), 0)::float8 FROM "contracts" ct
          WHERE ct."signedAt" IS NOT NULL AND ${inPreviousPeriod(signed, period)})                                    AS prev_contract_value,
        (SELECT COALESCE(sum(p."amountMnt"), 0)::float8 FROM "payments" p
          WHERE p.status = 'PAID' AND p.kind = 'REFUND' AND ${inPreviousPeriod(paid, period)})                        AS prev_refunded,
        (SELECT count(*)::int FROM "applications" a WHERE a."submittedAt" IS NOT NULL AND ${inPeriod(submitted, period)})         AS applications,
        (SELECT count(*)::int FROM "applications" a WHERE a."submittedAt" IS NOT NULL AND ${inPreviousPeriod(submitted, period)}) AS prev_applications,
        -- Counted off the transition trail, so "admitted in September" means
        -- the case was admitted then, not that it happens to be admitted now.
        (SELECT count(DISTINCT t."caseId")::int FROM "case_transitions" t
          WHERE t."toStage" IN ('ADMITTED', 'GKS_ROUND1_PASSED', 'GKS_ROUND2_PASSED') AND ${inPeriod(transition, period)})         AS admitted,
        (SELECT count(DISTINCT t."caseId")::int FROM "case_transitions" t
          WHERE t."toStage" IN ('ADMITTED', 'GKS_ROUND1_PASSED', 'GKS_ROUND2_PASSED') AND ${inPreviousPeriod(transition, period)}) AS prev_admitted,
        (SELECT count(DISTINCT t."caseId")::int FROM "case_transitions" t
          WHERE t."toStage" = 'VISA_APPROVED' AND ${inPeriod(transition, period)})         AS visa_approved,
        (SELECT count(DISTINCT t."caseId")::int FROM "case_transitions" t
          WHERE t."toStage" = 'VISA_APPROVED' AND ${inPreviousPeriod(transition, period)}) AS prev_visa_approved,
        (SELECT count(DISTINCT t."caseId")::int FROM "case_transitions" t
          WHERE t."toStage" IN ('DEPARTED', 'COMPLETED') AND ${inPeriod(transition, period)})         AS departed,
        (SELECT count(DISTINCT t."caseId")::int FROM "case_transitions" t
          WHERE t."toStage" IN ('DEPARTED', 'COMPLETED') AND ${inPreviousPeriod(transition, period)}) AS prev_departed
    `;

    return rows[0]!;
  }

  /** Where the business stands now. No period touches any of these. */
  private async stockCounters() {
    const rows = await this.prisma.$queryRaw<
      Record<'active_cases' | 'open_leads' | 'unassigned_leads' | 'collecting_documents' | 'overdue_documents', number>[]
    >`
      SELECT
        (SELECT count(*)::int FROM "cases" c WHERE c.stage NOT IN ${CLOSED_STAGES})                     AS active_cases,
        (SELECT count(*)::int FROM "leads" l
          WHERE l."mergedIntoId" IS NULL AND l.stage NOT IN ('WON', 'LOST'))                            AS open_leads,
        (SELECT count(*)::int FROM "leads" l
          WHERE l."mergedIntoId" IS NULL AND l.stage NOT IN ('WON', 'LOST') AND l."assignedToId" IS NULL) AS unassigned_leads,
        doc_totals.collecting                                                                            AS collecting_documents,
        doc_totals.overdue                                                                               AS overdue_documents
      FROM (
        SELECT
          count(*) FILTER (WHERE docs.required_total > 0 AND docs.required_done < docs.required_total)::int AS collecting,
          COALESCE(sum(docs.overdue_docs), 0)::int AS overdue
        FROM "cases" c
        ${CASE_DOC_PROGRESS}
        WHERE c.stage NOT IN ${CLOSED_STAGES}
      ) doc_totals
    `;

    return rows[0]!;
  }

  /**
   * Where enquiries came from, and how many of them became a signed client.
   * Won is counted from the stage-change trail rather than the lead's current
   * stage, so it belongs to the period the deal closed in.
   */
  private leadsBySource(period: ReportPeriod) {
    const created = Prisma.sql`l."createdAt"`;
    return this.prisma.$queryRaw<{ source: string; leads: number; won: number }[]>`
      SELECT
        l.source::text AS source,
        count(*)::int  AS leads,
        count(*) FILTER (WHERE EXISTS (
          SELECT 1 FROM "lead_activities" la
          WHERE la."leadId" = l.id AND la.type = 'STAGE_CHANGE' AND la.meta->>'to' = 'WON'
        ))::int AS won
      FROM "leads" l
      WHERE l."mergedIntoId" IS NULL AND ${inPeriod(created, period)}
      GROUP BY 1
      ORDER BY 2 DESC
    `;
  }

  // ── Internals ────────────────────────────────────────────────────────────

  /**
   * Resolve the period once, stamp it, and memoise the result under a key that
   * includes every input — a report cached under the wrong period is worse than
   * no cache at all.
   */
  private async cached<T>(
    name: string,
    request: ReportRequest,
    build: (period: ReportPeriod, info: ReportPeriodInfo) => Promise<T>,
  ): Promise<T> {
    const period = resolvePeriod(request.preset ?? 'month', { from: request.from, to: request.to });
    const key = [CACHE_PREFIX, name, period.from, period.to, request.stallDays ?? '', request.horizonDays ?? ''].join(':');

    return this.cache.wrap(
      key,
      () => build(period, { ...period, generatedAt: new Date().toISOString() }),
      REPORT_CACHE_TTL_MS,
    );
  }
}

/** A flow figure carries the previous period beside it, always. */
function metric(value: number, previous: number) {
  return { value, previous, changePercent: changePercent(value, previous) };
}

/** Re-exported so the controller states its defaults from one source. */
export { DEFAULT_HORIZON_DAYS, DEFAULT_STALL_DAYS };
