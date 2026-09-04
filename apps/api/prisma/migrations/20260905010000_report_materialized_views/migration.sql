-- 1G-08 — the four report materialized views of ARCHITECTURE.md §13.
--
-- The dashboard reads these instead of aggregating the transactional tables on
-- every page load. Each carries a UNIQUE index so the nightly job can use
-- REFRESH MATERIALIZED VIEW CONCURRENTLY and never block a reader.
--
-- Prisma does not model materialized views, so they live only here and are
-- queried with $queryRaw from `reports.service.ts`.

-- ── 1. Sales funnel (gksedu.md §19: суваг, хөрвөлт) ─────────────────────────
CREATE MATERIALIZED VIEW "mv_sales_funnel" AS
SELECT
  date_trunc('month', l."createdAt")::date              AS month,
  l.source                                              AS source,
  l.stage                                               AS stage,
  count(*)::bigint                                      AS lead_count,
  count(*) FILTER (WHERE l."assignedToId" IS NULL)::bigint AS unassigned_count,
  avg(EXTRACT(EPOCH FROM (l."updatedAt" - l."createdAt")) / 86400)::numeric(10, 2) AS avg_age_days
FROM "leads" l
-- A merged duplicate is not a second enquiry (1B-09).
WHERE l."mergedIntoId" IS NULL
GROUP BY 1, 2, 3;

CREATE UNIQUE INDEX "mv_sales_funnel_key" ON "mv_sales_funnel" (month, source, stage);

-- ── 2. Finance (§19: орлого, урьдчилгаа, үлдэгдэл, авлага, буцаалт) ─────────
CREATE MATERIALIZED VIEW "mv_finance" AS
SELECT
  date_trunc('month', COALESCE(p."paidAt", p."dueAt", p."createdAt"))::date AS month,
  c."serviceType"                        AS service_type,
  p.kind                                 AS kind,
  p.status                               AS status,
  count(*)::bigint                       AS payment_count,
  COALESCE(sum(p."amountMnt"), 0)::numeric(18, 2) AS total_mnt,
  count(*) FILTER (WHERE p.status = 'PENDING' AND p."dueAt" < now())::bigint AS overdue_count,
  COALESCE(sum(p."amountMnt") FILTER (WHERE p.status = 'PENDING' AND p."dueAt" < now()), 0)::numeric(18, 2) AS overdue_mnt
FROM "payments" p
JOIN "cases" c ON c.id = p."caseId"
GROUP BY 1, 2, 3, 4;

CREATE UNIQUE INDEX "mv_finance_key" ON "mv_finance" (month, service_type, kind, status);

-- ── 3. Document progress (§19: материал бүрдүүлж байгаа, хугацаа хэтэрсэн) ──
CREATE MATERIALIZED VIEW "mv_document_progress" AS
SELECT
  c.id                                   AS case_id,
  c.code                                 AS case_code,
  c."serviceType"                        AS service_type,
  c.stage                                AS case_stage,
  c."userId"                             AS user_id,
  c."assignedDocOfficerId"               AS doc_officer_id,
  count(cd.id) FILTER (WHERE cd.necessity = 'REQUIRED')::bigint AS required_total,
  count(cd.id) FILTER (
    WHERE cd.necessity = 'REQUIRED'
      AND cd.status IN ('ACCEPTED', 'IN_TRANSLATION', 'TRANSLATED', 'CERTIFIED', 'READY', 'SENT_TO_UNIVERSITY')
  )::bigint AS required_done,
  count(cd.id) FILTER (
    WHERE cd.necessity = 'REQUIRED'
      AND cd."dueAt" IS NOT NULL
      AND cd."dueAt" < now()
      AND cd.status NOT IN ('ACCEPTED', 'IN_TRANSLATION', 'TRANSLATED', 'CERTIFIED', 'READY', 'SENT_TO_UNIVERSITY')
  )::bigint AS overdue_count,
  min(cd."dueAt") FILTER (
    WHERE cd.necessity = 'REQUIRED'
      AND cd.status NOT IN ('ACCEPTED', 'IN_TRANSLATION', 'TRANSLATED', 'CERTIFIED', 'READY', 'SENT_TO_UNIVERSITY')
  ) AS next_due_at
FROM "cases" c
LEFT JOIN "case_documents" cd ON cd."caseId" = c.id AND cd."deletedAt" IS NULL
GROUP BY c.id;

CREATE UNIQUE INDEX "mv_document_progress_key" ON "mv_document_progress" (case_id);
CREATE INDEX "mv_document_progress_officer" ON "mv_document_progress" (doc_officer_id);

-- ── 4. Staff performance (§19: ажилтан тус бүрийн гүйцэтгэл) ────────────────
CREATE MATERIALIZED VIEW "mv_staff_performance" AS
SELECT
  u.id                                   AS staff_id,
  u.name                                 AS staff_name,
  u.email                                AS staff_email,
  u.role                                 AS role,
  (SELECT count(*) FROM "leads" l WHERE l."assignedToId" = u.id AND l."mergedIntoId" IS NULL)::bigint AS leads_assigned,
  (SELECT count(*) FROM "leads" l WHERE l."assignedToId" = u.id AND l.stage = 'WON')::bigint          AS leads_won,
  (SELECT count(*) FROM "leads" l WHERE l."assignedToId" = u.id AND l.stage = 'LOST')::bigint         AS leads_lost,
  (SELECT count(*) FROM "cases" c WHERE c."assignedConsultantId" = u.id)::bigint                      AS cases_as_consultant,
  (SELECT count(*) FROM "cases" c WHERE c."assignedDocOfficerId" = u.id)::bigint                      AS cases_as_doc_officer,
  (SELECT count(*) FROM "work_tasks" t WHERE t."assigneeId" = u.id AND t.status IN ('TODO', 'IN_PROGRESS'))::bigint AS open_tasks,
  (SELECT count(*) FROM "work_tasks" t WHERE t."assigneeId" = u.id AND t.status IN ('TODO', 'IN_PROGRESS') AND t."dueAt" < now())::bigint AS overdue_tasks,
  (SELECT count(*) FROM "work_tasks" t WHERE t."assigneeId" = u.id AND t.status = 'DONE')::bigint     AS completed_tasks,
  (SELECT count(*) FROM "document_review_notes" n WHERE n."authorId" = u.id)::bigint                  AS review_notes,
  (SELECT COALESCE(sum(p."amountMnt"), 0) FROM "payments" p
     JOIN "cases" c ON c.id = p."caseId"
    WHERE c."assignedConsultantId" = u.id AND p.status = 'PAID')::numeric(18, 2)                      AS revenue_mnt
FROM "users" u
WHERE u.role <> 'USER' AND u."isActive" = true;

CREATE UNIQUE INDEX "mv_staff_performance_key" ON "mv_staff_performance" (staff_id);
