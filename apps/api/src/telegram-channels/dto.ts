import { Type } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsInt,
  IsISO8601,
  IsOptional,
  IsString,
  ValidateNested,
} from 'class-validator';

export class CreateTelegramChannelDto {
  @IsString() title!: string;
  @IsOptional() @IsString() username?: string;
  @IsOptional() @IsString() telegramChatId?: string;
  @IsOptional() @IsString() telegramBotIntegrationId?: string;
  @IsOptional() @IsString() description?: string;
  @IsOptional() @Type(() => Number) @IsInt() currentSubscribersCount?: number;
}

export class UpdateTelegramChannelDto {
  @IsOptional() @IsString() title?: string;
  @IsOptional() @IsString() username?: string;
  @IsOptional() @IsString() telegramChatId?: string;
  @IsOptional() @IsString() telegramBotIntegrationId?: string;
  @IsOptional() @IsString() description?: string;
  @IsOptional() @Type(() => Number) @IsInt() currentSubscribersCount?: number;
}

export class CheckBotAccessDto {
  @IsOptional() @IsString() telegramBotIntegrationId?: string;
}

export class CreateInviteLinkDto {
  @IsString() name!: string;
  @IsOptional() @IsString() adCampaignId?: string;
  @IsOptional() @IsISO8601() expireDate?: string;
  @IsOptional() @Type(() => Number) @IsInt() memberLimit?: number;
  @IsOptional() @IsBoolean() createsJoinRequest?: boolean;
}

export class UpdateInviteLinkDto {
  @IsOptional() @IsString() name?: string;
  @IsOptional() @IsISO8601() expireDate?: string;
  @IsOptional() @Type(() => Number) @IsInt() memberLimit?: number;
  @IsOptional() @IsBoolean() createsJoinRequest?: boolean;
}

export class HistoricalInviteLinkMetricDto {
  @IsString() url!: string;
  @IsOptional() @IsString() name?: string;
  @IsOptional() @Type(() => Number) @IsInt() joinedCount?: number;
  @IsOptional() @IsBoolean() isRevoked?: boolean;
}

export class HistoricalSyncDto {
  @IsOptional() @IsString() telegramUserAccountId?: string;
  @IsOptional() @IsBoolean() syncInviteLinks?: boolean;
  @IsOptional() @IsBoolean() syncPosts?: boolean;
  @IsOptional() @Type(() => Number) @IsInt() postLimit?: number;
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => HistoricalInviteLinkMetricDto)
  inviteLinks?: HistoricalInviteLinkMetricDto[];
}

export class DeepSyncDto {
  @IsOptional() @IsString() telegramUserAccountId?: string;
  @IsOptional() @Type(() => Number) @IsInt() postLimit?: number;
}

export class SyncPostsMetricsDto {
  @IsOptional() @IsString() telegramUserAccountId?: string;
  @IsOptional() @Type(() => Number) @IsInt() postLimit?: number;
}

export class AttachCampaignDto {
  @IsString() adCampaignId!: string;
}
