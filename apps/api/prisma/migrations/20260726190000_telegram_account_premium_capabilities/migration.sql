ALTER TABLE "TelegramUserAccountIntegration"
ADD COLUMN "isPremium" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "premiumCheckedAt" TIMESTAMP(3),
ADD COLUMN "captionLengthMax" INTEGER NOT NULL DEFAULT 1024,
ADD COLUMN "messageLengthMax" INTEGER NOT NULL DEFAULT 4096,
ADD COLUMN "premiumCapabilities" JSONB;

ALTER TABLE "TelegramManagedPost"
ADD COLUMN "sourceWasPremium" BOOLEAN,
ADD COLUMN "captionLengthMaxUsed" INTEGER,
ADD COLUMN "messageLengthMaxUsed" INTEGER;

ALTER TABLE "TelegramManagedPostRevision"
ADD COLUMN "sourceWasPremium" BOOLEAN,
ADD COLUMN "captionLengthMaxUsed" INTEGER,
ADD COLUMN "messageLengthMaxUsed" INTEGER;
