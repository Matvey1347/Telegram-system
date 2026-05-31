import { PromoStatus } from '@prisma/client';
import { IsEnum, IsOptional, IsString } from 'class-validator';

export class CreatePromoDto { @IsString() telegramChannelId!: string; @IsString() title!: string; @IsString() text!: string; @IsOptional() @IsString() angle?: string; @IsOptional() @IsString() imageData?: string; @IsOptional() @IsEnum(PromoStatus) status?: PromoStatus; }
export class UpdatePromoDto { @IsOptional() @IsString() telegramChannelId?: string; @IsOptional() @IsString() title?: string; @IsOptional() @IsString() text?: string; @IsOptional() @IsString() angle?: string; @IsOptional() @IsString() imageData?: string; @IsOptional() @IsEnum(PromoStatus) status?: PromoStatus; }
