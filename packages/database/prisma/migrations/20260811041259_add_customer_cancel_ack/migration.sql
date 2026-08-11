-- AlterTable
ALTER TABLE "Order" ADD COLUMN     "cancelledByCustomer" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "customerCancelAckedAt" TIMESTAMP(3);
