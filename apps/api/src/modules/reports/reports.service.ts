import { Injectable, Logger } from '@nestjs/common';
import {
  CaseStage,
  LeadStage,
  PaymentKind,
  PaymentStatus,
  type LeadSource,
  type Role,
  type ServiceType,
} from '../../prisma/client.js';
import { PrismaService } from '../../prisma/prisma.service.js';

/**
 * 1G-08…1G-11 — reporting.
 *
 * Everything here reads the four materialized views created in
 * `20260905010000_report_materialized_views`; Prisma cannot model a view, so
 * these are `$queryRaw` with hand-written row types. Nothing aggregates the
 * transactional tables directly (ARCHITECTURE.md §13) — except the handful of
 * "right now" counters on the dashboard, which must not be a night stale.
 */

export interface FunnelRow {
  month: Date;
  source: LeadSource;
  stage: LeadStage;
  lead_count: bigint;
  unassigned_count: bigint;
  avg_age_days: string | null;
}

export interface FinanceRow {
  month: Date;
  service_type: ServiceType;
  kind: PaymentKind;
  status: PaymentStatus;
  payment_count: bigint;
  total_mnt: string;
  overdue_count: bigint;
  overdue_mnt: string;
}

export interface DocumentProgressRow {
  case_id: string;
  case_code: string;
  service_type: ServiceType;
  case_stage: CaseStage;
  user_id: string;
  doc_officer_id: string | null;
  required_total: bigint;
  required_done: bigint;
  overdue_count: bigint;
  next_due_at: Date | null;
}

export interface StaffPerformanceRow {
  staff_id: string;
  staff_name: string | null;
  staff_email: string | null;
  role: Role;
  leads_assigned: bigint;
  leads_won: bigint;
  leads_lost: bigint;
  cases_as_consultant: bigint;
  cases_as_doc_officer: bigint;
  open_tasks: bigint;
  overdue_tasks: bigint;
  completed_tasks: bigint;
  review_notes: bigint;
  revenue_mnt: string;
}

/** Case stages that mean the client has physically left (§19 "явсан"). */
const DEPARTED_STAGES: CaseStage[] = [CaseStage.DEPARTED, CaseStage.COMPLETED];

@Injectable()
export class ReportsService {
  private readonly logger = new Logger(ReportsService.name);

  constructor(private readonly prisma: PrismaService) {}

  /** Nightly job (1G-08). `CONCURRENTLY` needs the unique indexes the migration created. */
  async refreshViews(): Promise<{ refreshed: string[]; durationMs: number }> {
    const started = Date.now();
    const views = ['mv_sales_funnel', 'mv_finance', 'mv_document_progress', 'mv_staff_performance'];

    for (const view of views) {
      try {
        await this.prisma.$executeRawUnsafe(`REFRESH MATERIALIZED VIEW CONCURRENTLY "${view}"`);
      } catch (error) {
        // CONCURRENTLY fails on a view that has never been populated; the
        // blocking form is correct for that first run.
        this.logger.warn(`"${view}" CONCURRENTLY шинэчлэлт амжилтгүй, блоклох горимд шилжлээ`);
        await this.prisma.$executeRawUnsafe(`REFRESH MATERIALIZED VIEW "${view}"`);
        void error;
      }
    }

    const durationMs = Date.now() - started;
    this.logger.log(`Тайлангийн ${views.length} харагдац ${durationMs}ms-д шинэчлэгдлээ`);
    return { refreshed: views, durationMs };
  }

  // ── 1B-11 — sales funnel ─────────────────────────────────────────────────

  async salesFunnel(months = 12) {
    const rows = await this.prisma.$queryRawUnsafe<FunnelRow[]>(
      `SELECT * FROM "mv_sales_funnel"
        WHERE month >= date_trunc('month', now()) - make_interval(months => $1)
        ORDER BY month DESC, source, stage`,
      months,
    );

    const bySource = new Map<LeadSource, { total: number; won: number; lost: number; unassigned: number }>();
    const byStage = new Map<LeadStage, number>();
    const byMonth = new Map<string, { month: string; total: number; won: number }>();

    for (const row of rows) {
      const count = Number(row.lead_count);
      const source = bySource.get(row.source) ?? { total: 0, won: 0, lost: 0, unassigned: 0 };
      source.total += count;
      source.unassigned += Number(row.unassigned_count);
      if (row.stage === LeadStage.WON) source.won += count;
      if (row.stage === LeadStage.LOST) source.lost += count;
      bySource.set(row.source, source);

      byStage.set(row.stage, (byStage.get(row.stage) ?? 0) + count);

      const key = row.month.toISOString().slice(0, 7);
      const month = byMonth.get(key) ?? { month: key, total: 0, won: 0 };
      month.total += count;
      if (row.stage === LeadStage.WON) month.won += count;
      byMonth.set(key, month);
    }

    const total = [...byStage.values()].reduce((sum, count) => sum + count, 0);
    const won = byStage.get(LeadStage.WON) ?? 0;

    return {
      total,
      won,
      conversionRate: total ? Math.round((won / total) * 1000) / 10 : 0,
      byStage: [...byStage.entries()].map(([stage, count]) => ({ stage, count })),
      bySource: [...bySource.entries()].map(([source, stats]) => ({
        source,
        ...stats,
        conversionRate: stats.total ? Math.round((stats.won / stats.total) * 1000) / 10 : 0,
      })),
      byMonth: [...byMonth.values()].sort((a, b) => a.month.localeCompare(b.month)),
    };
  }

  // ── 1G-10 — finance ──────────────────────────────────────────────────────

  async finance(months = 12) {
    const rows = await this.prisma.$queryRawUnsafe<FinanceRow[]>(
      `SELECT * FROM "mv_finance"
        WHERE month >= date_trunc('month', now()) - make_interval(months => $1)
        ORDER BY month DESC`,
      months,
    );

    const totals = { revenue: 0, prepayment: 0, balance: 0, receivable: 0, overdue: 0, refunded: 0 };
    const byService = new Map<ServiceType, { revenue: number; receivable: number; refunded: number; count: number }>();
    const byMonth = new Map<string, { month: string; revenue: number; receivable: number }>();

    for (const row of rows) {
      const amount = Number(row.total_mnt);
      const service = byService.get(row.service_type) ?? { revenue: 0, receivable: 0, refunded: 0, count: 0 };

      if (row.status === PaymentStatus.PAID) {
        // A refund is stored as its own PAID row; it reduces revenue.
        if (row.kind === PaymentKind.REFUND) {
          totals.refunded += amount;
          service.refunded += amount;
        } else {
          totals.revenue += amount;
          service.revenue += amount;
          if (row.kind === PaymentKind.PREPAYMENT) totals.prepayment += amount;
          if (row.kind === PaymentKind.BALANCE) totals.balance += amount;
        }
        service.count += Number(row.payment_count);

        const key = row.month.toISOString().slice(0, 7);
        const month = byMonth.get(key) ?? { month: key, revenue: 0, receivable: 0 };
        if (row.kind !== PaymentKind.REFUND) month.revenue += amount;
        byMonth.set(key, month);
      }

      if (row.status === PaymentStatus.PENDING) {
        totals.receivable += amount;
        totals.overdue += Number(row.overdue_mnt);
        service.receivable += amount;

        const key = row.month.toISOString().slice(0, 7);
        const month = byMonth.get(key) ?? { month: key, revenue: 0, receivable: 0 };
        month.receivable += amount;
        byMonth.set(key, month);
      }

      byService.set(row.service_type, service);
    }

    return {
      totals: { ...totals, netRevenue: totals.revenue - totals.refunded },
      byService: [...byService.entries()].map(([serviceType, stats]) => ({ serviceType, ...stats })),
      byMonth: [...byMonth.values()].sort((a, b) => a.month.localeCompare(b.month)),
    };
  }

  // ── 1G-11 — staff performance ────────────────────────────────────────────

  async staffPerformance() {
    const rows = await this.prisma.$queryRawUnsafe<StaffPerformanceRow[]>(
      `SELECT * FROM "mv_staff_performance" ORDER BY revenue_mnt DESC, staff_name`,
    );

    return rows.map((row) => ({
      staffId: row.staff_id,
      name: row.staff_name,
      email: row.staff_email,
      role: row.role,
      leadsAssigned: Number(row.leads_assigned),
      leadsWon: Number(row.leads_won),
      leadsLost: Number(row.leads_lost),
      conversionRate: Number(row.leads_assigned)
        ? Math.round((Number(row.leads_won) / Number(row.leads_assigned)) * 1000) / 10
        : 0,
      casesAsConsultant: Number(row.cases_as_consultant),
      casesAsDocOfficer: Number(row.cases_as_doc_officer),
      openTasks: Number(row.open_tasks),
      overdueTasks: Number(row.overdue_tasks),
      completedTasks: Number(row.completed_tasks),
      reviewNotes: Number(row.review_notes),
      revenueMnt: Number(row.revenue_mnt),
    }));
  }

  // ── Document progress ────────────────────────────────────────────────────

  async documentProgress(limit = 100) {
    const rows = await this.prisma.$queryRawUnsafe<DocumentProgressRow[]>(
      `SELECT * FROM "mv_document_progress"
        WHERE required_total > 0
        ORDER BY overdue_count DESC, next_due_at NULLS LAST
        LIMIT $1`,
      limit,
    );

    return rows.map((row) => ({
      caseId: row.case_id,
      caseCode: row.case_code,
      serviceType: row.service_type,
      caseStage: row.case_stage,
      userId: row.user_id,
      docOfficerId: row.doc_officer_id,
      requiredTotal: Number(row.required_total),
      requiredDone: Number(row.required_done),
      percent: Number(row.required_total)
        ? Math.round((Number(row.required_done) / Number(row.required_total)) * 100)
        : 100,
      overdueCount: Number(row.overdue_count),
      nextDueAt: row.next_due_at,
    }));
  }

  // ── 1G-09 — the 21 dashboard figures of gksedu.md §19 ────────────────────

  async dashboard() {
    const monthStart = new Date();
    monthStart.setDate(1);
    monthStart.setHours(0, 0, 0, 0);

    const [funnel, finance, docs, staff] = await Promise.all([
      this.salesFunnel(12),
      this.finance(12),
      this.documentProgress(500),
      this.staffPerformance(),
    ]);

    // Live counters — the stage of a case is exactly the kind of number that
    // must not be a night old on a manager's screen.
    const [newLeadsThisMonth, clients, byStage, applications] = await Promise.all([
      this.prisma.lead.count({ where: { createdAt: { gte: monthStart }, mergedIntoId: null } }),
      this.prisma.client.count(),
      this.prisma.case.groupBy({ by: ['stage'], _count: { _all: true } }),
      this.prisma.application.groupBy({ by: ['universityId'], _count: { _all: true } }),
    ]);

    const stageCount = new Map(byStage.map((row) => [row.stage, row._count._all]));
    const countStages = (...stages: CaseStage[]) =>
      stages.reduce((sum, stage) => sum + (stageCount.get(stage) ?? 0), 0);

    return {
      // Харилцагч ба борлуулалт
      totalLeads: funnel.total,
      newLeadsThisMonth,
      contractedClients: clients,
      conversionRate: funnel.conversionRate,
      salesByService: finance.byService.map((row) => ({ serviceType: row.serviceType, revenue: row.revenue })),
      applicationsByUniversity: applications.length,
      // Санхүү
      totalRevenue: finance.totals.revenue,
      prepaymentTotal: finance.totals.prepayment,
      balanceTotal: finance.totals.balance,
      receivable: finance.totals.receivable,
      overdueReceivable: finance.totals.overdue,
      refunded: finance.totals.refunded,
      // Материал
      collectingDocuments: docs.filter((row) => row.percent < 100).length,
      overdueDocuments: docs.reduce((sum, row) => sum + row.overdueCount, 0),
      // Процессийн үе шат
      submittedToUniversity: countStages(CaseStage.APPLICATION_SUBMITTED),
      admitted: countStages(CaseStage.ADMITTED, CaseStage.GKS_ROUND1_PASSED, CaseStage.GKS_ROUND2_PASSED),
      rejected: countStages(CaseStage.REJECTED),
      invited: countStages(CaseStage.INVITATION_RECEIVED),
      visaApproved: countStages(CaseStage.VISA_APPROVED),
      departed: countStages(...DEPARTED_STAGES),
      // Ажилтан ба суваг
      staffPerformance: staff,
      leadsBySource: funnel.bySource,
    };
  }
}
