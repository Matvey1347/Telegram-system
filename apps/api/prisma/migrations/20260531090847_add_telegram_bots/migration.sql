-- AlterTable
ALTER TABLE "TelegramChannel" ADD COLUMN     "botCanInviteUsers" BOOLEAN,
ADD COLUMN     "botCanManageChat" BOOLEAN,
ADD COLUMN     "botCanPostMessages" BOOLEAN,
ADD COLUMN     "botCheckedAt" TIMESTAMP(3),
ADD COLUMN     "botIsAdmin" BOOLEAN,
ADD COLUMN     "botStatus" TEXT,
ADD COLUMN     "telegramBotIntegrationId" TEXT;

-- AlterTable
ALTER TABLE "TelegramInviteLink" ADD COLUMN     "telegramBotIntegrationId" TEXT;

-- CreateTable
CREATE TABLE "TelegramBotIntegration" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "botToken" TEXT NOT NULL,
    "botId" TEXT,
    "username" TEXT,
    "firstName" TEXT,
    "webhookUrl" TEXT,
    "webhookActive" BOOLEAN NOT NULL DEFAULT false,
    "hasExternalWebhook" BOOLEAN NOT NULL DEFAULT false,
    "webhookSecret" TEXT,
    "lastErrorMessage" TEXT,
    "lastCheckedAt" TIMESTAMP(3),
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TelegramBotIntegration_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TelegramBotUpdateLog" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "telegramBotIntegrationId" TEXT NOT NULL,
    "updateId" TEXT,
    "updateType" TEXT NOT NULL,
    "chatId" TEXT,
    "rawUpdate" JSONB NOT NULL,
    "processed" BOOLEAN NOT NULL DEFAULT false,
    "errorMessage" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TelegramBotUpdateLog_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "TelegramChannel" ADD CONSTRAINT "TelegramChannel_telegramBotIntegrationId_fkey" FOREIGN KEY ("telegramBotIntegrationId") REFERENCES "TelegramBotIntegration"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TelegramInviteLink" ADD CONSTRAINT "TelegramInviteLink_telegramBotIntegrationId_fkey" FOREIGN KEY ("telegramBotIntegrationId") REFERENCES "TelegramBotIntegration"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TelegramBotIntegration" ADD CONSTRAINT "TelegramBotIntegration_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TelegramBotUpdateLog" ADD CONSTRAINT "TelegramBotUpdateLog_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TelegramBotUpdateLog" ADD CONSTRAINT "TelegramBotUpdateLog_telegramBotIntegrationId_fkey" FOREIGN KEY ("telegramBotIntegrationId") REFERENCES "TelegramBotIntegration"("id") ON DELETE CASCADE ON UPDATE CASCADE;
