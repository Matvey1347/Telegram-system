import { CampaignStatus } from '@prisma/client';
import { Type } from 'class-transformer';
import { IsDateString, IsEnum, IsInt, IsOptional, IsString, IsNumber, Min } from 'class-validator';

export class CreateAdCampaignDto {
  @IsString() telegramChannelId!: string;
  @IsOptional() @IsString() advertisingSourceId?: string;
  @IsOptional() @IsString() promoId?: string;
  @IsOptional() @IsString() accountId?: string;
  @IsString() title!: string;
  @IsOptional() @IsEnum(CampaignStatus) status?: CampaignStatus;
  @Type(() => Number) @IsNumber() @Min(0) price!: number;
  @Type(() => Number) @IsNumber() @Min(0) exchangeRateToPrimary!: number;
  @IsOptional() @IsString() inviteLink?: string;
  @IsOptional() @IsString() sourcePostUrl?: string;
  @IsOptional() @IsInt() sourcePostViews?: number;
  @IsOptional() @IsInt() joinedCount?: number;
  @IsOptional() @IsInt() leftCount?: number;
  @IsOptional() @IsDateString() startedAt?: string;
  @IsOptional() @IsDateString() endedAt?: string;
  @IsOptional() @IsString() notes?: string;
}
export class UpdateAdCampaignDto extends CreateAdCampaignDto {}
