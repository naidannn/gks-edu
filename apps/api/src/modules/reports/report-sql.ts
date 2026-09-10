import { Prisma } from '../../prisma/client.js';
import { OFFICE_TIME_ZONE, type ReportPeriod } from './report-period.js';

/**
 * The SQL vocabulary every report is written in.
 *
 * These fragments exist so that one definition — "when does a month start?",
 * "which document statuses count as done?", "when did this case reach a
 * milestone?" — is written once. A report that re-spells any of them is a
 * report that will quietly disagree with the others.
 */

/**
 * A period bound, as an instant. The caller's `YYYY-MM-DD` is an office-local
 * calendar date; `AT TIME ZONE` turns it into the moment that day began in
 * Ulaanbaatar, which is what the timestamps in the database must be compared
 * against.
 */
export function localInstant(day: string): Prisma.Sql {
  return Prisma.sql`(CAST(${day} AS date)::timestamp AT TIME ZONE ${OFFICE_TIME_ZONE})`;
}

/**
 * `YYYY-MM` of a timestamp, in office-local months.
 *
 * **Two** `AT TIME ZONE`s, and the first one is the fix (1N-37). Every
 * `DateTime` column here is `timestamp without time zone` holding a UTC value,
 * and `naive AT TIME ZONE 'Asia/Ulaanbaatar'` reads that value as *already
 * being* Ulaanbaatar time and converts the wrong way — pushing every payment
 * taken in the office's first sixteen hours of a month into the month before.
 * `AT TIME ZONE 'UTC'` first says what the naive value actually is; the second
 * then puts it on the office clock.
 *
 * The period totals never had this bug: `within` compares against
 * {@link localInstant}, so both sides are instants and Postgres does the
 * conversion itself.
 */
export function localMonth(column: Prisma.Sql): Prisma.Sql {
  return Prisma.sql`to_char(date_trunc('month', (${column} AT TIME ZONE 'UTC') AT TIME ZONE ${OFFICE_TIME_ZONE}), 'YYYY-MM')`;
}

/** `column` falls inside the period (half-open, so no boundary double-count). */
export function within(column: Prisma.Sql, from: string, to: string): Prisma.Sql {
  return Prisma.sql`${column} >= ${localInstant(from)} AND ${column} < ${localInstant(to)}`;
}

export function inPeriod(column: Prisma.Sql, period: ReportPeriod): Prisma.Sql {
  return within(column, period.from, period.to);
}

export function inPreviousPeriod(column: Prisma.Sql, period: ReportPeriod): Prisma.Sql {
  return within(column, period.previousFrom, period.previousTo);
}

/** Whole days between two instants, as a float — the input to every median. */
export function daysBetween(from: Prisma.Sql, to: Prisma.Sql): Prisma.Sql {
  return Prisma.sql`(EXTRACT(EPOCH FROM (${to} - ${from})) / 86400.0)`;
}

/** `percentile_cont(0.5)`, which skips NULLs and so measures only what happened. */
export function median(expression: Prisma.Sql): Prisma.Sql {
  return Prisma.sql`percentile_cont(0.5) WITHIN GROUP (ORDER BY ${expression})::float8`;
}

/**
 * A required document is "done" once it has been accepted — everything past
 * ACCEPTED in the §6.2 flow is post-acceptance handling, not the client's
 * problem any more. Same list the client's checklist ticks off.
 */
export const DOCUMENT_DONE_STATUSES = Prisma.sql`('ACCEPTED', 'IN_TRANSLATION', 'TRANSLATED', 'CERTIFIED', 'READY', 'SENT_TO_UNIVERSITY')`;

/** Stages that mean the case is no longer moving through the pipeline. */
export const CLOSED_STAGES = Prisma.sql`('COMPLETED', 'DEPARTED', 'CANCELLED', 'REJECTED')`;

/** Money GKS keeps. `SCHOOL_TUITION` is the school's; `REFUND` is negative. */
export const INCOME_KINDS = Prisma.sql`('PREPAYMENT', 'BALANCE', 'TRANSFER_FEE', 'EXTRA_SERVICE')`;

/**
 * One row per case, carrying the first time it reached each milestone.
 *
 * Derived from `case_transitions`, which `CasesService.writeTransition` appends
 * to on every stage change — so this is the audit trail, not a second record
 * that could drift from it. `min()` because a case that bounces back and forth
 * (ON_HOLD and out again) first reached the milestone once.
 */
export const MILESTONES_CTE = Prisma.sql`
  milestones AS (
    SELECT
      t."caseId" AS case_id,
      min(t."createdAt") FILTER (WHERE t."toStage" = 'CONTRACT_SIGNED')                                   AS contract_signed_at,
      min(t."createdAt") FILTER (WHERE t."toStage" = 'PREPAYMENT_PAID')                                   AS prepayment_at,
      min(t."createdAt") FILTER (WHERE t."toStage" = 'DOCUMENTS')                                         AS documents_at,
      min(t."createdAt") FILTER (WHERE t."toStage" = 'APPLICATION_SUBMITTED')                             AS submitted_at,
      min(t."createdAt") FILTER (WHERE t."toStage" IN ('ADMITTED', 'GKS_ROUND1_PASSED', 'GKS_ROUND2_PASSED')) AS admitted_at,
      min(t."createdAt") FILTER (WHERE t."toStage" = 'INVITATION_RECEIVED')                               AS invited_at,
      min(t."createdAt") FILTER (WHERE t."toStage" = 'VISA_APPROVED')                                     AS visa_approved_at,
      min(t."createdAt") FILTER (WHERE t."toStage" IN ('DEPARTED', 'COMPLETED'))                          AS departed_at,
      min(t."createdAt") FILTER (WHERE t."toStage" = 'CANCELLED')                                         AS cancelled_at,
      min(t."createdAt") FILTER (WHERE t."toStage" = 'REJECTED')                                          AS rejected_at,
      max(t."createdAt")                                                                                  AS last_moved_at
    FROM "case_transitions" t
    GROUP BY t."caseId"
  )
`;

/**
 * How far a case got, as a number, so the funnel can be counted monotonically.
 *
 * Taking the furthest milestone rather than each flag on its own is what stops
 * a funnel from widening halfway down: a case admitted without a recorded
 * DOCUMENTS transition still counts as having passed DOCUMENTS, because it
 * plainly did.
 */
export const FURTHEST_MILESTONE = Prisma.sql`
  CASE
    WHEN m.departed_at       IS NOT NULL THEN 8
    WHEN m.visa_approved_at  IS NOT NULL THEN 7
    WHEN m.invited_at        IS NOT NULL THEN 6
    WHEN m.admitted_at       IS NOT NULL THEN 5
    WHEN m.submitted_at      IS NOT NULL THEN 4
    WHEN m.documents_at      IS NOT NULL THEN 3
    WHEN m.prepayment_at     IS NOT NULL THEN 2
    WHEN m.contract_signed_at IS NOT NULL THEN 1
    ELSE 0
  END
`;

/**
 * Stages before the application is lodged. Once a case is past
 * APPLICATION_SUBMITTED the school has the file, so it can no longer miss the
 * round however its own paperwork reads.
 */
export const NOT_YET_SUBMITTED = Prisma.sql`c.stage IN ('CONTRACT_DRAFT', 'CONTRACT_SIGNED', 'PREPAYMENT_PAID', 'DOCUMENTS')`;

/**
 * The deadline a case actually runs on: the programme's own if it has one,
 * otherwise the term's. `resolveIntakeDates` applies the same "override ??
 * term" rule everywhere else — this is that rule in SQL, and it must stay in
 * step with it. Requires `INTAKE_OVERRIDE_JOIN`.
 */
export const INTAKE_INTERNAL_DEADLINE = Prisma.sql`COALESCE(ovr."internalDeadline", it."internalDeadline")`;

/** Joins the per-programme override that `INTAKE_INTERNAL_DEADLINE` reads. */
export const INTAKE_OVERRIDE_JOIN = Prisma.sql`
  LEFT JOIN "intake_program_overrides" ovr
    ON ovr."intakeId" = it.id AND ovr."programId" = c."programId"
`;

/**
 * Required-document progress for one case, as a lateral rather than a join, so
 * a case with no documents yet still produces a row of zeroes instead of
 * disappearing from the very report that exists to find it. Exposes
 * `docs.required_total`, `docs.required_done` and `docs.overdue_docs`.
 */
export const CASE_DOC_PROGRESS = Prisma.sql`
  LEFT JOIN LATERAL (
    SELECT
      count(*) FILTER (WHERE cd.necessity = 'REQUIRED')::int AS required_total,
      count(*) FILTER (WHERE cd.necessity = 'REQUIRED' AND cd.status IN ${DOCUMENT_DONE_STATUSES})::int AS required_done,
      count(*) FILTER (
        WHERE cd.necessity = 'REQUIRED'
          AND cd."dueAt" IS NOT NULL
          AND cd."dueAt" < now()
          AND cd.status NOT IN ${DOCUMENT_DONE_STATUSES}
      )::int AS overdue_docs
    FROM "case_documents" cd
    WHERE cd."caseId" = c.id AND cd."deletedAt" IS NULL
  ) docs ON TRUE
`;

/** Round to whole tugriks — MNT has no subunit anybody quotes. */
export function money(value: number | string | null | undefined): number {
  return Math.round(Number(value ?? 0));
}

/** A count column arrives as a number already; this only guards against NULL. */
export function count(value: number | string | null | undefined): number {
  return Number(value ?? 0);
}

/** One decimal place, the precision every percentage in the UI is shown at. */
export function percent(part: number, whole: number): number {
  return whole > 0 ? Math.round((part / whole) * 1000) / 10 : 0;
}

/** A rate that does not exist yet reads as "—", never as 0%. */
export function rateOrNull(part: number, whole: number): number | null {
  return whole > 0 ? Math.round((part / whole) * 1000) / 10 : null;
}

/** Medians come back as fractional days; one decimal is as precise as it gets. */
export function days(value: number | string | null | undefined): number | null {
  if (value === null || value === undefined) return null;
  return Math.round(Number(value) * 10) / 10;
}
