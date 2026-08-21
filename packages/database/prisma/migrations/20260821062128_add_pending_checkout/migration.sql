-- CreateTable
CREATE TABLE "PendingCheckout" (
    "id" TEXT NOT NULL,
    "viewToken" TEXT NOT NULL,
    "orderNumber" TEXT NOT NULL,
    "idempotencyKey" TEXT,
    "branchId" TEXT NOT NULL,
    "userId" TEXT,
    "guestName" TEXT,
    "guestEmail" TEXT,
    "guestPhone" TEXT,
    "subtotal" INTEGER NOT NULL,
    "serviceFee" INTEGER NOT NULL,
    "total" INTEGER NOT NULL,
    "notes" TEXT,
    "itemsJson" JSONB NOT NULL,
    "stripeSessionId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PendingCheckout_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "PendingCheckout_viewToken_key" ON "PendingCheckout"("viewToken");

-- CreateIndex
CREATE UNIQUE INDEX "PendingCheckout_orderNumber_key" ON "PendingCheckout"("orderNumber");

-- CreateIndex
CREATE UNIQUE INDEX "PendingCheckout_idempotencyKey_key" ON "PendingCheckout"("idempotencyKey");

-- CreateIndex
CREATE UNIQUE INDEX "PendingCheckout_stripeSessionId_key" ON "PendingCheckout"("stripeSessionId");

-- CreateIndex
CREATE INDEX "PendingCheckout_createdAt_idx" ON "PendingCheckout"("createdAt");
