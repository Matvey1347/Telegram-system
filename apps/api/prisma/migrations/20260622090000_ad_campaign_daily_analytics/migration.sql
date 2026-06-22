ALTER TABLE "AdCampaign"
ADD COLUMN "subscribersBefore" INTEGER,
ADD COLUMN "avgViewsBefore" DOUBLE PRECISION,
ADD COLUMN "avgReactionsBefore" DOUBLE PRECISION,
ADD COLUMN "subscribersAfter24h" INTEGER,
ADD COLUMN "subscribersAfter48h" INTEGER,
ADD COLUMN "subscribersAfter72h" INTEGER,
ADD COLUMN "subscribersAfter7d" INTEGER,
ADD COLUMN "subscribersAfter30d" INTEGER,
ADD COLUMN "avgViewsAfter" DOUBLE PRECISION,
ADD COLUMN "avgReactionsAfter" DOUBLE PRECISION,
ADD COLUMN "clicksAfter" INTEGER,
ADD COLUMN "newSubscribers" INTEGER,
ADD COLUMN "activeSubscribersFromAd" INTEGER,
ADD COLUMN "activeCpa" DECIMAL(65,30),
ADD COLUMN "activeRate" DOUBLE PRECISION,
ADD COLUMN "unsub24h" INTEGER,
ADD COLUMN "unsub48h" INTEGER,
ADD COLUMN "unsub72h" INTEGER,
ADD COLUMN "unsub7d" INTEGER,
ADD COLUMN "unsub30d" INTEGER,
ADD COLUMN "retention24h" DOUBLE PRECISION,
ADD COLUMN "retention48h" DOUBLE PRECISION,
ADD COLUMN "retention72h" DOUBLE PRECISION,
ADD COLUMN "retention7d" DOUBLE PRECISION,
ADD COLUMN "retention30d" DOUBLE PRECISION,
ADD COLUMN "cpaStatus" TEXT,
ADD COLUMN "activeCpaStatus" TEXT,
ADD COLUMN "retentionStatus" TEXT,
ADD COLUMN "overallStatus" TEXT,
ADD COLUMN "decisionText" TEXT,
ADD COLUMN "excludeFromAnalytics" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "analyticsNotes" TEXT,
ADD COLUMN "analyticsLastCalculatedAt" TIMESTAMP(3),
ADD COLUMN "analyticsLastAutoSyncedAt" TIMESTAMP(3),
ADD COLUMN "analyticsLastManualSyncedAt" TIMESTAMP(3);

CREATE TABLE "DailyAnalyticsSyncRun" (
  "id" TEXT NOT NULL,
  "workspaceId" TEXT,
  "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "finishedAt" TIMESTAMP(3),
  "status" TEXT NOT NULL DEFAULT 'running',
  "source" TEXT NOT NULL DEFAULT 'cron',
  "channelsProcessed" INTEGER NOT NULL DEFAULT 0,
  "campaignsProcessed" INTEGER NOT NULL DEFAULT 0,
  "snapshotsCreated" INTEGER NOT NULL DEFAULT 0,
  "errorsCount" INTEGER NOT NULL DEFAULT 0,
  "errorMessage" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "DailyAnalyticsSyncRun_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "DailyAnalyticsSyncRun"
ADD CONSTRAINT "DailyAnalyticsSyncRun_workspaceId_fkey"
FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE INDEX "DailyAnalyticsSyncRun_workspaceId_startedAt_idx"
ON "DailyAnalyticsSyncRun"("workspaceId", "startedAt");

CREATE INDEX "DailyAnalyticsSyncRun_status_idx"
ON "DailyAnalyticsSyncRun"("status");

CREATE INDEX "DailyAnalyticsSyncRun_source_idx"
ON "DailyAnalyticsSyncRun"("source");
