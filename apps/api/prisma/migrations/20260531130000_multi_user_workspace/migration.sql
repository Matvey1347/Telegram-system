-- Add member role
ALTER TYPE "WorkspaceRole" ADD VALUE IF NOT EXISTS 'member';

-- Investor optional link to User
ALTER TABLE "Investor" ADD COLUMN "userId" TEXT;
ALTER TABLE "Investor" ADD CONSTRAINT "Investor_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Telegram bot token encryption fields
ALTER TABLE "TelegramBotIntegration"
  ADD COLUMN "botTokenEncrypted" TEXT NOT NULL DEFAULT '',
  ADD COLUMN "botTokenIv" TEXT NOT NULL DEFAULT '',
  ADD COLUMN "botTokenAuthTag" TEXT NOT NULL DEFAULT '',
  ADD COLUMN "botTokenMasked" TEXT NOT NULL DEFAULT '******';

-- Backfill from old botToken if present
ALTER TABLE "TelegramBotIntegration" DROP COLUMN IF EXISTS "botToken";
