-- An omitted list column was written as SQL NULL, and Prisma's `isEmpty` filter
-- matches only a real empty array — so every "applies to everyone" rule was
-- invisible to the requirement engine (1D-04). Backfill, then make the shape
-- impossible to reproduce.

UPDATE "requirement_rules" SET "serviceTypes"       = '{}' WHERE "serviceTypes"       IS NULL;
UPDATE "requirement_rules" SET "educationLevels"    = '{}' WHERE "educationLevels"    IS NULL;
UPDATE "requirement_rules" SET "guarantorTypes"     = '{}' WHERE "guarantorTypes"     IS NULL;
UPDATE "requirement_rules" SET "guarantorRelations" = '{}' WHERE "guarantorRelations" IS NULL;

ALTER TABLE "requirement_rules"
  ALTER COLUMN "serviceTypes"       SET DEFAULT ARRAY[]::"ServiceType"[],
  ALTER COLUMN "serviceTypes"       SET NOT NULL,
  ALTER COLUMN "educationLevels"    SET DEFAULT ARRAY[]::"EducationLevel"[],
  ALTER COLUMN "educationLevels"    SET NOT NULL,
  ALTER COLUMN "guarantorTypes"     SET DEFAULT ARRAY[]::"GuarantorType"[],
  ALTER COLUMN "guarantorTypes"     SET NOT NULL,
  ALTER COLUMN "guarantorRelations" SET DEFAULT ARRAY[]::"GuarantorRelation"[],
  ALTER COLUMN "guarantorRelations" SET NOT NULL;
