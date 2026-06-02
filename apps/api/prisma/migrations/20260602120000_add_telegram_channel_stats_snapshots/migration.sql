CREATE TABLE "TelegramChannelStatsSnapshot" (
  "id" TEXT NOT NULL,
  "workspaceId" TEXT NOT NULL,
  "telegramChannelId" TEXT NOT NULL,
  "syncedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "rawStats" JSONB NOT NULL,
  "normalizedStats" JSONB NOT NULL,
  "availableFields" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "warnings" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "TelegramChannelStatsSnapshot_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "TelegramChannelStatsSnapshot_workspaceId_telegramChannelId_syncedAt_idx"
  ON "TelegramChannelStatsSnapshot"("workspaceId", "telegramChannelId", "syncedAt");

ALTER TABLE "TelegramChannelStatsSnapshot"
  ADD CONSTRAINT "TelegramChannelStatsSnapshot_workspaceId_fkey"
  FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "TelegramChannelStatsSnapshot"
  ADD CONSTRAINT "TelegramChannelStatsSnapshot_telegramChannelId_fkey"
  FOREIGN KEY ("telegramChannelId") REFERENCES "TelegramChannel"("id") ON DELETE CASCADE ON UPDATE CASCADE;
