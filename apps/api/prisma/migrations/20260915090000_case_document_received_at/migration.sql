-- 1D-24 — the paper handed over the office desk.
--
-- Until now the only trace of a physical hand-in was a status change, and
-- staff had no way to make one: the checklist card offered no action out of
-- `NOT_STARTED`. These two columns record the act itself, and they are
-- deliberately independent of `status` — a scan may already be accepted
-- online when the original finally arrives, and a paper handed across the
-- desk may still fail review.
--
-- Hand-written rather than generated: `prisma migrate diff` against this
-- schema drops every SQL-only index the database carries.
ALTER TABLE "case_documents" ADD COLUMN IF NOT EXISTS "receivedAt" TIMESTAMP(3);
ALTER TABLE "case_documents" ADD COLUMN IF NOT EXISTS "receivedById" UUID;

ALTER TABLE "case_documents"
  DROP CONSTRAINT IF EXISTS "case_documents_receivedById_fkey";
ALTER TABLE "case_documents"
  ADD CONSTRAINT "case_documents_receivedById_fkey"
  FOREIGN KEY ("receivedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
