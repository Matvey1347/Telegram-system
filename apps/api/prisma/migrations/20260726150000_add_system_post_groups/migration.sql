ALTER TABLE "PostGroup"
ADD COLUMN "isSystem" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "systemKey" TEXT;

CREATE UNIQUE INDEX "PostGroup_telegramChannelId_systemKey_key"
ON "PostGroup"("telegramChannelId", "systemKey");
