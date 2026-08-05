-- CreateTable
CREATE TABLE "BranchModifier" (
    "id" TEXT NOT NULL,
    "branchId" TEXT NOT NULL,
    "modifierId" TEXT NOT NULL,
    "unavailableUntil" TIMESTAMP(3),

    CONSTRAINT "BranchModifier_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "BranchModifier_branchId_modifierId_key" ON "BranchModifier"("branchId", "modifierId");

-- AddForeignKey
ALTER TABLE "BranchModifier" ADD CONSTRAINT "BranchModifier_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BranchModifier" ADD CONSTRAINT "BranchModifier_modifierId_fkey" FOREIGN KEY ("modifierId") REFERENCES "Modifier"("id") ON DELETE CASCADE ON UPDATE CASCADE;
