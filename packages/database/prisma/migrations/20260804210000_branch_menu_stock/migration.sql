-- AlterTable
ALTER TABLE "Branch" ADD COLUMN "menuStockEnabled" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "BranchProduct" ADD COLUMN "unavailableUntil" TIMESTAMP(3);
