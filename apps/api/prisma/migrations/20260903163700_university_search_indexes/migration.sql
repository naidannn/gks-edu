-- Trigram indexes for fuzzy university search (`ILIKE '%q%'` and similarity ordering).
-- pg_trgm is enabled by the init migration; on Supabase it lives in the `extensions` schema.
CREATE INDEX IF NOT EXISTS "universities_nameMn_trgm_idx"
  ON "universities" USING GIN ("nameMn" gin_trgm_ops);

CREATE INDEX IF NOT EXISTS "universities_nameEn_trgm_idx"
  ON "universities" USING GIN ("nameEn" gin_trgm_ops);

CREATE INDEX IF NOT EXISTS "universities_nameKo_trgm_idx"
  ON "universities" USING GIN ("nameKo" gin_trgm_ops);

CREATE INDEX IF NOT EXISTS "universities_cityMn_trgm_idx"
  ON "universities" USING GIN ("cityMn" gin_trgm_ops);
