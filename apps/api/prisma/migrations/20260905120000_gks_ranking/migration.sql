-- AlterTable
ALTER TABLE "universities" ADD COLUMN     "gksRank" INTEGER,
ADD COLUMN     "gksRankBoost" DOUBLE PRECISION NOT NULL DEFAULT 0,
ADD COLUMN     "gksScore" DOUBLE PRECISION,
ADD COLUMN     "gksScoreParts" JSONB,
ADD COLUMN     "gksScoredAt" TIMESTAMP(3),
ADD COLUMN     "theKoreaRank" INTEGER,
ADD COLUMN     "theRankYear" INTEGER,
ADD COLUMN     "theWorldRank" TEXT;

-- CreateTable
CREATE TABLE "gks_ranking_config" (
    "id" TEXT NOT NULL DEFAULT 'default',
    "weightBaseRank" DOUBLE PRECISION NOT NULL DEFAULT 40,
    "weightPartnership" DOUBLE PRECISION NOT NULL DEFAULT 20,
    "weightFit" DOUBLE PRECISION NOT NULL DEFAULT 15,
    "weightDemand" DOUBLE PRECISION NOT NULL DEFAULT 15,
    "weightPractical" DOUBLE PRECISION NOT NULL DEFAULT 10,
    "unrankedBaseScore" DOUBLE PRECISION NOT NULL DEFAULT 45,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "updatedById" UUID,

    CONSTRAINT "gks_ranking_config_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "universities_gksRank_idx" ON "universities"("gksRank");

-- CreateIndex
CREATE INDEX "universities_theKoreaRank_idx" ON "universities"("theKoreaRank");

-- AddForeignKey
ALTER TABLE "gks_ranking_config" ADD CONSTRAINT "gks_ranking_config_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
