ALTER TABLE "TelegramManagedPost"
ADD COLUMN "sidebarPosition" INTEGER;

ALTER TABLE "PostGroup"
ADD COLUMN "sidebarPosition" INTEGER;

CREATE INDEX "TelegramManagedPost_telegramChannelId_sidebarPosition_idx"
ON "TelegramManagedPost"("telegramChannelId", "sidebarPosition");

CREATE INDEX "PostGroup_telegramChannelId_sidebarPosition_idx"
ON "PostGroup"("telegramChannelId", "sidebarPosition");
