ALTER TYPE "WorkspaceRole" ADD VALUE IF NOT EXISTS 'MEDIA_BUYER';

CREATE TYPE "TelegramInviteLinkCreatorMatchSource" AS ENUM (
  'TELEGRAM_USER_ID',
  'MTPROTO_USERNAME',
  'MEMBER_USERNAME',
  'UNRESOLVED'
);

ALTER TABLE "WorkspaceMember"
ADD COLUMN "telegramUsername" TEXT;

ALTER TABLE "TelegramInviteLink"
ADD COLUMN "creatorTelegramUserId" TEXT,
ADD COLUMN "creatorUsername" TEXT,
ADD COLUMN "creatorFirstName" TEXT,
ADD COLUMN "creatorLastName" TEXT,
ADD COLUMN "creatorPhotoUrl" TEXT,
ADD COLUMN "creatorMemberId" TEXT,
ADD COLUMN "creatorMatchSource" "TelegramInviteLinkCreatorMatchSource",
ADD COLUMN "requestedCount" INTEGER NOT NULL DEFAULT 0;

UPDATE "WorkspaceMember"
SET "telegramUsername" = LOWER(REGEXP_REPLACE(TRIM("telegramUsername"), '^@', ''))
WHERE "telegramUsername" IS NOT NULL;

WITH duplicate_usernames AS (
  SELECT
    "workspaceId",
    "telegramUsername",
    ROW_NUMBER() OVER (
      PARTITION BY "workspaceId", "telegramUsername"
      ORDER BY "createdAt" ASC, "id" ASC
    ) AS row_num
  FROM "WorkspaceMember"
  WHERE "telegramUsername" IS NOT NULL
)
UPDATE "WorkspaceMember" member
SET "telegramUsername" = NULL
FROM duplicate_usernames duplicate
WHERE member."workspaceId" = duplicate."workspaceId"
  AND member."telegramUsername" = duplicate."telegramUsername"
  AND duplicate.row_num > 1;

WITH deduped_links AS (
  SELECT
    "id",
    ROW_NUMBER() OVER (
      PARTITION BY "workspaceId", "telegramChannelId", "url"
      ORDER BY COALESCE("lastSyncedAt", "updatedAt", "createdAt") DESC, "id" DESC
    ) AS row_num
  FROM "TelegramInviteLink"
)
DELETE FROM "TelegramInviteLink"
WHERE "id" IN (
  SELECT "id" FROM deduped_links WHERE row_num > 1
);

ALTER TABLE "TelegramInviteLink"
ADD CONSTRAINT "TelegramInviteLink_creatorMemberId_workspaceId_fkey"
FOREIGN KEY ("creatorMemberId", "workspaceId")
REFERENCES "WorkspaceMember"("id", "workspaceId")
ON DELETE SET NULL
ON UPDATE CASCADE;

CREATE UNIQUE INDEX "WorkspaceMember_workspaceId_telegramUsername_key"
ON "WorkspaceMember"("workspaceId", "telegramUsername");

CREATE UNIQUE INDEX "TelegramInviteLink_workspaceId_telegramChannelId_url_key"
ON "TelegramInviteLink"("workspaceId", "telegramChannelId", "url");

CREATE INDEX "TelegramInviteLink_workspaceId_creatorTelegramUserId_idx"
ON "TelegramInviteLink"("workspaceId", "creatorTelegramUserId");

CREATE INDEX "TelegramInviteLink_workspaceId_creatorMemberId_idx"
ON "TelegramInviteLink"("workspaceId", "creatorMemberId");

CREATE INDEX "TelegramInviteLink_telegramChannelId_isRevoked_idx"
ON "TelegramInviteLink"("telegramChannelId", "isRevoked");
