import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsIn,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Min,
} from 'class-validator';

export class CreateTelegramChannelDto {
  @IsOptional() @IsString() assignedMemberId?: string | null;
  @IsString() title!: string;
  @IsOptional() @IsString() username?: string;
  @IsOptional() @IsString() telegramChatId?: string;
  @IsOptional() @IsString() description?: string;
  @IsOptional() @Type(() => Number) @IsInt() currentSubscribersCount?: number;
}

export class UpdateTelegramChannelDto {
  @IsOptional() @IsString() assignedMemberId?: string | null;
  @IsOptional() @IsString() title?: string;
  @IsOptional() @IsString() username?: string;
  @IsOptional() @IsString() telegramChatId?: string;
  @IsOptional() @IsString() description?: string;
  @IsOptional() @Type(() => Number) @IsInt() currentSubscribersCount?: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(0) seedSubscribersCount?: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) activeSubscribersWindow?: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(0) ownViewsPerPost?: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(0) ownReactionsPerPost?: number;
  @IsOptional() @Type(() => Number) @IsNumber() @Min(0) targetCpaFrom?: number;
  @IsOptional() @Type(() => Number) @IsNumber() @Min(0) targetCpa?: number;
  @IsOptional() @Type(() => Number) @IsNumber() @Min(0) acceptableCpaFrom?: number;
  @IsOptional() @Type(() => Number) @IsNumber() @Min(0) acceptableCpa?: number;
  @IsOptional() @Type(() => Number) @IsNumber() @Min(0) stopCpaFrom?: number;
  @IsOptional() @Type(() => Number) @IsNumber() @Min(0) stopCpa?: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(0) knownFakeSubscribersCount?: number;
  @IsOptional() @IsIn(['normal', 'suspicious', 'polluted', 'invalid']) subscriberBaseQuality?: string;
  @IsOptional() @IsString() dataQualityNotes?: string | null;
}

export class ImportTelegramChannelDto {
  @IsString() input!: string;
}

export class HistoricalSyncDto {
  @IsOptional() @IsString() telegramUserAccountId?: string;
  @IsOptional() @IsBoolean() syncInviteLinks?: boolean;
  @IsOptional() @IsBoolean() syncPosts?: boolean;
  @IsOptional() @Type(() => Number) @IsInt() postLimit?: number;
}

export class DeepSyncDto {
  @IsOptional() @IsString() telegramUserAccountId?: string;
  @IsOptional() @Type(() => Number) @IsInt() postLimit?: number;
}

export class SyncPostsMetricsDto {
  @IsOptional() @IsString() telegramUserAccountId?: string;
  @IsOptional() @Type(() => Number) @IsInt() postLimit?: number;
}

export class SyncChannelStatsDto {
  @IsOptional() @IsString() telegramUserAccountId?: string;
}

export class AttachCampaignDto {
  @IsString() adCampaignId!: string;
}

export class UpdateTelegramPostManualMetricsDto {
  @IsOptional() @Type(() => Number) @IsInt() @Min(0) manualOwnViews?: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(0) manualOwnReactions?: number;
  @IsOptional() @IsBoolean() excludeFromAnalytics?: boolean;
}
