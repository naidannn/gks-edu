-- 1C-27: money that never went through QPay (bank transfer, card, cash) is
-- registered by staff, and the row has to say which channel it came through.

-- CreateEnum
CREATE TYPE "PaymentMethod" AS ENUM ('QPAY', 'BANK_TRANSFER', 'CARD', 'CASH');

-- AlterTable
-- Every existing row predates manual registration, so QPAY is the truthful backfill.
ALTER TABLE "payments"
  ADD COLUMN "method" "PaymentMethod" NOT NULL DEFAULT 'QPAY',
  ADD COLUMN "reference" TEXT,
  ADD COLUMN "note" TEXT;

-- CreateIndex
CREATE INDEX "payments_method_idx" ON "payments"("method");
