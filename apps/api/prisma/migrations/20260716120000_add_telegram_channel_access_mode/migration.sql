CREATE TYPE "TelegramChannelAccessMode" AS ENUM (
  'PUBLIC',
  'PRIVATE',
  'PRIVATE_INVITE',
  'PRIVATE_JOIN_REQUEST',
  'UNKNOWN'
);

ALTER TABLE "TelegramChannel"
ADD COLUMN "telegramAccessHash" TEXT,
ADD COLUMN "accessMode" "TelegramChannelAccessMode" NOT NULL DEFAULT 'UNKNOWN',
ADD COLUMN "requiresJoinRequest" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "lastEntityResolvedAt" TIMESTAMP(3);

UPDATE "TelegramChannel"
SET "accessMode" = CASE
  WHEN COALESCE(NULLIF(BTRIM("username"), ''), '') <> '' THEN 'PUBLIC'::"TelegramChannelAccessMode"
  WHEN COALESCE(NULLIF(BTRIM("inviteLink"), ''), '') <> '' THEN 'PRIVATE_INVITE'::"TelegramChannelAccessMode"
  ELSE 'UNKNOWN'::"TelegramChannelAccessMode"
END,
"requiresJoinRequest" = false;
