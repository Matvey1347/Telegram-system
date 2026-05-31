ALTER TABLE "TelegramUserAccountIntegration"
ADD COLUMN "phoneEncrypted" TEXT,
ADD COLUMN "phoneIv" TEXT,
ADD COLUMN "phoneAuthTag" TEXT;
