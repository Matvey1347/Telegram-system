import { PromoStatus } from '@prisma/client';
import { IsEnum, IsOptional, IsString } from 'class-validator';

export class CreatePromoDto {
  @IsOptional() @IsString() assignedMemberId?: string | null;
  @IsString() telegramChannelId!: string;
  @IsString() title!: string;
  @IsOptional() @IsString() text?: string;
  @IsOptional() @IsString() imageData?: string;
  @IsOptional() @IsEnum(PromoStatus) status?: PromoStatus;
}
export class UpdatePromoDto {
  @IsOptional() @IsString() assignedMemberId?: string | null;
  @IsOptional() @IsString() telegramChannelId?: string;
  @IsOptional() @IsString() title?: string;
  @IsOptional() @IsString() text?: string;
  @IsOptional() @IsString() imageData?: string;
  @IsOptional() @IsEnum(PromoStatus) status?: PromoStatus;
}

export class PromoQueryDto {
  @IsOptional() @IsString() assignedMemberId?: string;
  @IsOptional() @IsString() telegramChannelId?: string;
}
