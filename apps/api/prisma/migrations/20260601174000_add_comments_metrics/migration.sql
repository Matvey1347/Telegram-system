ALTER TABLE "TelegramPost"
  ADD COLUMN "commentsCount" INTEGER;

ALTER TABLE "TelegramPostMetricSnapshot"
  ADD COLUMN "commentsCount" INTEGER;
