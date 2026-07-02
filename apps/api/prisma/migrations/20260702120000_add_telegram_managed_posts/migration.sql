CREATE TYPE "TelegramManagedPostStatus" AS ENUM ('DRAFT', 'SCHEDULED', 'PUBLISHING', 'PUBLISHED', 'FAILED');

CREATE TABLE "TelegramManagedPost" (
  "id" TEXT NOT NULL,
  "workspaceId" TEXT NOT NULL,
  "telegramChannelId" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "text" TEXT,
  "imageUrls" TEXT[] DEFAULT ARRAY[]::TEXT[],
  "status" "TelegramManagedPostStatus" NOT NULL DEFAULT 'DRAFT',
  "scheduledAt" TIMESTAMP(3),
  "publishedAt" TIMESTAMP(3),
  "telegramMessageIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
  "sourceType" "TelegramSourceType",
  "sourceId" TEXT,
  "lastError" TEXT,
  "createdByUserId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "TelegramManagedPost_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "TelegramManagedPost_workspaceId_telegramChannelId_createdAt_idx"
ON "TelegramManagedPost"("workspaceId", "telegramChannelId", "createdAt");
CREATE INDEX "TelegramManagedPost_status_scheduledAt_idx"
ON "TelegramManagedPost"("status", "scheduledAt");

ALTER TABLE "TelegramManagedPost" ADD CONSTRAINT "TelegramManagedPost_workspaceId_fkey"
FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "TelegramManagedPost" ADD CONSTRAINT "TelegramManagedPost_telegramChannelId_fkey"
FOREIGN KEY ("telegramChannelId") REFERENCES "TelegramChannel"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "TelegramManagedPost" ADD CONSTRAINT "TelegramManagedPost_createdByUserId_fkey"
FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
