-- CreateEnum
CREATE TYPE "TelegramAdPricingMode" AS ENUM ('CPM', 'FIXED', 'MANUAL');

-- CreateEnum
CREATE TYPE "TelegramAdSlotStrategy" AS ENUM ('BEFORE_ORGANIC_POST', 'FIXED_TIMES', 'MANUAL');

-- CreateEnum
CREATE TYPE "TelegramAdSaleStatus" AS ENUM ('DRAFT', 'RESERVED', 'CONFIRMED', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "TelegramAdPlacementStatus" AS ENUM ('DRAFT', 'RESERVED', 'SCHEDULED', 'PUBLISHED', 'COMPLETED', 'CANCELLED', 'MISSED');

-- CreateEnum
CREATE TYPE "TelegramAdSalePaymentStatus" AS ENUM ('ACTIVE', 'VOIDED');

-- CreateTable
CREATE TABLE "TelegramAdProduct" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "telegramChannelId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "topDurationMinutes" INTEGER,
    "feedDurationHours" INTEGER,
    "deleteAfterHours" INTEGER,
    "isPermanent" BOOLEAN NOT NULL DEFAULT false,
    "defaultPricingMode" "TelegramAdPricingMode" NOT NULL,
    "defaultCpm" DECIMAL(65,30),
    "defaultFixedPrice" DECIMAL(65,30),
    "minimumPrice" DECIMAL(65,30),
    "currency" VARCHAR(3) NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "position" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TelegramAdProduct_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TelegramAdSchedulePolicy" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "telegramChannelId" TEXT NOT NULL,
    "timezone" TEXT NOT NULL,
    "autoFrequencyEnabled" BOOLEAN NOT NULL DEFAULT true,
    "expectedOrganicPostsPerDay" DECIMAL(65,30),
    "maxAdsPerDay" INTEGER NOT NULL,
    "minHoursBetweenAds" INTEGER NOT NULL,
    "minDaysBetweenAds" INTEGER NOT NULL,
    "slotStrategy" "TelegramAdSlotStrategy" NOT NULL,
    "fallbackSlotTimes" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "allowManualSlots" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TelegramAdSchedulePolicy_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TelegramAdPriceSnapshot" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "telegramChannelId" TEXT NOT NULL,
    "telegramAdProductId" TEXT,
    "calculatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "source" TEXT NOT NULL,
    "methodVersion" TEXT NOT NULL,
    "statisticsWindowDays" INTEGER NOT NULL,
    "postsSampleCount" INTEGER NOT NULL,
    "expectedViews" INTEGER NOT NULL,
    "averageViews" DECIMAL(65,30),
    "medianViews" DECIMAL(65,30),
    "adjustedViews" DECIMAL(65,30),
    "targetCpm" DECIMAL(65,30) NOT NULL,
    "minimumCpm" DECIMAL(65,30),
    "recommendedPrice" DECIMAL(65,30) NOT NULL,
    "minimumPrice" DECIMAL(65,30) NOT NULL,
    "currency" VARCHAR(3) NOT NULL,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TelegramAdPriceSnapshot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TelegramAdSale" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "advertiserName" TEXT NOT NULL,
    "advertiserTelegram" TEXT,
    "advertiserContact" TEXT,
    "title" TEXT,
    "notes" TEXT,
    "status" "TelegramAdSaleStatus" NOT NULL DEFAULT 'DRAFT',
    "settlementCurrency" VARCHAR(3) NOT NULL,
    "reservedUntil" TIMESTAMP(3),
    "createdByUserId" TEXT,
    "assignedMemberId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TelegramAdSale_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TelegramAdSalePlacement" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "telegramAdSaleId" TEXT NOT NULL,
    "telegramChannelId" TEXT NOT NULL,
    "telegramChannelNetworkId" TEXT,
    "telegramAdProductId" TEXT,
    "pricingSnapshotId" TEXT,
    "status" "TelegramAdPlacementStatus" NOT NULL DEFAULT 'DRAFT',
    "scheduledAt" TIMESTAMP(3) NOT NULL,
    "timezone" TEXT NOT NULL,
    "pricingMode" "TelegramAdPricingMode" NOT NULL,
    "expectedViews" INTEGER NOT NULL,
    "quotedCpm" DECIMAL(65,30),
    "recommendedPrice" DECIMAL(65,30) NOT NULL,
    "minimumPrice" DECIMAL(65,30) NOT NULL,
    "agreedPrice" DECIMAL(65,30) NOT NULL,
    "currency" VARCHAR(3) NOT NULL,
    "scheduledManagedAt" TIMESTAMP(3),
    "topDurationMinutesSnapshot" INTEGER,
    "feedDurationHoursSnapshot" INTEGER,
    "deleteAfterHoursSnapshot" INTEGER,
    "isPermanentSnapshot" BOOLEAN NOT NULL DEFAULT false,
    "manualPriceReason" TEXT,
    "managedPostId" TEXT,
    "telegramPostId" TEXT,
    "publishedAt" TIMESTAMP(3),
    "plannedDeleteAt" TIMESTAMP(3),
    "deletedAt" TIMESTAMP(3),
    "lastDeletionAttemptAt" TIMESTAMP(3),
    "lastDeletionError" TEXT,
    "actualViews24h" INTEGER,
    "actualViews48h" INTEGER,
    "actualViewsFinal" INTEGER,
    "actualCpm" DECIMAL(65,30),
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TelegramAdSalePlacement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TelegramAdSalePayment" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "telegramAdSaleId" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "transactionId" TEXT,
    "amount" DECIMAL(65,30) NOT NULL,
    "currency" VARCHAR(3) NOT NULL,
    "amountInPrimaryCurrency" DECIMAL(65,30) NOT NULL,
    "exchangeRateToPrimary" DECIMAL(65,30) NOT NULL,
    "paidAt" TIMESTAMP(3) NOT NULL,
    "notes" TEXT,
    "status" "TelegramAdSalePaymentStatus" NOT NULL DEFAULT 'ACTIVE',
    "idempotencyKey" TEXT,
    "reversalTransactionId" TEXT,
    "voidedAt" TIMESTAMP(3),
    "voidReason" TEXT,
    "createdByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TelegramAdSalePayment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TelegramAdSalePaymentAllocation" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "telegramAdSalePaymentId" TEXT NOT NULL,
    "telegramAdSalePlacementId" TEXT NOT NULL,
    "amount" DECIMAL(65,30) NOT NULL,
    "currency" VARCHAR(3) NOT NULL,
    "amountInPrimaryCurrency" DECIMAL(65,30) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TelegramAdSalePaymentAllocation_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "TelegramAdProduct_workspaceId_idx" ON "TelegramAdProduct"("workspaceId");
CREATE INDEX "TelegramAdProduct_telegramChannelId_isActive_position_idx" ON "TelegramAdProduct"("telegramChannelId", "isActive", "position");
CREATE INDEX "TelegramAdProduct_workspaceId_telegramChannelId_idx" ON "TelegramAdProduct"("workspaceId", "telegramChannelId");

-- CreateIndex
CREATE UNIQUE INDEX "TelegramAdSchedulePolicy_telegramChannelId_key" ON "TelegramAdSchedulePolicy"("telegramChannelId");
CREATE INDEX "TelegramAdSchedulePolicy_workspaceId_idx" ON "TelegramAdSchedulePolicy"("workspaceId");
CREATE INDEX "TelegramAdSchedulePolicy_workspaceId_telegramChannelId_idx" ON "TelegramAdSchedulePolicy"("workspaceId", "telegramChannelId");

-- CreateIndex
CREATE INDEX "TelegramAdPriceSnapshot_workspaceId_idx" ON "TelegramAdPriceSnapshot"("workspaceId");
CREATE INDEX "TelegramAdPriceSnapshot_telegramChannelId_calculatedAt_idx" ON "TelegramAdPriceSnapshot"("telegramChannelId", "calculatedAt");
CREATE INDEX "TelegramAdPriceSnapshot_telegramAdProductId_calculatedAt_idx" ON "TelegramAdPriceSnapshot"("telegramAdProductId", "calculatedAt");

-- CreateIndex
CREATE INDEX "TelegramAdSale_workspaceId_idx" ON "TelegramAdSale"("workspaceId");
CREATE INDEX "TelegramAdSale_workspaceId_status_createdAt_idx" ON "TelegramAdSale"("workspaceId", "status", "createdAt");
CREATE INDEX "TelegramAdSale_workspaceId_assignedMemberId_idx" ON "TelegramAdSale"("workspaceId", "assignedMemberId");

-- CreateIndex
CREATE INDEX "TelegramAdSalePlacement_workspaceId_idx" ON "TelegramAdSalePlacement"("workspaceId");
CREATE INDEX "TelegramAdSalePlacement_telegramChannelId_scheduledAt_idx" ON "TelegramAdSalePlacement"("telegramChannelId", "scheduledAt");
CREATE INDEX "TelegramAdSalePlacement_telegramAdSaleId_idx" ON "TelegramAdSalePlacement"("telegramAdSaleId");
CREATE INDEX "TelegramAdSalePlacement_status_scheduledAt_idx" ON "TelegramAdSalePlacement"("status", "scheduledAt");
CREATE INDEX "TelegramAdSalePlacement_workspaceId_status_scheduledAt_idx" ON "TelegramAdSalePlacement"("workspaceId", "status", "scheduledAt");
CREATE INDEX "TelegramAdSalePlacement_telegramChannelNetworkId_idx" ON "TelegramAdSalePlacement"("telegramChannelNetworkId");
CREATE INDEX "TelegramAdSalePlacement_telegramAdProductId_idx" ON "TelegramAdSalePlacement"("telegramAdProductId");
CREATE INDEX "TelegramAdSalePlacement_pricingSnapshotId_idx" ON "TelegramAdSalePlacement"("pricingSnapshotId");
CREATE INDEX "TelegramAdSalePlacement_workspaceId_publishedAt_idx" ON "TelegramAdSalePlacement"("workspaceId", "publishedAt");
CREATE INDEX "TelegramAdSalePlacement_workspaceId_plannedDeleteAt_deletedAt_idx" ON "TelegramAdSalePlacement"("workspaceId", "plannedDeleteAt", "deletedAt");

-- CreateIndex
CREATE UNIQUE INDEX "TelegramAdSalePayment_transactionId_key" ON "TelegramAdSalePayment"("transactionId");
CREATE UNIQUE INDEX "TelegramAdSalePayment_reversalTransactionId_key" ON "TelegramAdSalePayment"("reversalTransactionId");
CREATE UNIQUE INDEX "TelegramAdSalePayment_workspaceId_idempotencyKey_key" ON "TelegramAdSalePayment"("workspaceId", "idempotencyKey");
CREATE INDEX "TelegramAdSalePayment_workspaceId_idx" ON "TelegramAdSalePayment"("workspaceId");
CREATE INDEX "TelegramAdSalePayment_telegramAdSaleId_paidAt_idx" ON "TelegramAdSalePayment"("telegramAdSaleId", "paidAt");
CREATE INDEX "TelegramAdSalePayment_accountId_paidAt_idx" ON "TelegramAdSalePayment"("accountId", "paidAt");
CREATE INDEX "TelegramAdSalePayment_workspaceId_status_paidAt_idx" ON "TelegramAdSalePayment"("workspaceId", "status", "paidAt");

-- CreateIndex
CREATE UNIQUE INDEX "TelegramAdSalePaymentAllocation_telegramAdSalePaymentId_telegramAdS_key" ON "TelegramAdSalePaymentAllocation"("telegramAdSalePaymentId", "telegramAdSalePlacementId");
CREATE INDEX "TelegramAdSalePaymentAllocation_workspaceId_idx" ON "TelegramAdSalePaymentAllocation"("workspaceId");
CREATE INDEX "TelegramAdSalePaymentAllocation_telegramAdSalePaymentId_idx" ON "TelegramAdSalePaymentAllocation"("telegramAdSalePaymentId");
CREATE INDEX "TelegramAdSalePaymentAllocation_telegramAdSalePlacementId_idx" ON "TelegramAdSalePaymentAllocation"("telegramAdSalePlacementId");

-- AddForeignKey
ALTER TABLE "TelegramAdProduct"
ADD CONSTRAINT "TelegramAdProduct_workspaceId_fkey"
FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "TelegramAdProduct"
ADD CONSTRAINT "TelegramAdProduct_telegramChannelId_fkey"
FOREIGN KEY ("telegramChannelId") REFERENCES "TelegramChannel"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "TelegramAdSchedulePolicy"
ADD CONSTRAINT "TelegramAdSchedulePolicy_workspaceId_fkey"
FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "TelegramAdSchedulePolicy"
ADD CONSTRAINT "TelegramAdSchedulePolicy_telegramChannelId_fkey"
FOREIGN KEY ("telegramChannelId") REFERENCES "TelegramChannel"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "TelegramAdPriceSnapshot"
ADD CONSTRAINT "TelegramAdPriceSnapshot_workspaceId_fkey"
FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "TelegramAdPriceSnapshot"
ADD CONSTRAINT "TelegramAdPriceSnapshot_telegramChannelId_fkey"
FOREIGN KEY ("telegramChannelId") REFERENCES "TelegramChannel"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "TelegramAdPriceSnapshot"
ADD CONSTRAINT "TelegramAdPriceSnapshot_telegramAdProductId_fkey"
FOREIGN KEY ("telegramAdProductId") REFERENCES "TelegramAdProduct"("id")
ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "TelegramAdSale"
ADD CONSTRAINT "TelegramAdSale_workspaceId_fkey"
FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "TelegramAdSale"
ADD CONSTRAINT "TelegramAdSale_createdByUserId_fkey"
FOREIGN KEY ("createdByUserId") REFERENCES "User"("id")
ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "TelegramAdSale"
ADD CONSTRAINT "TelegramAdSale_assignedMemberId_fkey"
FOREIGN KEY ("assignedMemberId") REFERENCES "WorkspaceMember"("id")
ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "TelegramAdSalePlacement"
ADD CONSTRAINT "TelegramAdSalePlacement_workspaceId_fkey"
FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "TelegramAdSalePlacement"
ADD CONSTRAINT "TelegramAdSalePlacement_telegramAdSaleId_fkey"
FOREIGN KEY ("telegramAdSaleId") REFERENCES "TelegramAdSale"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "TelegramAdSalePlacement"
ADD CONSTRAINT "TelegramAdSalePlacement_telegramChannelId_fkey"
FOREIGN KEY ("telegramChannelId") REFERENCES "TelegramChannel"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "TelegramAdSalePlacement"
ADD CONSTRAINT "TelegramAdSalePlacement_telegramChannelNetworkId_fkey"
FOREIGN KEY ("telegramChannelNetworkId") REFERENCES "TelegramChannelNetwork"("id")
ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "TelegramAdSalePlacement"
ADD CONSTRAINT "TelegramAdSalePlacement_telegramAdProductId_fkey"
FOREIGN KEY ("telegramAdProductId") REFERENCES "TelegramAdProduct"("id")
ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "TelegramAdSalePlacement"
ADD CONSTRAINT "TelegramAdSalePlacement_pricingSnapshotId_fkey"
FOREIGN KEY ("pricingSnapshotId") REFERENCES "TelegramAdPriceSnapshot"("id")
ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "TelegramAdSalePlacement"
ADD CONSTRAINT "TelegramAdSalePlacement_managedPostId_fkey"
FOREIGN KEY ("managedPostId") REFERENCES "TelegramManagedPost"("id")
ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "TelegramAdSalePlacement"
ADD CONSTRAINT "TelegramAdSalePlacement_telegramPostId_fkey"
FOREIGN KEY ("telegramPostId") REFERENCES "TelegramPost"("id")
ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "TelegramAdSalePayment"
ADD CONSTRAINT "TelegramAdSalePayment_workspaceId_fkey"
FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "TelegramAdSalePayment"
ADD CONSTRAINT "TelegramAdSalePayment_telegramAdSaleId_fkey"
FOREIGN KEY ("telegramAdSaleId") REFERENCES "TelegramAdSale"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "TelegramAdSalePayment"
ADD CONSTRAINT "TelegramAdSalePayment_accountId_fkey"
FOREIGN KEY ("accountId") REFERENCES "Account"("id")
ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "TelegramAdSalePayment"
ADD CONSTRAINT "TelegramAdSalePayment_transactionId_fkey"
FOREIGN KEY ("transactionId") REFERENCES "Transaction"("id")
ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "TelegramAdSalePayment"
ADD CONSTRAINT "TelegramAdSalePayment_reversalTransactionId_fkey"
FOREIGN KEY ("reversalTransactionId") REFERENCES "Transaction"("id")
ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "TelegramAdSalePayment"
ADD CONSTRAINT "TelegramAdSalePayment_createdByUserId_fkey"
FOREIGN KEY ("createdByUserId") REFERENCES "User"("id")
ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "TelegramAdSalePaymentAllocation"
ADD CONSTRAINT "TelegramAdSalePaymentAllocation_workspaceId_fkey"
FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "TelegramAdSalePaymentAllocation"
ADD CONSTRAINT "TelegramAdSalePaymentAllocation_telegramAdSalePaymentId_fkey"
FOREIGN KEY ("telegramAdSalePaymentId") REFERENCES "TelegramAdSalePayment"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "TelegramAdSalePaymentAllocation"
ADD CONSTRAINT "TelegramAdSalePaymentAllocation_telegramAdSalePlacementId_fkey"
FOREIGN KEY ("telegramAdSalePlacementId") REFERENCES "TelegramAdSalePlacement"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

-- CreateTable
CREATE TABLE "TelegramAdInventoryDailySnapshot" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "telegramChannelId" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "timezone" TEXT NOT NULL,
    "eligibleSlots" INTEGER NOT NULL,
    "bookedSlots" INTEGER NOT NULL,
    "publishedSlots" INTEGER NOT NULL,
    "cancelledSlots" INTEGER NOT NULL,
    "missedSlots" INTEGER NOT NULL,
    "blockedSlots" INTEGER NOT NULL,
    "recommendedInventoryRevenue" DECIMAL(65,30) NOT NULL,
    "minimumInventoryRevenue" DECIMAL(65,30) NOT NULL,
    "agreedRevenue" DECIMAL(65,30) NOT NULL,
    "paidRevenue" DECIMAL(65,30) NOT NULL,
    "outstandingRevenue" DECIMAL(65,30) NOT NULL,
    "underpricingLoss" DECIMAL(65,30) NOT NULL,
    "unsoldInventoryOpportunity" DECIMAL(65,30) NOT NULL,
    "expectedViews" INTEGER NOT NULL,
    "actualViews" INTEGER NOT NULL,
    "policySnapshot" JSONB,
    "productSnapshot" JSONB,
    "pricingSnapshot" JSONB,
    "calculationVersion" TEXT NOT NULL,
    "calculatedAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TelegramAdInventoryDailySnapshot_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "tg_ad_inv_daily_ws_channel_date_key" ON "TelegramAdInventoryDailySnapshot"("workspaceId", "telegramChannelId", "date");
CREATE INDEX "tg_ad_inv_daily_ws_date_idx" ON "TelegramAdInventoryDailySnapshot"("workspaceId", "date");
CREATE INDEX "tg_ad_inv_daily_channel_date_idx" ON "TelegramAdInventoryDailySnapshot"("telegramChannelId", "date");
CREATE INDEX "tg_ad_inv_daily_ws_channel_date_idx" ON "TelegramAdInventoryDailySnapshot"("workspaceId", "telegramChannelId", "date");
CREATE INDEX "tg_ad_inv_daily_date_eligible_idx" ON "TelegramAdInventoryDailySnapshot"("date", "eligibleSlots");
CREATE INDEX "tg_ad_inv_daily_date_booked_idx" ON "TelegramAdInventoryDailySnapshot"("date", "bookedSlots");

-- AddForeignKey
ALTER TABLE "TelegramAdInventoryDailySnapshot"
ADD CONSTRAINT "TelegramAdInventoryDailySnapshot_workspaceId_fkey"
FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "TelegramAdInventoryDailySnapshot"
ADD CONSTRAINT "TelegramAdInventoryDailySnapshot_telegramChannelId_fkey"
FOREIGN KEY ("telegramChannelId") REFERENCES "TelegramChannel"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

-- CreateEnum
CREATE TYPE "TelegramAdvertiserStatus" AS ENUM ('LEAD', 'ACTIVE', 'INACTIVE', 'LOST', 'BLOCKED', 'ARCHIVED');
CREATE TYPE "TelegramAdvertiserLifecycleStage" AS ENUM ('NEW', 'CONTACTED', 'QUALIFIED', 'CUSTOMER', 'REPEAT_CUSTOMER', 'REACTIVATION', 'CHURNED');
CREATE TYPE "TelegramAdvertiserContactType" AS ENUM ('TELEGRAM_USERNAME', 'TELEGRAM_USER_ID', 'PHONE', 'EMAIL', 'WEBSITE', 'OTHER');
CREATE TYPE "TelegramAdCrmDealStage" AS ENUM ('NEW_LEAD', 'CONTACTED', 'NEED_IDENTIFIED', 'OFFER_PREPARED', 'OFFER_SENT', 'NEGOTIATION', 'SLOT_RESERVED', 'WAITING_PAYMENT', 'PAID', 'SCHEDULED', 'PUBLISHED', 'COMPLETED', 'LOST');
CREATE TYPE "TelegramAdvertiserActivityType" AS ENUM ('ADVERTISER_CREATED', 'CONTACT_ADDED', 'NOTE_ADDED', 'MANUAL_CONTACT', 'OUTREACH_PLANNED', 'OUTREACH_COMPLETED', 'CLIENT_REPLIED', 'OFFER_SENT', 'SALE_CREATED', 'SALE_STAGE_CHANGED', 'SLOT_RESERVED', 'PAYMENT_RECORDED', 'PLACEMENT_SCHEDULED', 'PLACEMENT_PUBLISHED', 'PLACEMENT_COMPLETED', 'FOLLOW_UP_CREATED', 'FOLLOW_UP_COMPLETED', 'FOLLOW_UP_SKIPPED', 'CLIENT_DECLINED', 'CLIENT_REQUESTED_LATER_CONTACT', 'CLIENT_REACTIVATED', 'ADVERTISER_MERGED', 'OWNER_CHANGED', 'STATUS_CHANGED');
CREATE TYPE "TelegramAdvertiserTaskType" AS ENUM ('FOLLOW_UP', 'PAYMENT_FOLLOW_UP', 'REQUEST_FEEDBACK', 'OFFER_FREE_SLOT', 'REACTIVATION', 'PREPARE_OFFER', 'MANUAL');
CREATE TYPE "TelegramAdvertiserTaskStatus" AS ENUM ('OPEN', 'IN_PROGRESS', 'COMPLETED', 'SKIPPED', 'CANCELLED');
CREATE TYPE "TelegramAdvertiserTaskPriority" AS ENUM ('LOW', 'NORMAL', 'HIGH', 'URGENT');
CREATE TYPE "TelegramAdCrmOwnerMode" AS ENUM ('SALE_ASSIGNEE', 'ADVERTISER_OWNER', 'WORKSPACE_DEFAULT');
CREATE TYPE "TelegramAdvertiserAutomationEventType" AS ENUM ('PLACEMENT_COMPLETED', 'PLACEMENT_PUBLISHED', 'SALE_COMPLETED', 'PAYMENT_OVERDUE', 'ADVERTISER_INACTIVE', 'FREE_SLOT_AVAILABLE', 'HIGH_PERFORMING_PLACEMENT', 'CLIENT_REQUESTED_LATER_CONTACT');
CREATE TYPE "TelegramAdvertiserAutomationActionType" AS ENUM ('CREATE_FOLLOW_UP_TASK', 'CREATE_PAYMENT_TASK', 'CREATE_FEEDBACK_TASK', 'CREATE_REACTIVATION_TASK', 'CREATE_FREE_SLOT_SUGGESTION');
CREATE TYPE "TelegramAdvertiserAutomationExecutionStatus" AS ENUM ('CREATED', 'SKIPPED', 'FAILED');
CREATE TYPE "TelegramAdPlacementAdvertiserResultSource" AS ENUM ('MANUAL', 'ADVERTISER_REPORTED', 'TRACKED');

-- AlterTable
ALTER TABLE "TelegramAdSale"
ADD COLUMN "advertiserId" TEXT,
ADD COLUMN "advertiserNameSnapshot" TEXT,
ADD COLUMN "advertiserTelegramSnapshot" TEXT,
ADD COLUMN "advertiserCompanySnapshot" TEXT,
ADD COLUMN "crmDealStage" "TelegramAdCrmDealStage" NOT NULL DEFAULT 'NEW_LEAD',
ADD COLUMN "expectedCloseAt" TIMESTAMP(3),
ADD COLUMN "lostReason" TEXT,
ADD COLUMN "nextActionAt" TIMESTAMP(3),
ADD COLUMN "sourceTaskId" TEXT,
ADD COLUMN "sourceAdvertiserActivityId" TEXT;

UPDATE "TelegramAdSale"
SET "advertiserNameSnapshot" = "advertiserName",
    "advertiserTelegramSnapshot" = "advertiserTelegram"
WHERE "advertiserNameSnapshot" IS NULL;

-- CreateTable
CREATE TABLE "TelegramAdvertiser" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "displayName" TEXT NOT NULL,
    "companyName" TEXT,
    "telegramUsername" TEXT,
    "telegramUserId" TEXT,
    "phone" TEXT,
    "email" TEXT,
    "website" TEXT,
    "description" TEXT,
    "source" TEXT,
    "status" "TelegramAdvertiserStatus" NOT NULL DEFAULT 'LEAD',
    "lifecycleStage" "TelegramAdvertiserLifecycleStage" NOT NULL DEFAULT 'NEW',
    "ownerMemberId" TEXT,
    "createdByUserId" TEXT,
    "lastContactAt" TIMESTAMP(3),
    "lastPurchaseAt" TIMESTAMP(3),
    "nextContactAt" TIMESTAMP(3),
    "defaultFollowUpDays" INTEGER,
    "preferredCurrency" VARCHAR(3),
    "preferredContactMethod" "TelegramAdvertiserContactType",
    "totalSalesCount" INTEGER NOT NULL DEFAULT 0,
    "completedSalesCount" INTEGER NOT NULL DEFAULT 0,
    "totalPlacementsCount" INTEGER NOT NULL DEFAULT 0,
    "totalRevenueInPrimaryCurrency" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "averageOrderValueInPrimaryCurrency" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "firstPurchaseAt" TIMESTAMP(3),
    "repeatCustomerAt" TIMESTAMP(3),
    "archivedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "TelegramAdvertiser_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "TelegramAdvertiserContact" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "advertiserId" TEXT NOT NULL,
    "type" "TelegramAdvertiserContactType" NOT NULL,
    "value" TEXT NOT NULL,
    "normalizedValue" TEXT NOT NULL,
    "label" TEXT,
    "isPrimary" BOOLEAN NOT NULL DEFAULT false,
    "isVerified" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "TelegramAdvertiserContact_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "TelegramAdvertiserTag" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "color" TEXT,
    "position" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "TelegramAdvertiserTag_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "TelegramAdvertiserTagAssignment" (
    "advertiserId" TEXT NOT NULL,
    "tagId" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "assignedByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "TelegramAdvertiserTagAssignment_pkey" PRIMARY KEY ("advertiserId","tagId")
);

CREATE TABLE "TelegramAdvertiserActivity" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "advertiserId" TEXT NOT NULL,
    "saleId" TEXT,
    "placementId" TEXT,
    "taskId" TEXT,
    "actorUserId" TEXT,
    "actorMemberId" TEXT,
    "type" "TelegramAdvertiserActivityType" NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "metadata" JSONB,
    "occurredAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "TelegramAdvertiserActivity_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "TelegramAdvertiserTask" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "advertiserId" TEXT NOT NULL,
    "saleId" TEXT,
    "placementId" TEXT,
    "assignedMemberId" TEXT NOT NULL,
    "createdByUserId" TEXT,
    "type" "TelegramAdvertiserTaskType" NOT NULL,
    "status" "TelegramAdvertiserTaskStatus" NOT NULL DEFAULT 'OPEN',
    "priority" "TelegramAdvertiserTaskPriority" NOT NULL DEFAULT 'NORMAL',
    "title" TEXT NOT NULL,
    "description" TEXT,
    "dueAt" TIMESTAMP(3) NOT NULL,
    "remindAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "skippedAt" TIMESTAMP(3),
    "snoozedUntil" TIMESTAMP(3),
    "completionNote" TEXT,
    "automationRuleId" TEXT,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "TelegramAdvertiserTask_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "TelegramAdCrmMemberSettings" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "workspaceMemberId" TEXT NOT NULL,
    "defaultFollowUpDays" INTEGER NOT NULL DEFAULT 30,
    "defaultReactivationDays" INTEGER NOT NULL DEFAULT 60,
    "autoCreateFollowUpAfterPlacement" BOOLEAN NOT NULL DEFAULT true,
    "autoCreateFeedbackTask" BOOLEAN NOT NULL DEFAULT false,
    "autoCreatePaymentFollowUp" BOOLEAN NOT NULL DEFAULT true,
    "dailyDigestEnabled" BOOLEAN NOT NULL DEFAULT false,
    "overdueDigestEnabled" BOOLEAN NOT NULL DEFAULT true,
    "reminderNotificationsEnabled" BOOLEAN NOT NULL DEFAULT true,
    "preferredReminderTime" TEXT,
    "timezone" TEXT NOT NULL DEFAULT 'UTC',
    "defaultTaskPriority" "TelegramAdvertiserTaskPriority" NOT NULL DEFAULT 'NORMAL',
    "defaultAdvertiserOwnerMode" "TelegramAdCrmOwnerMode" NOT NULL DEFAULT 'SALE_ASSIGNEE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "TelegramAdCrmMemberSettings_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "TelegramAdCrmWorkspaceSettings" (
    "workspaceId" TEXT NOT NULL,
    "defaultFollowUpDays" INTEGER NOT NULL DEFAULT 30,
    "defaultReactivationDays" INTEGER NOT NULL DEFAULT 60,
    "defaultSaleOwnerAssignment" "TelegramAdCrmOwnerMode" NOT NULL DEFAULT 'SALE_ASSIGNEE',
    "autoCreateAdvertiserFromSale" BOOLEAN NOT NULL DEFAULT true,
    "requireAdvertiserForConfirmedSale" BOOLEAN NOT NULL DEFAULT false,
    "duplicateDetectionEnabled" BOOLEAN NOT NULL DEFAULT true,
    "inactivityThresholdDays" INTEGER NOT NULL DEFAULT 60,
    "highValueCustomerThreshold" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "TelegramAdCrmWorkspaceSettings_pkey" PRIMARY KEY ("workspaceId")
);

CREATE TABLE "TelegramAdvertiserAutomationRule" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "eventType" "TelegramAdvertiserAutomationEventType" NOT NULL,
    "actionType" "TelegramAdvertiserAutomationActionType" NOT NULL,
    "delayDays" INTEGER NOT NULL DEFAULT 0,
    "delayHours" INTEGER NOT NULL DEFAULT 0,
    "assignedMemberMode" "TelegramAdCrmOwnerMode" NOT NULL DEFAULT 'SALE_ASSIGNEE',
    "specificMemberId" TEXT,
    "conditions" JSONB,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "priority" "TelegramAdvertiserTaskPriority" NOT NULL DEFAULT 'NORMAL',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "TelegramAdvertiserAutomationRule_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "TelegramAdvertiserAutomationExecution" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "automationRuleId" TEXT NOT NULL,
    "advertiserId" TEXT NOT NULL,
    "saleId" TEXT,
    "placementId" TEXT,
    "taskId" TEXT,
    "eventKey" TEXT NOT NULL,
    "status" "TelegramAdvertiserAutomationExecutionStatus" NOT NULL,
    "executedAt" TIMESTAMP(3) NOT NULL,
    "createdTaskId" TEXT,
    "error" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "TelegramAdvertiserAutomationExecution_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "TelegramAdPlacementAdvertiserResult" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "placementId" TEXT NOT NULL,
    "leadsCount" INTEGER,
    "salesCount" INTEGER,
    "revenue" DECIMAL(65,30),
    "currency" VARCHAR(3),
    "conversionRate" DECIMAL(65,30),
    "roi" DECIMAL(65,30),
    "source" "TelegramAdPlacementAdvertiserResultSource" NOT NULL,
    "notes" TEXT,
    "reportedAt" TIMESTAMP(3),
    "createdByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "TelegramAdPlacementAdvertiserResult_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "TelegramAdvertiser_workspaceId_displayName_key" ON "TelegramAdvertiser"("workspaceId", "displayName");
CREATE INDEX "TelegramAdvertiser_workspaceId_status_updatedAt_idx" ON "TelegramAdvertiser"("workspaceId", "status", "updatedAt");
CREATE INDEX "TelegramAdvertiser_workspaceId_lifecycleStage_updatedAt_idx" ON "TelegramAdvertiser"("workspaceId", "lifecycleStage", "updatedAt");
CREATE INDEX "TelegramAdvertiser_workspaceId_ownerMemberId_idx" ON "TelegramAdvertiser"("workspaceId", "ownerMemberId");
CREATE INDEX "TelegramAdvertiser_workspaceId_lastPurchaseAt_idx" ON "TelegramAdvertiser"("workspaceId", "lastPurchaseAt");
CREATE INDEX "TelegramAdvertiser_workspaceId_nextContactAt_idx" ON "TelegramAdvertiser"("workspaceId", "nextContactAt");
CREATE UNIQUE INDEX "TelegramAdvertiserContact_workspaceId_type_normalizedValue_key" ON "TelegramAdvertiserContact"("workspaceId", "type", "normalizedValue");
CREATE INDEX "TelegramAdvertiserContact_workspaceId_advertiserId_type_idx" ON "TelegramAdvertiserContact"("workspaceId", "advertiserId", "type");
CREATE UNIQUE INDEX "TelegramAdvertiserTag_workspaceId_name_key" ON "TelegramAdvertiserTag"("workspaceId", "name");
CREATE INDEX "TelegramAdvertiserTag_workspaceId_position_idx" ON "TelegramAdvertiserTag"("workspaceId", "position");
CREATE INDEX "TelegramAdvertiserTagAssignment_workspaceId_tagId_idx" ON "TelegramAdvertiserTagAssignment"("workspaceId", "tagId");
CREATE INDEX "TelegramAdvertiserActivity_workspaceId_advertiserId_occurredAt_idx" ON "TelegramAdvertiserActivity"("workspaceId", "advertiserId", "occurredAt");
CREATE INDEX "TelegramAdvertiserActivity_workspaceId_type_occurredAt_idx" ON "TelegramAdvertiserActivity"("workspaceId", "type", "occurredAt");
CREATE INDEX "TelegramAdvertiserTask_workspaceId_assignedMemberId_status_dueAt_idx" ON "TelegramAdvertiserTask"("workspaceId", "assignedMemberId", "status", "dueAt");
CREATE INDEX "TelegramAdvertiserTask_workspaceId_advertiserId_dueAt_idx" ON "TelegramAdvertiserTask"("workspaceId", "advertiserId", "dueAt");
CREATE INDEX "TelegramAdvertiserTask_workspaceId_status_dueAt_idx" ON "TelegramAdvertiserTask"("workspaceId", "status", "dueAt");
CREATE UNIQUE INDEX "TelegramAdCrmMemberSettings_workspaceMemberId_key" ON "TelegramAdCrmMemberSettings"("workspaceMemberId");
CREATE INDEX "TelegramAdCrmMemberSettings_workspaceId_idx" ON "TelegramAdCrmMemberSettings"("workspaceId");
CREATE INDEX "TelegramAdvertiserAutomationRule_workspaceId_eventType_isActive_idx" ON "TelegramAdvertiserAutomationRule"("workspaceId", "eventType", "isActive");
CREATE UNIQUE INDEX "TelegramAdvertiserAutomationExecution_automationRuleId_eventKey_key" ON "TelegramAdvertiserAutomationExecution"("automationRuleId", "eventKey");
CREATE INDEX "TelegramAdvertiserAutomationExecution_workspaceId_executedAt_idx" ON "TelegramAdvertiserAutomationExecution"("workspaceId", "executedAt");
CREATE UNIQUE INDEX "TelegramAdPlacementAdvertiserResult_placementId_key" ON "TelegramAdPlacementAdvertiserResult"("placementId");
CREATE INDEX "TelegramAdPlacementAdvertiserResult_workspaceId_reportedAt_idx" ON "TelegramAdPlacementAdvertiserResult"("workspaceId", "reportedAt");
CREATE INDEX "TelegramAdSale_workspaceId_advertiserId_createdAt_idx" ON "TelegramAdSale"("workspaceId", "advertiserId", "createdAt");
CREATE INDEX "TelegramAdSale_workspaceId_crmDealStage_createdAt_idx" ON "TelegramAdSale"("workspaceId", "crmDealStage", "createdAt");
CREATE INDEX "TelegramAdSale_sourceTaskId_idx" ON "TelegramAdSale"("sourceTaskId");

-- AddForeignKey
ALTER TABLE "TelegramAdSale" ADD CONSTRAINT "TelegramAdSale_advertiserId_fkey" FOREIGN KEY ("advertiserId") REFERENCES "TelegramAdvertiser"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "TelegramAdSale" ADD CONSTRAINT "TelegramAdSale_sourceTaskId_fkey" FOREIGN KEY ("sourceTaskId") REFERENCES "TelegramAdvertiserTask"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "TelegramAdSale" ADD CONSTRAINT "TelegramAdSale_sourceAdvertiserActivityId_fkey" FOREIGN KEY ("sourceAdvertiserActivityId") REFERENCES "TelegramAdvertiserActivity"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "TelegramAdvertiser" ADD CONSTRAINT "TelegramAdvertiser_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "TelegramAdvertiser" ADD CONSTRAINT "TelegramAdvertiser_ownerMemberId_fkey" FOREIGN KEY ("ownerMemberId") REFERENCES "WorkspaceMember"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "TelegramAdvertiser" ADD CONSTRAINT "TelegramAdvertiser_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "TelegramAdvertiserContact" ADD CONSTRAINT "TelegramAdvertiserContact_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "TelegramAdvertiserContact" ADD CONSTRAINT "TelegramAdvertiserContact_advertiserId_fkey" FOREIGN KEY ("advertiserId") REFERENCES "TelegramAdvertiser"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "TelegramAdvertiserTag" ADD CONSTRAINT "TelegramAdvertiserTag_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "TelegramAdvertiserTagAssignment" ADD CONSTRAINT "TelegramAdvertiserTagAssignment_advertiserId_fkey" FOREIGN KEY ("advertiserId") REFERENCES "TelegramAdvertiser"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "TelegramAdvertiserTagAssignment" ADD CONSTRAINT "TelegramAdvertiserTagAssignment_tagId_fkey" FOREIGN KEY ("tagId") REFERENCES "TelegramAdvertiserTag"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "TelegramAdvertiserTagAssignment" ADD CONSTRAINT "TelegramAdvertiserTagAssignment_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "TelegramAdvertiserTagAssignment" ADD CONSTRAINT "TelegramAdvertiserTagAssignment_assignedByUserId_fkey" FOREIGN KEY ("assignedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "TelegramAdvertiserActivity" ADD CONSTRAINT "TelegramAdvertiserActivity_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "TelegramAdvertiserActivity" ADD CONSTRAINT "TelegramAdvertiserActivity_advertiserId_fkey" FOREIGN KEY ("advertiserId") REFERENCES "TelegramAdvertiser"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "TelegramAdvertiserActivity" ADD CONSTRAINT "TelegramAdvertiserActivity_saleId_fkey" FOREIGN KEY ("saleId") REFERENCES "TelegramAdSale"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "TelegramAdvertiserActivity" ADD CONSTRAINT "TelegramAdvertiserActivity_placementId_fkey" FOREIGN KEY ("placementId") REFERENCES "TelegramAdSalePlacement"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "TelegramAdvertiserActivity" ADD CONSTRAINT "TelegramAdvertiserActivity_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "TelegramAdvertiserTask"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "TelegramAdvertiserActivity" ADD CONSTRAINT "TelegramAdvertiserActivity_actorUserId_fkey" FOREIGN KEY ("actorUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "TelegramAdvertiserActivity" ADD CONSTRAINT "TelegramAdvertiserActivity_actorMemberId_fkey" FOREIGN KEY ("actorMemberId") REFERENCES "WorkspaceMember"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "TelegramAdvertiserTask" ADD CONSTRAINT "TelegramAdvertiserTask_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "TelegramAdvertiserTask" ADD CONSTRAINT "TelegramAdvertiserTask_advertiserId_fkey" FOREIGN KEY ("advertiserId") REFERENCES "TelegramAdvertiser"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "TelegramAdvertiserTask" ADD CONSTRAINT "TelegramAdvertiserTask_saleId_fkey" FOREIGN KEY ("saleId") REFERENCES "TelegramAdSale"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "TelegramAdvertiserTask" ADD CONSTRAINT "TelegramAdvertiserTask_placementId_fkey" FOREIGN KEY ("placementId") REFERENCES "TelegramAdSalePlacement"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "TelegramAdvertiserTask" ADD CONSTRAINT "TelegramAdvertiserTask_assignedMemberId_fkey" FOREIGN KEY ("assignedMemberId") REFERENCES "WorkspaceMember"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "TelegramAdvertiserTask" ADD CONSTRAINT "TelegramAdvertiserTask_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "TelegramAdvertiserTask" ADD CONSTRAINT "TelegramAdvertiserTask_automationRuleId_fkey" FOREIGN KEY ("automationRuleId") REFERENCES "TelegramAdvertiserAutomationRule"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "TelegramAdCrmMemberSettings" ADD CONSTRAINT "TelegramAdCrmMemberSettings_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "TelegramAdCrmMemberSettings" ADD CONSTRAINT "TelegramAdCrmMemberSettings_workspaceMemberId_fkey" FOREIGN KEY ("workspaceMemberId") REFERENCES "WorkspaceMember"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "TelegramAdCrmWorkspaceSettings" ADD CONSTRAINT "TelegramAdCrmWorkspaceSettings_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "TelegramAdvertiserAutomationRule" ADD CONSTRAINT "TelegramAdvertiserAutomationRule_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "TelegramAdvertiserAutomationRule" ADD CONSTRAINT "TelegramAdvertiserAutomationRule_specificMemberId_fkey" FOREIGN KEY ("specificMemberId") REFERENCES "WorkspaceMember"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "TelegramAdvertiserAutomationExecution" ADD CONSTRAINT "TelegramAdvertiserAutomationExecution_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "TelegramAdvertiserAutomationExecution" ADD CONSTRAINT "TelegramAdvertiserAutomationExecution_automationRuleId_fkey" FOREIGN KEY ("automationRuleId") REFERENCES "TelegramAdvertiserAutomationRule"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "TelegramAdvertiserAutomationExecution" ADD CONSTRAINT "TelegramAdvertiserAutomationExecution_advertiserId_fkey" FOREIGN KEY ("advertiserId") REFERENCES "TelegramAdvertiser"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "TelegramAdvertiserAutomationExecution" ADD CONSTRAINT "TelegramAdvertiserAutomationExecution_saleId_fkey" FOREIGN KEY ("saleId") REFERENCES "TelegramAdSale"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "TelegramAdvertiserAutomationExecution" ADD CONSTRAINT "TelegramAdvertiserAutomationExecution_placementId_fkey" FOREIGN KEY ("placementId") REFERENCES "TelegramAdSalePlacement"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "TelegramAdvertiserAutomationExecution" ADD CONSTRAINT "TelegramAdvertiserAutomationExecution_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "TelegramAdvertiserTask"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "TelegramAdPlacementAdvertiserResult" ADD CONSTRAINT "TelegramAdPlacementAdvertiserResult_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "TelegramAdPlacementAdvertiserResult" ADD CONSTRAINT "TelegramAdPlacementAdvertiserResult_placementId_fkey" FOREIGN KEY ("placementId") REFERENCES "TelegramAdSalePlacement"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "TelegramAdPlacementAdvertiserResult" ADD CONSTRAINT "TelegramAdPlacementAdvertiserResult_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
