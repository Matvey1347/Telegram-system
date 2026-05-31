-- AlterTable
ALTER TABLE "TelegramBotIntegration" ALTER COLUMN "botTokenEncrypted" DROP DEFAULT,
ALTER COLUMN "botTokenIv" DROP DEFAULT,
ALTER COLUMN "botTokenAuthTag" DROP DEFAULT,
ALTER COLUMN "botTokenMasked" DROP DEFAULT;

-- AlterTable
ALTER TABLE "TelegramUserAccountIntegration" ADD COLUMN     "photoUrl" TEXT;

-- CreateTable
CREATE TABLE "TelegramChannelAdminLink" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "telegramChannelId" TEXT NOT NULL,
    "telegramUserAccountIntegrationId" TEXT NOT NULL,
    "source" TEXT NOT NULL DEFAULT 'mtproto',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TelegramChannelAdminLink_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "TelegramChannelAdminLink_workspaceId_telegramChannelId_idx" ON "TelegramChannelAdminLink"("workspaceId", "telegramChannelId");

-- CreateIndex
CREATE INDEX "TelegramChannelAdminLink_workspaceId_telegramUserAccountInt_idx" ON "TelegramChannelAdminLink"("workspaceId", "telegramUserAccountIntegrationId");

-- CreateIndex
CREATE UNIQUE INDEX "TelegramChannelAdminLink_workspaceId_telegramChannelId_tele_key" ON "TelegramChannelAdminLink"("workspaceId", "telegramChannelId", "telegramUserAccountIntegrationId");

-- AddForeignKey
ALTER TABLE "TelegramChannelAdminLink" ADD CONSTRAINT "TelegramChannelAdminLink_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TelegramChannelAdminLink" ADD CONSTRAINT "TelegramChannelAdminLink_telegramChannelId_fkey" FOREIGN KEY ("telegramChannelId") REFERENCES "TelegramChannel"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TelegramChannelAdminLink" ADD CONSTRAINT "TelegramChannelAdminLink_telegramUserAccountIntegrationId_fkey" FOREIGN KEY ("telegramUserAccountIntegrationId") REFERENCES "TelegramUserAccountIntegration"("id") ON DELETE CASCADE ON UPDATE CASCADE;
