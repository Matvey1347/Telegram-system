ALTER TABLE "TelegramPost"
ADD COLUMN "formattedText" TEXT,
ADD COLUMN "hasMedia" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "mediaKind" TEXT;
