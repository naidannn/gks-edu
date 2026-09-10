import { Injectable } from '@nestjs/common';
import type { PaymentKind, PaymentMethod, ServiceType } from '../../prisma/client.js';
import type { FinanceReport, ReceivableBucket, ReceivableRow, ReportPeriodInfo } from './report-types.js';
import { Prisma } from '../../prisma/client.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import { changePercent, type ReportPeriod } from './report-period.js';
import { INCOME_KINDS, inPeriod, inPreviousPeriod, localMonth, money } from './report-sql.js';

/**
 * 1M-02 — the money report.
 *
 * Two distinctions the old report did not make, and both of them changed the
 * headline number:
 *
 * - **Income is not turnover.** Сургалтын төлбөр that a client sends to a
 *   Korean school through our account is the school's money. Adding it to
 *   revenue made GKS look several times larger than it is, which is worse than
 *   useless when the figure is what the office plans against. It is reported,
 *   separately, as дамжин өнгөрөх мөнгө.
 * - **Шилжүүлгийн шимтгэл is income, and it was missing entirely.** The fee
 *   lives on `SchoolInvoice.transferFeeMnt` and never becomes a `Payment` row,
 *   so a report that only reads `payments` cannot see it. If a `TRANSFER_FEE`
 *   payment is ever introduced, it must replace this read rather than join it —
 *   one fee, one place.
 *
 * Everything under `receivables` is a **stock**: what is owed as of now. It is
 * queried live on purpose. A debt figure that is a night old is a figure that
 * sends somebody to ring a client who paid yesterday morning.
 */

/** Aging buckets, in the order the office reads them. */
const AGING: { bucket: ReceivableBucket; from: number; to: number }[] = [
  { bucket: 'UPCOMING', from: Number.NEGATIVE_INFINITY, to: 0 },
  { bucket: 'OVERDUE_1_7', from: 1, to: 7 },
  { bucket: 'OVERDUE_8_30', from: 8, to: 30 },
  { bucket: 'OVERDUE_31_60', from: 31, to: 60 },
  { bucket: 'OVERDUE_60_PLUS', from: 61, to: Number.POSITIVE_INFINITY },
];

/** How many debtors the report names before it stops being a list and starts being a database dump. */
const TOP_RECEIVABLES = 25;

interface IncomeRow {
  month: string;
  service_type: string;
  kind: string;
  method: string;
  payment_count: number;
  amount_mnt: number;
}

interface SchoolMoneyRow {
  month: string;
  invoice_count: number;
  pass_through_mnt: number;
  transfer_fee_mnt: number;
  awaiting_mnt: number;
}

interface ReceivableSqlRow {
  payment_id: string;
  case_id: string;
  case_code: string;
  client_name: string | null;
  consultant_name: string | null;
  service_type: string;
  kind: string;
  amount_mnt: number;
  due_at: Date | null;
}

@Injectable()
export class FinanceReportService {
  constructor(private readonly prisma: PrismaService) {}

  async build(period: ReportPeriod, periodInfo: ReportPeriodInfo): Promise<FinanceReport> {
    const paidAt = Prisma.sql`p."paidAt"`;
    const invoicePaidAt = Prisma.sql`si."paidAt"`;

    const [income, previousByService, schoolMoney, receivableRows, committed, caseCounts] = await Promise.all([
      this.prisma.$queryRaw<IncomeRow[]>`
        SELECT
          ${localMonth(paidAt)}          AS month,
          c."serviceType"::text          AS service_type,
          p.kind::text                   AS kind,
          p.method::text                 AS method,
          count(*)::int                  AS payment_count,
          sum(p."amountMnt")::float8     AS amount_mnt
        FROM "payments" p
        JOIN "cases" c ON c.id = p."caseId"
        WHERE p.status = 'PAID'
          AND p."paidAt" IS NOT NULL
          AND ${inPeriod(paidAt, period)}
        GROUP BY 1, 2, 3, 4
      `,
      this.prisma.$queryRaw<{ service_type: string; net_mnt: number }[]>`
        SELECT
          c."serviceType"::text AS service_type,
          sum(CASE WHEN p.kind = 'REFUND' THEN -p."amountMnt" ELSE p."amountMnt" END)::float8 AS net_mnt
        FROM "payments" p
        JOIN "cases" c ON c.id = p."caseId"
        WHERE p.status = 'PAID'
          AND p."paidAt" IS NOT NULL
          AND (p.kind IN ${INCOME_KINDS} OR p.kind = 'REFUND')
          AND ${inPreviousPeriod(paidAt, period)}
        GROUP BY 1
      `,
      this.prisma.$queryRaw<SchoolMoneyRow[]>`
        SELECT
          ${localMonth(invoicePaidAt)}                                                    AS month,
          count(*)::int                                                                   AS invoice_count,
          COALESCE(sum(si."amountMnt"), 0)::float8                                        AS pass_through_mnt,
          COALESCE(sum(si."transferFeeMnt"), 0)::float8                                   AS transfer_fee_mnt,
          COALESCE(sum(si."amountMnt") FILTER (WHERE si."receivedBySchoolAt" IS NULL), 0)::float8 AS awaiting_mnt
        FROM "school_invoices" si
        WHERE si."paidAt" IS NOT NULL
          AND si.status IN ('PAID', 'CONFIRMED_BY_SCHOOL')
          AND ${inPeriod(invoicePaidAt, period)}
        GROUP BY 1
      `,
      // Live, not period-bound: this is what is owed right now.
      this.prisma.$queryRaw<ReceivableSqlRow[]>`
        SELECT
          p.id                       AS payment_id,
          c.id                       AS case_id,
          c.code                     AS case_code,
          COALESCE(NULLIF(TRIM(CONCAT(cl."lastName", ' ', cl."firstName")), ''), u.name) AS client_name,
          cons.name                  AS consultant_name,
          c."serviceType"::text      AS service_type,
          p.kind::text               AS kind,
          p."amountMnt"::float8      AS amount_mnt,
          p."dueAt"                  AS due_at
        FROM "payments" p
        JOIN "cases" c    ON c.id = p."caseId"
        JOIN "users" u    ON u.id = c."userId"
        LEFT JOIN "clients" cl ON cl."userId" = c."userId"
        LEFT JOIN "users" cons ON cons.id = c."assignedConsultantId"
        WHERE p.status = 'PENDING'
          -- A cancelled case's invoice is not a debt anybody will collect.
          AND c.stage <> 'CANCELLED'
        ORDER BY p."dueAt" ASC NULLS LAST
      `,
      this.prisma.$queryRaw<{ case_count: number; amount_mnt: number }[]>`
        SELECT count(*)::int AS case_count, COALESCE(sum(remaining), 0)::float8 AS amount_mnt
        FROM (
          SELECT
            ct."totalAmountSnapshot" - COALESCE((
              SELECT sum(p."amountMnt")
              FROM "payments" p
              WHERE p."caseId" = ct."caseId"
                AND p.kind IN ('PREPAYMENT', 'BALANCE')
                AND p.status IN ('PAID', 'PENDING')
            ), 0) AS remaining
          FROM "contracts" ct
          JOIN "cases" c ON c.id = ct."caseId"
          WHERE ct.status IN ('SIGNED', 'ACTIVE')
            AND c.stage <> 'CANCELLED'
        ) uninvoiced
        WHERE remaining > 0
      `,
      this.prisma.$queryRaw<{ service_type: string; case_count: number }[]>`
        SELECT c."serviceType"::text AS service_type, count(DISTINCT p."caseId")::int AS case_count
        FROM "payments" p
        JOIN "cases" c ON c.id = p."caseId"
        WHERE p.status = 'PAID' AND p.kind IN ${INCOME_KINDS} AND ${inPeriod(paidAt, period)}
        GROUP BY 1
      `,
    ]);

    return {
      period: periodInfo,
      ...this.summarise(income, schoolMoney, previousByService, caseCounts),
      receivables: this.summariseReceivables(receivableRows, new Date(periodInfo.generatedAt)),
      committed: {
        caseCount: committed[0]?.case_count ?? 0,
        amountMnt: money(committed[0]?.amount_mnt),
      },
    };
  }

  /** Fold the payment and school-invoice rows into the report's four views of income. */
  private summarise(
    income: IncomeRow[],
    schoolMoney: SchoolMoneyRow[],
    previousByService: { service_type: string; net_mnt: number }[],
    caseCounts: { service_type: string; case_count: number }[],
  ): Omit<FinanceReport, 'period' | 'receivables' | 'committed'> {
    const totals = { prepayment: 0, balance: 0, extra: 0, transferFee: 0, refund: 0 };
    const byMonth = new Map<string, FinanceReport['byMonth'][number]>();
    const byService = new Map<string, { net: number; payments: number }>();
    const byMethod = new Map<string, { amountMnt: number; count: number }>();

    const month = (key: string) => {
      const existing = byMonth.get(key);
      if (existing) return existing;
      const created = {
        month: key,
        prepaymentMnt: 0,
        balanceMnt: 0,
        otherMnt: 0,
        refundMnt: 0,
        netMnt: 0,
        passThroughMnt: 0,
      };
      byMonth.set(key, created);
      return created;
    };

    for (const row of income) {
      const amount = Number(row.amount_mnt ?? 0);
      const bucket = month(row.month);
      const service = byService.get(row.service_type) ?? { net: 0, payments: 0 };

      switch (row.kind) {
        case 'PREPAYMENT':
          totals.prepayment += amount;
          bucket.prepaymentMnt += amount;
          break;
        case 'BALANCE':
          totals.balance += amount;
          bucket.balanceMnt += amount;
          break;
        case 'EXTRA_SERVICE':
        case 'TRANSFER_FEE':
          totals.extra += row.kind === 'EXTRA_SERVICE' ? amount : 0;
          totals.transferFee += row.kind === 'TRANSFER_FEE' ? amount : 0;
          bucket.otherMnt += amount;
          break;
        case 'REFUND':
          totals.refund += amount;
          bucket.refundMnt += amount;
          break;
        default:
          // SCHOOL_TUITION — the school's money passing through our account.
          // Counted under pass-through, never under income. Nothing writes such
          // a row today (§8 bills through `SchoolInvoice`); if something starts
          // to, it must replace the invoice read below rather than add to it.
          bucket.passThroughMnt += amount;
          continue;
      }

      const signed = row.kind === 'REFUND' ? -amount : amount;
      bucket.netMnt += signed;
      service.net += signed;
      service.payments += row.payment_count;
      byService.set(row.service_type, service);

      if (row.kind !== 'REFUND') {
        const method = byMethod.get(row.method) ?? { amountMnt: 0, count: 0 };
        method.amountMnt += amount;
        method.count += row.payment_count;
        byMethod.set(row.method, method);
      }
    }

    let passThroughCollected = 0;
    let awaitingSchool = 0;
    let invoiceCount = 0;
    for (const row of schoolMoney) {
      const bucket = month(row.month);
      bucket.passThroughMnt += Number(row.pass_through_mnt ?? 0);
      // The fee is ours, so it lands in income and in the month's net.
      bucket.otherMnt += Number(row.transfer_fee_mnt ?? 0);
      bucket.netMnt += Number(row.transfer_fee_mnt ?? 0);
      totals.transferFee += Number(row.transfer_fee_mnt ?? 0);
      passThroughCollected += Number(row.pass_through_mnt ?? 0);
      awaitingSchool += Number(row.awaiting_mnt ?? 0);
      invoiceCount += row.invoice_count;
    }

    const gross = totals.prepayment + totals.balance + totals.extra + totals.transferFee;
    const previous = new Map(previousByService.map((row) => [row.service_type, Number(row.net_mnt ?? 0)]));
    const cases = new Map(caseCounts.map((row) => [row.service_type, row.case_count]));
    const previousNet = [...previous.values()].reduce((sum, value) => sum + value, 0);
    const net = gross - totals.refund;

    return {
      income: {
        prepaymentMnt: money(totals.prepayment),
        balanceMnt: money(totals.balance),
        extraServiceMnt: money(totals.extra),
        transferFeeMnt: money(totals.transferFee),
        grossMnt: money(gross),
        refundMnt: money(totals.refund),
        netMnt: money(net),
        previousNetMnt: money(previousNet),
        changePercent: changePercent(money(net), money(previousNet)),
      },
      passThrough: {
        invoiceCount,
        collectedMnt: money(passThroughCollected),
        awaitingSchoolMnt: money(awaitingSchool),
      },
      byMonth: [...byMonth.values()]
        .sort((a, b) => a.month.localeCompare(b.month))
        .map((row) => ({
          month: row.month,
          prepaymentMnt: money(row.prepaymentMnt),
          balanceMnt: money(row.balanceMnt),
          otherMnt: money(row.otherMnt),
          refundMnt: money(row.refundMnt),
          netMnt: money(row.netMnt),
          passThroughMnt: money(row.passThroughMnt),
        })),
      byService: [...byService.entries()]
        .map(([serviceType, stats]) => ({
          serviceType: serviceType as ServiceType,
          netMnt: money(stats.net),
          previousMnt: money(previous.get(serviceType) ?? 0),
          changePercent: changePercent(money(stats.net), money(previous.get(serviceType) ?? 0)),
          paymentCount: stats.payments,
          caseCount: cases.get(serviceType) ?? 0,
        }))
        .sort((a, b) => b.netMnt - a.netMnt),
      byMethod: [...byMethod.entries()]
        .map(([method, stats]) => ({
          method: method as PaymentMethod,
          amountMnt: money(stats.amountMnt),
          count: stats.count,
        }))
        .sort((a, b) => b.amountMnt - a.amountMnt),
    };
  }

  /** Age every unpaid invoice against now, and name the ones worth a phone call. */
  private summariseReceivables(rows: ReceivableSqlRow[], now: Date): FinanceReport['receivables'] {
    const receivables: ReceivableRow[] = rows.map((row) => ({
      paymentId: row.payment_id,
      caseId: row.case_id,
      caseCode: row.case_code,
      clientName: row.client_name,
      consultantName: row.consultant_name,
      serviceType: row.service_type as ServiceType,
      kind: row.kind as PaymentKind,
      amountMnt: money(row.amount_mnt),
      dueAt: row.due_at ? row.due_at.toISOString() : null,
      daysOverdue: daysOverdue(row.due_at, now),
    }));

    const aging = AGING.map((bucket) => {
      const inBucket = receivables.filter((row) => row.daysOverdue >= bucket.from && row.daysOverdue <= bucket.to);
      return {
        bucket: bucket.bucket,
        count: inBucket.length,
        amountMnt: inBucket.reduce((sum, row) => sum + row.amountMnt, 0),
      };
    });

    return {
      totalMnt: receivables.reduce((sum, row) => sum + row.amountMnt, 0),
      overdueMnt: receivables.filter((row) => row.daysOverdue > 0).reduce((sum, row) => sum + row.amountMnt, 0),
      aging,
      // Oldest first, then largest: the debt that has been sitting longest is
      // the one that stops being collectable.
      top: [...receivables]
        .sort((a, b) => b.daysOverdue - a.daysOverdue || b.amountMnt - a.amountMnt)
        .slice(0, TOP_RECEIVABLES),
    };
  }
}

/**
 * Whole days a payment is past its date; 0 while it is still upcoming, and 0
 * when nobody set a date — an undated invoice is not evidence of lateness.
 */
function daysOverdue(dueAt: Date | null, now: Date): number {
  if (!dueAt) return 0;
  const elapsed = Math.floor((now.getTime() - dueAt.getTime()) / 86_400_000);
  return elapsed > 0 ? elapsed : 0;
}
