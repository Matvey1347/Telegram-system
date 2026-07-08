ALTER TABLE "PromptNote"
ADD COLUMN "emoji" TEXT,
ADD COLUMN "assignedMemberId" TEXT,
ADD COLUMN "telegramChannelId" TEXT,
ADD COLUMN "postGroupId" TEXT;

CREATE INDEX "PromptNote_workspaceId_telegramChannelId_idx"
ON "PromptNote"("workspaceId", "telegramChannelId");

CREATE INDEX "PromptNote_workspaceId_postGroupId_idx"
ON "PromptNote"("workspaceId", "postGroupId");

CREATE INDEX "PromptNote_workspaceId_assignedMemberId_idx"
ON "PromptNote"("workspaceId", "assignedMemberId");

ALTER TABLE "PromptNote"
ADD CONSTRAINT "PromptNote_assignedMemberId_fkey"
FOREIGN KEY ("assignedMemberId") REFERENCES "WorkspaceMember"("id")
ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "PromptNote"
ADD CONSTRAINT "PromptNote_telegramChannelId_fkey"
FOREIGN KEY ("telegramChannelId") REFERENCES "TelegramChannel"("id")
ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "PromptNote"
ADD CONSTRAINT "PromptNote_postGroupId_fkey"
FOREIGN KEY ("postGroupId") REFERENCES "PostGroup"("id")
ON DELETE SET NULL ON UPDATE CASCADE;
