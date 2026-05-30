-- AlterTable
ALTER TABLE "User" ADD COLUMN "seedKey" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "User_seedKey_key" ON "User"("seedKey");
