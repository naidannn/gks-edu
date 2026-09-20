-- 1O — marketing mail over Brevo.
--
-- Hand-written rather than taken from `migrate diff`: a diff against the live
-- database wants to drop the SQL-only objects Prisma cannot see (the trigram
-- indexes on `faculties` and `university_programs`, the partial unique index on
-- `payments`). See 20260913090000_ai_knowledge_base for the same note.

-- CreateEnum
CREATE TYPE "MarketingAudience" AS ENUM ('CONTRACT_CLIENTS', 'CLIENTS', 'LEADS', 'SUBSCRIBERS', 'CUSTOM');

-- CreateEnum
CREATE TYPE "EmailCampaignStatus" AS ENUM ('DRAFT', 'QUEUED', 'SENDING', 'SENT', 'FAILED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "CampaignRecipientStatus" AS ENUM ('PENDING', 'SENT', 'FAILED', 'SKIPPED');

-- CreateEnum
CREATE TYPE "SubscriberStatus" AS ENUM ('SUBSCRIBED', 'UNSUBSCRIBED', 'BOUNCED');

-- CreateTable
CREATE TABLE "email_subscribers" (
    "id" UUID NOT NULL,
    "email" TEXT NOT NULL,
    "name" TEXT,
    "status" "SubscriberStatus" NOT NULL DEFAULT 'SUBSCRIBED',
    "source" VARCHAR(40) NOT NULL DEFAULT 'website',
    "tags" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "utm" JSONB,
    "brevoSyncedAt" TIMESTAMP(3),
    "unsubscribedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "email_subscribers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "marketing_templates" (
    "id" UUID NOT NULL,
    "name" VARCHAR(120) NOT NULL,
    "key" VARCHAR(60),
    "subject" VARCHAR(200) NOT NULL,
    "eyebrow" VARCHAR(40),
    "heading" VARCHAR(200),
    "bodyMn" TEXT NOT NULL,
    "ctaLabel" VARCHAR(60),
    "ctaUrl" VARCHAR(300),
    "footerNote" VARCHAR(300),
    "tone" VARCHAR(16) NOT NULL DEFAULT 'info',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdById" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "marketing_templates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "email_campaigns" (
    "id" UUID NOT NULL,
    "name" VARCHAR(120) NOT NULL,
    "templateId" UUID,
    "subject" VARCHAR(200) NOT NULL,
    "eyebrow" VARCHAR(40),
    "heading" VARCHAR(200),
    "bodyMn" TEXT NOT NULL,
    "ctaLabel" VARCHAR(60),
    "ctaUrl" VARCHAR(300),
    "footerNote" VARCHAR(300),
    "tone" VARCHAR(16) NOT NULL DEFAULT 'info',
    "audience" "MarketingAudience" NOT NULL,
    "filters" JSONB NOT NULL DEFAULT '{}',
    "status" "EmailCampaignStatus" NOT NULL DEFAULT 'DRAFT',
    "totalCount" INTEGER NOT NULL DEFAULT 0,
    "sentCount" INTEGER NOT NULL DEFAULT 0,
    "failedCount" INTEGER NOT NULL DEFAULT 0,
    "skippedCount" INTEGER NOT NULL DEFAULT 0,
    "startedAt" TIMESTAMP(3),
    "finishedAt" TIMESTAMP(3),
    "failReason" TEXT,
    "createdById" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "email_campaigns_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "email_campaign_recipients" (
    "id" UUID NOT NULL,
    "campaignId" UUID NOT NULL,
    "email" VARCHAR(200) NOT NULL,
    "name" TEXT,
    "clientId" UUID,
    "leadId" UUID,
    "subscriberId" UUID,
    "status" "CampaignRecipientStatus" NOT NULL DEFAULT 'PENDING',
    "providerMessageId" VARCHAR(200),
    "error" TEXT,
    "sentAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "email_campaign_recipients_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "email_subscribers_email_key" ON "email_subscribers"("email");

-- CreateIndex
CREATE INDEX "email_subscribers_status_idx" ON "email_subscribers"("status");

-- CreateIndex
CREATE INDEX "email_subscribers_createdAt_idx" ON "email_subscribers"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "marketing_templates_key_key" ON "marketing_templates"("key");

-- CreateIndex
CREATE INDEX "marketing_templates_isActive_idx" ON "marketing_templates"("isActive");

-- CreateIndex
CREATE INDEX "email_campaigns_status_createdAt_idx" ON "email_campaigns"("status", "createdAt");

-- CreateIndex
CREATE INDEX "email_campaigns_createdAt_idx" ON "email_campaigns"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "email_campaign_recipients_campaignId_email_key" ON "email_campaign_recipients"("campaignId", "email");

-- CreateIndex
CREATE INDEX "email_campaign_recipients_campaignId_status_idx" ON "email_campaign_recipients"("campaignId", "status");

-- AddForeignKey
ALTER TABLE "marketing_templates" ADD CONSTRAINT "marketing_templates_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "email_campaigns" ADD CONSTRAINT "email_campaigns_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "marketing_templates"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "email_campaigns" ADD CONSTRAINT "email_campaigns_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "email_campaign_recipients" ADD CONSTRAINT "email_campaign_recipients_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "email_campaigns"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "email_campaign_recipients" ADD CONSTRAINT "email_campaign_recipients_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "clients"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "email_campaign_recipients" ADD CONSTRAINT "email_campaign_recipients_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "leads"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "email_campaign_recipients" ADD CONSTRAINT "email_campaign_recipients_subscriberId_fkey" FOREIGN KEY ("subscriberId") REFERENCES "email_subscribers"("id") ON DELETE SET NULL ON UPDATE CASCADE;
