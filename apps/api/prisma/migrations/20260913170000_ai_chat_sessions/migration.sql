-- 2B-02, 2B-03 — chat sessions, messages, feedback, the knowledge-gap queue and
-- the assistant's configuration singleton (AI-ASSISTANT.md §11).
--
-- Hand-assembled from `migrate diff`, with its drift removed: that diff also
-- wanted to drop the trigram indexes on `faculties` and `university_programs`,
-- the three SQL-only indexes on `knowledge_chunks`, and the generated `tsv`
-- column's definition — none of which Prisma can see. See the 2A-01 migration.

-- CreateEnum
CREATE TYPE "ChatChannel" AS ENUM ('WEB_WIDGET', 'PORTAL', 'ADMIN_COPILOT');

-- CreateEnum
CREATE TYPE "ChatSessionStatus" AS ENUM ('ACTIVE', 'HANDED_OFF', 'CLOSED');

-- CreateEnum
CREATE TYPE "ChatOutcome" AS ENUM ('NONE', 'LEAD_CREATED', 'HANDOFF', 'CONTRACT_STARTED');

-- CreateEnum
CREATE TYPE "ChatRole" AS ENUM ('USER', 'ASSISTANT', 'TOOL', 'SYSTEM');

-- CreateEnum
CREATE TYPE "FeedbackValue" AS ENUM ('UP', 'DOWN');

-- CreateEnum
CREATE TYPE "FeedbackReason" AS ENUM ('WRONG', 'INCOMPLETE', 'IRRELEVANT', 'OTHER');

-- CreateEnum
CREATE TYPE "GapStatus" AS ENUM ('OPEN', 'ANSWERED', 'IGNORED');

-- AlterTable
ALTER TABLE "leads" ADD COLUMN     "aiQualification" JSONB;

-- CreateTable
CREATE TABLE "chat_sessions" (
    "id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "channel" "ChatChannel" NOT NULL,
    "status" "ChatSessionStatus" NOT NULL DEFAULT 'ACTIVE',
    "userId" UUID,
    "anonymousId" TEXT,
    "accessLevel" "AccessLevel" NOT NULL,
    "caseId" UUID,
    "leadId" UUID,
    "conversationId" UUID,
    "profile" JSONB NOT NULL DEFAULT '{}',
    "intents" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "outcome" "ChatOutcome" NOT NULL DEFAULT 'NONE',
    "summary" TEXT,
    "utm" JSONB,
    "landingPage" TEXT,
    "messageCount" INTEGER NOT NULL DEFAULT 0,
    "promptTokens" INTEGER NOT NULL DEFAULT 0,
    "completionTokens" INTEGER NOT NULL DEFAULT 0,
    "costMicros" BIGINT NOT NULL DEFAULT 0,
    "lastMessageAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "chat_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "chat_messages" (
    "id" UUID NOT NULL,
    "sessionId" UUID NOT NULL,
    "role" "ChatRole" NOT NULL,
    "content" TEXT NOT NULL,
    "toolCalls" JSONB,
    "citations" JSONB,
    "cards" JSONB,
    "model" TEXT,
    "grounded" BOOLEAN NOT NULL DEFAULT true,
    "promptTokens" INTEGER,
    "completionTokens" INTEGER,
    "latencyMs" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "chat_messages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "chat_feedback" (
    "id" UUID NOT NULL,
    "messageId" UUID NOT NULL,
    "value" "FeedbackValue" NOT NULL,
    "reason" "FeedbackReason",
    "comment" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "chat_feedback_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "knowledge_gaps" (
    "id" UUID NOT NULL,
    "question" TEXT NOT NULL,
    "embedding" vector(1536),
    "occurrences" INTEGER NOT NULL DEFAULT 1,
    "firstSessionId" UUID,
    "lastAskedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "status" "GapStatus" NOT NULL DEFAULT 'OPEN',
    "answerDocId" UUID,
    "assigneeId" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "knowledge_gaps_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ai_assistant_config" (
    "id" TEXT NOT NULL DEFAULT 'default',
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "chatModel" TEXT NOT NULL DEFAULT 'gemini-3.1-flash-lite',
    "fallbackModel" TEXT NOT NULL DEFAULT 'deepseek-v4-flash',
    "embeddingModel" TEXT NOT NULL DEFAULT 'gemini-embedding-001',
    "temperature" DOUBLE PRECISION NOT NULL DEFAULT 0.2,
    "maxOutputTokens" INTEGER NOT NULL DEFAULT 700,
    "retrievalTopK" INTEGER NOT NULL DEFAULT 8,
    "minSimilarity" DOUBLE PRECISION NOT NULL DEFAULT 0.66,
    "sessionMessageLimit" INTEGER NOT NULL DEFAULT 40,
    "sessionTokenBudget" INTEGER NOT NULL DEFAULT 60000,
    "dailyTokenBudget" INTEGER NOT NULL DEFAULT 3000000,
    "leadCaptureAfterMessages" INTEGER NOT NULL DEFAULT 3,
    "greeting" TEXT NOT NULL DEFAULT 'Сайн байна уу. Солонгост суралцах талаар юу ч асууж болно — сургууль, хугацаа, материал, тэтгэлэг.',
    "persona" TEXT NOT NULL DEFAULT 'Чи GKS EDU-ийн туслах. Нэргүй, хүн шиг дүр зохиохгүй, хэрэглэгчийг «та» гэж дуудна. Найрсаг, товч, монголоор хариулна.',
    "ctaRules" JSONB NOT NULL DEFAULT '[]',
    "handoffHours" JSONB NOT NULL DEFAULT '{"mon-fri":["09:00","18:00"],"sat":["10:00","14:00"]}',
    "copilotEnabled" BOOLEAN NOT NULL DEFAULT true,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "updatedById" UUID,

    CONSTRAINT "ai_assistant_config_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "chat_sessions_code_key" ON "chat_sessions"("code");

-- CreateIndex
CREATE UNIQUE INDEX "chat_sessions_conversationId_key" ON "chat_sessions"("conversationId");

-- CreateIndex
CREATE INDEX "chat_sessions_userId_lastMessageAt_idx" ON "chat_sessions"("userId", "lastMessageAt");

-- CreateIndex
CREATE INDEX "chat_sessions_anonymousId_idx" ON "chat_sessions"("anonymousId");

-- CreateIndex
CREATE INDEX "chat_sessions_status_lastMessageAt_idx" ON "chat_sessions"("status", "lastMessageAt");

-- CreateIndex
CREATE INDEX "chat_sessions_leadId_idx" ON "chat_sessions"("leadId");

-- CreateIndex
CREATE INDEX "chat_sessions_caseId_idx" ON "chat_sessions"("caseId");

-- CreateIndex
CREATE INDEX "chat_messages_sessionId_createdAt_idx" ON "chat_messages"("sessionId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "chat_feedback_messageId_key" ON "chat_feedback"("messageId");

-- CreateIndex
CREATE INDEX "knowledge_gaps_status_occurrences_idx" ON "knowledge_gaps"("status", "occurrences");

-- CreateIndex
CREATE INDEX "knowledge_gaps_assigneeId_idx" ON "knowledge_gaps"("assigneeId");

-- AddForeignKey
ALTER TABLE "chat_sessions" ADD CONSTRAINT "chat_sessions_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "chat_sessions" ADD CONSTRAINT "chat_sessions_caseId_fkey" FOREIGN KEY ("caseId") REFERENCES "cases"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "chat_sessions" ADD CONSTRAINT "chat_sessions_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "leads"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "chat_sessions" ADD CONSTRAINT "chat_sessions_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "conversations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "chat_messages" ADD CONSTRAINT "chat_messages_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "chat_sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "chat_feedback" ADD CONSTRAINT "chat_feedback_messageId_fkey" FOREIGN KEY ("messageId") REFERENCES "chat_messages"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "knowledge_gaps" ADD CONSTRAINT "knowledge_gaps_answerDocId_fkey" FOREIGN KEY ("answerDocId") REFERENCES "knowledge_documents"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "knowledge_gaps" ADD CONSTRAINT "knowledge_gaps_assigneeId_fkey" FOREIGN KEY ("assigneeId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_assistant_config" ADD CONSTRAINT "ai_assistant_config_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- The gap queue merges near-duplicate questions by cosine distance, so it needs
-- the same ANN index the knowledge chunks have. Without it every new gap scans
-- the table — cheap today, and quietly not cheap once the queue has a year in it.
CREATE INDEX "knowledge_gaps_embedding_hnsw_idx"
  ON "knowledge_gaps" USING hnsw ("embedding" vector_cosine_ops);
