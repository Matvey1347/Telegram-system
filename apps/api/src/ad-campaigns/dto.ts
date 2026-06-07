import { Type } from 'class-transformer';
import { IsArray, IsOptional, IsString, IsNumber, Min } from 'class-validator';

export class CreateAdCampaignDto {
  @IsString() telegramChannelId!: string;
  @IsString() promoId!: string;
  @IsString() telegramInviteLinkId!: string;
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  advertisingChannelIds?: string[];
  @Type(() => Number) @IsNumber() @Min(0.000001) price!: number;
  @IsString() accountId!: string;
  @IsOptional() @IsString() date?: string;
  @IsOptional() @IsString() notes?: string;
}

export class UpdateAdCampaignDto {
  @IsOptional() @IsString() telegramChannelId?: string;
  @IsOptional() @IsString() promoId?: string;
  @IsOptional() @IsString() telegramInviteLinkId?: string;
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  advertisingChannelIds?: string[];
  @IsOptional() @Type(() => Number) @IsNumber() @Min(0.000001) price?: number;
  @IsOptional() @IsString() accountId?: string;
  @IsOptional() @IsString() date?: string;
  @IsOptional() @IsString() notes?: string;
}

export class AdCampaignQueryDto {
  @IsOptional() @IsString() telegramChannelId?: string;
}
