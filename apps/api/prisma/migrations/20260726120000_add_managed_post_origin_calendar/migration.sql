DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_type
    WHERE typname = 'TelegramManagedPostOrigin'
  ) THEN
    CREATE TYPE "TelegramManagedPostOrigin" AS ENUM ('SYSTEM', 'TELEGRAM');
  END IF;
END $$;

ALTER TABLE "TelegramManagedPost"
ADD COLUMN IF NOT EXISTS "origin" "TelegramManagedPostOrigin" NOT NULL DEFAULT 'SYSTEM',
ADD COLUMN IF NOT EXISTS "remoteImportKey" TEXT;

ALTER TABLE "TelegramManagedPostRevision"
ADD COLUMN IF NOT EXISTS "origin" "TelegramManagedPostOrigin" NOT NULL DEFAULT 'SYSTEM',
ADD COLUMN IF NOT EXISTS "remoteImportKey" TEXT;

UPDATE "TelegramManagedPost"
SET "origin" = 'SYSTEM'
WHERE "origin" IS NULL;

UPDATE "TelegramManagedPostRevision"
SET "origin" = 'SYSTEM'
WHERE "origin" IS NULL;

CREATE INDEX IF NOT EXISTS "TelegramManagedPost_workspaceId_telegramChannelId_origin_status_s_idx"
ON "TelegramManagedPost"("workspaceId", "telegramChannelId", "origin", "status", "scheduledAt");

CREATE UNIQUE INDEX IF NOT EXISTS "TelegramManagedPost_workspaceId_telegramChannelId_remoteImport_idx"
ON "TelegramManagedPost"("workspaceId", "telegramChannelId", "remoteImportKey")
WHERE "remoteImportKey" IS NOT NULL;
