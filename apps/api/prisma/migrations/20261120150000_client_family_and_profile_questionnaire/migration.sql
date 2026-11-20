-- 1B-28 — family contacts collected when a person becomes a client.
ALTER TABLE "clients" ADD COLUMN "fatherPhone" TEXT,
ADD COLUMN "motherPhone" TEXT,
ADD COLUMN "emergencyContactName" TEXT,
ADD COLUMN "emergencyContactRelation" TEXT,
ADD COLUMN "emergencyContactPhone" TEXT;

-- 1B-29 — the questionnaire a client answers after signing on.
CREATE TABLE "client_profile_questionnaires" (
    "id" UUID NOT NULL,
    "clientId" UUID NOT NULL,
    "answers" JSONB NOT NULL DEFAULT '{}',
    "status" "QuestionnaireStatus" NOT NULL DEFAULT 'DRAFT',
    "submittedAt" TIMESTAMP(3),
    "reopenNote" TEXT,
    "reopenedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "client_profile_questionnaires_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "client_profile_questionnaires_clientId_key" ON "client_profile_questionnaires"("clientId");

ALTER TABLE "client_profile_questionnaires" ADD CONSTRAINT "client_profile_questionnaires_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "clients"("id") ON DELETE CASCADE ON UPDATE CASCADE;
