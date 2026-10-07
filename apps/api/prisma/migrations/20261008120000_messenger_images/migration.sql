-- 1K-11: photos in the messenger.
ALTER TYPE "MessageKind" ADD VALUE 'IMAGE';

ALTER TABLE "messages"
  ADD COLUMN "imagePath" VARCHAR(300),
  ADD COLUMN "imageThumbPath" VARCHAR(300),
  ADD COLUMN "imageWidth" INTEGER,
  ADD COLUMN "imageHeight" INTEGER,
  ADD COLUMN "imageBytes" INTEGER;
