-- Early-stage local migration: derive investors from workspace members

ALTER TABLE "Investment" ADD COLUMN "workspaceMemberId" TEXT;

UPDATE "Investment" i
SET "workspaceMemberId" = wm."id"
FROM "Investor" inv
JOIN "WorkspaceMember" wm
  ON wm."workspaceId" = inv."workspaceId"
 AND wm."userId" = inv."userId"
WHERE i."investorId" = inv."id";

-- Fallback for rows that still have null (early local env)
UPDATE "Investment" i
SET "workspaceMemberId" = (
  SELECT wm."id"
  FROM "WorkspaceMember" wm
  WHERE wm."workspaceId" = i."workspaceId"
  ORDER BY wm."createdAt" ASC
  LIMIT 1
)
WHERE i."workspaceMemberId" IS NULL;

ALTER TABLE "Investment" ALTER COLUMN "workspaceMemberId" SET NOT NULL;
ALTER TABLE "Investment" ADD CONSTRAINT "Investment_workspaceMemberId_fkey" FOREIGN KEY ("workspaceMemberId") REFERENCES "WorkspaceMember"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "Investment" DROP CONSTRAINT IF EXISTS "Investment_investorId_fkey";
ALTER TABLE "Investment" DROP COLUMN IF EXISTS "investorId";

DROP TABLE IF EXISTS "Investor";
