-- CreateEnum
CREATE TYPE "PrepaymentMode" AS ENUM ('PERCENT', 'FIXED');

-- CreateEnum
CREATE TYPE "BalanceTrigger" AS ENUM ('AFTER_VISA_APPROVED', 'AFTER_SCHOLARSHIP_RESULT');

-- CreateEnum
CREATE TYPE "CaseStage" AS ENUM ('CONTRACT_DRAFT', 'CONTRACT_SIGNED', 'PREPAYMENT_PAID', 'DOCUMENTS', 'APPLICATION_SUBMITTED', 'ADMITTED', 'TUITION_INVOICED', 'INVITATION_RECEIVED', 'GKS_ROUND1_PASSED', 'GKS_ROUND2_PASSED', 'VISA', 'VISA_APPROVED', 'BALANCE_PAID', 'COLLATERAL_CONTRACT', 'PRE_DEPARTURE', 'DEPARTED', 'COMPLETED', 'ON_HOLD', 'CANCELLED', 'REJECTED');

-- CreateEnum
CREATE TYPE "ContractType" AS ENUM ('ELECTRONIC', 'PHYSICAL');

-- CreateEnum
CREATE TYPE "ContractStatus" AS ENUM ('DRAFT', 'SENT', 'SIGNED', 'ACTIVE', 'COMPLETED', 'TERMINATED');

-- CreateEnum
CREATE TYPE "PaymentKind" AS ENUM ('PREPAYMENT', 'BALANCE', 'SCHOOL_TUITION', 'TRANSFER_FEE', 'EXTRA_SERVICE', 'REFUND');

-- CreateEnum
CREATE TYPE "PaymentStatus" AS ENUM ('PENDING', 'PAID', 'FAILED', 'EXPIRED', 'REFUNDED');

-- CreateTable
CREATE TABLE "service_pricing" (
    "id" UUID NOT NULL,
    "serviceType" "ServiceType" NOT NULL,
    "totalAmount" DECIMAL(14,2) NOT NULL,
    "prepaymentMode" "PrepaymentMode" NOT NULL,
    "prepaymentValue" DECIMAL(14,2) NOT NULL,
    "balanceTrigger" "BalanceTrigger" NOT NULL,
    "effectiveFrom" TIMESTAMP(3) NOT NULL,
    "effectiveTo" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "service_pricing_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "cases" (
    "id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "userId" UUID NOT NULL,
    "serviceType" "ServiceType" NOT NULL,
    "universityId" UUID,
    "programId" UUID,
    "intakeId" UUID,
    "stage" "CaseStage" NOT NULL DEFAULT 'CONTRACT_DRAFT',
    "assignedConsultantId" UUID,
    "assignedDocOfficerId" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "cases_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "case_transitions" (
    "id" UUID NOT NULL,
    "caseId" UUID NOT NULL,
    "fromStage" "CaseStage" NOT NULL,
    "toStage" "CaseStage" NOT NULL,
    "reason" TEXT,
    "actorId" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "case_transitions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "case_flow_definitions" (
    "id" UUID NOT NULL,
    "serviceType" "ServiceType" NOT NULL,
    "fromStage" "CaseStage" NOT NULL,
    "toStage" "CaseStage" NOT NULL,
    "allowedRoles" "Role"[],
    "isSystemOnly" BOOLEAN NOT NULL DEFAULT false,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "case_flow_definitions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "contracts" (
    "id" UUID NOT NULL,
    "caseId" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "type" "ContractType" NOT NULL,
    "status" "ContractStatus" NOT NULL DEFAULT 'DRAFT',
    "totalAmountSnapshot" DECIMAL(14,2) NOT NULL,
    "prepaymentModeSnapshot" "PrepaymentMode" NOT NULL,
    "prepaymentValueSnapshot" DECIMAL(14,2) NOT NULL,
    "balanceTriggerSnapshot" "BalanceTrigger" NOT NULL,
    "refundPolicy" JSONB NOT NULL,
    "bodyMn" TEXT NOT NULL,
    "pdfPath" TEXT,
    "sentAt" TIMESTAMP(3),
    "acceptedAt" TIMESTAMP(3),
    "otpVerifiedAt" TIMESTAMP(3),
    "signedAt" TIMESTAMP(3),
    "signedIp" TEXT,
    "physicalScanPath" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "contracts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "collateral_contracts" (
    "id" UUID NOT NULL,
    "contractId" UUID NOT NULL,
    "isSigned" BOOLEAN NOT NULL DEFAULT false,
    "startDate" TIMESTAMP(3),
    "endDate" TIMESTAMP(3),
    "filePath" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "collateral_contracts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "contract_templates" (
    "id" UUID NOT NULL,
    "serviceType" "ServiceType" NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "bodyMn" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "contract_templates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payments" (
    "id" UUID NOT NULL,
    "caseId" UUID NOT NULL,
    "kind" "PaymentKind" NOT NULL,
    "amountMnt" DECIMAL(14,2) NOT NULL,
    "amountKrw" DECIMAL(14,2),
    "fxRate" DECIMAL(10,4),
    "status" "PaymentStatus" NOT NULL DEFAULT 'PENDING',
    "qpayInvoiceId" TEXT,
    "qpayPaymentId" TEXT,
    "qrText" TEXT,
    "qrImage" TEXT,
    "paidAt" TIMESTAMP(3),
    "receiptPath" TEXT,
    "dueAt" TIMESTAMP(3),
    "refundOfId" UUID,
    "createdById" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "payments_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "service_pricing_serviceType_effectiveFrom_idx" ON "service_pricing"("serviceType", "effectiveFrom");

-- CreateIndex
CREATE UNIQUE INDEX "cases_code_key" ON "cases"("code");

-- CreateIndex
CREATE INDEX "cases_userId_idx" ON "cases"("userId");

-- CreateIndex
CREATE INDEX "cases_stage_idx" ON "cases"("stage");

-- CreateIndex
CREATE INDEX "cases_assignedConsultantId_idx" ON "cases"("assignedConsultantId");

-- CreateIndex
CREATE INDEX "cases_assignedDocOfficerId_idx" ON "cases"("assignedDocOfficerId");

-- CreateIndex
CREATE INDEX "case_transitions_caseId_createdAt_idx" ON "case_transitions"("caseId", "createdAt");

-- CreateIndex
CREATE INDEX "case_flow_definitions_serviceType_fromStage_idx" ON "case_flow_definitions"("serviceType", "fromStage");

-- CreateIndex
CREATE UNIQUE INDEX "case_flow_definitions_serviceType_fromStage_toStage_key" ON "case_flow_definitions"("serviceType", "fromStage", "toStage");

-- CreateIndex
CREATE UNIQUE INDEX "contracts_caseId_key" ON "contracts"("caseId");

-- CreateIndex
CREATE INDEX "contracts_userId_idx" ON "contracts"("userId");

-- CreateIndex
CREATE INDEX "contracts_status_idx" ON "contracts"("status");

-- CreateIndex
CREATE UNIQUE INDEX "collateral_contracts_contractId_key" ON "collateral_contracts"("contractId");

-- CreateIndex
CREATE INDEX "contract_templates_serviceType_isActive_idx" ON "contract_templates"("serviceType", "isActive");

-- CreateIndex
CREATE UNIQUE INDEX "contract_templates_serviceType_version_key" ON "contract_templates"("serviceType", "version");

-- CreateIndex
CREATE UNIQUE INDEX "payments_qpayInvoiceId_key" ON "payments"("qpayInvoiceId");

-- CreateIndex
CREATE INDEX "payments_caseId_idx" ON "payments"("caseId");

-- CreateIndex
CREATE INDEX "payments_status_idx" ON "payments"("status");

-- AddForeignKey
ALTER TABLE "cases" ADD CONSTRAINT "cases_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cases" ADD CONSTRAINT "cases_universityId_fkey" FOREIGN KEY ("universityId") REFERENCES "universities"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cases" ADD CONSTRAINT "cases_programId_fkey" FOREIGN KEY ("programId") REFERENCES "university_programs"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cases" ADD CONSTRAINT "cases_intakeId_fkey" FOREIGN KEY ("intakeId") REFERENCES "intake_terms"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cases" ADD CONSTRAINT "cases_assignedConsultantId_fkey" FOREIGN KEY ("assignedConsultantId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cases" ADD CONSTRAINT "cases_assignedDocOfficerId_fkey" FOREIGN KEY ("assignedDocOfficerId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "case_transitions" ADD CONSTRAINT "case_transitions_caseId_fkey" FOREIGN KEY ("caseId") REFERENCES "cases"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "case_transitions" ADD CONSTRAINT "case_transitions_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contracts" ADD CONSTRAINT "contracts_caseId_fkey" FOREIGN KEY ("caseId") REFERENCES "cases"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contracts" ADD CONSTRAINT "contracts_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "collateral_contracts" ADD CONSTRAINT "collateral_contracts_contractId_fkey" FOREIGN KEY ("contractId") REFERENCES "contracts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payments" ADD CONSTRAINT "payments_caseId_fkey" FOREIGN KEY ("caseId") REFERENCES "cases"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payments" ADD CONSTRAINT "payments_refundOfId_fkey" FOREIGN KEY ("refundOfId") REFERENCES "payments"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payments" ADD CONSTRAINT "payments_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
