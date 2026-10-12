-- 2C-15: five free questions before the sign-up card, decided 2026-10-12.
-- The row is moved only if it still holds the old default; a value someone set
-- in /admin/ai/settings is theirs and stays.
ALTER TABLE "ai_assistant_config" ALTER COLUMN "guestMessageLimit" SET DEFAULT 5;
UPDATE "ai_assistant_config" SET "guestMessageLimit" = 5 WHERE "guestMessageLimit" = 2;
