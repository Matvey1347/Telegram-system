CREATE TYPE "TelegramChannelAdAnalysisStatus" AS ENUM ('NEW', 'APPROVED', 'REJECTED', 'WATCH_LATER', 'BLACKLIST', 'TESTED');

CREATE TABLE "TelegramChannelAdAnalysis" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "telegramChannelId" TEXT NOT NULL,
    "analyzedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "status" "TelegramChannelAdAnalysisStatus" NOT NULL DEFAULT 'WATCH_LATER',
    "verdict" TEXT,
    "price" DECIMAL(65,30),
    "currency" VARCHAR(3) NOT NULL DEFAULT 'USD',
    "avgViews" DOUBLE PRECISION,
    "avgReactions" DOUBLE PRECISION,
    "avgForwards" DOUBLE PRECISION,
    "postsCount" INTEGER,
    "cpm" DECIMAL(65,30),
    "reasonTags" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "reasonSummary" TEXT,
    "notes" TEXT,
    "nextReviewAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "TelegramChannelAdAnalysis_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "TelegramChannelAdAnalysis_workspaceId_telegramChannelId_idx" ON "TelegramChannelAdAnalysis"("workspaceId", "telegramChannelId");
CREATE INDEX "TelegramChannelAdAnalysis_workspaceId_analyzedAt_idx" ON "TelegramChannelAdAnalysis"("workspaceId", "analyzedAt");
CREATE INDEX "TelegramChannelAdAnalysis_workspaceId_status_idx" ON "TelegramChannelAdAnalysis"("workspaceId", "status");

ALTER TABLE "TelegramChannelAdAnalysis" ADD CONSTRAINT "TelegramChannelAdAnalysis_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "TelegramChannelAdAnalysis" ADD CONSTRAINT "TelegramChannelAdAnalysis_telegramChannelId_fkey" FOREIGN KEY ("telegramChannelId") REFERENCES "TelegramChannel"("id") ON DELETE CASCADE ON UPDATE CASCADE;
