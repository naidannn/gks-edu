-- Trigram index for the Facebook inbox search (`ILIKE '%q%'` over every message).
-- SQL-only, like the other trigram indexes: Prisma's schema does not declare it.
CREATE INDEX IF NOT EXISTS "facebook_messages_text_trgm_idx"
  ON "facebook_messages" USING GIN ("text" gin_trgm_ops);
