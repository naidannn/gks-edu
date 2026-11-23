-- 1B-30: the consultation calendar. The assistant's agreed time used to live
-- only as a sentence in "leads"."note"; it is a row now, and staff add their
-- own bookings to the same table.
CREATE TYPE "ConsultationMode" AS ENUM ('OFFICE', 'PHONE', 'ONLINE');

CREATE TABLE "consultation_appointments" (
    "id" UUID NOT NULL,
    "startsAt" TIMESTAMP(3) NOT NULL,
    "durationMinutes" INTEGER NOT NULL DEFAULT 30,
    "allDay" BOOLEAN NOT NULL DEFAULT false,
    "mode" "ConsultationMode" NOT NULL DEFAULT 'OFFICE',
    "status" "AppointmentStatus" NOT NULL DEFAULT 'SCHEDULED',
    "name" TEXT NOT NULL,
    "phone" TEXT,
    "note" TEXT,
    "leadId" UUID,
    "clientId" UUID,
    "staffId" UUID,
    "createdById" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "consultation_appointments_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "consultation_appointments_startsAt_idx" ON "consultation_appointments"("startsAt");
CREATE INDEX "consultation_appointments_leadId_idx" ON "consultation_appointments"("leadId");
CREATE INDEX "consultation_appointments_clientId_idx" ON "consultation_appointments"("clientId");
CREATE INDEX "consultation_appointments_staffId_startsAt_idx" ON "consultation_appointments"("staffId", "startsAt");

ALTER TABLE "consultation_appointments" ADD CONSTRAINT "consultation_appointments_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "leads"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "consultation_appointments" ADD CONSTRAINT "consultation_appointments_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "clients"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "consultation_appointments" ADD CONSTRAINT "consultation_appointments_staffId_fkey" FOREIGN KEY ("staffId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "consultation_appointments" ADD CONSTRAINT "consultation_appointments_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
