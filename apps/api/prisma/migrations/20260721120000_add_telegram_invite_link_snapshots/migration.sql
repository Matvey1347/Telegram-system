-- CreateTable
CREATE TABLE "TelegramInviteLinkSnapshot" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "telegramChannelId" TEXT NOT NULL,
    "inviteLinkId" TEXT NOT NULL,
    "adCampaignId" TEXT,
    "syncedAt" TIMESTAMP(3) NOT NULL,
    "joinedCount" INTEGER NOT NULL DEFAULT 0,
    "requestedCount" INTEGER NOT NULL DEFAULT 0,
    "isRevoked" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TelegramInviteLinkSnapshot_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "TelegramInviteLinkSnapshot_inviteLinkId_syncedAt_key" ON "TelegramInviteLinkSnapshot"("inviteLinkId", "syncedAt");

-- CreateIndex
CREATE INDEX "TelegramInviteLinkSnapshot_workspaceId_telegramChannelId_syncedAt_idx" ON "TelegramInviteLinkSnapshot"("workspaceId", "telegramChannelId", "syncedAt");

-- CreateIndex
CREATE INDEX "TelegramInviteLinkSnapshot_workspaceId_adCampaignId_syncedAt_idx" ON "TelegramInviteLinkSnapshot"("workspaceId", "adCampaignId", "syncedAt");

-- CreateIndex
CREATE INDEX "TelegramInviteLinkSnapshot_workspaceId_inviteLinkId_syncedAt_idx" ON "TelegramInviteLinkSnapshot"("workspaceId", "inviteLinkId", "syncedAt");

-- AddForeignKey
ALTER TABLE "TelegramInviteLinkSnapshot" ADD CONSTRAINT "TelegramInviteLinkSnapshot_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TelegramInviteLinkSnapshot" ADD CONSTRAINT "TelegramInviteLinkSnapshot_telegramChannelId_fkey" FOREIGN KEY ("telegramChannelId") REFERENCES "TelegramChannel"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TelegramInviteLinkSnapshot" ADD CONSTRAINT "TelegramInviteLinkSnapshot_inviteLinkId_fkey" FOREIGN KEY ("inviteLinkId") REFERENCES "TelegramInviteLink"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TelegramInviteLinkSnapshot" ADD CONSTRAINT "TelegramInviteLinkSnapshot_adCampaignId_fkey" FOREIGN KEY ("adCampaignId") REFERENCES "AdCampaign"("id") ON DELETE SET NULL ON UPDATE CASCADE;
