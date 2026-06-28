import { Type } from 'class-transformer';
import { IsArray, IsBoolean, IsOptional, IsString, IsNumber, Min } from 'class-validator';

export class AdCampaignAnalyticsInputDto {
  @IsOptional() @Type(() => Number) @IsNumber() @Min(0) subscribersBefore?: number;
  @IsOptional() @Type(() => Number) @IsNumber() @Min(0) avgViewsBefore?: number;
  @IsOptional() @Type(() => Number) @IsNumber() @Min(0) avgReactionsBefore?: number;
  @IsOptional() @Type(() => Number) @IsNumber() @Min(0) subscribersAfter24h?: number;
  @IsOptional() @Type(() => Number) @IsNumber() @Min(0) subscribersAfter48h?: number;
  @IsOptional() @Type(() => Number) @IsNumber() @Min(0) subscribersAfter72h?: number;
  @IsOptional() @Type(() => Number) @IsNumber() @Min(0) subscribersAfter7d?: number;
  @IsOptional() @Type(() => Number) @IsNumber() @Min(0) subscribersAfter30d?: number;
  @IsOptional() @Type(() => Number) @IsNumber() @Min(0) avgViewsAfter?: number;
  @IsOptional() @Type(() => Number) @IsNumber() @Min(0) avgReactionsAfter?: number;
  @IsOptional() @Type(() => Number) @IsNumber() @Min(0) clicksAfter?: number;
  @IsOptional() @IsString() analyticsNotes?: string;
  @IsOptional() @IsBoolean() excludeFromAnalytics?: boolean;
}

export class CreateAdCampaignDto {
  @IsOptional() @IsString() assignedMemberId?: string | null;
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
  @IsOptional() @Type(() => Number) @IsNumber() @Min(0) subscribersBefore?: number;
  @IsOptional() @Type(() => Number) @IsNumber() @Min(0) avgViewsBefore?: number;
  @IsOptional() @Type(() => Number) @IsNumber() @Min(0) avgReactionsBefore?: number;
  @IsOptional() @Type(() => Number) @IsNumber() @Min(0) subscribersAfter24h?: number;
  @IsOptional() @Type(() => Number) @IsNumber() @Min(0) subscribersAfter48h?: number;
  @IsOptional() @Type(() => Number) @IsNumber() @Min(0) subscribersAfter72h?: number;
  @IsOptional() @Type(() => Number) @IsNumber() @Min(0) subscribersAfter7d?: number;
  @IsOptional() @Type(() => Number) @IsNumber() @Min(0) subscribersAfter30d?: number;
  @IsOptional() @Type(() => Number) @IsNumber() @Min(0) avgViewsAfter?: number;
  @IsOptional() @Type(() => Number) @IsNumber() @Min(0) avgReactionsAfter?: number;
  @IsOptional() @Type(() => Number) @IsNumber() @Min(0) clicksAfter?: number;
  @IsOptional() @IsString() analyticsNotes?: string;
  @IsOptional() @IsBoolean() excludeFromAnalytics?: boolean;
}

export class UpdateAdCampaignDto {
  @IsOptional() @IsString() assignedMemberId?: string | null;
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
  @IsOptional() @Type(() => Number) @IsNumber() @Min(0) subscribersBefore?: number;
  @IsOptional() @Type(() => Number) @IsNumber() @Min(0) avgViewsBefore?: number;
  @IsOptional() @Type(() => Number) @IsNumber() @Min(0) avgReactionsBefore?: number;
  @IsOptional() @Type(() => Number) @IsNumber() @Min(0) subscribersAfter24h?: number;
  @IsOptional() @Type(() => Number) @IsNumber() @Min(0) subscribersAfter48h?: number;
  @IsOptional() @Type(() => Number) @IsNumber() @Min(0) subscribersAfter72h?: number;
  @IsOptional() @Type(() => Number) @IsNumber() @Min(0) subscribersAfter7d?: number;
  @IsOptional() @Type(() => Number) @IsNumber() @Min(0) subscribersAfter30d?: number;
  @IsOptional() @Type(() => Number) @IsNumber() @Min(0) avgViewsAfter?: number;
  @IsOptional() @Type(() => Number) @IsNumber() @Min(0) avgReactionsAfter?: number;
  @IsOptional() @Type(() => Number) @IsNumber() @Min(0) clicksAfter?: number;
  @IsOptional() @IsString() analyticsNotes?: string;
  @IsOptional() @IsBoolean() excludeFromAnalytics?: boolean;
}

export class AdCampaignQueryDto {
  @IsOptional() @IsString() assignedMemberId?: string;
  @IsOptional() @IsString() telegramChannelId?: string;
}
