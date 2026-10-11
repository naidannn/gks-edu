-- 2F-11: what each assistant answer really cost, cache discount included.
ALTER TABLE "chat_messages" ADD COLUMN "cachedPromptTokens" INTEGER;
ALTER TABLE "chat_messages" ADD COLUMN "costMicros" BIGINT;
