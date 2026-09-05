-- Contract numbers as the signed paper carries them: `СГ/26/001`, the sequence
-- restarting each calendar year. Existing rows are numbered in the order they
-- were created, so an already-signed contract keeps a stable, plausible number.
ALTER TABLE "contracts" ADD COLUMN "number" TEXT;

UPDATE "contracts" AS c
SET "number" = numbered."number"
FROM (
  SELECT
    id,
    'СГ/'
      || to_char("createdAt", 'YY')
      || '/'
      || lpad(
           row_number() OVER (PARTITION BY date_part('year', "createdAt") ORDER BY "createdAt", id)::text,
           3,
           '0'
         ) AS "number"
  FROM "contracts"
) AS numbered
WHERE c.id = numbered.id;

ALTER TABLE "contracts" ALTER COLUMN "number" SET NOT NULL;

-- CreateIndex
CREATE UNIQUE INDEX "contracts_number_key" ON "contracts"("number");
