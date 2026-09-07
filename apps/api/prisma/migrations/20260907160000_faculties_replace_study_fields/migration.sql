-- 1I-12 — Сургууль → Танхим → Анги.
--
-- The canonical subject taxonomy goes away entirely. It solved "every school
-- words маркетинг differently" by making staff maintain a second vocabulary
-- forever; what a visitor types is a word, and the search now answers that
-- straight off the names. What replaces it is the school's own structure: the
-- college a department sits in, which the prospectus already prints.

-- --------------------------------------------------------------------------
-- 1. Faculties (단과대학)
-- --------------------------------------------------------------------------
CREATE TABLE "faculties" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "universityId" UUID NOT NULL,
  "nameMn" TEXT NOT NULL,
  "nameEn" TEXT,
  "nameKo" TEXT,
  "sortOrder" INTEGER NOT NULL DEFAULT 100,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "faculties_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "faculties_universityId_nameMn_key" ON "faculties" ("universityId", "nameMn");
CREATE INDEX "faculties_universityId_idx" ON "faculties" ("universityId");

ALTER TABLE "faculties"
  ADD CONSTRAINT "faculties_universityId_fkey"
  FOREIGN KEY ("universityId") REFERENCES "universities"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- --------------------------------------------------------------------------
-- 2. `university_programs.faculty` (free text) → a real row
--
-- The old column was whatever somebody typed. Every distinct non-empty value
-- per school becomes one faculty, and the programmes that carried it point at
-- it. Nothing is invented: a programme that had no faculty text keeps none.
-- --------------------------------------------------------------------------
ALTER TABLE "university_programs" ADD COLUMN "facultyId" UUID;

INSERT INTO "faculties" ("id", "universityId", "nameMn", "nameKo", "updatedAt")
SELECT gen_random_uuid(), p."universityId", trim(p."faculty"), trim(p."faculty"), CURRENT_TIMESTAMP
FROM "university_programs" p
WHERE p."faculty" IS NOT NULL AND trim(p."faculty") <> ''
GROUP BY p."universityId", trim(p."faculty");

UPDATE "university_programs" p
SET "facultyId" = f."id"
FROM "faculties" f
WHERE f."universityId" = p."universityId"
  AND f."nameMn" = trim(p."faculty");

ALTER TABLE "university_programs" DROP COLUMN "faculty";

ALTER TABLE "university_programs"
  ADD CONSTRAINT "university_programs_facultyId_fkey"
  FOREIGN KEY ("facultyId") REFERENCES "faculties"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "university_programs_facultyId_idx" ON "university_programs" ("facultyId");

-- --------------------------------------------------------------------------
-- 3. The taxonomy goes
-- --------------------------------------------------------------------------
DROP INDEX IF EXISTS "university_programs_studyFieldId_idx";
ALTER TABLE "university_programs" DROP CONSTRAINT IF EXISTS "university_programs_studyFieldId_fkey";
ALTER TABLE "university_programs" DROP COLUMN "studyFieldId";
DROP TABLE "study_fields";

-- --------------------------------------------------------------------------
-- 4. Search indexes
--
-- The keyword box is now the only way into the catalogue, so the columns it
-- reads get the same trigram treatment `universities` already has — ILIKE
-- '%it%' over a growing catalogue is otherwise a sequential scan.
-- --------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS "university_programs_nameMn_trgm_idx"
  ON "university_programs" USING GIN ("nameMn" gin_trgm_ops);
CREATE INDEX IF NOT EXISTS "university_programs_nameEn_trgm_idx"
  ON "university_programs" USING GIN ("nameEn" gin_trgm_ops);
CREATE INDEX IF NOT EXISTS "university_programs_nameKo_trgm_idx"
  ON "university_programs" USING GIN ("nameKo" gin_trgm_ops);
CREATE INDEX IF NOT EXISTS "faculties_nameMn_trgm_idx"
  ON "faculties" USING GIN ("nameMn" gin_trgm_ops);
CREATE INDEX IF NOT EXISTS "faculties_nameKo_trgm_idx"
  ON "faculties" USING GIN ("nameKo" gin_trgm_ops);
