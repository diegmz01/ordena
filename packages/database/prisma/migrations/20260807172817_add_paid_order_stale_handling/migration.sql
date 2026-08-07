-- AlterTable
ALTER TABLE "Order" ADD COLUMN     "customerDelayAlertSentAt" TIMESTAMP(3);

-- CreateIndex
CREATE INDEX "Order_status_paidAt_idx" ON "Order"("status", "paidAt");
