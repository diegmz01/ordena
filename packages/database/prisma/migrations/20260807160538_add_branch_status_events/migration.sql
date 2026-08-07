-- CreateTable
CREATE TABLE "BranchStatusEvent" (
    "id" TEXT NOT NULL,
    "branchId" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "offlineCause" TEXT,
    "withinSchedule" BOOLEAN NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BranchStatusEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "BranchStatusEvent_branchId_createdAt_idx" ON "BranchStatusEvent"("branchId", "createdAt");

-- AddForeignKey
ALTER TABLE "BranchStatusEvent" ADD CONSTRAINT "BranchStatusEvent_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE CASCADE ON UPDATE CASCADE;
