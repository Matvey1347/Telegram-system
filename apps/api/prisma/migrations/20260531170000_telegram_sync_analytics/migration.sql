ALTER TABLE "TelegramBotIntegration"
  ADD COLUMN "updatesMode" TEXT,
  ADD COLUMN "lastUpdateId" INTEGER;

ALTER TABLE "TelegramChannelDailyStats"
  ADD COLUMN "netGrowthCount" INTEGER;

ALTER TABLE "SubscriberEvent"
  ADD COLUMN "updateId" TEXT,
  ADD COLUMN "rawEvent" JSONB;

CREATE UNIQUE INDEX "TelegramBotUpdateLog_telegramBotIntegrationId_updateId_key"
  ON "TelegramBotUpdateLog"("telegramBotIntegrationId", "updateId");

CREATE UNIQUE INDEX "SubscriberEvent_workspaceId_updateId_key"
  ON "SubscriberEvent"("workspaceId", "updateId");
