CREATE TABLE "AdCampaignPromo" (
  "id" TEXT NOT NULL,
  "adCampaignId" TEXT NOT NULL,
  "promoId" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "AdCampaignPromo_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "AdCampaignPromo_adCampaignId_promoId_key"
ON "AdCampaignPromo"("adCampaignId", "promoId");

CREATE INDEX "AdCampaignPromo_promoId_idx"
ON "AdCampaignPromo"("promoId");

ALTER TABLE "AdCampaignPromo"
ADD CONSTRAINT "AdCampaignPromo_adCampaignId_fkey"
FOREIGN KEY ("adCampaignId") REFERENCES "AdCampaign"("id")
ON DELETE CASCADE
ON UPDATE CASCADE;

ALTER TABLE "AdCampaignPromo"
ADD CONSTRAINT "AdCampaignPromo_promoId_fkey"
FOREIGN KEY ("promoId") REFERENCES "Promo"("id")
ON DELETE CASCADE
ON UPDATE CASCADE;

INSERT INTO "AdCampaignPromo" ("id", "adCampaignId", "promoId", "createdAt")
SELECT
  CONCAT('ad_campaign_promo_', md5("id" || ':' || "promoId" || ':' || clock_timestamp()::text)),
  "id",
  "promoId",
  CURRENT_TIMESTAMP
FROM "AdCampaign"
WHERE "promoId" IS NOT NULL
ON CONFLICT ("adCampaignId", "promoId") DO NOTHING;
