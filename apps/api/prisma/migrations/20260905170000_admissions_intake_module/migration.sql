-- CreateEnum
CREATE TYPE "IntakeSource" AS ENUM ('MANUAL', 'AI_ASSISTED', 'IMPORTED');

-- CreateEnum
CREATE TYPE "IntakeResearchStatus" AS ENUM ('QUEUED', 'RUNNING', 'SUCCEEDED', 'FAILED');

-- AlterEnum
ALTER TYPE "IntakeStatus" ADD VALUE 'CANCELLED';

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "NotificationEvent" ADD VALUE 'INTAKE_DEADLINE_NEAR';
ALTER TYPE "NotificationEvent" ADD VALUE 'INTAKE_OPENED';
ALTER TYPE "NotificationEvent" ADD VALUE 'INTAKE_CASE_AT_RISK';

-- AlterTable
ALTER TABLE "intake_terms" ADD COLUMN     "admissionFeeKrw" INTEGER,
ADD COLUMN     "classStartDate" DATE,
ADD COLUMN     "internalDeadline" TIMESTAMP(3),
ADD COLUMN     "internalDeadlineIsManual" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "openAt" DATE,
ADD COLUMN     "quota" INTEGER,
ADD COLUMN     "requirementNote" TEXT,
ADD COLUMN     "resultAnnouncedAt" DATE,
ADD COLUMN     "sourceType" "IntakeSource" NOT NULL DEFAULT 'MANUAL',
ADD COLUMN     "sourceUrl" TEXT,
ADD COLUMN     "verifiedAt" TIMESTAMP(3),
ADD COLUMN     "verifiedById" UUID;

-- CreateTable
CREATE TABLE "intake_program_overrides" (
    "id" UUID NOT NULL,
    "intakeId" UUID NOT NULL,
    "programId" UUID NOT NULL,
    "openAt" DATE,
    "applicationDeadline" TIMESTAMP(3),
    "internalDeadline" TIMESTAMP(3),
    "internalDeadlineIsManual" BOOLEAN NOT NULL DEFAULT false,
    "classStartDate" DATE,
    "quota" INTEGER,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "intake_program_overrides_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "admission_config" (
    "id" TEXT NOT NULL DEFAULT 'default',
    "internalLeadDays" INTEGER NOT NULL DEFAULT 7,
    "clientReminderOffsets" INTEGER[] DEFAULT ARRAY[30, 14, 7, 3, 1]::INTEGER[],
    "staffReminderOffsets" INTEGER[] DEFAULT ARRAY[21, 14, 7, 3, 1]::INTEGER[],
    "riskReadinessThreshold" INTEGER NOT NULL DEFAULT 80,
    "researchModel" TEXT NOT NULL DEFAULT 'gemini-2.5-pro',
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "updatedById" UUID,

    CONSTRAINT "admission_config_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "intake_research_runs" (
    "id" UUID NOT NULL,
    "universityId" UUID NOT NULL,
    "levels" "ProgramLevel"[] DEFAULT ARRAY[]::"ProgramLevel"[],
    "year" INTEGER NOT NULL,
    "status" "IntakeResearchStatus" NOT NULL DEFAULT 'QUEUED',
    "model" TEXT NOT NULL,
    "candidates" JSONB,
    "sources" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "rawResponse" TEXT,
    "error" TEXT,
    "promptTokens" INTEGER,
    "responseTokens" INTEGER,
    "startedAt" TIMESTAMP(3),
    "finishedAt" TIMESTAMP(3),
    "requestedById" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "intake_research_runs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "intake_program_overrides_programId_idx" ON "intake_program_overrides"("programId");

-- CreateIndex
CREATE UNIQUE INDEX "intake_program_overrides_intakeId_programId_key" ON "intake_program_overrides"("intakeId", "programId");

-- CreateIndex
CREATE INDEX "intake_research_runs_universityId_createdAt_idx" ON "intake_research_runs"("universityId", "createdAt");

-- CreateIndex
CREATE INDEX "intake_research_runs_status_idx" ON "intake_research_runs"("status");

-- CreateIndex
CREATE INDEX "intake_terms_status_internalDeadline_idx" ON "intake_terms"("status", "internalDeadline");

-- CreateIndex
CREATE INDEX "intake_terms_internalDeadline_idx" ON "intake_terms"("internalDeadline");

-- AddForeignKey
ALTER TABLE "intake_terms" ADD CONSTRAINT "intake_terms_verifiedById_fkey" FOREIGN KEY ("verifiedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "intake_program_overrides" ADD CONSTRAINT "intake_program_overrides_intakeId_fkey" FOREIGN KEY ("intakeId") REFERENCES "intake_terms"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "intake_program_overrides" ADD CONSTRAINT "intake_program_overrides_programId_fkey" FOREIGN KEY ("programId") REFERENCES "university_programs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "admission_config" ADD CONSTRAINT "admission_config_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "intake_research_runs" ADD CONSTRAINT "intake_research_runs_universityId_fkey" FOREIGN KEY ("universityId") REFERENCES "universities"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "intake_research_runs" ADD CONSTRAINT "intake_research_runs_requestedById_fkey" FOREIGN KEY ("requestedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
