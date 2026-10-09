-- 2F: star a Facebook thread to come back to it.
ALTER TABLE "facebook_threads"
  ADD COLUMN "starred" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "starredAt" TIMESTAMP(3);

CREATE INDEX "facebook_threads_starred_lastMessageAt_idx" ON "facebook_threads"("starred", "lastMessageAt");
