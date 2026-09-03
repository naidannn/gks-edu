-- CreateEnum
CREATE TYPE "UniversityType" AS ENUM ('NATIONAL', 'PUBLIC', 'PRIVATE');

-- CreateEnum
CREATE TYPE "AgentContractStatus" AS ENUM ('NONE', 'IN_TALKS', 'SIGNED', 'EXPIRED');

-- CreateEnum
CREATE TYPE "ServiceType" AS ENUM ('LANGUAGE_PREP', 'BACHELOR', 'MASTER', 'PHD', 'GKS_SCHOLARSHIP');

-- CreateEnum
CREATE TYPE "ProgramLevel" AS ENUM ('LANGUAGE_PREP', 'BACHELOR', 'MASTER', 'PHD');

-- CreateEnum
CREATE TYPE "IntakeStatus" AS ENUM ('PLANNED', 'OPEN', 'CLOSED');

-- CreateEnum
CREATE TYPE "EducationLevel" AS ENUM ('SECONDARY_SCHOOL', 'VOCATIONAL', 'BACHELOR', 'MASTER', 'PHD');

-- CreateEnum
CREATE TYPE "LeadSource" AS ENUM ('WEBSITE', 'AI_CHAT', 'PHONE', 'SOCIAL', 'OFFICE', 'LANGUAGE_CENTER', 'REFERRAL', 'OTHER');

-- CreateEnum
CREATE TYPE "LeadStage" AS ENUM ('NEW', 'CONTACTED', 'CONSULTED', 'PROPOSAL_SENT', 'CONTRACT_PENDING', 'WON', 'LOST');

-- CreateEnum
CREATE TYPE "LeadActivityType" AS ENUM ('NOTE', 'CALL', 'MEETING', 'MESSAGE', 'EMAIL', 'CHAT', 'STAGE_CHANGE');

-- DropIndex
DROP INDEX "document_chunks_embedding_hnsw_idx";

-- DropIndex
DROP INDEX "users_email_trgm_idx";

-- CreateTable
CREATE TABLE "universities" (
    "id" UUID NOT NULL,
    "slug" TEXT NOT NULL,
    "nameKo" TEXT NOT NULL,
    "nameEn" TEXT NOT NULL,
    "nameMn" TEXT NOT NULL,
    "type" "UniversityType" NOT NULL,
    "foundedYear" INTEGER,
    "cityEn" TEXT NOT NULL,
    "cityMn" TEXT NOT NULL,
    "regionEn" TEXT NOT NULL,
    "regionMn" TEXT NOT NULL,
    "address" TEXT,
    "lat" DOUBLE PRECISION,
    "lon" DOUBLE PRECISION,
    "logoPath" TEXT,
    "coverPath" TEXT,
    "shortIntroMn" TEXT,
    "detailedIntroMn" TEXT,
    "studentsTotal" INTEGER,
    "advantages" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "livingCost" JSONB,
    "dormitory" JSONB,
    "links" JSONB NOT NULL DEFAULT '{}',
    "quality" JSONB NOT NULL DEFAULT '{}',
    "acceptsLanguagePrep" BOOLEAN NOT NULL DEFAULT false,
    "acceptsFromMongolia" BOOLEAN NOT NULL DEFAULT true,
    "isGksEligible" BOOLEAN NOT NULL DEFAULT false,
    "agentContractStatus" "AgentContractStatus" NOT NULL DEFAULT 'NONE',
    "commissionNote" TEXT,
    "internalNote" TEXT,
    "isPublished" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "universities_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "university_programs" (
    "id" UUID NOT NULL,
    "universityId" UUID NOT NULL,
    "level" "ProgramLevel" NOT NULL,
    "nameMn" TEXT NOT NULL,
    "nameEn" TEXT,
    "nameKo" TEXT,
    "faculty" TEXT,
    "durationYears" DOUBLE PRECISION,
    "tuitionPerYearKrw" INTEGER,
    "tuitionPerTermKrw" INTEGER,
    "topikLevel" INTEGER,
    "ieltsScore" DOUBLE PRECISION,
    "otherRequirements" TEXT,
    "isPublished" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "university_programs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "intake_terms" (
    "id" UUID NOT NULL,
    "universityId" UUID NOT NULL,
    "level" "ProgramLevel" NOT NULL,
    "year" INTEGER NOT NULL,
    "month" INTEGER NOT NULL,
    "applicationDeadline" TIMESTAMP(3),
    "status" "IntakeStatus" NOT NULL DEFAULT 'PLANNED',
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "intake_terms_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "leads" (
    "id" UUID NOT NULL,
    "userId" UUID,
    "firstName" TEXT NOT NULL,
    "lastName" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "email" TEXT,
    "age" INTEGER,
    "educationLevel" "EducationLevel",
    "gpa" DOUBLE PRECISION,
    "gpaScale" TEXT,
    "koreanLevel" TEXT,
    "englishLevel" TEXT,
    "interestedServices" "ServiceType"[] DEFAULT ARRAY[]::"ServiceType"[],
    "interestedUniversityIds" UUID[] DEFAULT ARRAY[]::UUID[],
    "interestedMajor" TEXT,
    "plannedIntakeId" UUID,
    "source" "LeadSource" NOT NULL,
    "stage" "LeadStage" NOT NULL DEFAULT 'NEW',
    "assignedToId" UUID,
    "nextContactAt" TIMESTAMP(3),
    "winProbability" INTEGER,
    "lostReason" TEXT,
    "note" TEXT,
    "utm" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "leads_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "lead_activities" (
    "id" UUID NOT NULL,
    "leadId" UUID NOT NULL,
    "type" "LeadActivityType" NOT NULL,
    "body" TEXT,
    "meta" JSONB NOT NULL DEFAULT '{}',
    "actorId" UUID,
    "occurredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "lead_activities_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "universities_slug_key" ON "universities"("slug");

-- CreateIndex
CREATE INDEX "universities_isPublished_idx" ON "universities"("isPublished");

-- CreateIndex
CREATE INDEX "universities_regionEn_idx" ON "universities"("regionEn");

-- CreateIndex
CREATE INDEX "universities_type_idx" ON "universities"("type");

-- CreateIndex
CREATE INDEX "university_programs_universityId_idx" ON "university_programs"("universityId");

-- CreateIndex
CREATE INDEX "university_programs_level_idx" ON "university_programs"("level");

-- CreateIndex
CREATE UNIQUE INDEX "university_programs_universityId_level_nameMn_key" ON "university_programs"("universityId", "level", "nameMn");

-- CreateIndex
CREATE INDEX "intake_terms_universityId_idx" ON "intake_terms"("universityId");

-- CreateIndex
CREATE INDEX "intake_terms_year_month_idx" ON "intake_terms"("year", "month");

-- CreateIndex
CREATE UNIQUE INDEX "intake_terms_universityId_level_year_month_key" ON "intake_terms"("universityId", "level", "year", "month");

-- CreateIndex
CREATE INDEX "leads_stage_idx" ON "leads"("stage");

-- CreateIndex
CREATE INDEX "leads_assignedToId_idx" ON "leads"("assignedToId");

-- CreateIndex
CREATE INDEX "leads_source_idx" ON "leads"("source");

-- CreateIndex
CREATE INDEX "leads_createdAt_idx" ON "leads"("createdAt");

-- CreateIndex
CREATE INDEX "leads_phone_idx" ON "leads"("phone");

-- CreateIndex
CREATE INDEX "lead_activities_leadId_occurredAt_idx" ON "lead_activities"("leadId", "occurredAt");

-- AddForeignKey
ALTER TABLE "university_programs" ADD CONSTRAINT "university_programs_universityId_fkey" FOREIGN KEY ("universityId") REFERENCES "universities"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "intake_terms" ADD CONSTRAINT "intake_terms_universityId_fkey" FOREIGN KEY ("universityId") REFERENCES "universities"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "leads" ADD CONSTRAINT "leads_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "leads" ADD CONSTRAINT "leads_assignedToId_fkey" FOREIGN KEY ("assignedToId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lead_activities" ADD CONSTRAINT "lead_activities_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "leads"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lead_activities" ADD CONSTRAINT "lead_activities_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
