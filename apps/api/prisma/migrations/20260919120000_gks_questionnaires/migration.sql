-- 1D-27 — GKS essay and recommendation questionnaires (ARCHITECTURE.md §7.6).

-- CreateEnum
CREATE TYPE "QuestionnaireStatus" AS ENUM ('DRAFT', 'SUBMITTED');

-- CreateEnum
CREATE TYPE "RecommendationStatus" AS ENUM ('INVITED', 'ANSWERED', 'LETTER_READY', 'RECEIVED');

-- CreateTable
CREATE TABLE "essay_questionnaires" (
    "id" UUID NOT NULL,
    "caseId" UUID NOT NULL,
    "level" "ProgramLevel" NOT NULL,
    "answers" JSONB NOT NULL DEFAULT '{}',
    "status" "QuestionnaireStatus" NOT NULL DEFAULT 'DRAFT',
    "submittedAt" TIMESTAMP(3),
    "reopenNote" TEXT,
    "reopenedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "essay_questionnaires_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "recommendation_requests" (
    "id" UUID NOT NULL,
    "caseId" UUID NOT NULL,
    "level" "ProgramLevel" NOT NULL,
    "token" TEXT NOT NULL,
    "recommenderName" TEXT NOT NULL,
    "relation" TEXT,
    "answers" JSONB NOT NULL DEFAULT '{}',
    "recommender" JSONB NOT NULL DEFAULT '{}',
    "filledByApplicant" BOOLEAN NOT NULL DEFAULT false,
    "status" "RecommendationStatus" NOT NULL DEFAULT 'INVITED',
    "openedAt" TIMESTAMP(3),
    "answeredAt" TIMESTAMP(3),
    "letterReadyAt" TIMESTAMP(3),
    "receivedAt" TIMESTAMP(3),
    "letterPath" TEXT,
    "letterName" TEXT,
    "staffNote" TEXT,
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "recommendation_requests_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "essay_questionnaires_caseId_key" ON "essay_questionnaires"("caseId");

-- CreateIndex
CREATE UNIQUE INDEX "recommendation_requests_token_key" ON "recommendation_requests"("token");

-- CreateIndex
CREATE INDEX "recommendation_requests_caseId_idx" ON "recommendation_requests"("caseId");

-- AddForeignKey
ALTER TABLE "essay_questionnaires" ADD CONSTRAINT "essay_questionnaires_caseId_fkey" FOREIGN KEY ("caseId") REFERENCES "cases"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "recommendation_requests" ADD CONSTRAINT "recommendation_requests_caseId_fkey" FOREIGN KEY ("caseId") REFERENCES "cases"("id") ON DELETE CASCADE ON UPDATE CASCADE;
