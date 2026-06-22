ALTER TABLE "TelegramChannel"
ADD COLUMN "knownFakeSubscribersCount" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN "subscriberBaseQuality" TEXT NOT NULL DEFAULT 'normal',
ADD COLUMN "dataQualityNotes" TEXT;

ALTER TABLE "TelegramChannelAudienceSnapshot"
ADD COLUMN "rawAvgViews" DOUBLE PRECISION,
ADD COLUMN "rawAvgReactions" DOUBLE PRECISION,
ADD COLUMN "rawViewRate" DOUBLE PRECISION,
ADD COLUMN "effectiveSubscribersCount" INTEGER,
ADD COLUMN "cappedActiveSubscribersEstimate" INTEGER,
ADD COLUMN "cappedViewRate" DOUBLE PRECISION,
ADD COLUMN "dataQuality" TEXT NOT NULL DEFAULT 'normal',
ADD COLUMN "dataQualityReason" TEXT,
ADD COLUMN "hasExternalTrafficAnomaly" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "hasSubscriberBasePollution" BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE "AdCampaign"
ADD COLUMN "rawActiveSubscribersFromAd" INTEGER,
ADD COLUMN "rawViewRateAfter" DOUBLE PRECISION,
ADD COLUMN "cappedActiveSubscribersFromAd" INTEGER,
ADD COLUMN "cappedActiveRate" DOUBLE PRECISION,
ADD COLUMN "cappedActiveCpa" DECIMAL(65,30),
ADD COLUMN "cappedViewRateAfter" DOUBLE PRECISION,
ADD COLUMN "adDataQuality" TEXT NOT NULL DEFAULT 'normal',
ADD COLUMN "adDataQualityReason" TEXT,
ADD COLUMN "hasViewAnomaly" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "hasSubscriberBasePollution" BOOLEAN NOT NULL DEFAULT false;
