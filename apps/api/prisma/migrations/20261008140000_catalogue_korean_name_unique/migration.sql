-- 1I-14 — a programme and a faculty are identified inside one school by their
-- Korean name, not by `nameMn`.
--
-- `nameMn` is our translation and comes out differently every time somebody
-- words it, so the same department went in twice as «Компьютерийн ухаан» and
-- «Компьютерийн шинжлэх ухаан». The Korean name is the school's own and does
-- not drift. Spaces and case are ignored — `글로벌 경영학과` and `글로벌경영학과`
-- are one department — with the same expression as `catalogueNameKey` in
-- src/modules/programs/catalogue-name.ts. Change one, change the other.
--
-- Both indexes are SQL-only: Prisma has no syntax for a unique index on an
-- expression with a predicate, so a `migrate diff` against the live database
-- will want to DROP them. Hand-write the next migration, as with the trigram
-- indexes and the partial unique index on `payments` (20260921120000).
--
-- `nameMn` stays unique as before.

-- A blank is "not known", the same as null — and two blanks must not collide.
UPDATE "university_programs" SET "nameKo" = NULL WHERE btrim("nameKo") = '';
UPDATE "university_programs" SET "nameEn" = NULL WHERE btrim("nameEn") = '';
UPDATE "faculties" SET "nameKo" = NULL WHERE btrim("nameKo") = '';
UPDATE "faculties" SET "nameEn" = NULL WHERE btrim("nameEn") = '';

-- CreateIndex
CREATE UNIQUE INDEX "university_programs_universityId_level_nameKo_key"
  ON "university_programs" ("universityId", "level", lower(regexp_replace("nameKo", '\s', '', 'g')))
  WHERE "nameKo" IS NOT NULL;

-- CreateIndex
CREATE UNIQUE INDEX "faculties_universityId_nameKo_key"
  ON "faculties" ("universityId", lower(regexp_replace("nameKo", '\s', '', 'g')))
  WHERE "nameKo" IS NOT NULL;
