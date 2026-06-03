import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsInt,
  IsOptional,
  IsString,
} from 'class-validator';

export class CreateTelegramChannelDto {
  @IsString() title!: string;
  @IsOptional() @IsString() username?: string;
  @IsOptional() @IsString() telegramChatId?: string;
  @IsOptional() @IsString() description?: string;
  @IsOptional() @Type(() => Number) @IsInt() currentSubscribersCount?: number;
}

export class UpdateTelegramChannelDto {
  @IsOptional() @IsString() title?: string;
  @IsOptional() @IsString() username?: string;
  @IsOptional() @IsString() telegramChatId?: string;
  @IsOptional() @IsString() description?: string;
  @IsOptional() @Type(() => Number) @IsInt() currentSubscribersCount?: number;
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
