ALTER TABLE "AdHypothesis"
ADD COLUMN "telegramChannelId" TEXT;

CREATE INDEX IF NOT EXISTS "AdHypothesis_telegramChannelId_idx"
ON "AdHypothesis"("telegramChannelId");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.table_constraints
    WHERE constraint_name = 'AdHypothesis_telegramChannelId_fkey'
      AND table_name = 'AdHypothesis'
  ) THEN
    ALTER TABLE "AdHypothesis"
    ADD CONSTRAINT "AdHypothesis_telegramChannelId_fkey"
    FOREIGN KEY ("telegramChannelId") REFERENCES "TelegramChannel"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;
