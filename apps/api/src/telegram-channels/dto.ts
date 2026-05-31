import { Type } from 'class-transformer';
import { IsBoolean, IsInt, IsISO8601, IsOptional, IsString } from 'class-validator';

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
