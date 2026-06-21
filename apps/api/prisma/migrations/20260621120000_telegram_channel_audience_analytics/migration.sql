ALTER TABLE "TelegramChannel"
ADD COLUMN "seedSubscribersCount" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN "activeSubscribersWindow" INTEGER NOT NULL DEFAULT 5,
ADD COLUMN "targetCpa" DECIMAL(65,30),
ADD COLUMN "acceptableCpa" DECIMAL(65,30),
ADD COLUMN "stopCpa" DECIMAL(65,30),
ADD COLUMN "kpiCurrency" VARCHAR(3);

ALTER TABLE "TelegramPost"
ADD COLUMN "manualOwnViews" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN "manualOwnReactions" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN "excludeFromAnalytics" BOOLEAN NOT NULL DEFAULT false;

CREATE TABLE "TelegramChannelAudienceSnapshot" (
  "id" TEXT NOT NULL,
  "workspaceId" TEXT NOT NULL,
  "telegramChannelId" TEXT NOT NULL,
  "collectedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "subscribersCount" INTEGER,
  "activeSubscribersEstimate" INTEGER,
  "viewRate" DOUBLE PRECISION,
  "avgViewsRaw" DOUBLE PRECISION,
  "avgViewsAdjusted" DOUBLE PRECISION,
  "avgReactionsRaw" DOUBLE PRECISION,
  "avgReactionsAdjusted" DOUBLE PRECISION,
  "postsWindow" INTEGER NOT NULL,
  "source" TEXT NOT NULL DEFAULT 'sync',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "TelegramChannelAudienceSnapshot_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "TelegramChannelAudienceSnapshot"
ADD CONSTRAINT "TelegramChannelAudienceSnapshot_workspaceId_fkey"
FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "TelegramChannelAudienceSnapshot"
ADD CONSTRAINT "TelegramChannelAudienceSnapshot_telegramChannelId_fkey"
FOREIGN KEY ("telegramChannelId") REFERENCES "TelegramChannel"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE INDEX "TelegramChannelAudienceSnapshot_workspaceId_telegramChannelId_collectedAt_idx"
ON "TelegramChannelAudienceSnapshot"("workspaceId", "telegramChannelId", "collectedAt");

CREATE INDEX "TelegramChannelAudienceSnapshot_telegramChannelId_collectedAt_idx"
ON "TelegramChannelAudienceSnapshot"("telegramChannelId", "collectedAt");
