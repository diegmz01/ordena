-- AlterTable
ALTER TABLE "Order" ADD COLUMN     "captureFailedAt" TIMESTAMP(3),
ADD COLUMN     "staleOrderAlertSentAt" TIMESTAMP(3);
