ALTER TABLE "Transaction"
ADD COLUMN IF NOT EXISTS "telegramChannelId" TEXT;

CREATE INDEX IF NOT EXISTS "Transaction_workspaceId_telegramChannelId_idx"
ON "Transaction"("workspaceId", "telegramChannelId");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'Transaction_telegramChannelId_fkey'
  ) THEN
    ALTER TABLE "Transaction"
    ADD CONSTRAINT "Transaction_telegramChannelId_fkey"
    FOREIGN KEY ("telegramChannelId")
    REFERENCES "TelegramChannel"("id")
    ON DELETE SET NULL
    ON UPDATE CASCADE;
  END IF;
END
$$;
