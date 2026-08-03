WITH ranked_products AS (
  SELECT
    id,
    "workspaceId",
    "telegramChannelId",
    name,
    "createdAt",
    ROW_NUMBER() OVER (
      PARTITION BY "workspaceId", "telegramChannelId", name
      ORDER BY "createdAt" ASC, id ASC
    ) AS row_num,
    FIRST_VALUE(id) OVER (
      PARTITION BY "workspaceId", "telegramChannelId", name
      ORDER BY "createdAt" ASC, id ASC
    ) AS keeper_id
  FROM "TelegramAdProduct"
),
duplicates AS (
  SELECT id, keeper_id
  FROM ranked_products
  WHERE row_num > 1
)
UPDATE "TelegramAdPriceSnapshot" snapshot
SET "telegramAdProductId" = duplicates.keeper_id
FROM duplicates
WHERE snapshot."telegramAdProductId" = duplicates.id;

WITH ranked_products AS (
  SELECT
    id,
    "workspaceId",
    "telegramChannelId",
    name,
    "createdAt",
    ROW_NUMBER() OVER (
      PARTITION BY "workspaceId", "telegramChannelId", name
      ORDER BY "createdAt" ASC, id ASC
    ) AS row_num,
    FIRST_VALUE(id) OVER (
      PARTITION BY "workspaceId", "telegramChannelId", name
      ORDER BY "createdAt" ASC, id ASC
    ) AS keeper_id
  FROM "TelegramAdProduct"
),
duplicates AS (
  SELECT id, keeper_id
  FROM ranked_products
  WHERE row_num > 1
)
UPDATE "TelegramAdSalePlacement" placement
SET "telegramAdProductId" = duplicates.keeper_id
FROM duplicates
WHERE placement."telegramAdProductId" = duplicates.id;

WITH ranked_products AS (
  SELECT
    id,
    "workspaceId",
    "telegramChannelId",
    name,
    "createdAt",
    ROW_NUMBER() OVER (
      PARTITION BY "workspaceId", "telegramChannelId", name
      ORDER BY "createdAt" ASC, id ASC
    ) AS row_num
  FROM "TelegramAdProduct"
)
DELETE FROM "TelegramAdProduct" product
USING ranked_products
WHERE product.id = ranked_products.id
  AND ranked_products.row_num > 1;

CREATE UNIQUE INDEX "TelegramAdProduct_workspaceId_telegramChannelId_name_key"
ON "TelegramAdProduct"("workspaceId", "telegramChannelId", name);
