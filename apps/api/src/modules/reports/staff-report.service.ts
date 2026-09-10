import { Injectable } from '@nestjs/common';
import type { Role } from '../../prisma/client.js';
import type { ReportPeriodInfo, StaffReport, StaffReportRow } from './report-types.js';
import { Prisma } from '../../prisma/client.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import type { ReportPeriod } from './report-period.js';
import { CLOSED_STAGES, INCOME_KINDS, inPeriod, money, rateOrNull } from './report-sql.js';

/**
 * 1M-06 — who did what, in a period.
 *
 * The old staff view counted every lead, task and tugrik a person had ever
 * touched, so it only ever went up and told a manager nothing about this month.
 * Every column here is one of two things, and the shape says which:
 *
 * - **Flow** — assigned, won, signed, collected *inside the period*.
 * - **Stock** — active cases and open tasks *right now*, because "you have 14
 *   things open" is not a fact about August.
 *
 * Revenue is attributed to the case's consultant and counts only GKS income
 * (`INCOME_KINDS`), so no one is credited with tuition that passed through to a
 * Korean school.
 */

interface StaffSqlRow {
  staff_id: string;
  name: string | null;
  email: string | null;
  role: string;
  leads_assigned: number;
  leads_won: number;
  leads_lost: number;
  contracts_signed: number;
  contract_value_mnt: number;
  collected_mnt: number;
  cases_advanced: number;
  tasks_completed: number;
  documents_reviewed: number;
  active_cases: number;
  open_tasks: number;
  overdue_tasks: number;
}

@Injectable()
export class StaffReportService {
  constructor(private readonly prisma: PrismaService) {}

  async build(period: ReportPeriod, periodInfo: ReportPeriodInfo): Promise<StaffReport> {
    // Correlated subqueries rather than joins: each column counts a different
    // table, and one query per staff member would be a round trip per person.
    const rows = await this.prisma.$queryRaw<StaffSqlRow[]>`
      SELECT
        u.id           AS staff_id,
        u.name         AS name,
        u.email        AS email,
        u.role::text   AS role,

        -- Flow, inside the period.
        (SELECT count(*)::int FROM "leads" l
          WHERE l."assignedToId" = u.id AND l."mergedIntoId" IS NULL
            AND ${inPeriod(Prisma.sql`l."createdAt"`, period)}) AS leads_assigned,
        -- A stage change is an event with a date, so "won this month" is
        -- answerable; the lead row itself only remembers its current stage.
        (SELECT count(DISTINCT la."leadId")::int FROM "lead_activities" la
          JOIN "leads" l ON l.id = la."leadId"
          WHERE l."assignedToId" = u.id AND la.type = 'STAGE_CHANGE' AND la.meta->>'to' = 'WON'
            AND ${inPeriod(Prisma.sql`la."occurredAt"`, period)}) AS leads_won,
        (SELECT count(DISTINCT la."leadId")::int FROM "lead_activities" la
          JOIN "leads" l ON l.id = la."leadId"
          WHERE l."assignedToId" = u.id AND la.type = 'STAGE_CHANGE' AND la.meta->>'to' = 'LOST'
            AND ${inPeriod(Prisma.sql`la."occurredAt"`, period)}) AS leads_lost,
        (SELECT count(*)::int FROM "contracts" ct
          JOIN "cases" c ON c.id = ct."caseId"
          WHERE c."assignedConsultantId" = u.id AND ct."signedAt" IS NOT NULL
            AND ${inPeriod(Prisma.sql`ct."signedAt"`, period)}) AS contracts_signed,
        (SELECT COALESCE(sum(ct."totalAmountSnapshot"), 0)::float8 FROM "contracts" ct
          JOIN "cases" c ON c.id = ct."caseId"
          WHERE c."assignedConsultantId" = u.id AND ct."signedAt" IS NOT NULL
            AND ${inPeriod(Prisma.sql`ct."signedAt"`, period)}) AS contract_value_mnt,
        (SELECT COALESCE(sum(p."amountMnt"), 0)::float8 FROM "payments" p
          JOIN "cases" c ON c.id = p."caseId"
          WHERE c."assignedConsultantId" = u.id AND p.status = 'PAID' AND p.kind IN ${INCOME_KINDS}
            AND ${inPeriod(Prisma.sql`p."paidAt"`, period)}) AS collected_mnt,
        (SELECT count(*)::int FROM "case_transitions" t
          WHERE t."actorId" = u.id AND ${inPeriod(Prisma.sql`t."createdAt"`, period)}) AS cases_advanced,
        (SELECT count(*)::int FROM "work_tasks" t
          WHERE t."assigneeId" = u.id AND t.status = 'DONE' AND t."completedAt" IS NOT NULL
            AND ${inPeriod(Prisma.sql`t."completedAt"`, period)}) AS tasks_completed,
        (SELECT count(*)::int FROM "document_review_notes" n
          WHERE n."authorId" = u.id AND ${inPeriod(Prisma.sql`n."createdAt"`, period)}) AS documents_reviewed,

        -- Stock, right now.
        (SELECT count(*)::int FROM "cases" c
          WHERE (c."assignedConsultantId" = u.id OR c."assignedDocOfficerId" = u.id)
            AND c.stage NOT IN ${CLOSED_STAGES}) AS active_cases,
        (SELECT count(*)::int FROM "work_tasks" t
          WHERE t."assigneeId" = u.id AND t.status IN ('TODO', 'IN_PROGRESS')) AS open_tasks,
        (SELECT count(*)::int FROM "work_tasks" t
          WHERE t."assigneeId" = u.id AND t.status IN ('TODO', 'IN_PROGRESS') AND t."dueAt" < now()) AS overdue_tasks

      FROM "users" u
      WHERE u.role <> 'USER' AND u."isActive" = true
    `;

    return {
      period: periodInfo,
      rows: rows
        .map(
          (row): StaffReportRow => ({
            staffId: row.staff_id,
            name: row.name,
            email: row.email,
            role: row.role as Role,
            leadsAssigned: row.leads_assigned,
            leadsWon: row.leads_won,
            leadsLost: row.leads_lost,
            // Of the leads this person *closed* in the period, how many landed.
            conversionRate: rateOrNull(row.leads_won, row.leads_won + row.leads_lost),
            contractsSigned: row.contracts_signed,
            contractValueMnt: money(row.contract_value_mnt),
            collectedMnt: money(row.collected_mnt),
            casesAdvanced: row.cases_advanced,
            tasksCompleted: row.tasks_completed,
            documentsReviewed: row.documents_reviewed,
            activeCases: row.active_cases,
            openTasks: row.open_tasks,
            overdueTasks: row.overdue_tasks,
          }),
        )
        .sort((a, b) => b.collectedMnt - a.collectedMnt || (a.name ?? '').localeCompare(b.name ?? '', 'mn')),
    };
  }
}
