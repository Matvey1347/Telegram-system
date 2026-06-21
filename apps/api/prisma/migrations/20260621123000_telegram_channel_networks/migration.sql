CREATE TABLE "TelegramChannelNetwork" (
  "id" TEXT NOT NULL,
  "workspaceId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "description" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "TelegramChannelNetwork_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "TelegramChannelNetworkMember" (
  "id" TEXT NOT NULL,
  "workspaceId" TEXT NOT NULL,
  "networkId" TEXT NOT NULL,
  "telegramChannelId" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "TelegramChannelNetworkMember_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "TelegramChannelNetwork"
ADD CONSTRAINT "TelegramChannelNetwork_workspaceId_fkey"
FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "TelegramChannelNetworkMember"
ADD CONSTRAINT "TelegramChannelNetworkMember_workspaceId_fkey"
FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "TelegramChannelNetworkMember"
ADD CONSTRAINT "TelegramChannelNetworkMember_networkId_fkey"
FOREIGN KEY ("networkId") REFERENCES "TelegramChannelNetwork"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "TelegramChannelNetworkMember"
ADD CONSTRAINT "TelegramChannelNetworkMember_telegramChannelId_fkey"
FOREIGN KEY ("telegramChannelId") REFERENCES "TelegramChannel"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE UNIQUE INDEX "TelegramChannelNetwork_workspaceId_name_key"
ON "TelegramChannelNetwork"("workspaceId", "name");

CREATE INDEX "TelegramChannelNetwork_workspaceId_idx"
ON "TelegramChannelNetwork"("workspaceId");

CREATE UNIQUE INDEX "TelegramChannelNetworkMember_networkId_telegramChannelId_key"
ON "TelegramChannelNetworkMember"("networkId", "telegramChannelId");

CREATE INDEX "TelegramChannelNetworkMember_workspaceId_idx"
ON "TelegramChannelNetworkMember"("workspaceId");

CREATE INDEX "TelegramChannelNetworkMember_networkId_idx"
ON "TelegramChannelNetworkMember"("networkId");

CREATE INDEX "TelegramChannelNetworkMember_telegramChannelId_idx"
ON "TelegramChannelNetworkMember"("telegramChannelId");
