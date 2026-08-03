WITH legacy_permanent AS (
  SELECT
    legacy.id AS legacy_id,
    canonical.id AS canonical_id
  FROM "TelegramAdProduct" legacy
  JOIN "TelegramAdProduct" canonical
    ON canonical."workspaceId" = legacy."workspaceId"
   AND canonical."telegramChannelId" = legacy."telegramChannelId"
   AND canonical.name = 'No auto-delete'
  WHERE legacy.name = '1/permanent'
),
update_snapshots AS (
  UPDATE "TelegramAdPriceSnapshot" snapshot
  SET "telegramAdProductId" = legacy_permanent.canonical_id
  FROM legacy_permanent
  WHERE snapshot."telegramAdProductId" = legacy_permanent.legacy_id
),
update_placements AS (
  UPDATE "TelegramAdSalePlacement" placement
  SET "telegramAdProductId" = legacy_permanent.canonical_id
  FROM legacy_permanent
  WHERE placement."telegramAdProductId" = legacy_permanent.legacy_id
)
DELETE FROM "TelegramAdProduct" product
USING legacy_permanent
WHERE product.id = legacy_permanent.legacy_id;
