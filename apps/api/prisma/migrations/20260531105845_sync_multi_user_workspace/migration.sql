-- AlterTable
ALTER TABLE "TelegramBotIntegration" ALTER COLUMN "botTokenEncrypted" DROP DEFAULT,
ALTER COLUMN "botTokenIv" DROP DEFAULT,
ALTER COLUMN "botTokenAuthTag" DROP DEFAULT,
ALTER COLUMN "botTokenMasked" DROP DEFAULT;
