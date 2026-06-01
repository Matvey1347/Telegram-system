import { Type } from 'class-transformer';
import { IsArray, IsInt, IsOptional, IsString, Min } from 'class-validator';

export class CreateAdvertisingSourceDto {
  @IsString() title!: string;
  @IsOptional() @IsString() telegramUrl?: string;
  @IsOptional() @IsString() username?: string;
  @IsOptional() @IsString() notes?: string;
  @IsOptional() @IsString() imageUrl?: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(0) subscribersCount?: number;
  @IsOptional() @IsArray() @IsString({ each: true }) channelTags?: string[];
}

export class UpdateAdvertisingSourceDto {
  @IsOptional() @IsString() title?: string;
  @IsOptional() @IsString() telegramUrl?: string;
  @IsOptional() @IsString() username?: string;
  @IsOptional() @IsString() notes?: string;
  @IsOptional() @IsString() imageUrl?: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(0) subscribersCount?: number;
  @IsOptional() @IsArray() @IsString({ each: true }) channelTags?: string[];
}
