-- 1D-28 — Personal Statement and Study Plan written in the system (ARCHITECTURE.md §7.6.1).

-- CreateEnum
CREATE TYPE "EssayDocumentKind" AS ENUM ('PERSONAL_STATEMENT', 'STUDY_PLAN');

-- CreateEnum
CREATE TYPE "EssayDocumentStatus" AS ENUM ('DRAFT', 'SHARED', 'APPROVED');

-- CreateTable
CREATE TABLE "essay_documents" (
    "id" UUID NOT NULL,
    "caseId" UUID NOT NULL,
    "kind" "EssayDocumentKind" NOT NULL,
    "html" TEXT NOT NULL DEFAULT '',
    "status" "EssayDocumentStatus" NOT NULL DEFAULT 'DRAFT',
    "version" INTEGER NOT NULL DEFAULT 0,
    "editedById" UUID,
    "sharedAt" TIMESTAMP(3),
    "approvedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "essay_documents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "essay_document_comments" (
    "id" UUID NOT NULL,
    "documentId" UUID NOT NULL,
    "authorId" UUID,
    "body" TEXT NOT NULL,
    "quote" TEXT,
    "resolvedAt" TIMESTAMP(3),
    "resolvedById" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "essay_document_comments_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "essay_documents_caseId_kind_key" ON "essay_documents"("caseId", "kind");

-- CreateIndex
CREATE INDEX "essay_document_comments_documentId_createdAt_idx" ON "essay_document_comments"("documentId", "createdAt");

-- AddForeignKey
ALTER TABLE "essay_documents" ADD CONSTRAINT "essay_documents_caseId_fkey" FOREIGN KEY ("caseId") REFERENCES "cases"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "essay_documents" ADD CONSTRAINT "essay_documents_editedById_fkey" FOREIGN KEY ("editedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "essay_document_comments" ADD CONSTRAINT "essay_document_comments_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "essay_documents"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "essay_document_comments" ADD CONSTRAINT "essay_document_comments_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
