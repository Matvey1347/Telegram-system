CREATE TABLE "PromptNote" (
  "id" TEXT NOT NULL,
  "workspaceId" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "content" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "PromptNote_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "PromptNote_workspaceId_updatedAt_idx"
ON "PromptNote"("workspaceId", "updatedAt");

ALTER TABLE "PromptNote"
ADD CONSTRAINT "PromptNote_workspaceId_fkey"
FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id")
ON DELETE CASCADE ON UPDATE CASCADE;
