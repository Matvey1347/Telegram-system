CREATE TYPE "ScheduledTaskScope" AS ENUM ('WORKSPACE_OPERATION', 'SYSTEM_MAINTENANCE');
CREATE TYPE "ScheduledTaskTrigger" AS ENUM ('SCHEDULE', 'MANUAL');
CREATE TYPE "ScheduledTaskRunStatus" AS ENUM ('RUNNING', 'SUCCESS', 'FAILED', 'SKIPPED');
CREATE TYPE "ScheduledTaskNotificationChannel" AS ENUM ('SYSTEM_TELEGRAM_BOT');

CREATE TABLE "ScheduledTaskConfig" (
  "id" TEXT NOT NULL,
  "workspaceId" TEXT,
  "taskKey" TEXT NOT NULL,
  "scope" "ScheduledTaskScope" NOT NULL,
  "lockKey" TEXT NOT NULL,
  "enabled" BOOLEAN NOT NULL DEFAULT true,
  "schedule" JSONB NOT NULL,
  "notificationChannel" "ScheduledTaskNotificationChannel" NOT NULL DEFAULT 'SYSTEM_TELEGRAM_BOT',
  "notifyOnSuccess" BOOLEAN NOT NULL DEFAULT false,
  "notifyOnFailure" BOOLEAN NOT NULL DEFAULT false,
  "lastScheduledEvaluationAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "ScheduledTaskConfig_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ScheduledTaskRun" (
  "id" TEXT NOT NULL,
  "taskKey" TEXT NOT NULL,
  "workspaceId" TEXT,
  "trigger" "ScheduledTaskTrigger" NOT NULL,
  "status" "ScheduledTaskRunStatus" NOT NULL DEFAULT 'RUNNING',
  "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "finishedAt" TIMESTAMP(3),
  "durationMs" INTEGER,
  "resultSummary" TEXT,
  "error" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "ScheduledTaskRun_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ScheduledTaskLease" (
  "id" TEXT NOT NULL,
  "lockKey" TEXT NOT NULL,
  "taskKey" TEXT NOT NULL,
  "workspaceId" TEXT,
  "ownerId" TEXT NOT NULL,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "ScheduledTaskLease_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ScheduledTaskConfig_lockKey_key" ON "ScheduledTaskConfig"("lockKey");
CREATE INDEX "ScheduledTaskConfig_workspaceId_taskKey_idx" ON "ScheduledTaskConfig"("workspaceId", "taskKey");
CREATE INDEX "ScheduledTaskConfig_taskKey_idx" ON "ScheduledTaskConfig"("taskKey");
CREATE INDEX "ScheduledTaskConfig_scope_idx" ON "ScheduledTaskConfig"("scope");
CREATE INDEX "ScheduledTaskConfig_enabled_idx" ON "ScheduledTaskConfig"("enabled");

CREATE INDEX "ScheduledTaskRun_workspaceId_taskKey_startedAt_idx" ON "ScheduledTaskRun"("workspaceId", "taskKey", "startedAt");
CREATE INDEX "ScheduledTaskRun_taskKey_startedAt_idx" ON "ScheduledTaskRun"("taskKey", "startedAt");
CREATE INDEX "ScheduledTaskRun_status_idx" ON "ScheduledTaskRun"("status");
CREATE INDEX "ScheduledTaskRun_trigger_idx" ON "ScheduledTaskRun"("trigger");

CREATE UNIQUE INDEX "ScheduledTaskLease_lockKey_key" ON "ScheduledTaskLease"("lockKey");
CREATE INDEX "ScheduledTaskLease_workspaceId_taskKey_idx" ON "ScheduledTaskLease"("workspaceId", "taskKey");
CREATE INDEX "ScheduledTaskLease_expiresAt_idx" ON "ScheduledTaskLease"("expiresAt");

ALTER TABLE "ScheduledTaskConfig"
  ADD CONSTRAINT "ScheduledTaskConfig_workspaceId_fkey"
  FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ScheduledTaskRun"
  ADD CONSTRAINT "ScheduledTaskRun_workspaceId_fkey"
  FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ScheduledTaskLease"
  ADD CONSTRAINT "ScheduledTaskLease_workspaceId_fkey"
  FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
