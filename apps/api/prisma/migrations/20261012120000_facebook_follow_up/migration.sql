-- 2G-07: automatic Messenger follow-ups inside Meta's 24-hour window.
CREATE TYPE "FacebookFollowUp" AS ENUM ('NUDGE', 'PROMO', 'BOOKED');

ALTER TABLE "facebook_messages" ADD COLUMN "followUp" "FacebookFollowUp";
ALTER TABLE "facebook_threads" ADD COLUMN "followUpOptOut" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "ai_assistant_config" ADD COLUMN "facebookFollowUpEnabled" BOOLEAN NOT NULL DEFAULT false;
