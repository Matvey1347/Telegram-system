DROP TABLE IF EXISTS "TelegramBotUpdateLog";
DROP TABLE IF EXISTS "SubscriberEvent";

ALTER TABLE "TelegramChannel"
  DROP COLUMN IF EXISTS "telegramBotIntegrationId",
  DROP COLUMN IF EXISTS "botStatus",
  DROP COLUMN IF EXISTS "botIsAdmin",
  DROP COLUMN IF EXISTS "botCanInviteUsers",
  DROP COLUMN IF EXISTS "botCanManageChat",
  DROP COLUMN IF EXISTS "botCanPostMessages",
  DROP COLUMN IF EXISTS "botCheckedAt";

ALTER TABLE "TelegramInviteLink"
  DROP COLUMN IF EXISTS "telegramBotIntegrationId";

ALTER TABLE "TelegramPost"
  DROP COLUMN IF EXISTS "telegramBotIntegrationId";

ALTER TABLE "TelegramBotIntegration"
  DROP COLUMN IF EXISTS "webhookUrl",
  DROP COLUMN IF EXISTS "webhookActive",
  DROP COLUMN IF EXISTS "hasExternalWebhook",
  DROP COLUMN IF EXISTS "webhookSecret",
  DROP COLUMN IF EXISTS "updatesMode",
  DROP COLUMN IF EXISTS "lastUpdateId";
