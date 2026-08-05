-- AlterTable
ALTER TABLE "PushSubscription" ADD COLUMN "branchId" TEXT;

-- AddForeignKey
ALTER TABLE "PushSubscription" ADD CONSTRAINT "PushSubscription_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- CreateIndex
CREATE INDEX "PushSubscription_branchId_idx" ON "PushSubscription"("branchId");
