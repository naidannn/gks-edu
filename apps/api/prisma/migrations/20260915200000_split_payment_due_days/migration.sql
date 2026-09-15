-- 1C-35 — one payment window becomes two.
--
-- `paymentDueDays` served the prepayment and the balance alike. The office
-- wants the prepayment due in 3 days (2026-09-15: the same three days after
-- which an unpaid case is cancelled, 1C-43) and the much larger balance in 14
-- (ARCHITECTURE.md §18-23).
--
-- The column is renamed rather than dropped, so closed pricing rows keep the
-- window they were actually in force with. Only the rows in effect today take
-- the new prepayment window; invoices already raised keep their `dueAt`.
--
-- Hand-written rather than generated: `prisma migrate diff` against this
-- schema drops every SQL-only index the database carries.
ALTER TABLE "service_pricing" RENAME COLUMN "paymentDueDays" TO "prepaymentDueDays";
ALTER TABLE "service_pricing" ALTER COLUMN "prepaymentDueDays" SET DEFAULT 3;
UPDATE "service_pricing" SET "prepaymentDueDays" = 3 WHERE "effectiveTo" IS NULL;
ALTER TABLE "service_pricing" ADD COLUMN IF NOT EXISTS "balanceDueDays" INTEGER NOT NULL DEFAULT 14;
