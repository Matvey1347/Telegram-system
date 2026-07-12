CREATE TABLE "TelegramChannelTimePost" (
    "id" TEXT NOT NULL,
    "telegramChannelId" TEXT NOT NULL,
    "iconId" TEXT,
    "title" TEXT NOT NULL,
    "time" VARCHAR(5) NOT NULL,
    "position" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TelegramChannelTimePost_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "TelegramChannelTimePost_telegramChannelId_position_idx"
ON "TelegramChannelTimePost"("telegramChannelId", "position");

CREATE INDEX "TelegramChannelTimePost_iconId_idx"
ON "TelegramChannelTimePost"("iconId");

ALTER TABLE "TelegramChannelTimePost"
ADD CONSTRAINT "TelegramChannelTimePost_telegramChannelId_fkey"
FOREIGN KEY ("telegramChannelId") REFERENCES "TelegramChannel"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "TelegramChannelTimePost"
ADD CONSTRAINT "TelegramChannelTimePost_iconId_fkey"
FOREIGN KEY ("iconId") REFERENCES "Icon"("id")
ON DELETE SET NULL ON UPDATE CASCADE;
