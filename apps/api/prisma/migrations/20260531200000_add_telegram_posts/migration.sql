CREATE TABLE "TelegramPost" (
  "id" TEXT NOT NULL,
  "workspaceId" TEXT NOT NULL,
  "telegramChannelId" TEXT NOT NULL,
  "telegramBotIntegrationId" TEXT,
  "telegramMessageId" TEXT NOT NULL,
  "text" TEXT,
  "postDate" TIMESTAMP(3) NOT NULL,
  "viewsCount" INTEGER,
  "forwardsCount" INTEGER,
  "reactionsCount" INTEGER,
  "reactions" JSONB,
  "rawMessage" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "TelegramPost_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "TelegramPost_telegramChannelId_telegramMessageId_key"
  ON "TelegramPost"("telegramChannelId", "telegramMessageId");

CREATE INDEX "TelegramPost_workspaceId_telegramChannelId_postDate_idx"
  ON "TelegramPost"("workspaceId", "telegramChannelId", "postDate");

ALTER TABLE "TelegramPost"
  ADD CONSTRAINT "TelegramPost_workspaceId_fkey"
  FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "TelegramPost"
  ADD CONSTRAINT "TelegramPost_telegramChannelId_fkey"
  FOREIGN KEY ("telegramChannelId") REFERENCES "TelegramChannel"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "TelegramPost"
  ADD CONSTRAINT "TelegramPost_telegramBotIntegrationId_fkey"
  FOREIGN KEY ("telegramBotIntegrationId") REFERENCES "TelegramBotIntegration"("id") ON DELETE SET NULL ON UPDATE CASCADE;
