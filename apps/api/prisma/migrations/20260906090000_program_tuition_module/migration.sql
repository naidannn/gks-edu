-- CreateEnum
CREATE TYPE "ProgramSource" AS ENUM ('MANUAL', 'AI_ASSISTED', 'IMPORTED');

-- CreateEnum
CREATE TYPE "InstructionLanguage" AS ENUM ('KOREAN', 'ENGLISH', 'KOREAN_ENGLISH');

-- CreateTable
CREATE TABLE "study_fields" (
    "id" UUID NOT NULL,
    "slug" TEXT NOT NULL,
    "nameMn" TEXT NOT NULL,
    "nameEn" TEXT NOT NULL,
    "nameKo" TEXT,
    "aliases" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "parentId" UUID,
    "sortOrder" INTEGER NOT NULL DEFAULT 100,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "study_fields_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "study_fields_slug_key" ON "study_fields"("slug");

-- CreateIndex
CREATE INDEX "study_fields_parentId_idx" ON "study_fields"("parentId");

-- CreateIndex
CREATE INDEX "study_fields_isActive_idx" ON "study_fields"("isActive");

-- AlterTable
ALTER TABLE "university_programs" ADD COLUMN     "acceptsInternational" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "admissionFeeKrw" INTEGER,
ADD COLUMN     "internalNote" TEXT,
ADD COLUMN     "language" "InstructionLanguage" NOT NULL DEFAULT 'KOREAN',
ADD COLUMN     "scholarshipMaxPercent" INTEGER,
ADD COLUMN     "scholarshipNote" TEXT,
ADD COLUMN     "sourceType" "ProgramSource" NOT NULL DEFAULT 'MANUAL',
ADD COLUMN     "sourceUrl" TEXT,
ADD COLUMN     "studyFieldId" UUID,
ADD COLUMN     "tuitionYear" INTEGER,
ADD COLUMN     "verifiedAt" TIMESTAMP(3),
ADD COLUMN     "verifiedById" UUID;

-- CreateIndex
CREATE INDEX "university_programs_studyFieldId_idx" ON "university_programs"("studyFieldId");

-- CreateIndex
CREATE INDEX "university_programs_tuitionPerYearKrw_idx" ON "university_programs"("tuitionPerYearKrw");

-- CreateTable
CREATE TABLE "program_research_runs" (
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
    "acceptedCount" INTEGER NOT NULL DEFAULT 0,
    "startedAt" TIMESTAMP(3),
    "finishedAt" TIMESTAMP(3),
    "requestedById" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "program_research_runs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "program_research_runs_universityId_createdAt_idx" ON "program_research_runs"("universityId", "createdAt");

-- CreateIndex
CREATE INDEX "program_research_runs_status_idx" ON "program_research_runs"("status");

-- AddForeignKey
ALTER TABLE "study_fields" ADD CONSTRAINT "study_fields_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "study_fields"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "university_programs" ADD CONSTRAINT "university_programs_studyFieldId_fkey" FOREIGN KEY ("studyFieldId") REFERENCES "study_fields"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "university_programs" ADD CONSTRAINT "university_programs_verifiedById_fkey" FOREIGN KEY ("verifiedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "program_research_runs" ADD CONSTRAINT "program_research_runs_universityId_fkey" FOREIGN KEY ("universityId") REFERENCES "universities"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "program_research_runs" ADD CONSTRAINT "program_research_runs_requestedById_fkey" FOREIGN KEY ("requestedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
