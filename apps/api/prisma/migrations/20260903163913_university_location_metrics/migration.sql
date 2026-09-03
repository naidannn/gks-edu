-- DropIndex
DROP INDEX "universities_cityMn_trgm_idx";

-- DropIndex
DROP INDEX "universities_nameEn_trgm_idx";

-- DropIndex
DROP INDEX "universities_nameKo_trgm_idx";

-- DropIndex
DROP INDEX "universities_nameMn_trgm_idx";

-- AlterTable
ALTER TABLE "universities" ADD COLUMN     "campusInfo" TEXT,
ADD COLUMN     "distanceFromSeoulKm" DOUBLE PRECISION,
ADD COLUMN     "internationalStudents" INTEGER,
ADD COLUMN     "mongolianStudents" INTEGER,
ADD COLUMN     "nearestTransit" TEXT,
ADD COLUMN     "numCampuses" INTEGER,
ADD COLUMN     "travelTimeFromSeoul" TEXT;
