ALTER TABLE "TelegramChannel"
ADD COLUMN "syncIncludePublicInfo" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN "syncIncludeInviteLinks" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN "syncIncludeHistoricalPosts" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN "syncIncludePostMetrics" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN "syncIncludeOlderPosts" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN "syncIncludeChannelStats" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN "syncIncludeManagedPosts" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN "syncIncludeAudienceSnapshot" BOOLEAN NOT NULL DEFAULT true;
