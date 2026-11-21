-- 1F-12: the visa list depends on the school's accreditation tier — only a
-- non-accredited school's students bring guarantor papers — and on a sponsor
-- whose income is proven by bank statements rather than social insurance.
ALTER TYPE "GuarantorType" ADD VALUE 'NO_SOCIAL_INSURANCE';

ALTER TABLE "requirement_rules"
  ADD COLUMN "accreditationGrades" "AccreditationGrade"[] NOT NULL DEFAULT ARRAY[]::"AccreditationGrade"[];
