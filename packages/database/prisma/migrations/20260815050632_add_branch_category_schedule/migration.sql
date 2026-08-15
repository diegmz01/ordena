-- CreateTable
CREATE TABLE "BranchCategory" (
    "id" TEXT NOT NULL,
    "branchId" TEXT NOT NULL,
    "categoryId" TEXT NOT NULL,
    "schedule" JSONB,

    CONSTRAINT "BranchCategory_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "BranchCategory_branchId_categoryId_key" ON "BranchCategory"("branchId", "categoryId");

-- AddForeignKey
ALTER TABLE "BranchCategory" ADD CONSTRAINT "BranchCategory_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BranchCategory" ADD CONSTRAINT "BranchCategory_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "Category"("id") ON DELETE CASCADE ON UPDATE CASCADE;
