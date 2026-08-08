import { Type } from 'class-transformer';
import { Transform } from 'class-transformer';
import {
  TelegramAdCrmDealStage,
  TelegramAdCrmOwnerMode,
  TelegramAdPricingMode,
  TelegramAdSalePaymentStatus,
  TelegramAdSaleStatus,
  TelegramAdSlotStrategy,
  TelegramAdvertiserActivityType,
  TelegramAdvertiserContactType,
  TelegramAdvertiserLifecycleStage,
  TelegramAdvertiserStatus,
  TelegramAdvertiserTaskPriority,
  TelegramAdvertiserTaskStatus,
  TelegramAdvertiserTaskType,
} from '@prisma/client';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsDateString,
  IsDefined,
  IsEnum,
  IsIn,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Matches,
  Max,
  Min,
  ValidateIf,
  ValidateNested,
} from 'class-validator';
import { PaginationQueryDto } from '../common/pagination/pagination-query.dto';

const normalizeCurrency = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim().toUpperCase() : value;

export class TelegramAdProductsQueryDto extends PaginationQueryDto {
  @IsOptional() @IsString() telegramChannelId?: string;
  @IsOptional() @IsBoolean() isActive?: boolean;
}

export class CreateTelegramAdProductDto {
  @IsString() name!: string;
  @IsOptional() @IsString() description?: string | null;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) topDurationMinutes?: number | null;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) feedDurationHours?: number | null;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) deleteAfterHours?: number | null;
  @IsOptional() @IsBoolean() isPermanent?: boolean;
  @IsEnum(TelegramAdPricingMode) defaultPricingMode!: TelegramAdPricingMode;
  @IsOptional() @Type(() => Number) @IsNumber() @Min(0) defaultCpm?: number | null;
  @IsOptional() @Type(() => Number) @IsNumber() @Min(0) defaultFixedPrice?: number | null;
  @IsOptional() @Type(() => Number) @IsNumber() @Min(0) minimumPrice?: number | null;
  @Transform(normalizeCurrency) @IsString() @Matches(/^[A-Z]{3}$/) currency!: string;
  @IsOptional() @IsBoolean() isActive?: boolean;
  @IsOptional() @Type(() => Number) @IsInt() @Min(0) position?: number;
}

export class UpdateTelegramAdProductDto {
  @IsOptional() @IsString() name?: string;
  @IsOptional() @IsString() description?: string | null;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) topDurationMinutes?: number | null;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) feedDurationHours?: number | null;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) deleteAfterHours?: number | null;
  @IsOptional() @IsBoolean() isPermanent?: boolean;
  @IsOptional() @IsEnum(TelegramAdPricingMode) defaultPricingMode?: TelegramAdPricingMode;
  @IsOptional() @Type(() => Number) @IsNumber() @Min(0) defaultCpm?: number | null;
  @IsOptional() @Type(() => Number) @IsNumber() @Min(0) defaultFixedPrice?: number | null;
  @IsOptional() @Type(() => Number) @IsNumber() @Min(0) minimumPrice?: number | null;
  @IsOptional() @Transform(normalizeCurrency) @IsString() @Matches(/^[A-Z]{3}$/) currency?: string;
  @IsOptional() @IsBoolean() isActive?: boolean;
  @IsOptional() @Type(() => Number) @IsInt() @Min(0) position?: number;
}

export class UpdateTelegramAdPolicyDto {
  @IsOptional() @IsString() timezone?: string;
  @IsOptional() @IsBoolean() autoFrequencyEnabled?: boolean;
  @IsOptional() @Type(() => Number) @IsNumber() @Min(0) expectedOrganicPostsPerDay?: number | null;
  @IsOptional() @IsBoolean() useWorkspaceDefault?: boolean;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) organicPostsPerAdSlot?: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(0) maxAdsPerDay?: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(0) minHoursBetweenAds?: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(0) minDaysBetweenAds?: number;
  @IsOptional() @IsEnum(TelegramAdSlotStrategy) slotStrategy?: TelegramAdSlotStrategy;
  @IsOptional()
  @IsArray()
  @Matches(/^([01]\d|2[0-3]):[0-5]\d$/, { each: true })
  fallbackSlotTimes?: string[];
  @IsOptional() @IsBoolean() allowManualSlots?: boolean;
}

export class UpdateTelegramAdSalesWorkspaceSettingsDto {
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) defaultOrganicPostsPerAdSlot?: number;
}

export class UpdateTelegramAdChannelPricingDto {
  @IsOptional() @Type(() => Number) @IsNumber() @Min(0) baseCpm?: number | null;
  @IsOptional() @Transform(normalizeCurrency) @IsString() @Matches(/^[A-Z]{3}$/) currency?: string;
}

export class UpdateTelegramAdSalesMemberPreferencesDto {
  @IsOptional() @IsArray() @ArrayMaxSize(50) @IsString({ each: true }) selectedChannelIds?: string[];
  @IsOptional() @ValidateIf((_, value) => value !== null) @IsString() selectedNetworkId?: string | null;
  @IsOptional() @IsIn(['week', 'month', 'list']) calendarView?: string;
  @IsOptional() @IsBoolean() initialized?: boolean;
}

export class RecommendTelegramAdPolicyDto {
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(90) statisticsWindowDays?: number;
}

export class CreateTelegramAdQuoteDto {
  @IsString() telegramChannelId!: string;
  @IsOptional() @IsString() telegramAdProductId?: string | null;
  @IsOptional() @Type(() => Number) @IsNumber() @Min(0) targetCpm?: number | null;
  @IsOptional() @Type(() => Number) @IsNumber() @Min(0) minimumCpm?: number | null;
  @IsOptional() @Type(() => Number) @IsNumber() @Min(0) fixedPrice?: number | null;
  @IsOptional() @IsEnum(TelegramAdPricingMode) pricingMode?: TelegramAdPricingMode;
  @IsOptional() @Transform(normalizeCurrency) @IsString() @Matches(/^[A-Z]{3}$/) currency?: string;
  @IsOptional() @IsString() source?: string;
  @IsOptional() @IsDateString() scheduledAt?: string;
}

export class TelegramAdPriceHistoryQueryDto {
  @IsOptional() @IsString() telegramAdProductId?: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(200) limit?: number;
}

export class TelegramAdAvailabilityQueryDto {
  @IsDateString() from!: string;
  @IsDateString() to!: string;
  @IsOptional() @IsArray() @ArrayMaxSize(50) @IsString({ each: true }) channelIds?: string[];
  @IsOptional() @IsString() networkId?: string;
  @IsOptional() @IsArray() @IsString({ each: true }) productIds?: string[];
  /** A one-off client nonce used only by the explicit Refresh action. */
  @IsOptional() @IsString() cacheBust?: string;
}

export class TelegramAdSalesQueryDto extends PaginationQueryDto {
  @IsOptional() @IsEnum(TelegramAdSaleStatus) status?: TelegramAdSaleStatus;
}

export class TelegramAdvertisersQueryDto extends PaginationQueryDto {
  @IsOptional() @IsString() search?: string;
  @IsOptional() @IsEnum(TelegramAdvertiserStatus) status?: TelegramAdvertiserStatus;
  @IsOptional() @IsEnum(TelegramAdvertiserLifecycleStage) lifecycleStage?: TelegramAdvertiserLifecycleStage;
  @IsOptional() @IsString() ownerMemberId?: string;
  @IsOptional() @IsBoolean() archived?: boolean;
}

export class TelegramAdvertiserSearchDto {
  @IsString() q!: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(20) limit?: number;
}

export class CreateTelegramAdvertiserDto {
  @IsString() displayName!: string;
  @IsOptional() @IsString() companyName?: string | null;
  @IsOptional() @IsString() telegramUsername?: string | null;
  @IsOptional() @IsString() telegramUserId?: string | null;
  @IsOptional() @IsString() phone?: string | null;
  @IsOptional() @IsString() email?: string | null;
  @IsOptional() @IsString() website?: string | null;
  @IsOptional() @IsString() description?: string | null;
  @IsOptional() @IsString() source?: string | null;
  @IsOptional() @IsEnum(TelegramAdvertiserStatus) status?: TelegramAdvertiserStatus;
  @IsOptional() @IsEnum(TelegramAdvertiserLifecycleStage) lifecycleStage?: TelegramAdvertiserLifecycleStage;
  @IsOptional() @IsString() ownerMemberId?: string | null;
  @IsOptional() @ValidateIf((_, value) => value !== null && value !== undefined) @IsDateString() nextContactAt?: string | null;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(365) defaultFollowUpDays?: number | null;
  @IsOptional() @Transform(normalizeCurrency) @IsString() @Matches(/^[A-Z]{3}$/) preferredCurrency?: string | null;
  @IsOptional() @IsEnum(TelegramAdvertiserContactType) preferredContactMethod?: TelegramAdvertiserContactType | null;
}

export class UpdateTelegramAdvertiserDto {
  @IsOptional() @IsString() displayName?: string;
  @IsOptional() @IsString() companyName?: string | null;
  @IsOptional() @IsString() telegramUsername?: string | null;
  @IsOptional() @IsString() telegramUserId?: string | null;
  @IsOptional() @IsString() phone?: string | null;
  @IsOptional() @IsString() email?: string | null;
  @IsOptional() @IsString() website?: string | null;
  @IsOptional() @IsString() description?: string | null;
  @IsOptional() @IsString() source?: string | null;
  @IsOptional() @IsEnum(TelegramAdvertiserStatus) status?: TelegramAdvertiserStatus;
  @IsOptional() @IsEnum(TelegramAdvertiserLifecycleStage) lifecycleStage?: TelegramAdvertiserLifecycleStage;
  @IsOptional() @IsString() ownerMemberId?: string | null;
  @IsOptional() @ValidateIf((_, value) => value !== null && value !== undefined) @IsDateString() nextContactAt?: string | null;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(365) defaultFollowUpDays?: number | null;
  @IsOptional() @Transform(normalizeCurrency) @IsString() @Matches(/^[A-Z]{3}$/) preferredCurrency?: string | null;
  @IsOptional() @IsEnum(TelegramAdvertiserContactType) preferredContactMethod?: TelegramAdvertiserContactType | null;
}

export class CreateTelegramAdvertiserContactDto {
  @IsEnum(TelegramAdvertiserContactType) type!: TelegramAdvertiserContactType;
  @IsString() value!: string;
  @IsOptional() @IsString() label?: string | null;
  @IsOptional() @IsBoolean() isPrimary?: boolean;
  @IsOptional() @IsBoolean() isVerified?: boolean;
}

export class UpdateTelegramAdvertiserContactDto {
  @IsOptional() @IsEnum(TelegramAdvertiserContactType) type?: TelegramAdvertiserContactType;
  @IsOptional() @IsString() value?: string;
  @IsOptional() @IsString() label?: string | null;
  @IsOptional() @IsBoolean() isPrimary?: boolean;
  @IsOptional() @IsBoolean() isVerified?: boolean;
}

export class TelegramAdvertiserActivitiesQueryDto extends PaginationQueryDto {}

export class CreateTelegramAdvertiserActivityDto {
  @IsEnum(TelegramAdvertiserActivityType) type!: TelegramAdvertiserActivityType;
  @IsString() title!: string;
  @IsOptional() @IsString() description?: string | null;
  @IsOptional() metadata?: Record<string, unknown> | null;
  @IsOptional() @ValidateIf((_, value) => value !== null && value !== undefined) @IsDateString() occurredAt?: string | null;
}

export class CreateTelegramAdvertiserTaskDto {
  @IsEnum(TelegramAdvertiserTaskType) type!: TelegramAdvertiserTaskType;
  @IsOptional() @IsString() saleId?: string | null;
  @IsOptional() @IsString() placementId?: string | null;
  @IsString() assignedMemberId!: string;
  @IsOptional() @IsEnum(TelegramAdvertiserTaskPriority) priority?: TelegramAdvertiserTaskPriority;
  @IsString() title!: string;
  @IsOptional() @IsString() description?: string | null;
  @IsDateString() dueAt!: string;
  @IsOptional() @ValidateIf((_, value) => value !== null && value !== undefined) @IsDateString() remindAt?: string | null;
  @IsOptional() metadata?: Record<string, unknown> | null;
}

export class TelegramAdvertiserTasksQueryDto extends PaginationQueryDto {
  @IsOptional() @IsString() advertiserId?: string;
  @IsOptional() @IsString() assignedMemberId?: string;
  @IsOptional() @IsEnum(TelegramAdvertiserTaskStatus) status?: TelegramAdvertiserTaskStatus;
  @IsOptional() @IsEnum(TelegramAdvertiserTaskType) type?: TelegramAdvertiserTaskType;
}

export class UpdateTelegramAdvertiserTaskDto {
  @IsOptional() @IsString() assignedMemberId?: string;
  @IsOptional() @IsEnum(TelegramAdvertiserTaskStatus) status?: TelegramAdvertiserTaskStatus;
  @IsOptional() @IsEnum(TelegramAdvertiserTaskPriority) priority?: TelegramAdvertiserTaskPriority;
  @IsOptional() @IsString() title?: string;
  @IsOptional() @IsString() description?: string | null;
  @IsOptional() @ValidateIf((_, value) => value !== null && value !== undefined) @IsDateString() dueAt?: string | null;
  @IsOptional() @ValidateIf((_, value) => value !== null && value !== undefined) @IsDateString() remindAt?: string | null;
  @IsOptional() @ValidateIf((_, value) => value !== null && value !== undefined) @IsDateString() snoozedUntil?: string | null;
}

export class CompleteTelegramAdvertiserTaskDto {
  @IsOptional() @IsString() completionNote?: string | null;
}

export class SkipTelegramAdvertiserTaskDto {
  @IsOptional() @IsString() reason?: string | null;
}

export class TelegramAdCrmWorkspaceSettingsDto {
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(365) defaultFollowUpDays?: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(365) defaultReactivationDays?: number;
  @IsOptional() @IsEnum(TelegramAdCrmOwnerMode) defaultSaleOwnerAssignment?: TelegramAdCrmOwnerMode;
  @IsOptional() @IsBoolean() autoCreateAdvertiserFromSale?: boolean;
  @IsOptional() @IsBoolean() requireAdvertiserForConfirmedSale?: boolean;
  @IsOptional() @IsBoolean() duplicateDetectionEnabled?: boolean;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(365) inactivityThresholdDays?: number;
  @IsOptional() @Type(() => Number) @IsNumber() @Min(0) highValueCustomerThreshold?: number;
}

export class TelegramAdCrmMemberSettingsDto {
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(365) defaultFollowUpDays?: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(365) defaultReactivationDays?: number;
  @IsOptional() @IsBoolean() autoCreateFollowUpAfterPlacement?: boolean;
  @IsOptional() @IsBoolean() autoCreateFeedbackTask?: boolean;
  @IsOptional() @IsBoolean() autoCreatePaymentFollowUp?: boolean;
  @IsOptional() @IsBoolean() dailyDigestEnabled?: boolean;
  @IsOptional() @IsBoolean() overdueDigestEnabled?: boolean;
  @IsOptional() @IsBoolean() reminderNotificationsEnabled?: boolean;
  @IsOptional() @IsString() preferredReminderTime?: string | null;
  @IsOptional() @IsString() timezone?: string;
  @IsOptional() @IsEnum(TelegramAdvertiserTaskPriority) defaultTaskPriority?: TelegramAdvertiserTaskPriority;
  @IsOptional() @IsEnum(TelegramAdCrmOwnerMode) defaultAdvertiserOwnerMode?: TelegramAdCrmOwnerMode;
}

export class TelegramAdAnalyticsQueryDto {
  @IsOptional()
  @Transform(({ value, obj }: { value: unknown; obj?: Record<string, unknown> }) =>
    typeof value === 'string'
      ? value
      : typeof obj?.from === 'string'
        ? obj.from
        : value,
  )
  @IsDateString()
  dateFrom?: string;
  @IsOptional()
  @Transform(({ value, obj }: { value: unknown; obj?: Record<string, unknown> }) =>
    typeof value === 'string'
      ? value
      : typeof obj?.to === 'string'
        ? obj.to
        : value,
  )
  @IsDateString()
  dateTo?: string;
  @IsOptional() @IsString() timezone?: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(366) rangeDays?: number;
  @IsOptional() @IsIn(['PREVIOUS_PERIOD', 'PREVIOUS_30_DAYS', 'PREVIOUS_MONTH', 'CUSTOM', 'NONE']) compareMode?: 'PREVIOUS_PERIOD' | 'PREVIOUS_30_DAYS' | 'PREVIOUS_MONTH' | 'CUSTOM' | 'NONE';
  @IsOptional() @IsDateString() compareDateFrom?: string;
  @IsOptional() @IsDateString() compareDateTo?: string;
  @IsOptional() @IsIn(['day', 'week', 'month']) granularity?: 'day' | 'week' | 'month';
}

export class TelegramAdAnalyticsSeriesQueryDto extends TelegramAdAnalyticsQueryDto {
  @IsOptional() @IsString() channelId?: string;
  @IsOptional() @IsString() networkId?: string;
  @IsOptional() @IsString() telegramAdProductId?: string;
}

export class TelegramAdNetworkAnalyticsQueryDto extends TelegramAdAnalyticsQueryDto {
  @IsOptional() @IsIn(['SALE_CONTEXT', 'CURRENT_CHANNELS']) mode?: 'SALE_CONTEXT' | 'CURRENT_CHANNELS';
}

export class TelegramAdAlertsQueryDto extends TelegramAdAnalyticsQueryDto {
  @IsOptional()
  @IsArray()
  @IsIn(['OVERDUE_PAYMENT', 'MISSED_PLACEMENT', 'DELETION_FAILURE', 'UNDERPRICED_PLACEMENT', 'UNUSED_INVENTORY'], {
    each: true,
  })
  kinds?: Array<
    | 'OVERDUE_PAYMENT'
    | 'MISSED_PLACEMENT'
    | 'DELETION_FAILURE'
    | 'UNDERPRICED_PLACEMENT'
    | 'UNUSED_INVENTORY'
  >;
}

export class TelegramAdInventoryRebuildDto {
  @IsOptional() @IsArray() @ArrayMaxSize(50) @IsString({ each: true }) channelIds?: string[];
  @IsOptional() @IsString() networkId?: string;
  @IsDateString() dateFrom!: string;
  @IsDateString() dateTo!: string;
  @IsBoolean() force!: boolean;
  @IsBoolean() dryRun!: boolean;
}

export class TelegramAdPriceFillCorrelationQueryDto extends TelegramAdAnalyticsQueryDto {
  @IsOptional() @IsString() channelId?: string;
  @IsOptional() @IsString() networkId?: string;
  @IsOptional() @IsIn(['SALE_CONTEXT', 'CURRENT_CHANNELS']) networkMode?: 'SALE_CONTEXT' | 'CURRENT_CHANNELS';
  @IsOptional() @IsIn(['DAY', 'WEEK', 'MONTH']) bucket?: 'DAY' | 'WEEK' | 'MONTH';
}

export class TelegramAdRevenueScenarioDto {
  @IsOptional() @IsString() channelId?: string;
  @IsOptional() @IsString() networkId?: string;
  @IsDateString() dateFrom!: string;
  @IsDateString() dateTo!: string;
  @IsOptional() @Type(() => Number) @IsNumber() proposedPriceChangePercent?: number;
  @IsOptional() @Type(() => Number) @IsNumber() @Min(0) proposedFixedPrice?: number;
  @IsOptional() @Type(() => Number) @IsNumber() @Min(0) assumedFillRate?: number;
  @IsOptional() @IsBoolean() useHistoricalElasticity?: boolean;
  @IsOptional() @IsIn(['SALE_CONTEXT', 'CURRENT_CHANNELS']) networkMode?: 'SALE_CONTEXT' | 'CURRENT_CHANNELS';
}

export class TelegramAdInventoryDetailsQueryDto extends PaginationQueryDto {
  @IsOptional() @IsString() channelId?: string;
  @IsOptional() @IsString() networkId?: string;
  @IsOptional() @IsDateString() dateFrom?: string;
  @IsOptional() @IsDateString() dateTo?: string;
}

export class CreateTelegramAdSaleDto {
  @IsOptional() @IsString() advertiserId?: string | null;
  @IsString() advertiserName!: string;
  @IsOptional() @IsString() advertiserTelegram?: string | null;
  @IsOptional() @IsString() advertiserContact?: string | null;
  @IsOptional() @IsString() advertiserCompanyName?: string | null;
  @IsOptional() @IsString() title?: string | null;
  @IsOptional() @IsString() notes?: string | null;
  @Transform(normalizeCurrency) @IsString() @Matches(/^[A-Z]{3}$/) settlementCurrency!: string;
  @IsOptional() @IsString() assignedMemberId?: string | null;
  @IsOptional() @ValidateIf((_, value) => value !== null && value !== undefined) @IsDateString() reservedUntil?: string | null;
  @IsOptional() @IsEnum(TelegramAdCrmDealStage) crmDealStage?: TelegramAdCrmDealStage;
  @IsOptional() @ValidateIf((_, value) => value !== null && value !== undefined) @IsDateString() expectedCloseAt?: string | null;
  @IsOptional() @IsString() lostReason?: string | null;
  @IsOptional() @ValidateIf((_, value) => value !== null && value !== undefined) @IsDateString() nextActionAt?: string | null;
  @IsOptional() @IsBoolean() createAdvertiser?: boolean;
  @IsOptional() @IsString() sourceTaskId?: string | null;
  @IsOptional() @IsString() sourceAdvertiserActivityId?: string | null;
}

export class UpdateTelegramAdSaleDto {
  @IsOptional() @IsString() advertiserId?: string | null;
  @IsOptional() @IsString() advertiserName?: string;
  @IsOptional() @IsString() advertiserTelegram?: string | null;
  @IsOptional() @IsString() advertiserContact?: string | null;
  @IsOptional() @IsString() advertiserCompanyName?: string | null;
  @IsOptional() @IsString() title?: string | null;
  @IsOptional() @IsString() notes?: string | null;
  @IsOptional() @Transform(normalizeCurrency) @IsString() @Matches(/^[A-Z]{3}$/) settlementCurrency?: string;
  @IsOptional() @IsString() assignedMemberId?: string | null;
  @IsOptional() @ValidateIf((_, value) => value !== null && value !== undefined) @IsDateString() reservedUntil?: string | null;
  @IsOptional() @IsEnum(TelegramAdSaleStatus) status?: TelegramAdSaleStatus;
  @IsOptional() @IsEnum(TelegramAdCrmDealStage) crmDealStage?: TelegramAdCrmDealStage;
  @IsOptional() @ValidateIf((_, value) => value !== null && value !== undefined) @IsDateString() expectedCloseAt?: string | null;
  @IsOptional() @IsString() lostReason?: string | null;
  @IsOptional() @ValidateIf((_, value) => value !== null && value !== undefined) @IsDateString() nextActionAt?: string | null;
  @IsOptional() @IsString() sourceTaskId?: string | null;
  @IsOptional() @IsString() sourceAdvertiserActivityId?: string | null;
}

export class CreateTelegramAdSalePlacementDto {
  @IsString() telegramChannelId!: string;
  @IsOptional() @IsString() telegramChannelNetworkId?: string | null;
  @IsOptional() @IsString() telegramAdProductId?: string | null;
  @IsOptional() @IsString() inventoryOpportunityKey?: string | null;
  @IsOptional() @IsString() pricingSnapshotId?: string | null;
  @IsDateString() scheduledAt!: string;
  @IsString() timezone!: string;
  @IsOptional() @IsEnum(TelegramAdPricingMode) pricingMode?: TelegramAdPricingMode;
  @IsOptional() @Type(() => Number) @IsNumber() @Min(0) quotedCpm?: number | null;
  @IsOptional() @Type(() => Number) @IsNumber() @Min(0) agreedPrice?: number | null;
  @IsOptional() @Type(() => Number) @IsNumber() @Min(0) expectedViews?: number | null;
  @IsOptional() @Type(() => Number) @IsNumber() @Min(0) recommendedPrice?: number | null;
  @IsOptional() @Type(() => Number) @IsNumber() @Min(0) minimumPrice?: number | null;
  @IsOptional() @Transform(normalizeCurrency) @IsString() @Matches(/^[A-Z]{3}$/) currency?: string;
  @IsOptional() @IsString() manualPriceReason?: string | null;
}

export class UpdateTelegramAdSalePlacementDto {
  @IsOptional() @IsDateString() scheduledAt?: string;
  @IsOptional() @IsString() timezone?: string;
  @IsOptional() @IsEnum(TelegramAdPricingMode) pricingMode?: TelegramAdPricingMode;
  @IsOptional() @Type(() => Number) @IsNumber() @Min(0) agreedPrice?: number;
  @IsOptional() @Type(() => Number) @IsNumber() @Min(0) expectedViews?: number;
  @IsOptional() @Type(() => Number) @IsNumber() @Min(0) recommendedPrice?: number;
  @IsOptional() @Type(() => Number) @IsNumber() @Min(0) minimumPrice?: number;
  @IsOptional() @Type(() => Number) @IsNumber() @Min(0) quotedCpm?: number | null;
  @IsOptional() @Transform(normalizeCurrency) @IsString() @Matches(/^[A-Z]{3}$/) currency?: string;
  @IsOptional() @IsString() manualPriceReason?: string | null;
  @IsOptional() @IsString() managedPostId?: string | null;
  @IsOptional() @IsString() telegramPostId?: string | null;
}

export class CreateTelegramAdSalePaymentAllocationDto {
  @IsString() placementId!: string;
  @Type(() => Number) @IsNumber() @Min(0) amount!: number;
}

export class CreateTelegramAdSalePaymentDto {
  @IsString() accountId!: string;
  @Type(() => Number) @IsNumber() @Min(0) amount!: number;
  @Transform(normalizeCurrency) @IsString() @Matches(/^[A-Z]{3}$/) currency!: string;
  @IsDateString() paidAt!: string;
  @IsOptional() @IsString() notes?: string | null;
  @IsOptional() @IsString() idempotencyKey?: string | null;
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CreateTelegramAdSalePaymentAllocationDto)
  allocations!: CreateTelegramAdSalePaymentAllocationDto[];
}

export class UpdateTelegramAdSalePaymentDto {
  @IsOptional() @IsString() accountId?: string;
  @IsOptional() @Type(() => Number) @IsNumber() @Min(0) amount?: number;
  @IsOptional() @Transform(normalizeCurrency) @IsString() @Matches(/^[A-Z]{3}$/) currency?: string;
  @IsOptional() @IsDateString() paidAt?: string;
  @IsOptional() @IsString() notes?: string | null;
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CreateTelegramAdSalePaymentAllocationDto)
  allocations?: CreateTelegramAdSalePaymentAllocationDto[];
}

export class VoidTelegramAdSalePaymentDto {
  @IsString() reason!: string;
}

export class CreatePlacementManagedPostDto {
  @IsOptional() @IsString() title?: string;
  @IsOptional() @IsString() text?: string | null;
  @IsOptional() @IsArray() @IsString({ each: true }) imageUrls?: string[];
  @IsOptional() @IsString() assignedMemberId?: string | null;
  @IsOptional() @IsString() icon?: string | null;
}

export class AttachPlacementManagedPostDto {
  @IsOptional() @IsString() managedPostId?: string;
  @IsOptional() @IsString() telegramPostId?: string;
}

export class SchedulePlacementDto {
  @IsOptional() @IsDateString() scheduledAt?: string;
  @IsOptional()
  @IsIn(['IMAGES_THEN_TEXT', 'CAPTION_THEN_TEXT'])
  longTextMode?: 'IMAGES_THEN_TEXT' | 'CAPTION_THEN_TEXT';
}

export class ScheduleSaleDto {
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ScheduleSalePlacementItemDto)
  placements?: ScheduleSalePlacementItemDto[];
}

export class ScheduleSalePlacementItemDto {
  @IsString() placementId!: string;
  @IsOptional() @IsDateString() scheduledAt?: string;
  @IsOptional()
  @IsIn(['IMAGES_THEN_TEXT', 'CAPTION_THEN_TEXT'])
  longTextMode?: 'IMAGES_THEN_TEXT' | 'CAPTION_THEN_TEXT';
}

export class PublishPlacementDto {
  @IsOptional()
  @IsIn(['IMAGES_THEN_TEXT', 'CAPTION_THEN_TEXT'])
  longTextMode?: 'IMAGES_THEN_TEXT' | 'CAPTION_THEN_TEXT';
}

export class ReschedulePlacementDto {
  @IsDateString() scheduledAt!: string;
  @IsOptional()
  @IsIn(['IMAGES_THEN_TEXT', 'CAPTION_THEN_TEXT'])
  longTextMode?: 'IMAGES_THEN_TEXT' | 'CAPTION_THEN_TEXT';
}

export class CancelPlacementDto {
  @IsOptional() @IsString() reason?: string | null;
}

export class RetryPlacementDeletionDto {
  @IsOptional() @IsString() reason?: string | null;
}

export class CompletePermanentPlacementDto {
  @IsOptional() @IsString() reason?: string | null;
}

export class ReserveTelegramAdSaleDto {
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ReserveTelegramAdSalePlacementDto)
  placements?: ReserveTelegramAdSalePlacementDto[];
}

export class TelegramAdSalesBulkAdvertiserDto {
  @IsOptional() @IsString() advertiserId?: string | null;
  @IsString() advertiserName!: string;
  @IsOptional() @IsString() advertiserTelegram?: string | null;
  @IsOptional() @IsString() advertiserContact?: string | null;
  @IsOptional() @IsString() advertiserCompanyName?: string | null;
  @IsOptional() @IsBoolean() createAdvertiser?: boolean;
}

export class TelegramAdSalesBulkTargetDto {
  @IsIn(['CHANNEL', 'NETWORK']) type!: 'CHANNEL' | 'NETWORK';
  @ValidateIf((target) => target.type === 'CHANNEL')
  @IsString()
  channelId?: string;
  @ValidateIf((target) => target.type === 'NETWORK')
  @IsString()
  networkId?: string;
}

export class TelegramAdSalesBulkDefaultsDto extends TelegramAdSalesBulkAdvertiserDto {
  @Type(() => Number) @IsNumber() @Min(0) agreedPrice!: number;
  @Matches(/^([01]\d|2[0-3]):[0-5]\d$/) time!: string;
  @IsString() timezone!: string;
  @IsOptional() @IsString() productId?: string | null;
  @IsOptional() @IsEnum(TelegramAdPricingMode) pricingMode?: TelegramAdPricingMode;
  @IsOptional() @Type(() => Number) @IsInt() @Min(0) expectedViews?: number | null;
  @IsOptional() @Type(() => Number) @IsNumber() @Min(0) recommendedPrice?: number | null;
  @IsOptional() @Type(() => Number) @IsNumber() @Min(0) minimumPrice?: number | null;
  @IsOptional() @IsString() manualPriceReason?: string | null;
  @Transform(normalizeCurrency) @IsString() @Matches(/^[A-Z]{3}$/) settlementCurrency!: string;
  @IsOptional() @IsString() assignedMemberId?: string | null;
}

export class TelegramAdSalesBulkChannelOverrideDto {
  @IsString() channelId!: string;
  @IsOptional() @IsString() telegramPostId?: string | null;
  @IsOptional() @IsString() productId?: string | null;
  @IsOptional() @ValidateIf((_, value) => value !== null) @Matches(/^([01]\d|2[0-3]):[0-5]\d$/) time?: string | null;
  @IsOptional() @IsEnum(TelegramAdPricingMode) pricingMode?: TelegramAdPricingMode;
  @IsOptional() @Type(() => Number) @IsInt() @Min(0) expectedViews?: number | null;
  @IsOptional() @Type(() => Number) @IsNumber() @Min(0) recommendedPrice?: number | null;
  @IsOptional() @Type(() => Number) @IsNumber() @Min(0) minimumPrice?: number | null;
  @IsOptional() @IsString() manualPriceReason?: string | null;
}

export class TelegramAdSalesBulkRowDto {
  @IsString() clientRowId!: string;
  @Matches(/^\d{4}-\d{2}-\d{2}$/) date!: string;
  @IsOptional()
  @ValidateNested()
  @Type(() => TelegramAdSalesBulkAdvertiserDto)
  advertiserOverride?: TelegramAdSalesBulkAdvertiserDto | null;
  @IsOptional() @Type(() => Number) @IsNumber() @Min(0) agreedPriceOverride?: number | null;
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(500)
  @ValidateNested({ each: true })
  @Type(() => TelegramAdSalesBulkChannelOverrideDto)
  channelOverrides?: TelegramAdSalesBulkChannelOverrideDto[];
}

export class TelegramAdSalesBulkCreateDto {
  @IsDefined()
  @ValidateNested()
  @Type(() => TelegramAdSalesBulkTargetDto)
  target!: TelegramAdSalesBulkTargetDto;

  @IsDefined()
  @ValidateNested()
  @Type(() => TelegramAdSalesBulkDefaultsDto)
  defaults!: TelegramAdSalesBulkDefaultsDto;

  @IsDefined()
  @IsArray()
  @ArrayMaxSize(400)
  @ValidateNested({ each: true })
  @Type(() => TelegramAdSalesBulkRowDto)
  rows!: TelegramAdSalesBulkRowDto[];
}

export class ReserveTelegramAdSalePlacementDto {
  @IsString() placementId!: string;
  @IsOptional() @ValidateIf((_, value) => value !== null && value !== undefined) @IsDateString() scheduledAt?: string;
}
