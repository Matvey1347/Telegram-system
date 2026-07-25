CREATE TYPE "TelegramChannelAcquisitionType" AS ENUM ('CREATED', 'PURCHASED');

ALTER TABLE "TelegramChannel"
ADD COLUMN "acquisitionType" "TelegramChannelAcquisitionType" NOT NULL DEFAULT 'CREATED',
ADD COLUMN "postsSyncFrom" TIMESTAMP(3),
ADD COLUMN "inviteLinksSyncFrom" TIMESTAMP(3),
ADD COLUMN "purchaseTransactionId" TEXT;

ALTER TABLE "TelegramInviteLink"
ADD COLUMN "telegramCreatedAt" TIMESTAMP(3);

ALTER TABLE "TelegramChannel"
ADD CONSTRAINT "TelegramChannel_purchaseTransactionId_fkey"
FOREIGN KEY ("purchaseTransactionId") REFERENCES "Transaction"("id")
ON DELETE SET NULL ON UPDATE CASCADE;

CREATE UNIQUE INDEX "TelegramChannel_purchaseTransactionId_key"
ON "TelegramChannel"("purchaseTransactionId");
