-- CreateEnum
CREATE TYPE "BannerPlacement" AS ENUM ('SITE_TOP', 'HOME_HERO');

-- CreateTable
CREATE TABLE "banners" (
    "id" UUID NOT NULL,
    "placement" "BannerPlacement" NOT NULL DEFAULT 'SITE_TOP',
    "titleMn" VARCHAR(160) NOT NULL,
    "bodyMn" VARCHAR(400),
    "linkUrl" VARCHAR(300),
    "linkLabel" VARCHAR(60),
    "startsAt" TIMESTAMP(3),
    "endsAt" TIMESTAMP(3),
    "isPublished" BOOLEAN NOT NULL DEFAULT false,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "banners_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "banners_placement_isPublished_sortOrder_idx" ON "banners"("placement", "isPublished", "sortOrder");
