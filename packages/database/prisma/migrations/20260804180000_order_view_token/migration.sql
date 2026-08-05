-- AlterTable
ALTER TABLE "Order" ADD COLUMN "viewToken" TEXT;

-- Backfill existing rows
UPDATE "Order" SET "viewToken" = md5(random()::text || id::text || clock_timestamp()::text) WHERE "viewToken" IS NULL;

-- Enforce NOT NULL + unique
ALTER TABLE "Order" ALTER COLUMN "viewToken" SET NOT NULL;
CREATE UNIQUE INDEX "Order_viewToken_key" ON "Order"("viewToken");
