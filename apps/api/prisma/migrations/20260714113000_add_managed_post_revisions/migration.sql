-- CreateTable
CREATE TABLE "TelegramManagedPostRevision" (
    "id" TEXT NOT NULL,
    "telegramManagedPostId" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "telegramChannelId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "text" TEXT,
    "imageUrls" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "status" "TelegramManagedPostStatus" NOT NULL,
    "scheduledAt" TIMESTAMP(3),
    "publishedAt" TIMESTAMP(3),
    "telegramMessageIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "telegramMessageUrls" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "telegramRemoteStatus" "TelegramManagedPostRemoteStatus" NOT NULL DEFAULT 'NONE',
    "lastTelegramSyncedAt" TIMESTAMP(3),
    "lastTelegramSyncNote" TEXT,
    "sourceType" "TelegramSourceType",
    "sourceId" TEXT,
    "publishMode" TEXT,
    "lastError" TEXT,
    "assignedMemberId" TEXT NOT NULL,
    "icon" TEXT,
    "groupId" TEXT,
    "groupPosition" INTEGER,
    "sidebarPosition" INTEGER,
    "reason" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TelegramManagedPostRevision_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "TelegramManagedPostRevision_telegramManagedPostId_createdAt_idx" ON "TelegramManagedPostRevision"("telegramManagedPostId", "createdAt");

-- CreateIndex
CREATE INDEX "TelegramManagedPostRevision_workspaceId_createdAt_idx" ON "TelegramManagedPostRevision"("workspaceId", "createdAt");

-- CreateIndex
CREATE INDEX "TelegramManagedPostRevision_telegramChannelId_createdAt_idx" ON "TelegramManagedPostRevision"("telegramChannelId", "createdAt");

-- AddForeignKey
ALTER TABLE "TelegramManagedPostRevision" ADD CONSTRAINT "TelegramManagedPostRevision_telegramManagedPostId_fkey" FOREIGN KEY ("telegramManagedPostId") REFERENCES "TelegramManagedPost"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TelegramManagedPostRevision" ADD CONSTRAINT "TelegramManagedPostRevision_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TelegramManagedPostRevision" ADD CONSTRAINT "TelegramManagedPostRevision_telegramChannelId_fkey" FOREIGN KEY ("telegramChannelId") REFERENCES "TelegramChannel"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TelegramManagedPostRevision" ADD CONSTRAINT "TelegramManagedPostRevision_assignedMemberId_workspaceId_fkey" FOREIGN KEY ("assignedMemberId", "workspaceId") REFERENCES "WorkspaceMember"("id", "workspaceId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TelegramManagedPostRevision" ADD CONSTRAINT "TelegramManagedPostRevision_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "PostGroup"("id") ON DELETE SET NULL ON UPDATE CASCADE;
