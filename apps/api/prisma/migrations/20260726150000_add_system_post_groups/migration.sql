ALTER TABLE "PostGroup"
ADD COLUMN IF NOT EXISTS "isSystem" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN IF NOT EXISTS "systemKey" TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS "PostGroup_telegramChannelId_systemKey_key"
ON "PostGroup"("telegramChannelId", "systemKey");
