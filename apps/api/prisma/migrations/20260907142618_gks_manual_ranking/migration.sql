-- CreateEnum
CREATE TYPE "GksRankingMode" AS ENUM ('AUTO', 'MANUAL');

-- AlterTable
ALTER TABLE "gks_ranking_config" ADD COLUMN     "mode" "GksRankingMode" NOT NULL DEFAULT 'AUTO';

-- AlterTable
ALTER TABLE "universities" ADD COLUMN     "gksManualRank" INTEGER;

-- CreateIndex
CREATE INDEX "universities_gksManualRank_idx" ON "universities"("gksManualRank");
