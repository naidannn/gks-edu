-- The programme search gets its own model.
--
-- One field served both searches, and they are not the same job: an intake
-- calendar is four to eight rows and worth grounding, a school's department
-- list is sixty rows that no model grounds in practice. Measured on Seoul
-- National University with the same prompt: gemini-3.1-flash-lite returned 5
-- departments for $0.002, gemini-3.1-pro-preview 82 for $0.38, and DeepSeek
-- v4-flash 62 for $0.018. The second search now defaults to the third.
ALTER TABLE "admission_config"
  ADD COLUMN "programResearchModel" TEXT NOT NULL DEFAULT 'deepseek-v4-flash';
