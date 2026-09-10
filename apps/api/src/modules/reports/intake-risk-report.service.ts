import { Injectable } from '@nestjs/common';
import type { CaseStage, ProgramLevel, ServiceType } from '../../prisma/client.js';
import type { IntakeRiskCaseRow, IntakeRiskReport, IntakeRiskTermRow } from './report-types.js';
import { Prisma } from '../../prisma/client.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import { daysUntil } from '../admissions/intake-deadline.js';
import {
  CASE_DOC_PROGRESS,
  CLOSED_STAGES,
  INTAKE_INTERNAL_DEADLINE,
  INTAKE_OVERRIDE_JOIN,
  NOT_YET_SUBMITTED,
} from './report-sql.js';

/**
 * 1M-05 — will we make the intake?
 *
 * The deadline that matters is **ours**, not the school's: `internalDeadline`
 * sits `AdmissionConfig.internalLeadDays` before the school's last day, and
 * translation, notarisation and postage live in that gap (CLAUDE.md). So this
 * report counts down to the internal date and never shows the school's, exactly
 * as every other countdown in the system does.
 *
 * It is a "now" report and takes no period. A deadline does not belong to a
 * reporting month — asking "how did our deadlines do in August" is not a
 * question anybody has.
 *
 * A programme on its own calendar overrides its term's dates
 * (`IntakeProgramOverride`); the COALESCE below is the same "override ?? term"
 * rule `resolveIntakeDates` applies everywhere else.
 */

/** How far ahead to look. Beyond a term, nothing is actionable yet. */
export const DEFAULT_HORIZON_DAYS = 120;

/** Enough cases to work through in one sitting. */
const CASE_LIMIT = 100;

interface TermSqlRow {
  intake_id: string;
  university_id: string;
  university_name_mn: string;
  level: string;
  year: number;
  month: number;
  internal_deadline: Date | null;
  case_count: number;
  submitted_count: number;
  documents_ready_count: number;
  at_risk_count: number;
}

interface CaseSqlRow {
  case_id: string;
  case_code: string;
  client_name: string | null;
  consultant_name: string | null;
  doc_officer_name: string | null;
  service_type: string;
  stage: string;
  university_name_mn: string | null;
  internal_deadline: Date | null;
  required_total: number;
  required_done: number;
  overdue_docs: number;
}

@Injectable()
export class IntakeRiskReportService {
  constructor(private readonly prisma: PrismaService) {}

  async build(horizonDays: number = DEFAULT_HORIZON_DAYS): Promise<IntakeRiskReport> {
    const now = new Date();

    const deadline = INTAKE_INTERNAL_DEADLINE;
    const withinHorizon = Prisma.sql`
      ${deadline} IS NOT NULL
      AND ${deadline} < now() + make_interval(days => ${horizonDays})
    `;

    const [terms, cases, withoutIntake] = await Promise.all([
      this.prisma.$queryRaw<TermSqlRow[]>`
        SELECT
          it.id                  AS intake_id,
          un.id                  AS university_id,
          un."nameMn"            AS university_name_mn,
          it.level::text         AS level,
          it.year                AS year,
          it.month               AS month,
          -- A term can carry several deadlines once programmes override it;
          -- the earliest is the one the office is actually working to.
          min(${deadline})       AS internal_deadline,
          count(*)::int          AS case_count,
          count(*) FILTER (WHERE NOT (${NOT_YET_SUBMITTED}))::int AS submitted_count,
          count(*) FILTER (WHERE docs.required_total > 0 AND docs.required_done >= docs.required_total)::int AS documents_ready_count,
          count(*) FILTER (WHERE ${NOT_YET_SUBMITTED})::int AS at_risk_count
        FROM "cases" c
        JOIN "intake_terms" it ON it.id = c."intakeId"
        JOIN "universities" un ON un.id = it."universityId"
        ${INTAKE_OVERRIDE_JOIN}
        ${CASE_DOC_PROGRESS}
        WHERE c.stage NOT IN ${CLOSED_STAGES}
          AND ${withinHorizon}
        GROUP BY it.id, un.id, un."nameMn", it.level, it.year, it.month
        ORDER BY min(${deadline}) ASC
      `,
      this.prisma.$queryRaw<CaseSqlRow[]>`
        SELECT
          c.id                   AS case_id,
          c.code                 AS case_code,
          COALESCE(NULLIF(TRIM(CONCAT(cl."lastName", ' ', cl."firstName")), ''), u.name) AS client_name,
          cons.name              AS consultant_name,
          doc.name               AS doc_officer_name,
          c."serviceType"::text  AS service_type,
          c.stage::text          AS stage,
          un."nameMn"            AS university_name_mn,
          ${deadline}            AS internal_deadline,
          docs.required_total    AS required_total,
          docs.required_done     AS required_done,
          docs.overdue_docs      AS overdue_docs
        FROM "cases" c
        JOIN "intake_terms" it ON it.id = c."intakeId"
        JOIN "universities" un ON un.id = it."universityId"
        JOIN "users" u ON u.id = c."userId"
        LEFT JOIN "clients" cl ON cl."userId" = c."userId"
        LEFT JOIN "users" cons ON cons.id = c."assignedConsultantId"
        LEFT JOIN "users" doc  ON doc.id = c."assignedDocOfficerId"
        ${INTAKE_OVERRIDE_JOIN}
        ${CASE_DOC_PROGRESS}
        WHERE c.stage NOT IN ${CLOSED_STAGES}
          AND ${withinHorizon}
          AND ${NOT_YET_SUBMITTED}
        ORDER BY ${deadline} ASC
        LIMIT ${CASE_LIMIT}
      `,
      this.prisma.case.count({
        where: {
          intakeId: null,
          stage: { notIn: ['COMPLETED', 'DEPARTED', 'CANCELLED', 'REJECTED'] },
        },
      }),
    ]);

    return {
      generatedAt: now.toISOString(),
      horizonDays,
      terms: terms.map(
        (row): IntakeRiskTermRow => ({
          intakeId: row.intake_id,
          universityId: row.university_id,
          universityNameMn: row.university_name_mn,
          level: row.level as ProgramLevel,
          year: row.year,
          month: row.month,
          internalDeadline: row.internal_deadline ? row.internal_deadline.toISOString() : null,
          daysLeft: daysUntil(row.internal_deadline, now),
          caseCount: row.case_count,
          submittedCount: row.submitted_count,
          documentsReadyCount: row.documents_ready_count,
          atRiskCount: row.at_risk_count,
        }),
      ),
      cases: cases.map(
        (row): IntakeRiskCaseRow => ({
          caseId: row.case_id,
          caseCode: row.case_code,
          clientName: row.client_name,
          consultantName: row.consultant_name,
          docOfficerName: row.doc_officer_name,
          serviceType: row.service_type as ServiceType,
          stage: row.stage as CaseStage,
          universityNameMn: row.university_name_mn,
          internalDeadline: row.internal_deadline ? row.internal_deadline.toISOString() : null,
          daysLeft: daysUntil(row.internal_deadline, now),
          requiredDocsTotal: row.required_total,
          requiredDocsDone: row.required_done,
          overdueDocs: row.overdue_docs,
        }),
      ),
      casesWithoutIntake: withoutIntake,
    };
  }

  /**
   * Just the headline: how many live cases could still miss their own deadline.
   * The overview shows this as a queue to clear, so it must be counted the same
   * way the detail report lists them.
   */
  async atRiskCount(horizonDays: number = DEFAULT_HORIZON_DAYS): Promise<number> {
    const rows = await this.prisma.$queryRaw<{ count: number }[]>`
      SELECT count(*)::int AS count
      FROM "cases" c
      JOIN "intake_terms" it ON it.id = c."intakeId"
      ${INTAKE_OVERRIDE_JOIN}
      WHERE c.stage NOT IN ${CLOSED_STAGES}
        AND ${NOT_YET_SUBMITTED}
        AND ${INTAKE_INTERNAL_DEADLINE} IS NOT NULL
        AND ${INTAKE_INTERNAL_DEADLINE} < now() + make_interval(days => ${horizonDays})
    `;
    return rows[0]?.count ?? 0;
  }
}
