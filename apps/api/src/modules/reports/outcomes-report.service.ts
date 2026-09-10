import { Injectable } from '@nestjs/common';
import type { ApplicationDecision, ServiceType, VisaType } from '../../prisma/client.js';
import type { OutcomesReport, ReportPeriodInfo, UniversityOutcomeRow, VisaRejectionRow } from './report-types.js';
import { Prisma } from '../../prisma/client.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import type { ReportPeriod } from './report-period.js';
import { inPeriod, inPreviousPeriod, rateOrNull } from './report-sql.js';

/**
 * 1M-04 — did it work?
 *
 * §19 asks for "тэнцсэн болон татгалзсан" and "виз гарсан болон татгалзсан",
 * and the old dashboard answered half of each: it showed admissions and visa
 * approvals and never once counted a refusal, which makes a success rate
 * impossible to compute and a bad school impossible to spot. For a brokerage
 * these two rates *are* the product — a client is buying the odds.
 *
 * Both sides are counted here, per university and per service, on the date the
 * decision landed rather than the date the case was opened: a report about
 * outcomes has to be timed by the outcome.
 */

/** Application statuses that are still in the school's hands. */
const PENDING_STATUSES = Prisma.sql`('SUBMITTED', 'UNDER_REVIEW', 'ADDITIONAL_DOCS_REQUESTED', 'INTERVIEW_SCHEDULED')`;

/** How many refusals the report names before the list stops being readable. */
const REJECTION_LIMIT = 25;

interface OutcomeCounts {
  submitted: number;
  accepted: number;
  rejected: number;
  pending: number;
  deferred: number;
}

@Injectable()
export class OutcomesReportService {
  constructor(private readonly prisma: PrismaService) {}

  async build(period: ReportPeriod, periodInfo: ReportPeriodInfo): Promise<OutcomesReport> {
    // An application belongs to the period by when it was submitted; one that
    // was never submitted belongs to when it was raised, so nothing vanishes.
    const applicationDate = Prisma.sql`COALESCE(a."submittedAt", a."createdAt")`;
    const visaDate = Prisma.sql`COALESCE(v."decidedAt", v."submittedAt", v."createdAt")`;

    const counts = Prisma.sql`
      count(*)::int                                              AS submitted,
      count(*) FILTER (WHERE a.status = 'ACCEPTED')::int          AS accepted,
      count(*) FILTER (WHERE a.status = 'REJECTED')::int          AS rejected,
      count(*) FILTER (WHERE a.status IN ${PENDING_STATUSES})::int AS pending,
      count(*) FILTER (WHERE a.status = 'DEFERRED')::int          AS deferred
    `;

    const [totals, previousTotals, byUniversity, byService, gksRounds, visa, previousVisa, rejections] =
      await Promise.all([
        this.prisma.$queryRaw<OutcomeCounts[]>`
          SELECT ${counts} FROM "applications" a WHERE ${inPeriod(applicationDate, period)}
        `,
        this.prisma.$queryRaw<OutcomeCounts[]>`
          SELECT ${counts} FROM "applications" a WHERE ${inPreviousPeriod(applicationDate, period)}
        `,
        this.prisma.$queryRaw<(OutcomeCounts & { university_id: string | null; name_mn: string | null; name_ko: string | null })[]>`
          SELECT
            a."universityId" AS university_id,
            un."nameMn"      AS name_mn,
            un."nameKo"      AS name_ko,
            ${counts}
          FROM "applications" a
          LEFT JOIN "universities" un ON un.id = a."universityId"
          WHERE ${inPeriod(applicationDate, period)}
          GROUP BY 1, 2, 3
        `,
        this.prisma.$queryRaw<(OutcomeCounts & { service_type: string })[]>`
          SELECT c."serviceType"::text AS service_type, ${counts}
          FROM "applications" a
          JOIN "cases" c ON c.id = a."caseId"
          WHERE ${inPeriod(applicationDate, period)}
          GROUP BY 1
        `,
        // GKS decides in two rounds (§7); every other service only has round 1.
        this.prisma.$queryRaw<{ round: number; decision: string; count: number }[]>`
          SELECT r.round, r.decision::text AS decision, count(*)::int AS count
          FROM "application_results" r
          WHERE ${inPeriod(Prisma.sql`r."decidedAt"`, period)}
          GROUP BY 1, 2
          ORDER BY 1, 2
        `,
        this.prisma.$queryRaw<{ visa_type: string; approved: number; rejected: number; pending: number }[]>`
          SELECT
            v."visaType"::text AS visa_type,
            count(*) FILTER (WHERE v.status = 'APPROVED')::int AS approved,
            count(*) FILTER (WHERE v.status = 'REJECTED')::int AS rejected,
            count(*) FILTER (WHERE v.status NOT IN ('APPROVED', 'REJECTED'))::int AS pending
          FROM "visa_cases" v
          WHERE ${inPeriod(visaDate, period)}
          GROUP BY 1
        `,
        this.prisma.$queryRaw<{ approved: number; rejected: number }[]>`
          SELECT
            count(*) FILTER (WHERE v.status = 'APPROVED')::int AS approved,
            count(*) FILTER (WHERE v.status = 'REJECTED')::int AS rejected
          FROM "visa_cases" v
          WHERE ${inPreviousPeriod(visaDate, period)}
        `,
        this.prisma.$queryRaw<
          {
            case_id: string;
            case_code: string;
            client_name: string | null;
            visa_type: string;
            decided_at: Date | null;
            reason: string | null;
          }[]
        >`
          SELECT
            c.id   AS case_id,
            c.code AS case_code,
            COALESCE(NULLIF(TRIM(CONCAT(cl."lastName", ' ', cl."firstName")), ''), u.name) AS client_name,
            v."visaType"::text  AS visa_type,
            v."decidedAt"       AS decided_at,
            v."rejectionReason" AS reason
          FROM "visa_cases" v
          JOIN "cases" c ON c.id = v."caseId"
          JOIN "users" u ON u.id = c."userId"
          LEFT JOIN "clients" cl ON cl."userId" = c."userId"
          WHERE v.status = 'REJECTED' AND ${inPeriod(visaDate, period)}
          ORDER BY v."decidedAt" DESC NULLS LAST
          LIMIT ${REJECTION_LIMIT}
        `,
      ]);

    const total = totals[0] ?? empty();
    const previous = previousTotals[0] ?? empty();
    const visaTotals = visa.reduce(
      (sum, row) => ({
        approved: sum.approved + row.approved,
        rejected: sum.rejected + row.rejected,
        pending: sum.pending + row.pending,
      }),
      { approved: 0, rejected: 0, pending: 0 },
    );
    const previousVisaTotals = previousVisa[0] ?? { approved: 0, rejected: 0 };

    const rounds = new Map<number, { decision: string; count: number }[]>();
    for (const row of gksRounds) {
      rounds.set(row.round, [...(rounds.get(row.round) ?? []), { decision: row.decision, count: row.count }]);
    }

    return {
      period: periodInfo,
      applications: {
        ...total,
        successRate: rateOrNull(total.accepted, total.accepted + total.rejected),
        previousSuccessRate: rateOrNull(previous.accepted, previous.accepted + previous.rejected),
      },
      byUniversity: byUniversity
        .map(
          (row): UniversityOutcomeRow => ({
            universityId: row.university_id,
            // An application whose university was later unset still happened.
            nameMn: row.name_mn ?? 'Сургууль тодорхойгүй',
            nameKo: row.name_ko,
            submitted: row.submitted,
            accepted: row.accepted,
            rejected: row.rejected,
            pending: row.pending,
            successRate: rateOrNull(row.accepted, row.accepted + row.rejected),
          }),
        )
        .sort((a, b) => b.submitted - a.submitted || a.nameMn.localeCompare(b.nameMn, 'mn')),
      byService: byService
        .map((row) => ({
          serviceType: row.service_type as ServiceType,
          submitted: row.submitted,
          accepted: row.accepted,
          rejected: row.rejected,
          successRate: rateOrNull(row.accepted, row.accepted + row.rejected),
        }))
        .sort((a, b) => b.submitted - a.submitted),
      gksRounds: [...rounds.entries()]
        .sort(([a], [b]) => a - b)
        .map(([round, counts]) => ({
          round,
          counts: counts.map((entry) => ({
            decision: entry.decision as ApplicationDecision,
            count: entry.count,
          })),
        })),
      visa: {
        ...visaTotals,
        approvalRate: rateOrNull(visaTotals.approved, visaTotals.approved + visaTotals.rejected),
        previousApprovalRate: rateOrNull(
          previousVisaTotals.approved,
          previousVisaTotals.approved + previousVisaTotals.rejected,
        ),
        byType: visa
          .map((row) => ({
            visaType: row.visa_type as VisaType,
            approved: row.approved,
            rejected: row.rejected,
            pending: row.pending,
          }))
          .sort((a, b) => b.approved + b.rejected - (a.approved + a.rejected)),
        rejections: rejections.map(
          (row): VisaRejectionRow => ({
            caseId: row.case_id,
            caseCode: row.case_code,
            clientName: row.client_name,
            visaType: row.visa_type as VisaType,
            decidedAt: row.decided_at ? row.decided_at.toISOString() : null,
            reason: row.reason,
          }),
        ),
      },
    };
  }
}

function empty(): OutcomeCounts {
  return { submitted: 0, accepted: 0, rejected: 0, pending: 0, deferred: 0 };
}
