-- pgvector ANN index for the cosine-distance search in VectorService.search().
-- `vector_cosine_ops` must match the `<=>` operator used in the query, and
-- Prisma cannot express index options like this in schema.prisma.
CREATE INDEX IF NOT EXISTS "document_chunks_embedding_hnsw_idx"
  ON "document_chunks" USING hnsw ("embedding" vector_cosine_ops);

-- Trigram index backing the case-insensitive `contains` search in UsersService.
CREATE INDEX IF NOT EXISTS "users_email_trgm_idx" ON "users" USING gin ("email" gin_trgm_ops);
