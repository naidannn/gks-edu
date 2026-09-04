-- CreateEnum
CREATE TYPE "Gender" AS ENUM ('MALE', 'FEMALE', 'OTHER');

-- CreateEnum
CREATE TYPE "ClientStatus" AS ENUM ('ACTIVE', 'INACTIVE', 'ARCHIVED');

-- AlterTable
ALTER TABLE "users" ALTER COLUMN "email" DROP NOT NULL,
ALTER COLUMN "password" DROP NOT NULL;

-- CreateTable
CREATE TABLE "clients" (
    "id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "userId" UUID NOT NULL,
    "leadId" UUID,
    "lastName" TEXT NOT NULL,
    "firstName" TEXT NOT NULL,
    "birthDate" DATE NOT NULL,
    "registerNumber" TEXT NOT NULL,
    "gender" "Gender",
    "phone" TEXT NOT NULL,
    "phoneAlt" TEXT,
    "email" TEXT,
    "address" TEXT,
    "guardianLastName" TEXT,
    "guardianFirstName" TEXT,
    "guardianRegisterNumber" TEXT,
    "guardianPhone" TEXT,
    "guardianRelation" TEXT,
    "educationLevel" "EducationLevel",
    "schoolName" TEXT,
    "gpa" DOUBLE PRECISION,
    "gpaScale" TEXT,
    "koreanLevel" TEXT,
    "englishLevel" TEXT,
    "passportNumber" TEXT,
    "passportExpiry" TIMESTAMP(3),
    "primaryServiceType" "ServiceType" NOT NULL,
    "targetUniversityId" UUID,
    "targetMajor" TEXT,
    "plannedIntakeId" UUID,
    "source" "LeadSource" NOT NULL DEFAULT 'OFFICE',
    "status" "ClientStatus" NOT NULL DEFAULT 'ACTIVE',
    "note" TEXT,
    "assignedConsultantId" UUID,
    "createdById" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "clients_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "clients_code_key" ON "clients"("code");

-- CreateIndex
CREATE UNIQUE INDEX "clients_userId_key" ON "clients"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "clients_leadId_key" ON "clients"("leadId");

-- CreateIndex
CREATE UNIQUE INDEX "clients_registerNumber_key" ON "clients"("registerNumber");

-- CreateIndex
CREATE INDEX "clients_status_idx" ON "clients"("status");

-- CreateIndex
CREATE INDEX "clients_assignedConsultantId_idx" ON "clients"("assignedConsultantId");

-- CreateIndex
CREATE INDEX "clients_primaryServiceType_idx" ON "clients"("primaryServiceType");

-- CreateIndex
CREATE INDEX "clients_createdAt_idx" ON "clients"("createdAt");

-- CreateIndex
CREATE INDEX "clients_phone_idx" ON "clients"("phone");

-- CreateIndex
CREATE INDEX "clients_lastName_firstName_idx" ON "clients"("lastName", "firstName");

-- AddForeignKey
ALTER TABLE "clients" ADD CONSTRAINT "clients_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "clients" ADD CONSTRAINT "clients_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "leads"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "clients" ADD CONSTRAINT "clients_targetUniversityId_fkey" FOREIGN KEY ("targetUniversityId") REFERENCES "universities"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "clients" ADD CONSTRAINT "clients_plannedIntakeId_fkey" FOREIGN KEY ("plannedIntakeId") REFERENCES "intake_terms"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "clients" ADD CONSTRAINT "clients_assignedConsultantId_fkey" FOREIGN KEY ("assignedConsultantId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "clients" ADD CONSTRAINT "clients_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

