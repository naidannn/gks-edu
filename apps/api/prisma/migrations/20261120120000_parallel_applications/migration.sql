-- 1E-13: a case may apply to more than one school at once. Every existing row
-- is its case's only application, so it becomes the primary one.

DROP INDEX "applications_caseId_key";

ALTER TABLE "applications" ADD COLUMN "isPrimary" BOOLEAN NOT NULL DEFAULT true;

CREATE INDEX "applications_caseId_idx" ON "applications"("caseId");

CREATE UNIQUE INDEX "applications_caseId_universityId_key" ON "applications"("caseId", "universityId");

-- One primary per case. SQL-only: Prisma cannot see a partial index, so never
-- let `migrate diff` regenerate this file.
CREATE UNIQUE INDEX "applications_one_primary_per_case" ON "applications"("caseId") WHERE "isPrimary";
