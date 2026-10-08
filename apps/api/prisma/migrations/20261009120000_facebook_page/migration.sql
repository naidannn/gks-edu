-- 2F: the Facebook Page — Messenger threads and post comments.
ALTER TYPE "ChatChannel" ADD VALUE 'FACEBOOK';

CREATE TYPE "FacebookAiMode" AS ENUM ('AUTO', 'OFF');
CREATE TYPE "FacebookSender" AS ENUM ('CONTACT', 'AI', 'STAFF', 'PAGE');
CREATE TYPE "FacebookDeliveryStatus" AS ENUM ('SENT', 'FAILED');
CREATE TYPE "FacebookCommentStatus" AS ENUM ('NEW', 'AI_REPLIED', 'STAFF_REPLIED', 'IGNORED', 'FAILED');

ALTER TABLE "ai_assistant_config"
  ADD COLUMN "facebookEnabled" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "facebookCommentsEnabled" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "facebookCommentReply" TEXT NOT NULL DEFAULT 'Сайн байна уу! Дэлгэрэнгүй мэдээллийг inbox-оор илгээлээ 🙂',
  ADD COLUMN "facebookStaffPauseHours" INTEGER NOT NULL DEFAULT 12;

CREATE TABLE "facebook_threads" (
    "id" UUID NOT NULL,
    "psid" TEXT NOT NULL,
    "name" TEXT,
    "profilePic" TEXT,
    "leadId" UUID,
    "clientId" UUID,
    "aiMode" "FacebookAiMode" NOT NULL DEFAULT 'AUTO',
    "aiPausedUntil" TIMESTAMP(3),
    "chatSessionId" UUID,
    "needsStaff" BOOLEAN NOT NULL DEFAULT false,
    "unreadCount" INTEGER NOT NULL DEFAULT 0,
    "lastInboundAt" TIMESTAMP(3),
    "lastMessageAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastMessagePreview" TEXT,
    "lastSender" "FacebookSender",
    "referral" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "facebook_threads_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "facebook_messages" (
    "id" UUID NOT NULL,
    "threadId" UUID NOT NULL,
    "mid" TEXT,
    "sender" "FacebookSender" NOT NULL,
    "staffId" UUID,
    "text" TEXT,
    "attachments" JSONB NOT NULL DEFAULT '[]',
    "commentId" TEXT,
    "status" "FacebookDeliveryStatus" NOT NULL DEFAULT 'SENT',
    "error" TEXT,
    "chatMessageId" UUID,
    "knowledgeDocumentId" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "facebook_messages_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "facebook_comments" (
    "id" UUID NOT NULL,
    "commentId" TEXT NOT NULL,
    "postId" TEXT NOT NULL,
    "parentId" TEXT,
    "fromId" TEXT NOT NULL,
    "fromName" TEXT,
    "text" TEXT NOT NULL,
    "postMessage" TEXT,
    "postPermalink" TEXT,
    "status" "FacebookCommentStatus" NOT NULL DEFAULT 'NEW',
    "error" TEXT,
    "publicReplyId" TEXT,
    "publicReplyText" TEXT,
    "privateRepliedAt" TIMESTAMP(3),
    "threadId" UUID,
    "repliedById" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "facebook_comments_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "facebook_threads_psid_key" ON "facebook_threads"("psid");
CREATE UNIQUE INDEX "facebook_threads_chatSessionId_key" ON "facebook_threads"("chatSessionId");
CREATE INDEX "facebook_threads_lastMessageAt_idx" ON "facebook_threads"("lastMessageAt");
CREATE INDEX "facebook_threads_needsStaff_lastMessageAt_idx" ON "facebook_threads"("needsStaff", "lastMessageAt");
CREATE INDEX "facebook_threads_leadId_idx" ON "facebook_threads"("leadId");
CREATE INDEX "facebook_threads_clientId_idx" ON "facebook_threads"("clientId");

CREATE UNIQUE INDEX "facebook_messages_mid_key" ON "facebook_messages"("mid");
CREATE INDEX "facebook_messages_threadId_createdAt_idx" ON "facebook_messages"("threadId", "createdAt");
CREATE INDEX "facebook_messages_staffId_idx" ON "facebook_messages"("staffId");
CREATE INDEX "facebook_messages_knowledgeDocumentId_idx" ON "facebook_messages"("knowledgeDocumentId");

CREATE UNIQUE INDEX "facebook_comments_commentId_key" ON "facebook_comments"("commentId");
CREATE INDEX "facebook_comments_status_createdAt_idx" ON "facebook_comments"("status", "createdAt");
CREATE INDEX "facebook_comments_postId_idx" ON "facebook_comments"("postId");
CREATE INDEX "facebook_comments_threadId_idx" ON "facebook_comments"("threadId");
CREATE INDEX "facebook_comments_repliedById_idx" ON "facebook_comments"("repliedById");

ALTER TABLE "facebook_threads" ADD CONSTRAINT "facebook_threads_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "leads"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "facebook_threads" ADD CONSTRAINT "facebook_threads_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "clients"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "facebook_threads" ADD CONSTRAINT "facebook_threads_chatSessionId_fkey" FOREIGN KEY ("chatSessionId") REFERENCES "chat_sessions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "facebook_messages" ADD CONSTRAINT "facebook_messages_threadId_fkey" FOREIGN KEY ("threadId") REFERENCES "facebook_threads"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "facebook_messages" ADD CONSTRAINT "facebook_messages_staffId_fkey" FOREIGN KEY ("staffId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "facebook_messages" ADD CONSTRAINT "facebook_messages_knowledgeDocumentId_fkey" FOREIGN KEY ("knowledgeDocumentId") REFERENCES "knowledge_documents"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "facebook_comments" ADD CONSTRAINT "facebook_comments_threadId_fkey" FOREIGN KEY ("threadId") REFERENCES "facebook_threads"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "facebook_comments" ADD CONSTRAINT "facebook_comments_repliedById_fkey" FOREIGN KEY ("repliedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
