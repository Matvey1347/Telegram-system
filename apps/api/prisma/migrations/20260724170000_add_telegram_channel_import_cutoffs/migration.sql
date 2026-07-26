DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_type
    WHERE typname = 'TelegramChannelAcquisitionType'
  ) THEN
    CREATE TYPE "TelegramChannelAcquisitionType" AS ENUM ('CREATED', 'PURCHASED');
  END IF;
END $$;

ALTER TABLE "TelegramChannel"
ADD COLUMN IF NOT EXISTS "acquisitionType" "TelegramChannelAcquisitionType" NOT NULL DEFAULT 'CREATED',
ADD COLUMN IF NOT EXISTS "postsSyncFrom" TIMESTAMP(3),
ADD COLUMN IF NOT EXISTS "inviteLinksSyncFrom" TIMESTAMP(3),
ADD COLUMN IF NOT EXISTS "purchaseTransactionId" TEXT;

ALTER TABLE "TelegramInviteLink"
ADD COLUMN IF NOT EXISTS "telegramCreatedAt" TIMESTAMP(3);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'TelegramChannel_purchaseTransactionId_fkey'
  ) THEN
    ALTER TABLE "TelegramChannel"
    ADD CONSTRAINT "TelegramChannel_purchaseTransactionId_fkey"
    FOREIGN KEY ("purchaseTransactionId") REFERENCES "Transaction"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS "TelegramChannel_purchaseTransactionId_key"
ON "TelegramChannel"("purchaseTransactionId");
