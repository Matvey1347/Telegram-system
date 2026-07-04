CREATE TABLE "PostGroup" (
  "id" TEXT NOT NULL,
  "workspaceId" TEXT NOT NULL,
  "telegramChannelId" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "description" TEXT,
  "icon" TEXT,
  "createdByMemberId" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "PostGroup_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "TelegramManagedPost"
ADD COLUMN "icon" TEXT,
ADD COLUMN "groupId" TEXT,
ADD COLUMN "groupPosition" INTEGER;

CREATE INDEX "PostGroup_workspaceId_idx" ON "PostGroup"("workspaceId");
CREATE INDEX "PostGroup_telegramChannelId_idx" ON "PostGroup"("telegramChannelId");
CREATE INDEX "PostGroup_createdByMemberId_idx" ON "PostGroup"("createdByMemberId");
CREATE INDEX "TelegramManagedPost_groupId_idx" ON "TelegramManagedPost"("groupId");
CREATE INDEX "TelegramManagedPost_groupId_groupPosition_idx"
ON "TelegramManagedPost"("groupId", "groupPosition");

ALTER TABLE "PostGroup"
ADD CONSTRAINT "PostGroup_workspaceId_fkey"
FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "PostGroup"
ADD CONSTRAINT "PostGroup_telegramChannelId_fkey"
FOREIGN KEY ("telegramChannelId") REFERENCES "TelegramChannel"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "PostGroup"
ADD CONSTRAINT "PostGroup_createdByMemberId_workspaceId_fkey"
FOREIGN KEY ("createdByMemberId", "workspaceId")
REFERENCES "WorkspaceMember"("id", "workspaceId")
ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "TelegramManagedPost"
ADD CONSTRAINT "TelegramManagedPost_groupId_fkey"
FOREIGN KEY ("groupId") REFERENCES "PostGroup"("id")
ON DELETE SET NULL ON UPDATE CASCADE;
