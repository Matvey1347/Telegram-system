ALTER TABLE "TelegramManagedPost"
ADD COLUMN "telegramMessageUrls" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];
