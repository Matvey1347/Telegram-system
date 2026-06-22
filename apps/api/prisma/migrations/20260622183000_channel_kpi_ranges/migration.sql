ALTER TABLE "TelegramChannel"
ADD COLUMN "targetCpaFrom" DECIMAL(65,30),
ADD COLUMN "acceptableCpaFrom" DECIMAL(65,30),
ADD COLUMN "stopCpaFrom" DECIMAL(65,30);

UPDATE "TelegramChannel"
SET "stopCpaFrom" = "stopCpa",
    "stopCpa" = NULL
WHERE "stopCpa" IS NOT NULL
  AND "stopCpaFrom" IS NULL;
