import { execFileSync } from "node:child_process";
import process from "node:process";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { Client } from "pg";
import { config as loadEnv } from "dotenv";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const apiDir = resolve(scriptDir, "..");

loadEnv({
  path: resolve(apiDir, "../../.env"),
  override: true,
});

const recoverableMigrations = [
  {
    name: "20260724143000_add_ad_hypothesis_telegram_channel_id",
    recover: recoverAdHypothesisTelegramChannelId,
  },
  {
    name: "20260724170000_add_telegram_channel_import_cutoffs",
    recover: recoverTelegramChannelImportCutoffs,
  },
  {
    name: "20260726120000_add_managed_post_origin_calendar",
    recover: recoverManagedPostOriginCalendar,
  },
  {
    name: "20260726150000_add_system_post_groups",
    recover: recoverSystemPostGroups,
  },
  {
    name: "20260726190000_telegram_account_premium_capabilities",
    recover: recoverTelegramPremiumCapabilities,
  },
];

async function hasFailedMigration(client, migrationName) {
  const result = await client.query(
    `
      SELECT 1
      FROM "_prisma_migrations"
      WHERE migration_name = $1
        AND finished_at IS NULL
        AND rolled_back_at IS NULL
      LIMIT 1
    `,
    [migrationName],
  );
  return result.rowCount > 0;
}

async function recoverAdHypothesisTelegramChannelId(client) {
  await client.query(`
    ALTER TABLE "AdHypothesis"
    ADD COLUMN IF NOT EXISTS "telegramChannelId" TEXT;
  `);

  await client.query(`
    CREATE INDEX IF NOT EXISTS "AdHypothesis_telegramChannelId_idx"
    ON "AdHypothesis"("telegramChannelId");
  `);

  await client.query(`
    DO $$
    BEGIN
      IF NOT EXISTS (
        SELECT 1
        FROM information_schema.table_constraints
        WHERE constraint_name = 'AdHypothesis_telegramChannelId_fkey'
          AND table_name = 'AdHypothesis'
      ) THEN
        ALTER TABLE "AdHypothesis"
        ADD CONSTRAINT "AdHypothesis_telegramChannelId_fkey"
        FOREIGN KEY ("telegramChannelId") REFERENCES "TelegramChannel"("id")
        ON DELETE SET NULL ON UPDATE CASCADE;
      END IF;
    END $$;
  `);
}

async function recoverTelegramChannelImportCutoffs(client) {
  await client.query(`
    DO $$
    BEGIN
      IF NOT EXISTS (
        SELECT 1
        FROM pg_type
        WHERE typname = 'TelegramChannelAcquisitionType'
      ) THEN
        CREATE TYPE "TelegramChannelAcquisitionType" AS ENUM ('CREATED', 'PURCHASED');
      END IF;
    END $$;
  `);

  await client.query(`
    ALTER TABLE "TelegramChannel"
    ADD COLUMN IF NOT EXISTS "acquisitionType" "TelegramChannelAcquisitionType" NOT NULL DEFAULT 'CREATED',
    ADD COLUMN IF NOT EXISTS "postsSyncFrom" TIMESTAMP(3),
    ADD COLUMN IF NOT EXISTS "inviteLinksSyncFrom" TIMESTAMP(3),
    ADD COLUMN IF NOT EXISTS "purchaseTransactionId" TEXT;
  `);

  await client.query(`
    ALTER TABLE "TelegramInviteLink"
    ADD COLUMN IF NOT EXISTS "telegramCreatedAt" TIMESTAMP(3);
  `);

  await client.query(`
    CREATE UNIQUE INDEX IF NOT EXISTS "TelegramChannel_purchaseTransactionId_key"
    ON "TelegramChannel"("purchaseTransactionId");
  `);

  await client.query(`
    DO $$
    BEGIN
      IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'TelegramChannel_purchaseTransactionId_fkey'
      ) THEN
        ALTER TABLE "TelegramChannel"
        ADD CONSTRAINT "TelegramChannel_purchaseTransactionId_fkey"
        FOREIGN KEY ("purchaseTransactionId") REFERENCES "Transaction"("id")
        ON DELETE SET NULL ON UPDATE CASCADE;
      END IF;
    END $$;
  `);
}

async function recoverManagedPostOriginCalendar(client) {
  await client.query(`
    DO $$
    BEGIN
      IF NOT EXISTS (
        SELECT 1
        FROM pg_type
        WHERE typname = 'TelegramManagedPostOrigin'
      ) THEN
        CREATE TYPE "TelegramManagedPostOrigin" AS ENUM ('SYSTEM', 'TELEGRAM');
      END IF;
    END $$;
  `);

  await client.query(`
    ALTER TABLE "TelegramManagedPost"
    ADD COLUMN IF NOT EXISTS "origin" "TelegramManagedPostOrigin" NOT NULL DEFAULT 'SYSTEM',
    ADD COLUMN IF NOT EXISTS "remoteImportKey" TEXT;
  `);

  await client.query(`
    ALTER TABLE "TelegramManagedPostRevision"
    ADD COLUMN IF NOT EXISTS "origin" "TelegramManagedPostOrigin" NOT NULL DEFAULT 'SYSTEM',
    ADD COLUMN IF NOT EXISTS "remoteImportKey" TEXT;
  `);

  await client.query(`
    UPDATE "TelegramManagedPost"
    SET "origin" = 'SYSTEM'
    WHERE "origin" IS NULL;
  `);

  await client.query(`
    UPDATE "TelegramManagedPostRevision"
    SET "origin" = 'SYSTEM'
    WHERE "origin" IS NULL;
  `);

  await client.query(`
    CREATE INDEX IF NOT EXISTS "TelegramManagedPost_workspaceId_telegramChannelId_origin_status_s_idx"
    ON "TelegramManagedPost"("workspaceId", "telegramChannelId", "origin", "status", "scheduledAt");
  `);

  await client.query(`
    CREATE UNIQUE INDEX IF NOT EXISTS "TelegramManagedPost_workspaceId_telegramChannelId_remoteImport_idx"
    ON "TelegramManagedPost"("workspaceId", "telegramChannelId", "remoteImportKey")
    WHERE "remoteImportKey" IS NOT NULL;
  `);
}

async function recoverSystemPostGroups(client) {
  await client.query(`
    ALTER TABLE "PostGroup"
    ADD COLUMN IF NOT EXISTS "isSystem" BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN IF NOT EXISTS "systemKey" TEXT;
  `);

  await client.query(`
    CREATE UNIQUE INDEX IF NOT EXISTS "PostGroup_telegramChannelId_systemKey_key"
    ON "PostGroup"("telegramChannelId", "systemKey");
  `);
}

async function recoverTelegramPremiumCapabilities(client) {
  await client.query(`
    ALTER TABLE "TelegramUserAccountIntegration"
    ADD COLUMN IF NOT EXISTS "isPremium" BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN IF NOT EXISTS "premiumCheckedAt" TIMESTAMP(3),
    ADD COLUMN IF NOT EXISTS "captionLengthMax" INTEGER NOT NULL DEFAULT 1024,
    ADD COLUMN IF NOT EXISTS "messageLengthMax" INTEGER NOT NULL DEFAULT 4096,
    ADD COLUMN IF NOT EXISTS "premiumCapabilities" JSONB;
  `);

  await client.query(`
    ALTER TABLE "TelegramManagedPost"
    ADD COLUMN IF NOT EXISTS "sourceWasPremium" BOOLEAN,
    ADD COLUMN IF NOT EXISTS "captionLengthMaxUsed" INTEGER,
    ADD COLUMN IF NOT EXISTS "messageLengthMaxUsed" INTEGER;
  `);

  await client.query(`
    ALTER TABLE "TelegramManagedPostRevision"
    ADD COLUMN IF NOT EXISTS "sourceWasPremium" BOOLEAN,
    ADD COLUMN IF NOT EXISTS "captionLengthMaxUsed" INTEGER,
    ADD COLUMN IF NOT EXISTS "messageLengthMaxUsed" INTEGER;
  `);
}

async function main() {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    throw new Error("DATABASE_URL is not set");
  }

  const client = new Client({ connectionString: databaseUrl });
  await client.connect();

  try {
    const failedMigrations = [];
    for (const migration of recoverableMigrations) {
      if (await hasFailedMigration(client, migration.name)) {
        failedMigrations.push(migration);
      }
    }
    if (!failedMigrations.length) {
      console.log("No recoverable failed migration states found, skipping recovery.");
      return;
    }

    for (const migration of failedMigrations) {
      console.log(
        `Recovering failed migration ${migration.name} before prisma migrate deploy...`,
      );
      await migration.recover(client);
    }

    await client.end();

    for (const migration of failedMigrations) {
      execFileSync(
        "pnpm",
        [
          "exec",
          "prisma",
          "migrate",
          "resolve",
          "--applied",
          migration.name,
        ],
        {
          cwd: apiDir,
          stdio: "inherit",
          env: process.env,
        },
      );
    }
  } finally {
    try {
      await client.end();
    } catch {}
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
