-- The greeting speaks in the homepage headline's words (2C-14). Only a greeting
-- nobody has edited is replaced; one staff wrote in /admin/ai/settings stays.
ALTER TABLE "ai_assistant_config" ALTER COLUMN "greeting" SET DEFAULT 'Сайн байна уу! Би GKSedu-гийн AI зөвлөх. Солонгост сурах бүх асуултаа надаас асуугаарай — танд тохирох сургууль, зардал, GKS тэтгэлэг, материал, виз.';
UPDATE "ai_assistant_config" SET "greeting" = 'Сайн байна уу! Би GKSedu-гийн AI зөвлөх. Солонгост сурах бүх асуултаа надаас асуугаарай — танд тохирох сургууль, зардал, GKS тэтгэлэг, материал, виз.' WHERE "greeting" = 'Сайн байна уу. Солонгост суралцах талаар юу ч асууж болно — сургууль, хугацаа, материал, тэтгэлэг.';
