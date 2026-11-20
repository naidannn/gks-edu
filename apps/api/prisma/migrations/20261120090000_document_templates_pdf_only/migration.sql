-- 1D-32: every material is kept as a PDF. A photo sent for a PDF-only
-- template is converted on upload, so clients are not refused — see
-- `image-to-pdf.ts`. Files already stored keep their own type.
ALTER TABLE "document_templates" ALTER COLUMN "acceptedFileTypes" SET DEFAULT ARRAY['pdf']::TEXT[];

UPDATE "document_templates" SET "acceptedFileTypes" = ARRAY['pdf']::TEXT[];
