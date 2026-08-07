CREATE TABLE "TelegramPostPlannerFormat" (
  "id" TEXT NOT NULL,
  "workspaceId" TEXT NOT NULL,
  "telegramChannelId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "description" TEXT,
  "icon" TEXT,
  "position" INTEGER NOT NULL DEFAULT 0,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "TelegramPostPlannerFormat_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "TelegramPostPlannerSlot" (
  "id" TEXT NOT NULL,
  "workspaceId" TEXT NOT NULL,
  "telegramChannelId" TEXT NOT NULL,
  "formatId" TEXT,
  "postGroupIds" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "weekday" INTEGER NOT NULL,
  "time" VARCHAR(5) NOT NULL,
  "timezone" TEXT NOT NULL,
  "position" INTEGER NOT NULL DEFAULT 0,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "TelegramPostPlannerSlot_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "TelegramManagedPost"
  ADD COLUMN "plannerFormatId" TEXT,
  ADD COLUMN "plannerSlotId" TEXT,
  ADD COLUMN "plannerRunId" TEXT,
  ADD COLUMN "plannerPlannedAt" TIMESTAMP(3),
  ADD COLUMN "plannerProvenance" JSONB;

CREATE UNIQUE INDEX "TelegramPostPlannerFormat_workspaceId_telegramChannelId_name_key"
  ON "TelegramPostPlannerFormat"("workspaceId", "telegramChannelId", "name");
CREATE INDEX "TelegramPostPlannerFormat_workspaceId_telegramChannelId_position_idx"
  ON "TelegramPostPlannerFormat"("workspaceId", "telegramChannelId", "position");
CREATE INDEX "TelegramPostPlannerFormat_workspaceId_telegramChannelId_isActive_idx"
  ON "TelegramPostPlannerFormat"("workspaceId", "telegramChannelId", "isActive");

CREATE INDEX "TelegramPostPlannerSlot_workspaceId_telegramChannelId_weekday_position_idx"
  ON "TelegramPostPlannerSlot"("workspaceId", "telegramChannelId", "weekday", "position");
CREATE INDEX "TelegramPostPlannerSlot_workspaceId_telegramChannelId_isActive_idx"
  ON "TelegramPostPlannerSlot"("workspaceId", "telegramChannelId", "isActive");
CREATE INDEX "TelegramPostPlannerSlot_workspaceId_telegramChannelId_formatId_idx"
  ON "TelegramPostPlannerSlot"("workspaceId", "telegramChannelId", "formatId");

CREATE INDEX "TelegramManagedPost_workspaceId_telegramChannelId_plannerRunId_idx"
  ON "TelegramManagedPost"("workspaceId", "telegramChannelId", "plannerRunId");
CREATE INDEX "TelegramManagedPost_workspaceId_telegramChannelId_plannerSlotId_idx"
  ON "TelegramManagedPost"("workspaceId", "telegramChannelId", "plannerSlotId");

ALTER TABLE "TelegramPostPlannerFormat"
  ADD CONSTRAINT "TelegramPostPlannerFormat_workspaceId_fkey"
  FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "TelegramPostPlannerFormat"
  ADD CONSTRAINT "TelegramPostPlannerFormat_telegramChannelId_fkey"
  FOREIGN KEY ("telegramChannelId") REFERENCES "TelegramChannel"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "TelegramPostPlannerSlot"
  ADD CONSTRAINT "TelegramPostPlannerSlot_workspaceId_fkey"
  FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "TelegramPostPlannerSlot"
  ADD CONSTRAINT "TelegramPostPlannerSlot_telegramChannelId_fkey"
  FOREIGN KEY ("telegramChannelId") REFERENCES "TelegramChannel"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "TelegramPostPlannerSlot"
  ADD CONSTRAINT "TelegramPostPlannerSlot_formatId_fkey"
  FOREIGN KEY ("formatId") REFERENCES "TelegramPostPlannerFormat"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "TelegramManagedPost"
  ADD CONSTRAINT "TelegramManagedPost_plannerFormatId_fkey"
  FOREIGN KEY ("plannerFormatId") REFERENCES "TelegramPostPlannerFormat"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "TelegramManagedPost"
  ADD CONSTRAINT "TelegramManagedPost_plannerSlotId_fkey"
  FOREIGN KEY ("plannerSlotId") REFERENCES "TelegramPostPlannerSlot"("id") ON DELETE SET NULL ON UPDATE CASCADE;
