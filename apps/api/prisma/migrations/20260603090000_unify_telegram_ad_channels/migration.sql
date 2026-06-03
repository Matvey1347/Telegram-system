ALTER TABLE "TelegramChannel"
  ADD COLUMN IF NOT EXISTS "sourceType" TEXT DEFAULT 'telegram';

ALTER TABLE "TelegramChannel"
  ADD COLUMN IF NOT EXISTS "lastPublicSyncedAt" TIMESTAMP(3);

CREATE INDEX IF NOT EXISTS "TelegramChannel_workspaceId_username_idx"
ON "TelegramChannel"("workspaceId", "username");

CREATE INDEX IF NOT EXISTS "TelegramChannel_workspaceId_telegramChatId_idx"
ON "TelegramChannel"("workspaceId", "telegramChatId");

CREATE TABLE IF NOT EXISTS "AdCampaignTelegramChannelPlacement" (
  "id" TEXT NOT NULL,
  "adCampaignId" TEXT NOT NULL,
  "telegramChannelId" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "AdCampaignTelegramChannelPlacement_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "AdCampaignTelegramChannelPlacement_adCampaignId_telegramChannelId_key"
ON "AdCampaignTelegramChannelPlacement"("adCampaignId", "telegramChannelId");

CREATE INDEX IF NOT EXISTS "AdCampaignTelegramChannelPlacement_telegramChannelId_idx"
ON "AdCampaignTelegramChannelPlacement"("telegramChannelId");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'AdCampaignTelegramChannelPlacement_adCampaignId_fkey'
  ) THEN
    ALTER TABLE "AdCampaignTelegramChannelPlacement"
      ADD CONSTRAINT "AdCampaignTelegramChannelPlacement_adCampaignId_fkey"
      FOREIGN KEY ("adCampaignId") REFERENCES "AdCampaign"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'AdCampaignTelegramChannelPlacement_telegramChannelId_fkey'
  ) THEN
    ALTER TABLE "AdCampaignTelegramChannelPlacement"
      ADD CONSTRAINT "AdCampaignTelegramChannelPlacement_telegramChannelId_fkey"
      FOREIGN KEY ("telegramChannelId") REFERENCES "TelegramChannel"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

WITH telegram_sources AS (
  SELECT
    s."id",
    s."workspaceId",
    s."name",
    NULLIF(LOWER(REGEXP_REPLACE(COALESCE(s."telegramUsername", ''), '^@', '')), '') AS "normalizedUsername",
    s."url",
    s."description",
    s."imageUrl",
    s."subscribersCount",
    s."createdAt",
    s."updatedAt"
  FROM "AdvertisingSource" s
  WHERE s."type" = 'telegram_channel'
),
inserted_channels AS (
  INSERT INTO "TelegramChannel" (
    "id",
    "workspaceId",
    "title",
    "username",
    "inviteLink",
    "description",
    "currentSubscribersCount",
    "photoUrl",
    "sourceType",
    "lastPublicSyncedAt",
    "createdAt",
    "updatedAt"
  )
  SELECT
    gen_random_uuid()::text,
    ts."workspaceId",
    ts."name",
    ts."normalizedUsername",
    ts."url",
    ts."description",
    COALESCE(ts."subscribersCount", 0),
    ts."imageUrl",
    'telegram',
    CURRENT_TIMESTAMP,
    ts."createdAt",
    ts."updatedAt"
  FROM telegram_sources ts
  WHERE NOT EXISTS (
    SELECT 1
    FROM "TelegramChannel" tc
    WHERE tc."workspaceId" = ts."workspaceId"
      AND (
        (ts."normalizedUsername" IS NOT NULL AND LOWER(tc."username") = ts."normalizedUsername")
        OR (ts."normalizedUsername" IS NULL AND tc."title" = ts."name")
      )
  )
  RETURNING "id", "workspaceId", "username", "title"
),
source_channel_map AS (
  SELECT
    ts."id" AS "advertisingSourceId",
    COALESCE(existing."id", inserted."id") AS "telegramChannelId"
  FROM telegram_sources ts
  LEFT JOIN "TelegramChannel" existing
    ON existing."workspaceId" = ts."workspaceId"
   AND ts."normalizedUsername" IS NOT NULL
   AND LOWER(existing."username") = ts."normalizedUsername"
  LEFT JOIN inserted_channels inserted
    ON inserted."workspaceId" = ts."workspaceId"
   AND (
     (ts."normalizedUsername" IS NOT NULL AND inserted."username" = ts."normalizedUsername")
     OR (ts."normalizedUsername" IS NULL AND inserted."title" = ts."name")
   )
)
INSERT INTO "AdCampaignTelegramChannelPlacement" ("id", "adCampaignId", "telegramChannelId", "createdAt")
SELECT gen_random_uuid()::text, j."adCampaignId", scm."telegramChannelId", j."createdAt"
FROM "AdCampaignAdvertisingChannel" j
JOIN source_channel_map scm ON scm."advertisingSourceId" = j."advertisingSourceId"
WHERE scm."telegramChannelId" IS NOT NULL
  AND NOT EXISTS (
    SELECT 1
    FROM "AdCampaignTelegramChannelPlacement" p
    WHERE p."adCampaignId" = j."adCampaignId"
      AND p."telegramChannelId" = scm."telegramChannelId"
  );
