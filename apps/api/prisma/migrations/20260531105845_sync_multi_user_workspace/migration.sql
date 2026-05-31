DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_name = 'TelegramBotIntegration' AND column_name = 'botTokenEncrypted'
  ) THEN
    EXECUTE 'ALTER TABLE "TelegramBotIntegration" ALTER COLUMN "botTokenEncrypted" DROP DEFAULT';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_name = 'TelegramBotIntegration' AND column_name = 'botTokenIv'
  ) THEN
    EXECUTE 'ALTER TABLE "TelegramBotIntegration" ALTER COLUMN "botTokenIv" DROP DEFAULT';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_name = 'TelegramBotIntegration' AND column_name = 'botTokenAuthTag'
  ) THEN
    EXECUTE 'ALTER TABLE "TelegramBotIntegration" ALTER COLUMN "botTokenAuthTag" DROP DEFAULT';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_name = 'TelegramBotIntegration' AND column_name = 'botTokenMasked'
  ) THEN
    EXECUTE 'ALTER TABLE "TelegramBotIntegration" ALTER COLUMN "botTokenMasked" DROP DEFAULT';
  END IF;
END $$;
