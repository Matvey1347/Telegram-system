import { AdvertisingSourceType } from '@prisma/client';
import { IsEnum, IsOptional, IsString } from 'class-validator';

export class CreateAdvertisingSourceDto { @IsString() name!: string; @IsEnum(AdvertisingSourceType) type!: AdvertisingSourceType; @IsOptional() @IsString() url?: string; @IsOptional() @IsString() telegramUsername?: string; @IsOptional() @IsString() notes?: string; }
export class UpdateAdvertisingSourceDto { @IsOptional() @IsString() name?: string; @IsOptional() @IsEnum(AdvertisingSourceType) type?: AdvertisingSourceType; @IsOptional() @IsString() url?: string; @IsOptional() @IsString() telegramUsername?: string; @IsOptional() @IsString() notes?: string; }
