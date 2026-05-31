-- Safe additive migration for advertising channels + campaign channel join
ALTER TABLE "AdCampaign" ADD COLUMN IF NOT EXISTS "placementDate" TIMESTAMP(3);
ALTER TABLE "AdvertisingSource" ALTER COLUMN "type" SET DEFAULT 'telegram_channel';

CREATE TABLE IF NOT EXISTS "AdCampaignAdvertisingChannel" (
  "id" TEXT NOT NULL,
  "adCampaignId" TEXT NOT NULL,
  "advertisingSourceId" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "AdCampaignAdvertisingChannel_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "AdCampaignAdvertisingChannel_adCampaignId_advertisingSourceId_key"
ON "AdCampaignAdvertisingChannel"("adCampaignId", "advertisingSourceId");

CREATE INDEX IF NOT EXISTS "AdCampaignAdvertisingChannel_advertisingSourceId_idx"
ON "AdCampaignAdvertisingChannel"("advertisingSourceId");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'AdCampaignAdvertisingChannel_adCampaignId_fkey'
  ) THEN
    ALTER TABLE "AdCampaignAdvertisingChannel"
      ADD CONSTRAINT "AdCampaignAdvertisingChannel_adCampaignId_fkey"
      FOREIGN KEY ("adCampaignId") REFERENCES "AdCampaign"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'AdCampaignAdvertisingChannel_advertisingSourceId_fkey'
  ) THEN
    ALTER TABLE "AdCampaignAdvertisingChannel"
      ADD CONSTRAINT "AdCampaignAdvertisingChannel_advertisingSourceId_fkey"
      FOREIGN KEY ("advertisingSourceId") REFERENCES "AdvertisingSource"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

-- Backfill single-source campaigns into join table.
INSERT INTO "AdCampaignAdvertisingChannel" ("id", "adCampaignId", "advertisingSourceId", "createdAt")
SELECT gen_random_uuid()::text, c."id", c."advertisingSourceId", CURRENT_TIMESTAMP
FROM "AdCampaign" c
WHERE c."advertisingSourceId" IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM "AdCampaignAdvertisingChannel" j
    WHERE j."adCampaignId" = c."id" AND j."advertisingSourceId" = c."advertisingSourceId"
  );
