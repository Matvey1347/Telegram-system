CREATE TYPE "TelegramManagedPostOrigin" AS ENUM ('SYSTEM', 'TELEGRAM');

ALTER TABLE "TelegramManagedPost"
ADD COLUMN "origin" "TelegramManagedPostOrigin" NOT NULL DEFAULT 'SYSTEM',
ADD COLUMN "remoteImportKey" TEXT;

ALTER TABLE "TelegramManagedPostRevision"
ADD COLUMN "origin" "TelegramManagedPostOrigin" NOT NULL DEFAULT 'SYSTEM',
ADD COLUMN "remoteImportKey" TEXT;

UPDATE "TelegramManagedPost"
SET "origin" = 'SYSTEM'
WHERE "origin" IS NULL;

UPDATE "TelegramManagedPostRevision"
SET "origin" = 'SYSTEM'
WHERE "origin" IS NULL;

CREATE INDEX "TelegramManagedPost_workspaceId_telegramChannelId_origin_status_s_idx"
ON "TelegramManagedPost"("workspaceId", "telegramChannelId", "origin", "status", "scheduledAt");

CREATE UNIQUE INDEX "TelegramManagedPost_workspaceId_telegramChannelId_remoteImport_idx"
ON "TelegramManagedPost"("workspaceId", "telegramChannelId", "remoteImportKey")
WHERE "remoteImportKey" IS NOT NULL;
