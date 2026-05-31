import { Type } from 'class-transformer';
import {
  IsArray,
  IsDateString,
  IsOptional,
  IsString,
  IsNumber,
  Min,
  ArrayMinSize,
} from 'class-validator';

export class CreateAdCampaignDto {
  @IsString() telegramChannelId!: string;
  @IsString() promoId!: string;
  @IsString() telegramInviteLinkId!: string;
  @IsArray() @ArrayMinSize(1) @IsString({ each: true }) advertisingChannelIds!: string[];
  @Type(() => Number) @IsNumber() @Min(0.000001) price!: number;
  @IsString() currency!: string;
  @IsOptional() @Type(() => Number) @IsNumber() @Min(0.000001) exchangeRateToPrimary?: number;
  @IsOptional() @IsString() accountId?: string;
  @IsOptional() @IsDateString() placementDate?: string;
  @IsOptional() @IsDateString() startedAt?: string;
  @IsOptional() @IsDateString() endedAt?: string;
  @IsOptional() @IsString() notes?: string;
}

export class UpdateAdCampaignDto {
  @IsOptional() @IsString() telegramChannelId?: string;
  @IsOptional() @IsString() promoId?: string;
  @IsOptional() @IsString() telegramInviteLinkId?: string;
  @IsOptional() @IsArray() @ArrayMinSize(1) @IsString({ each: true }) advertisingChannelIds?: string[];
  @IsOptional() @Type(() => Number) @IsNumber() @Min(0.000001) price?: number;
  @IsOptional() @IsString() currency?: string;
  @IsOptional() @Type(() => Number) @IsNumber() @Min(0.000001) exchangeRateToPrimary?: number;
  @IsOptional() @IsString() accountId?: string;
  @IsOptional() @IsDateString() placementDate?: string;
  @IsOptional() @IsDateString() startedAt?: string;
  @IsOptional() @IsDateString() endedAt?: string;
  @IsOptional() @IsString() notes?: string;
}

export class GenerateInviteLinkDto {
  @IsOptional() @IsString() telegramBotIntegrationId?: string;
  @IsOptional() @IsString() name?: string;
}
