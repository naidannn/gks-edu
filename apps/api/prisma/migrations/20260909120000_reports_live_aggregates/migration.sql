-- 1M — reporting moves from four nightly materialized views to live aggregates.
--
-- The views (`20260905010000_report_materialized_views`) refreshed once a night,
-- which meant every money figure on the management screen could be a day out.
-- For receivables that is not a rounding error, it is a phone call to a client
-- who paid yesterday morning. The tables behind these reports are small —
-- thousands of cases and payments — and the cost against the Supabase pooler is
-- the round trip, not the scan, so `reports.service.ts` now aggregates the
-- transactional tables directly and memoises the result in Redis for minutes
-- rather than hours.
--
-- Nothing else read these views, and Prisma never modelled them, so dropping
-- them changes no generated type.

DROP MATERIALIZED VIEW IF EXISTS "mv_sales_funnel";
DROP MATERIALIZED VIEW IF EXISTS "mv_finance";
DROP MATERIALIZED VIEW IF EXISTS "mv_document_progress";
DROP MATERIALIZED VIEW IF EXISTS "mv_staff_performance";

-- Every report asks "what happened between these two instants", so each date a
-- report buckets on gets an index. Declared in `schema.prisma` alongside the
-- models, so the schema and the database keep saying the same thing.

-- Revenue and receivables, by the month the money actually arrived.
CREATE INDEX "payments_paidAt_idx" ON "payments"("paidAt");

-- Pass-through tuition and the transfer fee (§8), by the same clock.
CREATE INDEX "school_invoices_paidAt_idx" ON "school_invoices"("paidAt");

-- The funnel reads milestones out of the transition trail.
CREATE INDEX "case_transitions_toStage_createdAt_idx" ON "case_transitions"("toStage", "createdAt");
CREATE INDEX "case_transitions_actorId_createdAt_idx" ON "case_transitions"("actorId", "createdAt");

-- Contract value signed inside a period, and the uninvoiced remainder.
CREATE INDEX "contracts_signedAt_idx" ON "contracts"("signedAt");

-- Admission outcomes are timed by the submission, not by the case.
CREATE INDEX "applications_submittedAt_idx" ON "applications"("submittedAt");

-- Visa approval and refusal rates, timed by the decision.
CREATE INDEX "visa_cases_decidedAt_idx" ON "visa_cases"("decidedAt");

-- "Won this month" is answered from the stage-change trail, because a lead row
-- only remembers the stage it is in now.
CREATE INDEX "lead_activities_type_occurredAt_idx" ON "lead_activities"("type", "occurredAt");

-- Tasks completed, and documents reviewed, inside a period.
CREATE INDEX "work_tasks_completedAt_idx" ON "work_tasks"("completedAt");
CREATE INDEX "document_review_notes_authorId_createdAt_idx" ON "document_review_notes"("authorId", "createdAt");

-- The deadline countdown groups live cases by their intake round.
CREATE INDEX "cases_intakeId_idx" ON "cases"("intakeId");
