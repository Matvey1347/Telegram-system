-- Persist MTProto login handshake state so code confirmation survives backend restarts.
ALTER TABLE "TelegramUserAccountIntegration"
ADD COLUMN IF NOT EXISTS "loginPhoneCodeHash" TEXT;

ALTER TABLE "TelegramUserAccountIntegration"
ADD COLUMN IF NOT EXISTS "loginTempSessionEncrypted" TEXT;

ALTER TABLE "TelegramUserAccountIntegration"
ADD COLUMN IF NOT EXISTS "loginTempSessionIv" TEXT;

ALTER TABLE "TelegramUserAccountIntegration"
ADD COLUMN IF NOT EXISTS "loginTempSessionAuthTag" TEXT;

ALTER TABLE "TelegramUserAccountIntegration"
ADD COLUMN IF NOT EXISTS "loginStartedAt" TIMESTAMP(3);
