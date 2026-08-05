-- CreateTable
CREATE TABLE "OAuthOneTimeCode" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OAuthOneTimeCode_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "OAuthOneTimeCode_code_key" ON "OAuthOneTimeCode"("code");

-- CreateIndex
CREATE INDEX "OAuthOneTimeCode_expiresAt_idx" ON "OAuthOneTimeCode"("expiresAt");

-- CreateIndex
CREATE INDEX "OAuthOneTimeCode_userId_idx" ON "OAuthOneTimeCode"("userId");
