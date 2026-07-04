-- Backfill posts created before member assignment was introduced.
UPDATE "TelegramManagedPost" post
SET "assignedMemberId" = member."id"
FROM "WorkspaceMember" member
WHERE post."assignedMemberId" IS NULL
  AND post."createdByUserId" = member."userId"
  AND post."workspaceId" = member."workspaceId";

-- Preserve posts whose creator was removed or was not recorded by assigning the
-- oldest remaining member of their workspace.
UPDATE "TelegramManagedPost" post
SET "assignedMemberId" = (
  SELECT "id"
  FROM "WorkspaceMember"
  WHERE "workspaceId" = post."workspaceId"
  ORDER BY "createdAt" ASC, "id" ASC
  LIMIT 1
)
WHERE post."assignedMemberId" IS NULL;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM "TelegramManagedPost"
    WHERE "assignedMemberId" IS NULL
  ) THEN
    RAISE EXCEPTION 'Cannot assign managed posts: a post workspace has no members';
  END IF;
END $$;

ALTER TABLE "TelegramManagedPost"
ALTER COLUMN "assignedMemberId" SET NOT NULL;

ALTER TABLE "TelegramManagedPost"
DROP CONSTRAINT "TelegramManagedPost_assignedMemberId_fkey";

ALTER TABLE "WorkspaceMember"
ADD CONSTRAINT "WorkspaceMember_id_workspaceId_key"
UNIQUE ("id", "workspaceId");

ALTER TABLE "TelegramManagedPost"
ADD CONSTRAINT "TelegramManagedPost_assignedMemberId_fkey"
FOREIGN KEY ("assignedMemberId", "workspaceId")
REFERENCES "WorkspaceMember"("id", "workspaceId")
ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "TelegramManagedPost"
DROP CONSTRAINT "TelegramManagedPost_createdByUserId_fkey";

ALTER TABLE "TelegramManagedPost"
DROP COLUMN "createdByUserId";
