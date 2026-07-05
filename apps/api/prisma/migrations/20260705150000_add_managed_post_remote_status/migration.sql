CREATE TYPE "TelegramManagedPostRemoteStatus" AS ENUM (
  'NONE',
  'SCHEDULED',
  'PUBLISHED',
  'BROKEN',
  'MISSING',
  'UNKNOWN'
);

ALTER TABLE "TelegramManagedPost"
ADD COLUMN "telegramRemoteStatus" "TelegramManagedPostRemoteStatus" NOT NULL DEFAULT 'NONE',
ADD COLUMN "lastTelegramSyncedAt" TIMESTAMP(3),
ADD COLUMN "lastTelegramSyncNote" TEXT;
