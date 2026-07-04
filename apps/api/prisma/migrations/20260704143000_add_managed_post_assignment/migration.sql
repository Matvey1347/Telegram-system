ALTER TABLE "TelegramManagedPost"
ADD COLUMN "assignedMemberId" TEXT;

UPDATE "TelegramManagedPost" post
SET "assignedMemberId" = member."id"
FROM "WorkspaceMember" member
WHERE post."assignedMemberId" IS NULL
  AND post."createdByUserId" = member."userId"
  AND post."workspaceId" = member."workspaceId";

CREATE INDEX "TelegramManagedPost_workspaceId_assignedMemberId_idx"
ON "TelegramManagedPost" ("workspaceId", "assignedMemberId");

ALTER TABLE "TelegramManagedPost"
ADD CONSTRAINT "TelegramManagedPost_assignedMemberId_fkey"
FOREIGN KEY ("assignedMemberId") REFERENCES "WorkspaceMember"("id")
ON DELETE SET NULL ON UPDATE CASCADE;
