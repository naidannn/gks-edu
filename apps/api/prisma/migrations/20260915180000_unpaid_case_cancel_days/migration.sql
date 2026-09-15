-- 1C-43 — cancel a case whose prepayment never came.
--
-- A case that was registered, maybe had its contract signed, and then went
-- quiet used to sit at CONTRACT_DRAFT / CONTRACT_SIGNED forever, holding a
-- place in every count. The office's rule is three days without movement; the
-- number is configuration, and 0 switches the sweep off.
--
-- Hand-written rather than generated: `prisma migrate diff` against this
-- schema drops every SQL-only index the database carries.
ALTER TABLE "admission_config" ADD COLUMN IF NOT EXISTS "unpaidCaseCancelDays" INTEGER NOT NULL DEFAULT 3;
