-- CreateEnum
CREATE TYPE "TelegramUserAccountStatus" AS ENUM ('pending', 'needs_code', 'needs_password', 'connected', 'error', 'disabled');

-- CreateTable
CREATE TABLE "TelegramUserAccountIntegration" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "apiId" TEXT NOT NULL,
    "apiHashEncrypted" TEXT NOT NULL,
    "apiHashIv" TEXT NOT NULL,
    "apiHashAuthTag" TEXT NOT NULL,
    "phoneMasked" TEXT,
    "telegramUserId" TEXT,
    "username" TEXT,
    "firstName" TEXT,
    "lastName" TEXT,
    "status" "TelegramUserAccountStatus" NOT NULL DEFAULT 'pending',
    "lastErrorMessage" TEXT,
    "lastCheckedAt" TIMESTAMP(3),
    "lastSyncedAt" TIMESTAMP(3),
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "sessionEncrypted" TEXT,
    "sessionIv" TEXT,
    "sessionAuthTag" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TelegramUserAccountIntegration_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "TelegramUserAccountIntegration" ADD CONSTRAINT "TelegramUserAccountIntegration_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
