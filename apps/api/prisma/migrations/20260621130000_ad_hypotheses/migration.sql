CREATE TABLE "AdHypothesis" (
  "id" TEXT NOT NULL,
  "workspaceId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "description" TEXT,
  "status" TEXT NOT NULL DEFAULT 'testing',
  "conclusion" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "AdHypothesis_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "AdHypothesisCampaign" (
  "id" TEXT NOT NULL,
  "workspaceId" TEXT NOT NULL,
  "hypothesisId" TEXT NOT NULL,
  "adCampaignId" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "AdHypothesisCampaign_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "AdHypothesis"
ADD CONSTRAINT "AdHypothesis_workspaceId_fkey"
FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "AdHypothesisCampaign"
ADD CONSTRAINT "AdHypothesisCampaign_workspaceId_fkey"
FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "AdHypothesisCampaign"
ADD CONSTRAINT "AdHypothesisCampaign_hypothesisId_fkey"
FOREIGN KEY ("hypothesisId") REFERENCES "AdHypothesis"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "AdHypothesisCampaign"
ADD CONSTRAINT "AdHypothesisCampaign_adCampaignId_fkey"
FOREIGN KEY ("adCampaignId") REFERENCES "AdCampaign"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE UNIQUE INDEX "AdHypothesis_workspaceId_name_key"
ON "AdHypothesis"("workspaceId", "name");

CREATE INDEX "AdHypothesis_workspaceId_idx"
ON "AdHypothesis"("workspaceId");

CREATE INDEX "AdHypothesis_workspaceId_status_idx"
ON "AdHypothesis"("workspaceId", "status");

CREATE UNIQUE INDEX "AdHypothesisCampaign_hypothesisId_adCampaignId_key"
ON "AdHypothesisCampaign"("hypothesisId", "adCampaignId");

CREATE INDEX "AdHypothesisCampaign_workspaceId_idx"
ON "AdHypothesisCampaign"("workspaceId");

CREATE INDEX "AdHypothesisCampaign_hypothesisId_idx"
ON "AdHypothesisCampaign"("hypothesisId");

CREATE INDEX "AdHypothesisCampaign_adCampaignId_idx"
ON "AdHypothesisCampaign"("adCampaignId");
