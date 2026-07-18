import { Type } from 'class-transformer';
import { TelegramChannelAdAnalysisStatus } from '@prisma/client';
import {
  IsArray,
  IsBoolean,
  IsDateString,
  IsIn,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  IsUrl,
  Matches,
  Max,
  Min,
  ValidateNested,
} from 'class-validator';

export class CreateTelegramChannelDto {
  @IsOptional() @IsString() assignedMemberId?: string | null;
  @IsString() title!: string;
  @IsOptional() @IsString() username?: string;
  @IsOptional() @IsString() telegramChatId?: string;
  @IsOptional() @IsString() description?: string;
  @IsOptional() @Type(() => Number) @IsInt() currentSubscribersCount?: number;
}

export class TelegramChannelTimePostDto {
  @IsOptional() @IsString() iconId?: string | null;
  @IsOptional() @IsString() title?: string;
  @Matches(/^([01]\d|2[0-3]):[0-5]\d$/) time!: string;
}

export class UpdateTelegramChannelDto {
  @IsOptional() @IsString() assignedMemberId?: string | null;
  @IsOptional() @IsString() title?: string;
  @IsOptional() @IsString() username?: string;
  @IsOptional() @IsString() telegramChatId?: string;
  @IsOptional() @IsString() description?: string;
  @IsOptional() @Type(() => Number) @IsInt() currentSubscribersCount?: number;
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  seedSubscribersCount?: number;
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  activeSubscribersWindow?: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(0) ownViewsPerPost?: number;
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  ownReactionsPerPost?: number;
  @IsOptional() @Type(() => Number) @IsNumber() @Min(0) targetCpaFrom?: number;
  @IsOptional() @Type(() => Number) @IsNumber() @Min(0) targetCpa?: number;
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  acceptableCpaFrom?: number;
  @IsOptional() @Type(() => Number) @IsNumber() @Min(0) acceptableCpa?: number;
  @IsOptional() @Type(() => Number) @IsNumber() @Min(0) stopCpaFrom?: number;
  @IsOptional() @Type(() => Number) @IsNumber() @Min(0) stopCpa?: number;
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  knownFakeSubscribersCount?: number;
  @IsOptional()
  @IsIn(['normal', 'suspicious', 'polluted', 'invalid'])
  subscriberBaseQuality?: string;
  @IsOptional() @IsString() dataQualityNotes?: string | null;
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => TelegramChannelTimePostDto)
  timePosts?: TelegramChannelTimePostDto[];
}

export class ImportTelegramChannelDto {
  @IsOptional() @IsString() input?: string;
  @IsOptional() @IsString() username?: string;
  @IsOptional() @IsString() telegramAccountId?: string;
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
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  manualOwnReactions?: number;
  @IsOptional() @IsBoolean() excludeFromAnalytics?: boolean;
}

export class CreateTelegramManagedPostDto {
  @IsString() title!: string;
  @IsOptional() @IsString() text?: string;
  @IsOptional() @IsArray() @IsString({ each: true }) imageUrls?: string[];
  @IsOptional() @IsString() assignedMemberId?: string;
  @IsOptional() @IsString() icon?: string | null;
}

export class UpdateTelegramManagedPostDto {
  @IsOptional() @IsString() title?: string;
  @IsOptional() @IsString() text?: string | null;
  @IsOptional() @IsArray() @IsString({ each: true }) imageUrls?: string[];
  @IsOptional() @IsString() assignedMemberId?: string;
  @IsOptional() @IsString() icon?: string | null;
}

export class ManagedPostLinkTargetsQueryDto {
  @IsOptional() @IsString() search?: string;
  @IsOptional() @IsString() groupId?: string;
  @IsOptional() @IsString() excludePostId?: string;
  @IsOptional() @IsIn(['edit', 'publishNow', 'schedule']) usage?: string;
  @IsOptional() @IsDateString() scheduledAt?: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(50) limit?: number;
}

export class SetManagedPostTelegramUrlDto {
  @IsString()
  telegramUrl!: string;
}

export class CreatePostGroupDto {
  @IsString() telegramChannelId!: string;
  @IsString() title!: string;
  @IsOptional() @IsString() description?: string | null;
  @IsOptional() @IsString() icon?: string | null;
  @IsOptional() @IsArray() @IsString({ each: true }) postIds?: string[];
}

export class UpdatePostGroupDto {
  @IsOptional() @IsString() title?: string;
  @IsOptional() @IsString() description?: string | null;
  @IsOptional() @IsString() icon?: string | null;
}

export class PostGroupsQueryDto {
  @IsOptional() @IsString() telegramChannelId?: string;
  @IsOptional() @IsString() search?: string;
}

export class PostIdsDto {
  @IsArray() @IsString({ each: true }) postIds!: string[];
}

export class ReorderPostGroupDto {
  @IsArray() @IsString({ each: true }) orderedPostIds!: string[];
}

export class ReorderManagedPostSidebarDto {
  @IsArray() @IsString({ each: true }) orderedItems!: string[];
}

export class MovePostChannelDto {
  @IsString() targetTelegramChannelId!: string;
}

export class PublishPostGroupDto {
  @IsOptional() @IsBoolean() includeScheduled?: boolean;
  @IsOptional() @IsBoolean() includeFailed?: boolean;
  @IsOptional() @IsBoolean() republishPublished?: boolean;
}

export class SchedulePostGroupSequenceDto {
  @IsDateString() startDate!: string;
  @Matches(/^([01]\d|2[0-3]):[0-5]\d$/) time!: string;
  @Type(() => Number) @IsInt() @Min(1) intervalDays!: number;
  @IsOptional() @IsString() timezone?: string;
  @IsOptional() @IsBoolean() includeDraftsOnly?: boolean;
  @IsOptional() @IsBoolean() overwriteExistingScheduled?: boolean;
  @IsOptional() @IsBoolean() includeFailed?: boolean;
}

export class ScheduleTelegramManagedPostDto {
  @IsDateString() scheduledAt!: string;
  @IsOptional()
  @IsIn(['IMAGES_THEN_TEXT', 'CAPTION_THEN_TEXT'])
  longTextMode?: string;
}

export class PublishTelegramManagedPostDto {
  @IsOptional()
  @IsIn(['IMAGES_THEN_TEXT', 'CAPTION_THEN_TEXT'])
  longTextMode?: string;
}

export class CreateTelegramChannelAdAnalysisDto {
  @IsOptional() @IsString() assignedMemberId?: string | null;
  @IsIn([
    TelegramChannelAdAnalysisStatus.APPROVED,
    TelegramChannelAdAnalysisStatus.REJECTED,
  ])
  status!: TelegramChannelAdAnalysisStatus;
  @IsDateString() analyzedAt!: string;
  @IsOptional() @IsString() verdict?: string;
  @IsOptional() @Type(() => Number) @IsNumber() @Min(0) price?: number;
  @IsOptional() @IsString() currency?: string;
  @IsOptional() @IsArray() @IsString({ each: true }) reasonTags?: string[];
  @IsOptional() @IsString() reasonSummary?: string;
  @IsOptional() @IsString() notes?: string;
  @IsOptional() @IsDateString() nextReviewAt?: string | Date;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) postLimit?: number;
}

export class UpdateTelegramChannelAdAnalysisDto {
  @IsOptional() @IsString() assignedMemberId?: string | null;
  @IsOptional()
  @IsIn([
    TelegramChannelAdAnalysisStatus.APPROVED,
    TelegramChannelAdAnalysisStatus.REJECTED,
  ])
  status?: TelegramChannelAdAnalysisStatus;
  @IsOptional() @IsDateString() analyzedAt?: string;
  @IsOptional() @IsString() verdict?: string;
  @IsOptional() @Type(() => Number) @IsNumber() @Min(0) price?: number;
  @IsOptional() @IsString() currency?: string;
  @IsOptional() @IsArray() @IsString({ each: true }) reasonTags?: string[];
  @IsOptional() @IsString() reasonSummary?: string;
  @IsOptional() @IsString() notes?: string;
  @IsOptional() @IsDateString() nextReviewAt?: string | Date;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) postLimit?: number;
}
