CREATE TYPE "TelegramSourceType" AS ENUM ('BOT', 'MTPROTO');
CREATE TYPE "TelegramChannelSourceRole" AS ENUM ('OWNER', 'ADMIN', 'MEMBER', 'UNKNOWN');
CREATE TYPE "TelegramChannelDataType" AS ENUM ('CHANNEL_INFO', 'POSTS', 'INVITE_LINKS', 'STATS', 'MEMBERS', 'REACTIONS', 'VIEWS', 'OTHER');
CREATE TYPE "TelegramDataSourceStatus" AS ENUM ('SUCCESS', 'PARTIAL', 'FAILED', 'SKIPPED');

CREATE TABLE "TelegramChannelSourceAccess" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "channelId" TEXT NOT NULL,
    "sourceId" TEXT NOT NULL,
    "sourceType" "TelegramSourceType" NOT NULL,
    "role" "TelegramChannelSourceRole" NOT NULL DEFAULT 'UNKNOWN',
    "canPostMessages" BOOLEAN NOT NULL DEFAULT false,
    "canEditMessages" BOOLEAN NOT NULL DEFAULT false,
    "canDeleteMessages" BOOLEAN NOT NULL DEFAULT false,
    "canInviteUsers" BOOLEAN NOT NULL DEFAULT false,
    "canManageInviteLinks" BOOLEAN NOT NULL DEFAULT false,
    "canViewStats" BOOLEAN NOT NULL DEFAULT false,
    "rawPermissions" JSONB,
    "lastCheckedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TelegramChannelSourceAccess_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "TelegramChannelDataSource" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "channelId" TEXT NOT NULL,
    "sourceId" TEXT NOT NULL,
    "sourceType" "TelegramSourceType" NOT NULL,
    "dataType" "TelegramChannelDataType" NOT NULL,
    "status" "TelegramDataSourceStatus" NOT NULL DEFAULT 'SUCCESS',
    "sourceDisplayName" TEXT,
    "errorMessage" TEXT,
    "metadata" JSONB,
    "syncedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TelegramChannelDataSource_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "TelegramChannelSourceAccess_channelId_sourceId_sourceType_key" ON "TelegramChannelSourceAccess"("channelId", "sourceId", "sourceType");
CREATE INDEX "TelegramChannelSourceAccess_workspaceId_channelId_idx" ON "TelegramChannelSourceAccess"("workspaceId", "channelId");
CREATE INDEX "TelegramChannelSourceAccess_workspaceId_sourceId_sourceType_idx" ON "TelegramChannelSourceAccess"("workspaceId", "sourceId", "sourceType");
CREATE INDEX "TelegramChannelDataSource_workspaceId_channelId_idx" ON "TelegramChannelDataSource"("workspaceId", "channelId");
CREATE INDEX "TelegramChannelDataSource_workspaceId_sourceId_sourceType_idx" ON "TelegramChannelDataSource"("workspaceId", "sourceId", "sourceType");
CREATE INDEX "TelegramChannelDataSource_workspaceId_channelId_dataType_idx" ON "TelegramChannelDataSource"("workspaceId", "channelId", "dataType");

ALTER TABLE "TelegramChannelSourceAccess" ADD CONSTRAINT "TelegramChannelSourceAccess_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "TelegramChannelSourceAccess" ADD CONSTRAINT "TelegramChannelSourceAccess_channelId_fkey" FOREIGN KEY ("channelId") REFERENCES "TelegramChannel"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "TelegramChannelDataSource" ADD CONSTRAINT "TelegramChannelDataSource_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "TelegramChannelDataSource" ADD CONSTRAINT "TelegramChannelDataSource_channelId_fkey" FOREIGN KEY ("channelId") REFERENCES "TelegramChannel"("id") ON DELETE CASCADE ON UPDATE CASCADE;
