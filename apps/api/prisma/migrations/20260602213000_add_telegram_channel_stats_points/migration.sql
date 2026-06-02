ALTER TABLE "TelegramChannelStatsSnapshot"
ADD COLUMN "snapshotDate" DATE;

UPDATE "TelegramChannelStatsSnapshot"
SET "snapshotDate" = "syncedAt"::date;

DELETE FROM "TelegramChannelStatsSnapshot" older
USING "TelegramChannelStatsSnapshot" newer
WHERE older."telegramChannelId" = newer."telegramChannelId"
  AND older."snapshotDate" = newer."snapshotDate"
  AND older."syncedAt" < newer."syncedAt";

ALTER TABLE "TelegramChannelStatsSnapshot"
ALTER COLUMN "snapshotDate" SET NOT NULL;

CREATE UNIQUE INDEX "TelegramChannelStatsSnapshot_telegramChannelId_snapshotDate_key"
ON "TelegramChannelStatsSnapshot"("telegramChannelId", "snapshotDate");

CREATE TABLE "TelegramChannelStatsPoint" (
  "id" TEXT NOT NULL,
  "workspaceId" TEXT NOT NULL,
  "telegramChannelId" TEXT NOT NULL,
  "metric" TEXT NOT NULL,
  "series" TEXT NOT NULL,
  "seriesLabel" TEXT NOT NULL,
  "color" TEXT,
  "graphType" TEXT NOT NULL,
  "date" DATE NOT NULL,
  "value" DOUBLE PRECISION NOT NULL,
  "latestSyncedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "TelegramChannelStatsPoint_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "TelegramChannelStatsPoint_telegramChannelId_metric_series_date_key"
ON "TelegramChannelStatsPoint"("telegramChannelId", "metric", "series", "date");

CREATE INDEX "TelegramChannelStatsPoint_workspaceId_telegramChannelId_date_idx"
ON "TelegramChannelStatsPoint"("workspaceId", "telegramChannelId", "date");

ALTER TABLE "TelegramChannelStatsPoint"
ADD CONSTRAINT "TelegramChannelStatsPoint_workspaceId_fkey"
FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "TelegramChannelStatsPoint"
ADD CONSTRAINT "TelegramChannelStatsPoint_telegramChannelId_fkey"
FOREIGN KEY ("telegramChannelId") REFERENCES "TelegramChannel"("id") ON DELETE CASCADE ON UPDATE CASCADE;
