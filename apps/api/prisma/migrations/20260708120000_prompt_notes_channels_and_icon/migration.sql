ALTER TABLE "PromptNote"
ADD COLUMN "iconId" TEXT,
ADD COLUMN "telegramChannelIds" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];

UPDATE "PromptNote"
SET "telegramChannelIds" = ARRAY["telegramChannelId"]
WHERE "telegramChannelId" IS NOT NULL
  AND cardinality("telegramChannelIds") = 0;

CREATE INDEX "PromptNote_workspaceId_iconId_idx"
ON "PromptNote"("workspaceId", "iconId");

ALTER TABLE "PromptNote"
ADD CONSTRAINT "PromptNote_iconId_fkey"
FOREIGN KEY ("iconId") REFERENCES "Icon"("id")
ON DELETE SET NULL ON UPDATE CASCADE;
