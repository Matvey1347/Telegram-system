CREATE TABLE "TelegramAdSalesWorkspaceSettings" (
  "workspaceId" TEXT NOT NULL,
  "defaultOrganicPostsPerAdSlot" INTEGER NOT NULL DEFAULT 3,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "TelegramAdSalesWorkspaceSettings_pkey" PRIMARY KEY ("workspaceId")
);

CREATE TABLE "TelegramAdSalesMemberPreferences" (
  "id" TEXT NOT NULL,
  "workspaceId" TEXT NOT NULL,
  "workspaceMemberId" TEXT NOT NULL,
  "selectedChannelIds" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "selectedNetworkId" TEXT,
  "calendarView" TEXT NOT NULL DEFAULT 'week',
  "initialized" BOOLEAN NOT NULL DEFAULT false,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "TelegramAdSalesMemberPreferences_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "TelegramAdSchedulePolicy"
  ADD COLUMN "useWorkspaceDefault" BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE "TelegramAdSalePlacement"
  ADD COLUMN "inventoryOpportunityKey" TEXT;

INSERT INTO "TelegramAdSalesWorkspaceSettings" ("workspaceId", "defaultOrganicPostsPerAdSlot", "updatedAt")
SELECT "id", 3, CURRENT_TIMESTAMP
FROM "Workspace"
ON CONFLICT ("workspaceId") DO NOTHING;

CREATE UNIQUE INDEX "TelegramAdSalesMemberPreferences_workspaceMemberId_key"
  ON "TelegramAdSalesMemberPreferences"("workspaceMemberId");

CREATE INDEX "TelegramAdSalesMemberPreferences_workspaceId_idx"
  ON "TelegramAdSalesMemberPreferences"("workspaceId");

CREATE UNIQUE INDEX "TelegramAdSalePlacement_workspaceId_telegramChannelId_inventoryOpportunityKey_key"
  ON "TelegramAdSalePlacement"("workspaceId", "telegramChannelId", "inventoryOpportunityKey");

ALTER TABLE "TelegramAdSalesWorkspaceSettings"
  ADD CONSTRAINT "TelegramAdSalesWorkspaceSettings_workspaceId_fkey"
  FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "TelegramAdSalesMemberPreferences"
  ADD CONSTRAINT "TelegramAdSalesMemberPreferences_workspaceId_fkey"
  FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "TelegramAdSalesMemberPreferences"
  ADD CONSTRAINT "TelegramAdSalesMemberPreferences_workspaceMemberId_fkey"
  FOREIGN KEY ("workspaceMemberId") REFERENCES "WorkspaceMember"("id") ON DELETE CASCADE ON UPDATE CASCADE;
