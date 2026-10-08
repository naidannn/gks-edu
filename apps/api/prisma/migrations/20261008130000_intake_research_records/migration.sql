-- 1A-43: what each school's intake research found, including what it did not.
CREATE TABLE "intake_research_records" (
    "universityId" UUID NOT NULL,
    "researchedAt" DATE NOT NULL,
    "roundsFound" INTEGER NOT NULL DEFAULT 0,
    "notOffered" "ProgramLevel"[] DEFAULT ARRAY[]::"ProgramLevel"[],
    "pending" JSONB NOT NULL DEFAULT '[]',
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "intake_research_records_pkey" PRIMARY KEY ("universityId")
);

ALTER TABLE "intake_research_records"
  ADD CONSTRAINT "intake_research_records_universityId_fkey"
  FOREIGN KEY ("universityId") REFERENCES "universities"("id") ON DELETE CASCADE ON UPDATE CASCADE;
