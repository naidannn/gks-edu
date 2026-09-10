-- 교육국제화역량 인증제 — the Ministry of Education's two-tier certification of a
-- school's capacity to host international students (ARCHITECTURE.md §3.1).
-- `NONE` is the honest default: the published lists cover the whole catalogue,
-- so a school on neither one is genuinely uncertified.
CREATE TYPE "AccreditationGrade" AS ENUM ('EXCELLENT', 'CERTIFIED', 'NONE');

ALTER TABLE "universities"
  ADD COLUMN "accreditation" "AccreditationGrade" NOT NULL DEFAULT 'NONE';

CREATE INDEX "universities_accreditation_idx" ON "universities"("accreditation");
