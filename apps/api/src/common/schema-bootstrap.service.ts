import { Injectable, OnModuleInit } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class SchemaBootstrapService implements OnModuleInit {
  constructor(private readonly prisma: PrismaService) {}

  async onModuleInit() {
    await this.ensureIconSchema();
  }

  private async ensureIconSchema() {
    await this.prisma.$executeRawUnsafe(`
DO $$
BEGIN
  CREATE TYPE "IconType" AS ENUM ('emoji', 'image');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;
`);

    await this.prisma.$executeRawUnsafe(`
DO $$
BEGIN
  CREATE TYPE "CurrencyDisplayMode" AS ENUM ('code', 'symbol');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;
`);

    await this.prisma.$executeRawUnsafe(`
CREATE TABLE IF NOT EXISTS "Icon" (
  "id" TEXT NOT NULL,
  "workspaceId" TEXT,
  "type" "IconType" NOT NULL,
  "name" TEXT NOT NULL,
  "emoji" TEXT,
  "imageUrl" TEXT,
  "createdByUserId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "Icon_pkey" PRIMARY KEY ("id")
);
`);

    await this.prisma.$executeRawUnsafe(`
CREATE UNIQUE INDEX IF NOT EXISTS "Icon_workspaceId_type_name_key"
ON "Icon" ("workspaceId", "type", "name");
`);

    await this.prisma.$executeRawUnsafe(`
CREATE INDEX IF NOT EXISTS "Icon_workspaceId_name_type_idx"
ON "Icon" ("workspaceId", "name", "type");
`);

    await this.prisma.$executeRawUnsafe(`
CREATE INDEX IF NOT EXISTS "Icon_workspaceId_type_idx"
ON "Icon" ("workspaceId", "type");
`);

    await this.prisma.$executeRawUnsafe(`
CREATE INDEX IF NOT EXISTS "Icon_createdByUserId_idx"
ON "Icon" ("createdByUserId");
`);

    await this.prisma.$executeRawUnsafe(`
ALTER TABLE "Workspace"
ADD COLUMN IF NOT EXISTS "avatarIconId" TEXT;
`);

    await this.prisma.$executeRawUnsafe(`
ALTER TABLE "Workspace"
ADD COLUMN IF NOT EXISTS "currencyDisplayMode" "CurrencyDisplayMode" NOT NULL DEFAULT 'code';
`);

    await this.prisma.$executeRawUnsafe(`
ALTER TABLE "Account"
ADD COLUMN IF NOT EXISTS "iconId" TEXT;
`);

    await this.prisma.$executeRawUnsafe(`
ALTER TABLE "TelegramUserAccountIntegration"
ADD COLUMN IF NOT EXISTS "loginPhoneCodeHash" TEXT;
`);

    await this.prisma.$executeRawUnsafe(`
ALTER TABLE "TelegramUserAccountIntegration"
ADD COLUMN IF NOT EXISTS "loginTempSessionEncrypted" TEXT;
`);

    await this.prisma.$executeRawUnsafe(`
ALTER TABLE "TelegramUserAccountIntegration"
ADD COLUMN IF NOT EXISTS "loginTempSessionIv" TEXT;
`);

    await this.prisma.$executeRawUnsafe(`
ALTER TABLE "TelegramUserAccountIntegration"
ADD COLUMN IF NOT EXISTS "loginTempSessionAuthTag" TEXT;
`);

    await this.prisma.$executeRawUnsafe(`
ALTER TABLE "TelegramUserAccountIntegration"
ADD COLUMN IF NOT EXISTS "loginStartedAt" TIMESTAMP(3);
`);

    await this.prisma.$executeRawUnsafe(`
ALTER TABLE "Transaction"
ADD COLUMN IF NOT EXISTS "iconId" TEXT;
`);

    await this.prisma.$executeRawUnsafe(`
ALTER TABLE "TransactionCategory"
ADD COLUMN IF NOT EXISTS "iconId" TEXT;
`);
  }
}
