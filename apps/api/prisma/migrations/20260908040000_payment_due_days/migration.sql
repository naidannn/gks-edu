-- `Payment.dueAt` had no author.
--
-- The column existed and four things read it — the "Төлбөрийн хугацаа болсон"
-- reminder sweep (§16), the receivables count on the payments screen,
-- `mv_finance.overdue_mnt`, and the overdue badge in the client portal — but
-- nothing ever wrote it, so every one of them reported zero and the reminder
-- could not fire at all.
--
-- The missing input is a payment term: how long a client is given to pay an
-- invoice once it is raised. It is versioned with the price rather than being a
-- constant, for the same reason the price is (gksedu.md §5.4). 7 days is the
-- office's current practice; §18 asks the business to confirm it.
--
-- Existing PENDING rows are deliberately left with a null `dueAt`: giving them
-- one retroactively would put every stale invoice past its date at once and
-- send each client a reminder on the next nightly sweep.
ALTER TABLE "service_pricing"
  ADD COLUMN "paymentDueDays" INTEGER NOT NULL DEFAULT 7;

-- The receivables queries filter on (status, dueAt); until now nothing did.
CREATE INDEX "payments_status_dueAt_idx" ON "payments" ("status", "dueAt");

-- The composite above answers a plain `status` lookup as well, so the old
-- single-column index is now dead weight on every payment write.
DROP INDEX IF EXISTS "payments_status_idx";
