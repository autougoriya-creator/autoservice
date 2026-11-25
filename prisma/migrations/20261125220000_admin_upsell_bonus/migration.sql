-- AlterTable
ALTER TABLE "Organization" ADD COLUMN "adminUpsellBonusPercent" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "Booking" ADD COLUMN "fromClient" BOOLEAN NOT NULL DEFAULT false;
