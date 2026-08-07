-- AlterTable
ALTER TABLE "Product" ADD COLUMN     "allowCombo" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "OrderItem" ADD COLUMN     "secondaryProductId" TEXT,
ADD COLUMN     "secondaryProductName" TEXT;

-- AddForeignKey
ALTER TABLE "OrderItem" ADD CONSTRAINT "OrderItem_secondaryProductId_fkey" FOREIGN KEY ("secondaryProductId") REFERENCES "Product"("id") ON DELETE SET NULL ON UPDATE CASCADE;
