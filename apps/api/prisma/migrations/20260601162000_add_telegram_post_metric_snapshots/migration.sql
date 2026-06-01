CREATE TABLE "TelegramPostMetricSnapshot" (
  "id" TEXT NOT NULL,
  "telegramPostId" TEXT NOT NULL,
  "viewsCount" INTEGER,
  "forwardsCount" INTEGER,
  "reactionsCount" INTEGER,
  "reactions" JSONB,
  "collectedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "TelegramPostMetricSnapshot_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "TelegramPostMetricSnapshot_telegramPostId_collectedAt_idx"
  ON "TelegramPostMetricSnapshot"("telegramPostId", "collectedAt");

CREATE INDEX "TelegramPost_telegramChannelId_postDate_idx"
  ON "TelegramPost"("telegramChannelId", "postDate");

ALTER TABLE "TelegramPostMetricSnapshot"
  ADD CONSTRAINT "TelegramPostMetricSnapshot_telegramPostId_fkey"
  FOREIGN KEY ("telegramPostId") REFERENCES "TelegramPost"("id") ON DELETE CASCADE ON UPDATE CASCADE;
