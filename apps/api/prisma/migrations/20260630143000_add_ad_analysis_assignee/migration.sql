ALTER TABLE "TelegramChannelAdAnalysis" ADD COLUMN "assignedMemberId" TEXT;

ALTER TABLE "TelegramChannelAdAnalysis"
ADD CONSTRAINT "TelegramChannelAdAnalysis_assignedMemberId_fkey"
FOREIGN KEY ("assignedMemberId") REFERENCES "WorkspaceMember"("id")
ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "TelegramChannelAdAnalysis_workspaceId_assignedMemberId_idx"
ON "TelegramChannelAdAnalysis"("workspaceId", "assignedMemberId");
