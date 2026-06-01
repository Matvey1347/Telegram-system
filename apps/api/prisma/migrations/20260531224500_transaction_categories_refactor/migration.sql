ALTER TABLE "Transaction"
  ADD COLUMN IF NOT EXISTS "categoryId" TEXT,
  ADD COLUMN IF NOT EXISTS "memberId" TEXT;

CREATE TABLE IF NOT EXISTS "TransactionCategory" (
  "id" TEXT NOT NULL,
  "workspaceId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "type" "TransactionType" NOT NULL,
  "isSystem" BOOLEAN NOT NULL DEFAULT false,
  "key" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "TransactionCategory_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "TransactionCategory_workspaceId_type_idx"
  ON "TransactionCategory"("workspaceId", "type");

CREATE UNIQUE INDEX IF NOT EXISTS "TransactionCategory_workspaceId_type_key_key"
  ON "TransactionCategory"("workspaceId", "type", "key");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'TransactionCategory_workspaceId_fkey'
  ) THEN
    ALTER TABLE "TransactionCategory"
      ADD CONSTRAINT "TransactionCategory_workspaceId_fkey"
      FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'Transaction_categoryId_fkey'
  ) THEN
    ALTER TABLE "Transaction"
      ADD CONSTRAINT "Transaction_categoryId_fkey"
      FOREIGN KEY ("categoryId") REFERENCES "TransactionCategory"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'Transaction_memberId_fkey'
  ) THEN
    ALTER TABLE "Transaction"
      ADD CONSTRAINT "Transaction_memberId_fkey"
      FOREIGN KEY ("memberId") REFERENCES "WorkspaceMember"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS "Transaction_workspaceId_type_categoryId_idx"
  ON "Transaction"("workspaceId", "type", "categoryId");

CREATE INDEX IF NOT EXISTS "Transaction_workspaceId_memberId_idx"
  ON "Transaction"("workspaceId", "memberId");

INSERT INTO "TransactionCategory" ("id", "workspaceId", "name", "type", "isSystem", "key", "createdAt", "updatedAt")
SELECT md5(random()::text || clock_timestamp()::text), w."id", 'Investment', 'income'::"TransactionType", true, 'investment', NOW(), NOW()
FROM "Workspace" w
WHERE NOT EXISTS (
  SELECT 1 FROM "TransactionCategory" c
  WHERE c."workspaceId" = w."id" AND c."type" = 'income'::"TransactionType" AND c."key" = 'investment'
);

INSERT INTO "TransactionCategory" ("id", "workspaceId", "name", "type", "isSystem", "key", "createdAt", "updatedAt")
SELECT md5(random()::text || clock_timestamp()::text), w."id", 'Advertising', 'expense'::"TransactionType", true, 'advertising', NOW(), NOW()
FROM "Workspace" w
WHERE NOT EXISTS (
  SELECT 1 FROM "TransactionCategory" c
  WHERE c."workspaceId" = w."id" AND c."type" = 'expense'::"TransactionType" AND c."key" = 'advertising'
);

INSERT INTO "TransactionCategory" ("id", "workspaceId", "name", "type", "isSystem", "key", "createdAt", "updatedAt")
SELECT md5(random()::text || clock_timestamp()::text), t."workspaceId", initcap(t."category"), t."type", false, NULL, NOW(), NOW()
FROM (
  SELECT DISTINCT "workspaceId", "type", COALESCE(NULLIF(TRIM("category"), ''), CASE WHEN "type" = 'income'::"TransactionType" THEN 'Income' ELSE 'Expense' END) AS "category"
  FROM "Transaction"
) t
WHERE NOT EXISTS (
  SELECT 1 FROM "TransactionCategory" c
  WHERE c."workspaceId" = t."workspaceId" AND c."type" = t."type" AND lower(c."name") = lower(t."category")
);

UPDATE "Transaction" t
SET "categoryId" = c."id"
FROM "TransactionCategory" c
WHERE t."workspaceId" = c."workspaceId"
  AND t."type" = c."type"
  AND lower(COALESCE(NULLIF(TRIM(t."category"), ''), CASE WHEN t."type" = 'income'::"TransactionType" THEN 'Income' ELSE 'Expense' END)) = lower(c."name")
  AND t."categoryId" IS NULL;

UPDATE "Transaction" t
SET "categoryId" = c."id", "category" = c."name"
FROM "TransactionCategory" c
WHERE t."workspaceId" = c."workspaceId"
  AND t."type" = 'income'::"TransactionType"
  AND lower(t."category") = 'investment'
  AND c."type" = 'income'::"TransactionType"
  AND c."key" = 'investment';

UPDATE "Transaction" t
SET "categoryId" = c."id", "category" = c."name"
FROM "TransactionCategory" c
WHERE t."workspaceId" = c."workspaceId"
  AND t."type" = 'expense'::"TransactionType"
  AND lower(t."category") = 'advertising'
  AND c."type" = 'expense'::"TransactionType"
  AND c."key" = 'advertising';

UPDATE "Transaction" t
SET "memberId" = i."workspaceMemberId"
FROM "Investment" i
WHERE i."transactionId" = t."id" AND t."memberId" IS NULL;
