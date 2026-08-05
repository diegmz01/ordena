-- CreateEnum
CREATE TYPE "StaffAwayReason" AS ENUM ('APP_CLOSED', 'CONNECTION_LOST');

-- AlterTable
ALTER TABLE "Branch" ADD COLUMN "staffAwayReason" "StaffAwayReason";
