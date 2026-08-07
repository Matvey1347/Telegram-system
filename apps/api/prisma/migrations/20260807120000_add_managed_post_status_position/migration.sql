ALTER TABLE "TelegramManagedPost"
  ADD COLUMN "statusPosition" INTEGER;

ALTER TABLE "TelegramManagedPostRevision"
  ADD COLUMN "statusPosition" INTEGER;

WITH ordered AS (
  SELECT
    "id",
    ROW_NUMBER() OVER (
      PARTITION BY "groupId"
      ORDER BY "groupPosition" ASC NULLS LAST, "createdAt" ASC, "id" ASC
    ) - 1 AS "nextGroupPosition"
  FROM "TelegramManagedPost"
  WHERE "groupId" IS NOT NULL
),
grouped AS (
  SELECT
    ranked."id",
    ranked."nextGroupPosition",
    ROW_NUMBER() OVER (
      PARTITION BY ranked."groupId", ranked."statusBucket"
      ORDER BY ranked."nextGroupPosition" ASC, ranked."createdAt" ASC, ranked."id" ASC
    ) - 1 AS "nextStatusPosition"
  FROM (
    SELECT
      p."id",
      p."groupId",
      p."createdAt",
      o."nextGroupPosition",
      CASE
        WHEN p."status" IN ('DRAFT', 'PUBLISHING', 'FAILED') THEN 'DRAFT'
        WHEN p."status" = 'SCHEDULED' THEN 'SCHEDULED'
        WHEN p."status" = 'PUBLISHED' THEN 'PUBLISHED'
      END AS "statusBucket"
    FROM "TelegramManagedPost" p
    JOIN ordered o ON o."id" = p."id"
  ) ranked
  WHERE ranked."statusBucket" IS NOT NULL
)
UPDATE "TelegramManagedPost" p
SET
  "groupPosition" = grouped."nextGroupPosition",
  "statusPosition" = grouped."nextStatusPosition"
FROM grouped
WHERE p."id" = grouped."id";

UPDATE "TelegramManagedPost"
SET
  "groupPosition" = NULL,
  "statusPosition" = NULL
WHERE "groupId" IS NULL;

WITH cleaned AS (
  SELECT
    "id",
    regexp_replace("title", '^\s*\d+\)\s+', '') AS "nextTitle"
  FROM "TelegramManagedPost"
  WHERE "groupId" IS NOT NULL
    AND "title" ~ '^\s*\d+\)\s+'
    AND substring("title" FROM '^\s*(\d+)\)\s+')::integer = "groupPosition" + 1
)
UPDATE "TelegramManagedPost" p
SET "title" = cleaned."nextTitle"
FROM cleaned
WHERE p."id" = cleaned."id"
  AND btrim(cleaned."nextTitle") <> '';

WITH revision_ordered AS (
  SELECT
    "id",
    ROW_NUMBER() OVER (
      PARTITION BY "groupId"
      ORDER BY "groupPosition" ASC NULLS LAST, "createdAt" ASC, "id" ASC
    ) - 1 AS "nextGroupPosition"
  FROM "TelegramManagedPostRevision"
  WHERE "groupId" IS NOT NULL
),
revision_grouped AS (
  SELECT
    ranked."id",
    ranked."nextGroupPosition",
    ROW_NUMBER() OVER (
      PARTITION BY ranked."groupId", ranked."statusBucket"
      ORDER BY ranked."nextGroupPosition" ASC, ranked."createdAt" ASC, ranked."id" ASC
    ) - 1 AS "nextStatusPosition"
  FROM (
    SELECT
      r."id",
      r."groupId",
      r."createdAt",
      ro."nextGroupPosition",
      CASE
        WHEN r."status" IN ('DRAFT', 'PUBLISHING', 'FAILED') THEN 'DRAFT'
        WHEN r."status" = 'SCHEDULED' THEN 'SCHEDULED'
        WHEN r."status" = 'PUBLISHED' THEN 'PUBLISHED'
      END AS "statusBucket"
    FROM "TelegramManagedPostRevision" r
    JOIN revision_ordered ro ON ro."id" = r."id"
  ) ranked
  WHERE ranked."statusBucket" IS NOT NULL
)
UPDATE "TelegramManagedPostRevision" r
SET
  "groupPosition" = revision_grouped."nextGroupPosition",
  "statusPosition" = revision_grouped."nextStatusPosition"
FROM revision_grouped
WHERE r."id" = revision_grouped."id";

UPDATE "TelegramManagedPostRevision"
SET
  "groupPosition" = NULL,
  "statusPosition" = NULL
WHERE "groupId" IS NULL;

WITH revision_cleaned AS (
  SELECT
    "id",
    regexp_replace("title", '^\s*\d+\)\s+', '') AS "nextTitle"
  FROM "TelegramManagedPostRevision"
  WHERE "groupId" IS NOT NULL
    AND "title" ~ '^\s*\d+\)\s+'
    AND substring("title" FROM '^\s*(\d+)\)\s+')::integer = "groupPosition" + 1
)
UPDATE "TelegramManagedPostRevision" r
SET "title" = revision_cleaned."nextTitle"
FROM revision_cleaned
WHERE r."id" = revision_cleaned."id"
  AND btrim(revision_cleaned."nextTitle") <> '';

CREATE INDEX "TelegramManagedPost_groupId_status_statusPosition_idx"
  ON "TelegramManagedPost"("groupId", "status", "statusPosition");

CREATE INDEX "TelegramManagedPostRevision_groupId_status_statusPosition_idx"
  ON "TelegramManagedPostRevision"("groupId", "status", "statusPosition");
