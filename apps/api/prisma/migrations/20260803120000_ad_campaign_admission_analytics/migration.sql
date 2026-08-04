CREATE TYPE "AdCampaignAdmissionBatchStatus" AS ENUM ('ACTIVE', 'CLOSED');

CREATE TYPE "AdCampaignAdmissionDetectionMode" AS ENUM (
  'EXACT_DELTA',
  'BOOTSTRAPPED_CUMULATIVE'
);

CREATE TYPE "AdCampaignAdmissionTimeBoundarySource" AS ENUM (
  'CAMPAIGN_ACTUAL_START',
  'CAMPAIGN_START',
  'INVITE_LINK_CREATED',
  'AUDIENCE_SNAPSHOT',
  'FIRST_INVITE_SNAPSHOT'
);

CREATE TYPE "AdCampaignAdmissionBaselineMethod" AS ENUM (
  'PRE_ADMISSION',
  'EARLIEST_OBSERVED',
  'UNAVAILABLE'
);

CREATE TYPE "AdCampaignAdmissionDataQuality" AS ENUM (
  'GOOD',
  'PARTIAL',
  'INSUFFICIENT',
  'SUSPICIOUS'
);

CREATE TABLE "AdCampaignAdmissionBatch" (
  "id" TEXT NOT NULL,
  "workspaceId" TEXT NOT NULL,
  "adCampaignId" TEXT NOT NULL,
  "telegramChannelId" TEXT NOT NULL,
  "status" "AdCampaignAdmissionBatchStatus" NOT NULL DEFAULT 'ACTIVE',
  "detectionMode" "AdCampaignAdmissionDetectionMode" NOT NULL,
  "analysisStartedAt" TIMESTAMP(3) NOT NULL,
  "firstObservedAt" TIMESTAMP(3) NOT NULL,
  "startedAt" TIMESTAMP(3) NOT NULL,
  "endedAt" TIMESTAMP(3),
  "timeBoundarySource" "AdCampaignAdmissionTimeBoundarySource" NOT NULL,
  "releasedSubscribersCount" INTEGER NOT NULL,
  "joinedBefore" INTEGER NOT NULL DEFAULT 0,
  "joinedAfter" INTEGER NOT NULL DEFAULT 0,
  "requestedBefore" INTEGER NOT NULL DEFAULT 0,
  "requestedAfter" INTEGER NOT NULL DEFAULT 0,
  "sourceLinks" JSONB NOT NULL,
  "baselineSnapshotAt" TIMESTAMP(3),
  "baselineMethod" "AdCampaignAdmissionBaselineMethod" NOT NULL DEFAULT 'UNAVAILABLE',
  "trackedPosts" JSONB NOT NULL,
  "trackedPostsCount" INTEGER NOT NULL DEFAULT 0,
  "baselineAvgViews" DOUBLE PRECISION,
  "baselineAvgReactions" DOUBLE PRECISION,
  "dataQuality" "AdCampaignAdmissionDataQuality" NOT NULL DEFAULT 'GOOD',
  "dataQualityReason" TEXT,
  "batchFingerprint" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "AdCampaignAdmissionBatch_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "AdCampaignAdmissionViewSnapshot" (
  "id" TEXT NOT NULL,
  "batchId" TEXT NOT NULL,
  "collectedAt" TIMESTAMP(3) NOT NULL,
  "sourceMetricCollectedAt" TIMESTAMP(3) NOT NULL,
  "avgViews" DOUBLE PRECISION,
  "avgReactions" DOUBLE PRECISION,
  "cumulativeAvgViewsUplift" DOUBLE PRECISION,
  "incrementalAvgViewsUplift" DOUBLE PRECISION,
  "estimatedActiveSubscribers" INTEGER,
  "activationRate" DOUBLE PRECISION,
  "trackedPostsCount" INTEGER NOT NULL DEFAULT 0,
  "channelSubscribersCount" INTEGER,
  "joinedCount" INTEGER,
  "requestedCount" INTEGER,
  "dataQuality" "AdCampaignAdmissionDataQuality" NOT NULL DEFAULT 'GOOD',
  "dataQualityReason" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "AdCampaignAdmissionViewSnapshot_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "AdCampaignAdmissionBackfillState" (
  "id" TEXT NOT NULL,
  "workspaceId" TEXT NOT NULL,
  "telegramChannelId" TEXT NOT NULL,
  "completedAt" TIMESTAMP(3) NOT NULL,
  "lastProcessedInviteSnapshotAt" TIMESTAMP(3),
  "version" INTEGER NOT NULL DEFAULT 1,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "AdCampaignAdmissionBackfillState_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "AdCampaignAdmissionBatch_batchFingerprint_key"
ON "AdCampaignAdmissionBatch"("batchFingerprint");

CREATE INDEX "AdCampaignAdmissionBatch_workspaceId_status_idx"
ON "AdCampaignAdmissionBatch"("workspaceId", "status");

CREATE INDEX "AdCampaignAdmissionBatch_workspaceId_adCampaignId_status_idx"
ON "AdCampaignAdmissionBatch"("workspaceId", "adCampaignId", "status");

CREATE INDEX "AdmissionBatch_workspace_channel_started_idx"
ON "AdCampaignAdmissionBatch"("workspaceId", "telegramChannelId", "startedAt");

CREATE INDEX "AdCampaignAdmissionBatch_adCampaignId_status_idx"
ON "AdCampaignAdmissionBatch"("adCampaignId", "status");

CREATE INDEX "AdCampaignAdmissionBatch_telegramChannelId_startedAt_idx"
ON "AdCampaignAdmissionBatch"("telegramChannelId", "startedAt");

CREATE INDEX "AdCampaignAdmissionBatch_startedAt_idx"
ON "AdCampaignAdmissionBatch"("startedAt");

CREATE UNIQUE INDEX "AdmissionViewSnapshot_batch_metric_key"
ON "AdCampaignAdmissionViewSnapshot"("batchId", "sourceMetricCollectedAt");

CREATE INDEX "AdCampaignAdmissionViewSnapshot_batchId_collectedAt_idx"
ON "AdCampaignAdmissionViewSnapshot"("batchId", "collectedAt");

CREATE UNIQUE INDEX "AdmissionBackfillState_workspace_channel_version_key"
ON "AdCampaignAdmissionBackfillState"("workspaceId", "telegramChannelId", "version");

CREATE INDEX "AdmissionBackfillState_workspace_channel_idx"
ON "AdCampaignAdmissionBackfillState"("workspaceId", "telegramChannelId");

ALTER TABLE "AdCampaignAdmissionBatch"
ADD CONSTRAINT "AdCampaignAdmissionBatch_workspaceId_fkey"
FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "AdCampaignAdmissionBatch"
ADD CONSTRAINT "AdCampaignAdmissionBatch_adCampaignId_fkey"
FOREIGN KEY ("adCampaignId") REFERENCES "AdCampaign"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "AdCampaignAdmissionBatch"
ADD CONSTRAINT "AdCampaignAdmissionBatch_telegramChannelId_fkey"
FOREIGN KEY ("telegramChannelId") REFERENCES "TelegramChannel"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "AdCampaignAdmissionViewSnapshot"
ADD CONSTRAINT "AdCampaignAdmissionViewSnapshot_batchId_fkey"
FOREIGN KEY ("batchId") REFERENCES "AdCampaignAdmissionBatch"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "AdCampaignAdmissionBackfillState"
ADD CONSTRAINT "AdCampaignAdmissionBackfillState_workspaceId_fkey"
FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "AdCampaignAdmissionBackfillState"
ADD CONSTRAINT "AdCampaignAdmissionBackfillState_telegramChannelId_fkey"
FOREIGN KEY ("telegramChannelId") REFERENCES "TelegramChannel"("id")
ON DELETE CASCADE ON UPDATE CASCADE;
