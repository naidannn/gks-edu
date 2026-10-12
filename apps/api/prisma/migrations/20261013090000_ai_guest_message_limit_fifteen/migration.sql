-- Guests get fifteen free answers before the sign-up card, not five (2G-19).
-- The recommendation now arrives within two answers and the refinements that
-- follow it are what keep a visitor talking, so five ran out mid-conversation.
-- Only the old default is moved; a value staff set in /admin/ai/settings stays.
ALTER TABLE "ai_assistant_config" ALTER COLUMN "guestMessageLimit" SET DEFAULT 15;
UPDATE "ai_assistant_config" SET "guestMessageLimit" = 15 WHERE "guestMessageLimit" = 5;
