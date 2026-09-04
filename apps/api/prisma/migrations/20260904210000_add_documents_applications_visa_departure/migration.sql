
-- CreateEnum
CREATE TYPE "DocStage" AS ENUM ('ADMISSION', 'VISA');

-- CreateEnum
CREATE TYPE "GuarantorType" AS ENUM ('NONE', 'EMPLOYEE', 'COMPANY_DIRECTOR', 'SELF_EMPLOYED');

-- CreateEnum
CREATE TYPE "GuarantorRelation" AS ENUM ('PARENT', 'SIBLING', 'UNCLE_AUNT', 'OTHER');

-- CreateEnum
CREATE TYPE "Necessity" AS ENUM ('REQUIRED', 'CONDITIONAL', 'OPTIONAL');

-- CreateEnum
CREATE TYPE "DocumentStatus" AS ENUM ('NOT_STARTED', 'IN_PROGRESS', 'SUBMITTED', 'UNDER_REVIEW', 'NEEDS_FIX', 'RESUBMIT_REQUIRED', 'ACCEPTED', 'IN_TRANSLATION', 'TRANSLATED', 'CERTIFIED', 'READY', 'SENT_TO_UNIVERSITY');

-- CreateEnum
CREATE TYPE "WorkTaskType" AS ENUM ('TRANSLATION', 'NOTARISATION', 'FORM_FILLING', 'STUDY_PLAN', 'SELF_INTRODUCTION', 'SCHOLARSHIP_ESSAY', 'COMPLETENESS_CHECK', 'FILE_MERGE', 'FINAL_REVIEW', 'OTHER');

-- CreateEnum
CREATE TYPE "WorkTaskStatus" AS ENUM ('TODO', 'IN_PROGRESS', 'DONE', 'CANCELLED');

-- CreateEnum
CREATE TYPE "AppointmentStatus" AS ENUM ('SCHEDULED', 'COMPLETED', 'CANCELLED', 'NO_SHOW');

-- CreateEnum
CREATE TYPE "ApplicationStatus" AS ENUM ('PREPARING', 'READY', 'SUBMITTED', 'UNDER_REVIEW', 'ADDITIONAL_DOCS_REQUESTED', 'INTERVIEW_SCHEDULED', 'ACCEPTED', 'REJECTED', 'DEFERRED');

-- CreateEnum
CREATE TYPE "ApplicationDecision" AS ENUM ('PASSED', 'FAILED', 'WAITLISTED', 'DEFERRED');

-- CreateEnum
CREATE TYPE "SchoolInvoiceStatus" AS ENUM ('DRAFT', 'ISSUED', 'PAID', 'CONFIRMED_BY_SCHOOL', 'CANCELLED');

-- CreateEnum
CREATE TYPE "InvoiceItemKind" AS ENUM ('TUITION', 'DORMITORY', 'INSURANCE', 'ADMISSION_FEE', 'OTHER');

-- CreateEnum
CREATE TYPE "VisaStatus" AS ENUM ('COLLECTING', 'REVIEWING', 'READY', 'SUBMITTED', 'ADDITIONAL_DOCS_REQUESTED', 'APPROVED', 'REJECTED', 'REAPPLY');

-- CreateEnum
CREATE TYPE "VisaType" AS ENUM ('D2', 'D4', 'OTHER');

-- CreateTable
CREATE TABLE "document_templates" (
    "id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "nameMn" TEXT NOT NULL,
    "descriptionMn" TEXT,
    "sourceHint" TEXT,
    "issuerHint" TEXT,
    "validityDays" INTEGER,
    "needsTranslation" BOOLEAN NOT NULL DEFAULT false,
    "needsNotary" BOOLEAN NOT NULL DEFAULT false,
    "needsApostille" BOOLEAN NOT NULL DEFAULT false,
    "needsPhysicalOriginal" BOOLEAN NOT NULL DEFAULT false,
    "acceptedFileTypes" TEXT[] DEFAULT ARRAY['pdf', 'jpg', 'png']::TEXT[],
    "sampleFilePath" TEXT,
    "tipsMn" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "document_templates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "requirement_rules" (
    "id" UUID NOT NULL,
    "templateId" UUID NOT NULL,
    "stage" "DocStage" NOT NULL,
    "serviceTypes" "ServiceType"[],
    "educationLevels" "EducationLevel"[],
    "guarantorTypes" "GuarantorType"[],
    "guarantorRelations" "GuarantorRelation"[],
    "universityId" UUID,
    "necessity" "Necessity" NOT NULL DEFAULT 'REQUIRED',
    "conditionNote" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "requirement_rules_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "case_conditions" (
    "id" UUID NOT NULL,
    "caseId" UUID NOT NULL,
    "educationLevel" "EducationLevel",
    "guarantorType" "GuarantorType" NOT NULL DEFAULT 'NONE',
    "guarantorRelation" "GuarantorRelation",
    "guarantorName" TEXT,
    "guarantorPhone" TEXT,
    "note" TEXT,
    "answeredById" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "case_conditions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "case_documents" (
    "id" UUID NOT NULL,
    "caseId" UUID NOT NULL,
    "templateId" UUID NOT NULL,
    "ruleId" UUID,
    "stage" "DocStage" NOT NULL,
    "necessity" "Necessity" NOT NULL DEFAULT 'REQUIRED',
    "conditionNote" TEXT,
    "status" "DocumentStatus" NOT NULL DEFAULT 'NOT_STARTED',
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "dueAt" TIMESTAMP(3),
    "submittedAt" TIMESTAMP(3),
    "acceptedAt" TIMESTAMP(3),
    "readyAt" TIMESTAMP(3),
    "sentToUniversityAt" TIMESTAMP(3),
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "case_documents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "document_files" (
    "id" UUID NOT NULL,
    "caseDocumentId" UUID NOT NULL,
    "version" INTEGER NOT NULL,
    "path" TEXT NOT NULL,
    "originalName" TEXT NOT NULL,
    "sizeBytes" INTEGER NOT NULL,
    "mimeType" TEXT NOT NULL,
    "isFinal" BOOLEAN NOT NULL DEFAULT false,
    "uploadedById" UUID,
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "document_files_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "document_review_notes" (
    "id" UUID NOT NULL,
    "caseDocumentId" UUID NOT NULL,
    "authorId" UUID,
    "body" TEXT NOT NULL,
    "fromStatus" "DocumentStatus",
    "toStatus" "DocumentStatus",
    "isInternal" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "document_review_notes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "work_tasks" (
    "id" UUID NOT NULL,
    "caseId" UUID NOT NULL,
    "caseDocumentId" UUID,
    "type" "WorkTaskType" NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "status" "WorkTaskStatus" NOT NULL DEFAULT 'TODO',
    "assigneeId" UUID,
    "createdById" UUID,
    "dueAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "work_tasks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "office_appointments" (
    "id" UUID NOT NULL,
    "caseId" UUID NOT NULL,
    "scheduledAt" TIMESTAMP(3) NOT NULL,
    "status" "AppointmentStatus" NOT NULL DEFAULT 'SCHEDULED',
    "note" TEXT,
    "createdById" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "office_appointments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "document_reminders" (
    "id" UUID NOT NULL,
    "caseDocumentId" UUID NOT NULL,
    "offsetDays" INTEGER NOT NULL,
    "dueAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "document_reminders_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "applications" (
    "id" UUID NOT NULL,
    "caseId" UUID NOT NULL,
    "universityId" UUID,
    "programId" UUID,
    "intakeId" UUID,
    "status" "ApplicationStatus" NOT NULL DEFAULT 'PREPARING',
    "applicationNo" TEXT,
    "admissionFeeKrw" DECIMAL(14,2),
    "submittedAt" TIMESTAMP(3),
    "interviewAt" TIMESTAMP(3),
    "interviewNote" TEXT,
    "decidedAt" TIMESTAMP(3),
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "applications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "application_results" (
    "id" UUID NOT NULL,
    "applicationId" UUID NOT NULL,
    "round" INTEGER NOT NULL DEFAULT 1,
    "decision" "ApplicationDecision" NOT NULL,
    "decidedAt" TIMESTAMP(3) NOT NULL,
    "note" TEXT,
    "recordedById" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "application_results_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "school_invoices" (
    "id" UUID NOT NULL,
    "caseId" UUID NOT NULL,
    "status" "SchoolInvoiceStatus" NOT NULL DEFAULT 'DRAFT',
    "totalKrw" DECIMAL(14,2) NOT NULL,
    "fxRate" DECIMAL(12,6) NOT NULL,
    "amountMnt" DECIMAL(14,2) NOT NULL,
    "transferFeeMnt" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "dueAt" TIMESTAMP(3),
    "paidAt" TIMESTAMP(3),
    "receiptPath" TEXT,
    "receivedBySchoolAt" TIMESTAMP(3),
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "school_invoices_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "school_invoice_items" (
    "id" UUID NOT NULL,
    "invoiceId" UUID NOT NULL,
    "kind" "InvoiceItemKind" NOT NULL,
    "labelMn" TEXT NOT NULL,
    "amountKrw" DECIMAL(14,2) NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "school_invoice_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "invitations" (
    "id" UUID NOT NULL,
    "caseId" UUID NOT NULL,
    "number" TEXT,
    "issuedAt" TIMESTAMP(3),
    "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "filePath" TEXT,
    "note" TEXT,
    "uploadedById" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "invitations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "fx_rates" (
    "id" UUID NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'KRW',
    "rate" DECIMAL(12,6) NOT NULL,
    "date" DATE NOT NULL,
    "source" TEXT NOT NULL DEFAULT 'mongolbank',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "fx_rates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "visa_cases" (
    "id" UUID NOT NULL,
    "caseId" UUID NOT NULL,
    "status" "VisaStatus" NOT NULL DEFAULT 'COLLECTING',
    "visaType" "VisaType" NOT NULL,
    "appointmentAt" TIMESTAMP(3),
    "submittedAt" TIMESTAMP(3),
    "decidedAt" TIMESTAMP(3),
    "visaNumber" TEXT,
    "expiresAt" TIMESTAMP(3),
    "rejectionReason" TEXT,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "visa_cases_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "departure_checklist_templates" (
    "code" TEXT NOT NULL,
    "titleMn" TEXT NOT NULL,
    "descriptionMn" TEXT,
    "guideUrl" TEXT,
    "videoUrl" TEXT,
    "offsetDays" INTEGER,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "departure_checklist_templates_pkey" PRIMARY KEY ("code")
);

-- CreateTable
CREATE TABLE "departure_plans" (
    "id" UUID NOT NULL,
    "caseId" UUID NOT NULL,
    "departureAt" TIMESTAMP(3),
    "flightNo" TEXT,
    "arrivalAt" TIMESTAMP(3),
    "pickupRequested" BOOLEAN NOT NULL DEFAULT false,
    "dormitoryInfo" TEXT,
    "emergencyNote" TEXT,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "departure_plans_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "departure_checklist_items" (
    "id" UUID NOT NULL,
    "planId" UUID NOT NULL,
    "templateCode" VARCHAR(64),
    "titleMn" TEXT NOT NULL,
    "descriptionMn" TEXT,
    "guideUrl" TEXT,
    "videoUrl" TEXT,
    "dueAt" TIMESTAMP(3),
    "isDone" BOOLEAN NOT NULL DEFAULT false,
    "doneAt" TIMESTAMP(3),
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "departure_checklist_items_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "document_templates_code_key" ON "document_templates"("code");

-- CreateIndex
CREATE INDEX "requirement_rules_stage_isActive_idx" ON "requirement_rules"("stage", "isActive");

-- CreateIndex
CREATE INDEX "requirement_rules_templateId_idx" ON "requirement_rules"("templateId");

-- CreateIndex
CREATE INDEX "requirement_rules_universityId_idx" ON "requirement_rules"("universityId");

-- CreateIndex
CREATE UNIQUE INDEX "case_conditions_caseId_key" ON "case_conditions"("caseId");

-- CreateIndex
CREATE INDEX "case_documents_caseId_stage_idx" ON "case_documents"("caseId", "stage");

-- CreateIndex
CREATE INDEX "case_documents_status_idx" ON "case_documents"("status");

-- CreateIndex
CREATE INDEX "case_documents_dueAt_idx" ON "case_documents"("dueAt");

-- CreateIndex
CREATE UNIQUE INDEX "case_documents_caseId_templateId_stage_key" ON "case_documents"("caseId", "templateId", "stage");

-- CreateIndex
CREATE INDEX "document_files_caseDocumentId_idx" ON "document_files"("caseDocumentId");

-- CreateIndex
CREATE UNIQUE INDEX "document_files_caseDocumentId_version_key" ON "document_files"("caseDocumentId", "version");

-- CreateIndex
CREATE INDEX "document_review_notes_caseDocumentId_createdAt_idx" ON "document_review_notes"("caseDocumentId", "createdAt");

-- CreateIndex
CREATE INDEX "work_tasks_caseId_idx" ON "work_tasks"("caseId");

-- CreateIndex
CREATE INDEX "work_tasks_assigneeId_status_idx" ON "work_tasks"("assigneeId", "status");

-- CreateIndex
CREATE INDEX "work_tasks_status_dueAt_idx" ON "work_tasks"("status", "dueAt");

-- CreateIndex
CREATE INDEX "office_appointments_caseId_idx" ON "office_appointments"("caseId");

-- CreateIndex
CREATE INDEX "office_appointments_scheduledAt_idx" ON "office_appointments"("scheduledAt");

-- CreateIndex
CREATE INDEX "document_reminders_createdAt_idx" ON "document_reminders"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "document_reminders_caseDocumentId_offsetDays_key" ON "document_reminders"("caseDocumentId", "offsetDays");

-- CreateIndex
CREATE UNIQUE INDEX "applications_caseId_key" ON "applications"("caseId");

-- CreateIndex
CREATE INDEX "applications_status_idx" ON "applications"("status");

-- CreateIndex
CREATE INDEX "applications_universityId_idx" ON "applications"("universityId");

-- CreateIndex
CREATE UNIQUE INDEX "application_results_applicationId_round_key" ON "application_results"("applicationId", "round");

-- CreateIndex
CREATE INDEX "school_invoices_caseId_idx" ON "school_invoices"("caseId");

-- CreateIndex
CREATE INDEX "school_invoices_status_idx" ON "school_invoices"("status");

-- CreateIndex
CREATE INDEX "school_invoice_items_invoiceId_idx" ON "school_invoice_items"("invoiceId");

-- CreateIndex
CREATE UNIQUE INDEX "invitations_caseId_key" ON "invitations"("caseId");

-- CreateIndex
CREATE INDEX "fx_rates_currency_date_idx" ON "fx_rates"("currency", "date");

-- CreateIndex
CREATE UNIQUE INDEX "fx_rates_currency_date_key" ON "fx_rates"("currency", "date");

-- CreateIndex
CREATE UNIQUE INDEX "visa_cases_caseId_key" ON "visa_cases"("caseId");

-- CreateIndex
CREATE INDEX "visa_cases_status_idx" ON "visa_cases"("status");

-- CreateIndex
CREATE UNIQUE INDEX "departure_plans_caseId_key" ON "departure_plans"("caseId");

-- CreateIndex
CREATE INDEX "departure_checklist_items_planId_idx" ON "departure_checklist_items"("planId");

-- CreateIndex
CREATE UNIQUE INDEX "departure_checklist_items_planId_templateCode_key" ON "departure_checklist_items"("planId", "templateCode");

-- AddForeignKey
ALTER TABLE "requirement_rules" ADD CONSTRAINT "requirement_rules_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "document_templates"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "requirement_rules" ADD CONSTRAINT "requirement_rules_universityId_fkey" FOREIGN KEY ("universityId") REFERENCES "universities"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "case_conditions" ADD CONSTRAINT "case_conditions_caseId_fkey" FOREIGN KEY ("caseId") REFERENCES "cases"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "case_conditions" ADD CONSTRAINT "case_conditions_answeredById_fkey" FOREIGN KEY ("answeredById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "case_documents" ADD CONSTRAINT "case_documents_caseId_fkey" FOREIGN KEY ("caseId") REFERENCES "cases"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "case_documents" ADD CONSTRAINT "case_documents_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "document_templates"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "case_documents" ADD CONSTRAINT "case_documents_ruleId_fkey" FOREIGN KEY ("ruleId") REFERENCES "requirement_rules"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "document_files" ADD CONSTRAINT "document_files_caseDocumentId_fkey" FOREIGN KEY ("caseDocumentId") REFERENCES "case_documents"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "document_files" ADD CONSTRAINT "document_files_uploadedById_fkey" FOREIGN KEY ("uploadedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "document_review_notes" ADD CONSTRAINT "document_review_notes_caseDocumentId_fkey" FOREIGN KEY ("caseDocumentId") REFERENCES "case_documents"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "document_review_notes" ADD CONSTRAINT "document_review_notes_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "work_tasks" ADD CONSTRAINT "work_tasks_caseId_fkey" FOREIGN KEY ("caseId") REFERENCES "cases"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "work_tasks" ADD CONSTRAINT "work_tasks_caseDocumentId_fkey" FOREIGN KEY ("caseDocumentId") REFERENCES "case_documents"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "work_tasks" ADD CONSTRAINT "work_tasks_assigneeId_fkey" FOREIGN KEY ("assigneeId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "work_tasks" ADD CONSTRAINT "work_tasks_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "office_appointments" ADD CONSTRAINT "office_appointments_caseId_fkey" FOREIGN KEY ("caseId") REFERENCES "cases"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "office_appointments" ADD CONSTRAINT "office_appointments_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "document_reminders" ADD CONSTRAINT "document_reminders_caseDocumentId_fkey" FOREIGN KEY ("caseDocumentId") REFERENCES "case_documents"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "applications" ADD CONSTRAINT "applications_caseId_fkey" FOREIGN KEY ("caseId") REFERENCES "cases"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "applications" ADD CONSTRAINT "applications_universityId_fkey" FOREIGN KEY ("universityId") REFERENCES "universities"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "applications" ADD CONSTRAINT "applications_programId_fkey" FOREIGN KEY ("programId") REFERENCES "university_programs"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "applications" ADD CONSTRAINT "applications_intakeId_fkey" FOREIGN KEY ("intakeId") REFERENCES "intake_terms"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "application_results" ADD CONSTRAINT "application_results_applicationId_fkey" FOREIGN KEY ("applicationId") REFERENCES "applications"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "application_results" ADD CONSTRAINT "application_results_recordedById_fkey" FOREIGN KEY ("recordedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "school_invoices" ADD CONSTRAINT "school_invoices_caseId_fkey" FOREIGN KEY ("caseId") REFERENCES "cases"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "school_invoice_items" ADD CONSTRAINT "school_invoice_items_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "school_invoices"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invitations" ADD CONSTRAINT "invitations_caseId_fkey" FOREIGN KEY ("caseId") REFERENCES "cases"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invitations" ADD CONSTRAINT "invitations_uploadedById_fkey" FOREIGN KEY ("uploadedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "visa_cases" ADD CONSTRAINT "visa_cases_caseId_fkey" FOREIGN KEY ("caseId") REFERENCES "cases"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "departure_plans" ADD CONSTRAINT "departure_plans_caseId_fkey" FOREIGN KEY ("caseId") REFERENCES "cases"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "departure_checklist_items" ADD CONSTRAINT "departure_checklist_items_planId_fkey" FOREIGN KEY ("planId") REFERENCES "departure_plans"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "departure_checklist_items" ADD CONSTRAINT "departure_checklist_items_templateCode_fkey" FOREIGN KEY ("templateCode") REFERENCES "departure_checklist_templates"("code") ON DELETE SET NULL ON UPDATE CASCADE;

