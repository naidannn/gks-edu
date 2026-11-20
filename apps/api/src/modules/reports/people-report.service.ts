import { Injectable } from '@nestjs/common';
import { LeadStage, PaymentKind, PaymentStatus, Prisma, type LeadSource, type ServiceType } from '../../prisma/client.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import { clientPhaseOf, NOT_ABANDONED_ONLINE_WHERE } from '../clients/client-phase.js';
import { officeDayStart, type ReportPeriod } from './report-period.js';
import { inPeriod } from './report-sql.js';
import type { ClientReportRow, ConsultationReportRow, PeopleReport, ReportPeriodInfo } from './report-types.js';

/**
 * The stages that mean "a consultant has sat down with this person". `LOST`
 * is not one of them — a lead can be lost before anybody talked to it — so a
 * lost lead counts as consulted only if its trail says it passed through one.
 */
const CONSULTED_STAGES: LeadStage[] = [
  LeadStage.CONSULTED,
  LeadStage.PROPOSAL_SENT,
  LeadStage.CONTRACT_PENDING,
  LeadStage.WON,
];

interface LeadSqlRow {
  lead_id: string;
  last_name: string;
  first_name: string;
  phone: string;
  email: string | null;
  source: LeadSource;
  stage: LeadStage;
  interested_services: ServiceType[];
  interested_major: string | null;
  assigned_to_name: string | null;
  requested_at: Date;
  consulted_at: Date | null;
  client_code: string | null;
}

/**
 * 1M-11 — the people behind two of the overview's numbers, as lists.
 *
 * - **Үйлчлүүлэгч болсон** — every client registered in the period, minus the
 *   abandoned website sign-ups the register already hides (1B-27): a list the
 *   office mails around must not contain people the office never met.
 * - **Зөвлөгөө хүссэн** — every enquiry that arrived in the period.
 * - **Зөвлөгөө авсан** — every enquiry *first consulted* in the period,
 *   whenever it arrived. A request from the 28th answered on the 3rd belongs
 *   to the month it was answered in, so this is not a filter on the list above.
 *
 * "Consulted" is read from the stage-change trail, not the current stage, so
 * it has a date. A lead created straight into a consulted stage has no trail
 * entry for it; its creation is the consultation, and `createdAt` stands in.
 */
@Injectable()
export class PeopleReportService {
  constructor(private readonly prisma: PrismaService) {}

  async build(period: ReportPeriod, info: ReportPeriodInfo): Promise<PeopleReport> {
    const [clients, requested, consulted] = await Promise.all([
      this.clients(period),
      this.leads(inPeriod(Prisma.sql`l."createdAt"`, period)),
      this.leads(inPeriod(Prisma.sql`lc.consulted_at`, period)),
    ]);
    return { period: info, clients, requested, consulted };
  }

  private async clients(period: ReportPeriod): Promise<ClientReportRow[]> {
    const rows = await this.prisma.client.findMany({
      where: {
        AND: [
          { createdAt: { gte: officeDayStart(period.from), lt: officeDayStart(period.to) } },
          NOT_ABANDONED_ONLINE_WHERE,
        ],
      },
      orderBy: { createdAt: 'asc' },
      select: {
        id: true,
        code: true,
        lastName: true,
        firstName: true,
        phone: true,
        email: true,
        primaryServiceType: true,
        targetMajor: true,
        source: true,
        leadId: true,
        createdAt: true,
        targetUniversity: { select: { nameMn: true } },
        assignedConsultant: { select: { name: true } },
        user: {
          select: {
            cases: {
              select: {
                stage: true,
                contract: { select: { signedAt: true } },
                payments: {
                  where: { kind: PaymentKind.PREPAYMENT, status: PaymentStatus.PAID },
                  select: { paidAt: true },
                },
              },
            },
          },
        },
      },
    });

    return rows.map((row) => {
      const cases = row.user.cases;
      return {
        clientId: row.id,
        code: row.code,
        lastName: row.lastName,
        firstName: row.firstName,
        phone: row.phone,
        email: row.email,
        serviceType: row.primaryServiceType,
        universityNameMn: row.targetUniversity?.nameMn ?? null,
        targetMajor: row.targetMajor,
        source: row.source,
        consultantName: row.assignedConsultant?.name ?? null,
        phase: clientPhaseOf(cases),
        fromLead: row.leadId !== null,
        registeredAt: row.createdAt.toISOString(),
        contractSignedAt: earliest(cases.map((item) => item.contract?.signedAt)),
        prepaymentPaidAt: earliest(cases.flatMap((item) => item.payments.map((payment) => payment.paidAt))),
      };
    });
  }

  /** Enquiries, each with the moment it was first consulted; `where` picks which. */
  private async leads(where: Prisma.Sql): Promise<ConsultationReportRow[]> {
    const consultedStages = Prisma.join(CONSULTED_STAGES.map((stage) => Prisma.sql`${stage}`));
    const rows = await this.prisma.$queryRaw<LeadSqlRow[]>`
      WITH lc AS (
        SELECT l.id AS lead_id,
          COALESCE(
            (SELECT min(la."occurredAt") FROM "lead_activities" la
              WHERE la."leadId" = l.id AND la.type = 'STAGE_CHANGE' AND la.meta->>'to' IN (${consultedStages})),
            -- Created straight into a consulted stage: no trail entry, the
            -- creation itself was the consultation.
            CASE WHEN l.stage::text IN (${consultedStages}) THEN l."createdAt" END
          ) AS consulted_at
        FROM "leads" l
        WHERE l."mergedIntoId" IS NULL
      )
      SELECT
        l.id                    AS lead_id,
        l."lastName"            AS last_name,
        l."firstName"           AS first_name,
        l.phone                 AS phone,
        l.email                 AS email,
        l.source::text          AS source,
        l.stage::text           AS stage,
        l."interestedServices"::text[] AS interested_services,
        l."interestedMajor"     AS interested_major,
        u.name                  AS assigned_to_name,
        l."createdAt"           AS requested_at,
        lc.consulted_at         AS consulted_at,
        cl.code                 AS client_code
      FROM "leads" l
      JOIN lc ON lc.lead_id = l.id
      LEFT JOIN "users" u ON u.id = l."assignedToId"
      LEFT JOIN "clients" cl ON cl."leadId" = l.id
      WHERE ${where}
      ORDER BY l."createdAt" ASC
    `;

    return rows.map((row) => ({
      leadId: row.lead_id,
      lastName: row.last_name,
      firstName: row.first_name,
      phone: row.phone,
      email: row.email,
      source: row.source,
      stage: row.stage,
      interestedServices: row.interested_services ?? [],
      interestedMajor: row.interested_major,
      assignedToName: row.assigned_to_name,
      requestedAt: row.requested_at.toISOString(),
      consultedAt: row.consulted_at?.toISOString() ?? null,
      clientCode: row.client_code,
    }));
  }
}

function earliest(values: (Date | null | undefined)[]): string | null {
  const times = values.filter((value): value is Date => value instanceof Date).map((value) => value.getTime());
  return times.length ? new Date(Math.min(...times)).toISOString() : null;
}
