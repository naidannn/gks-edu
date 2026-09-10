-- 1N-08 — one refund per payment. A second "Буцаах" click now races against an
-- index instead of against a read, so it fails loudly instead of paying twice.
-- Existing data first: keep the earliest refund of each payment and detach the
-- rest. The rows stay — nothing about money that already moved is rewritten.
UPDATE "payments" p
SET "refundOfId" = NULL
WHERE p."refundOfId" IS NOT NULL
  AND p.id <> (
    SELECT q.id FROM "payments" q
    WHERE q."refundOfId" = p."refundOfId"
    ORDER BY q."createdAt", q.id
    LIMIT 1
  );

-- CreateIndex
CREATE UNIQUE INDEX "payments_refundOfId_key" ON "payments"("refundOfId");

-- 1N-09 — at most one *open* invoice per (case, kind). Two live QRs for one
-- debt is how a client pays twice, and the check-then-create in PaymentsService
-- cannot stop a double click on its own.
--
-- Prisma has no syntax for a partial index, so this one exists only here — the
-- same arrangement as the trigram and HNSW indexes of the earlier migrations.
-- Any existing duplicates: keep the newest, expire the rest. The older QRs are
-- unreachable from the app anyway, because it always returned the newest.
UPDATE "payments" p
SET "status" = 'EXPIRED'
WHERE p."status" = 'PENDING'
  AND p.id <> (
    SELECT q.id FROM "payments" q
    WHERE q."caseId" = p."caseId" AND q."kind" = p."kind" AND q."status" = 'PENDING'
    ORDER BY q."createdAt" DESC, q.id DESC
    LIMIT 1
  );

CREATE UNIQUE INDEX "payments_caseId_kind_pending_key"
  ON "payments" ("caseId", "kind")
  WHERE "status" = 'PENDING';

-- 1N-23 — the 1D-12 reminder table. `DocumentRemindersService` wrote rows into
-- it that nothing ever read: the reminders a client actually receives come from
-- `ReminderSweepsService`, which reads `CaseDocument.dueAt` directly.
-- DropForeignKey
ALTER TABLE "document_reminders" DROP CONSTRAINT "document_reminders_caseDocumentId_fkey";

-- DropTable
DROP TABLE "document_reminders";
