-- CreateEnum
CREATE TYPE "ServiceFeeType" AS ENUM ('FIXED', 'PERCENTAGE');

-- AlterTable
ALTER TABLE "Order" ADD COLUMN     "serviceFee" INTEGER NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "ServiceFeeSettings" (
    "id" TEXT NOT NULL DEFAULT 'singleton',
    "type" "ServiceFeeType" NOT NULL DEFAULT 'FIXED',
    "amount" INTEGER NOT NULL DEFAULT 0,
    "percentage" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT false,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ServiceFeeSettings_pkey" PRIMARY KEY ("id")
);
