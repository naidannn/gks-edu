-- 2C-15: questions a signed-out visitor may ask before the sign-up card.
ALTER TABLE "ai_assistant_config" ADD COLUMN "guestMessageLimit" INTEGER NOT NULL DEFAULT 2;
