-- The intake-research button ran on gemini-2.5-pro, which Google now refuses to
-- new API keys (404 "no longer available to new users"). The whole 2.5 family is
-- refused, flash-lite included, so the replacement is the cheapest model Google
-- still answers on: gemini-3.1-flash-lite. It is a grounded extraction job whose
-- every answer a human reviews before it is saved, so the lite tier is enough.
ALTER TABLE "admission_config"
  ALTER COLUMN "researchModel" SET DEFAULT 'gemini-3.1-flash-lite';

-- Existing row still holds the retired id; a default only reaches new rows.
UPDATE "admission_config"
   SET "researchModel" = 'gemini-3.1-flash-lite'
 WHERE "researchModel" LIKE 'gemini-2.5%';
