CREATE TYPE "ApplicationLogLevel" AS ENUM ('debug', 'info', 'warn', 'error');

CREATE TYPE "ApplicationLogKind" AS ENUM (
  'http',
  'application',
  'integration',
  'cron',
  'client',
  'audit'
);

CREATE TABLE "ApplicationLog" (
  "id" TEXT NOT NULL,
  "workspaceId" TEXT,
  "userId" TEXT,
  "level" "ApplicationLogLevel" NOT NULL,
  "kind" "ApplicationLogKind" NOT NULL,
  "environment" TEXT NOT NULL,
  "service" TEXT NOT NULL,
  "source" TEXT,
  "event" TEXT NOT NULL,
  "message" TEXT NOT NULL,
  "correlationId" TEXT,
  "requestId" TEXT,
  "method" TEXT,
  "endpoint" TEXT,
  "path" TEXT,
  "statusCode" INTEGER,
  "durationMs" INTEGER,
  "errorName" TEXT,
  "errorCode" TEXT,
  "stack" TEXT,
  "metadata" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "expiresAt" TIMESTAMP(3),

  CONSTRAINT "ApplicationLog_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "ApplicationLog"
ADD CONSTRAINT "ApplicationLog_workspaceId_fkey"
FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ApplicationLog"
ADD CONSTRAINT "ApplicationLog_userId_fkey"
FOREIGN KEY ("userId") REFERENCES "User"("id")
ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "ApplicationLog_workspaceId_createdAt_idx"
ON "ApplicationLog"("workspaceId", "createdAt");

CREATE INDEX "ApplicationLog_level_createdAt_idx"
ON "ApplicationLog"("level", "createdAt");

CREATE INDEX "ApplicationLog_kind_createdAt_idx"
ON "ApplicationLog"("kind", "createdAt");

CREATE INDEX "ApplicationLog_source_createdAt_idx"
ON "ApplicationLog"("source", "createdAt");

CREATE INDEX "ApplicationLog_event_createdAt_idx"
ON "ApplicationLog"("event", "createdAt");

CREATE INDEX "ApplicationLog_correlationId_idx"
ON "ApplicationLog"("correlationId");

CREATE INDEX "ApplicationLog_statusCode_createdAt_idx"
ON "ApplicationLog"("statusCode", "createdAt");

CREATE INDEX "ApplicationLog_expiresAt_idx"
ON "ApplicationLog"("expiresAt");
