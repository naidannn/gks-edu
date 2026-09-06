-- CreateEnum
CREATE TYPE "CaseChoiceTrack" AS ENUM ('SCHOLARSHIP', 'REGULAR');

-- CreateTable
CREATE TABLE "case_university_choices" (
    "id" UUID NOT NULL,
    "caseId" UUID NOT NULL,
    "universityId" UUID NOT NULL,
    "programId" UUID,
    "track" "CaseChoiceTrack" NOT NULL DEFAULT 'REGULAR',
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "major" TEXT,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "case_university_choices_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "case_university_choices_caseId_sortOrder_idx" ON "case_university_choices"("caseId", "sortOrder");

-- CreateIndex
CREATE UNIQUE INDEX "case_university_choices_caseId_universityId_key" ON "case_university_choices"("caseId", "universityId");

-- AddForeignKey
ALTER TABLE "case_university_choices" ADD CONSTRAINT "case_university_choices_caseId_fkey" FOREIGN KEY ("caseId") REFERENCES "cases"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "case_university_choices" ADD CONSTRAINT "case_university_choices_universityId_fkey" FOREIGN KEY ("universityId") REFERENCES "universities"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "case_university_choices" ADD CONSTRAINT "case_university_choices_programId_fkey" FOREIGN KEY ("programId") REFERENCES "university_programs"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Backfill: every case that already names a school keeps it as its first choice,
-- so `universityChoices` is the whole truth from day one rather than only for
-- cases opened after this migration.
INSERT INTO "case_university_choices" ("id", "caseId", "universityId", "programId", "track", "sortOrder", "createdAt", "updatedAt")
SELECT gen_random_uuid(),
       c."id",
       c."universityId",
       c."programId",
       CASE WHEN c."serviceType" = 'GKS_SCHOLARSHIP' THEN 'SCHOLARSHIP'::"CaseChoiceTrack" ELSE 'REGULAR'::"CaseChoiceTrack" END,
       0,
       c."createdAt",
       c."updatedAt"
FROM "cases" c
WHERE c."universityId" IS NOT NULL;
