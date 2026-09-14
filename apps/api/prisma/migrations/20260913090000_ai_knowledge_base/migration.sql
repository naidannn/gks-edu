-- 2A-01 — the AI knowledge base (AI-ASSISTANT.md §4, §11).
--
-- The boilerplate `documents` / `document_chunks` pair is replaced rather than
-- migrated: it held one seeded fixture about linear algebra, nothing else, and
-- the new shape carries an access level, a kind and a lifecycle on every row.
-- The names change so that a knowledge document can never be read as a
-- `CaseDocument` — the client's passport scan.
--
-- Hand-written rather than taken as `migrate diff` produced it. A diff against
-- the live database also wants to drop the trigram indexes on `faculties` and
-- `university_programs`, because Prisma cannot see an index it did not declare;
-- that is how `document_chunks_embedding_hnsw_idx` was lost once already
-- (20260903163553). Keep generated SQL under review, and keep the SQL-only
-- objects — the generated `tsv` column, the GIN and HNSW indexes below — out of
-- Prisma's reach on purpose.

-- CreateEnum
CREATE TYPE "AccessLevel" AS ENUM ('PUBLIC', 'REGISTERED', 'CONTRACTED', 'INTERNAL');

-- CreateEnum
CREATE TYPE "KnowledgeKind" AS ENUM ('FILE', 'FAQ', 'POST', 'ENTRY', 'PLAYBOOK');

-- CreateEnum
CREATE TYPE "KnowledgeCategory" AS ENUM ('SCHOOL', 'SERVICE', 'PRICING', 'SCHOLARSHIP', 'DOCUMENTS', 'VISA', 'LIVING', 'POLICY', 'SALES', 'FAQ');

-- CreateEnum
CREATE TYPE "KnowledgeStatus" AS ENUM ('DRAFT', 'PUBLISHED', 'ARCHIVED');

-- DropForeignKey
ALTER TABLE "document_chunks" DROP CONSTRAINT IF EXISTS "document_chunks_documentId_fkey";

-- DropForeignKey
ALTER TABLE "documents" DROP CONSTRAINT IF EXISTS "documents_authorId_fkey";

-- DropTable
DROP TABLE IF EXISTS "document_chunks";

-- DropTable
DROP TABLE IF EXISTS "documents";

-- CreateTable
CREATE TABLE "knowledge_documents" (
    "id" UUID NOT NULL,
    "title" TEXT NOT NULL,
    "kind" "KnowledgeKind" NOT NULL,
    "category" "KnowledgeCategory" NOT NULL,
    "accessLevel" "AccessLevel" NOT NULL DEFAULT 'PUBLIC',
    "status" "KnowledgeStatus" NOT NULL DEFAULT 'DRAFT',
    "universityId" UUID,
    "serviceType" "ServiceType",
    "validUntil" TIMESTAMP(3),
    "sourceFile" TEXT,
    "sourceRef" TEXT,
    "question" TEXT,
    "body" TEXT,
    "contentHash" TEXT,
    "chunkCount" INTEGER NOT NULL DEFAULT 0,
    "indexedAt" TIMESTAMP(3),
    "indexError" TEXT,
    "createdById" UUID,
    "updatedById" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "knowledge_documents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "knowledge_chunks" (
    "id" UUID NOT NULL,
    "documentId" UUID NOT NULL,
    "chunkIndex" INTEGER NOT NULL,
    "heading" TEXT,
    "content" TEXT NOT NULL,
    "tokenCount" INTEGER NOT NULL DEFAULT 0,
    "accessLevel" "AccessLevel" NOT NULL,
    "universityId" UUID,
    "embedding" vector(1536),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "knowledge_chunks_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "knowledge_documents_sourceRef_key" ON "knowledge_documents"("sourceRef");

-- CreateIndex
CREATE INDEX "knowledge_documents_status_accessLevel_idx" ON "knowledge_documents"("status", "accessLevel");

-- CreateIndex
CREATE INDEX "knowledge_documents_universityId_idx" ON "knowledge_documents"("universityId");

-- CreateIndex
CREATE INDEX "knowledge_documents_kind_idx" ON "knowledge_documents"("kind");

-- CreateIndex
CREATE INDEX "knowledge_documents_createdById_idx" ON "knowledge_documents"("createdById");

-- CreateIndex
CREATE INDEX "knowledge_documents_updatedById_idx" ON "knowledge_documents"("updatedById");

-- CreateIndex
CREATE INDEX "knowledge_chunks_documentId_idx" ON "knowledge_chunks"("documentId");

-- CreateIndex
CREATE INDEX "knowledge_chunks_accessLevel_idx" ON "knowledge_chunks"("accessLevel");

-- CreateIndex
CREATE UNIQUE INDEX "knowledge_chunks_documentId_chunkIndex_key" ON "knowledge_chunks"("documentId", "chunkIndex");

-- AddForeignKey
ALTER TABLE "knowledge_documents" ADD CONSTRAINT "knowledge_documents_universityId_fkey" FOREIGN KEY ("universityId") REFERENCES "universities"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "knowledge_documents" ADD CONSTRAINT "knowledge_documents_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "knowledge_documents" ADD CONSTRAINT "knowledge_documents_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "knowledge_chunks" ADD CONSTRAINT "knowledge_chunks_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "knowledge_documents"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- The lexical half of the hybrid search (AI-ASSISTANT.md §4.4). Generated, so a
-- chunk can never be inserted with a stale `tsv`, and `simple` because Postgres
-- ships no Mongolian stemmer — stemming Cyrillic with the English dictionary is
-- worse than not stemming at all. The heading is indexed with the body so that
-- "Виз > D-4" is searchable from inside the chunk it labels.
ALTER TABLE "knowledge_chunks"
  ADD COLUMN "tsv" tsvector
  GENERATED ALWAYS AS (to_tsvector('simple', coalesce("heading", '') || ' ' || "content")) STORED;

CREATE INDEX "knowledge_chunks_tsv_idx" ON "knowledge_chunks" USING GIN ("tsv");

-- Trigram, for the third leg of the hybrid search: the one that matches
-- "TOPIK", "D-2" and a misspelt school name. pg_trgm is enabled by the init
-- migration; on Supabase it lives in the `extensions` schema.
CREATE INDEX "knowledge_chunks_content_trgm_idx" ON "knowledge_chunks" USING GIN ("content" gin_trgm_ops);

-- pgvector ANN index for the cosine search. `vector_cosine_ops` must match the
-- `<=>` operator the retrieval query uses.
CREATE INDEX "knowledge_chunks_embedding_hnsw_idx" ON "knowledge_chunks" USING hnsw ("embedding" vector_cosine_ops);
