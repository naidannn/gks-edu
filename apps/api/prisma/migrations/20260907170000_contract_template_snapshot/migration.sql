-- Remember which template version a contract was issued from, so an unsigned
-- draft can be re-rendered against the same legal text after the client's
-- identity is corrected (1C-30). Existing rows stay NULL and fall back to the
-- active template for their service.
ALTER TABLE "contracts" ADD COLUMN "templateId" UUID;

ALTER TABLE "contracts" ADD CONSTRAINT "contracts_templateId_fkey"
  FOREIGN KEY ("templateId") REFERENCES "contract_templates"("id") ON DELETE SET NULL ON UPDATE CASCADE;
