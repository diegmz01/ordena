-- CreateEnum
CREATE TYPE "BranchAvailability" AS ENUM ('AUTO', 'OPEN', 'PAUSED', 'CLOSED');

-- AlterTable Branch
ALTER TABLE "Branch" ADD COLUMN "availability" "BranchAvailability" NOT NULL DEFAULT 'AUTO';
ALTER TABLE "Branch" ADD COLUMN "pausedUntil" TIMESTAMP(3);
ALTER TABLE "Branch" ADD COLUMN "prepTimeMinutes" INTEGER NOT NULL DEFAULT 20;

-- AlterTable Order
ALTER TABLE "Order" ADD COLUMN "paymentBrand" TEXT;
ALTER TABLE "Order" ADD COLUMN "paymentFunding" TEXT;
ALTER TABLE "Order" ADD COLUMN "paymentLast4" TEXT;
ALTER TABLE "Order" ADD COLUMN "dayNumber" INTEGER;
ALTER TABLE "Order" ADD COLUMN "businessDate" DATE;
ALTER TABLE "Order" ADD COLUMN "prepMinutes" INTEGER;
ALTER TABLE "Order" ADD COLUMN "readyAt" TIMESTAMP(3);

-- CreateIndex
CREATE INDEX "Order_readyAt_idx" ON "Order"("readyAt");
CREATE UNIQUE INDEX "Order_branchId_businessDate_dayNumber_key" ON "Order"("branchId", "businessDate", "dayNumber");
