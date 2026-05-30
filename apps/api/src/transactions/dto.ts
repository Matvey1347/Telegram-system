import { TransactionType } from '@prisma/client';
import { Type } from 'class-transformer';
import { IsDateString, IsEnum, IsNumber, IsOptional, IsString, Min } from 'class-validator';

export class CreateTransactionDto {
  @IsString() accountId!: string;
  @IsEnum(TransactionType) type!: TransactionType;
  @Type(() => Number) @IsNumber() @Min(0) amount!: number;
  @Type(() => Number) @IsNumber() @Min(0) exchangeRateToPrimary!: number;
  @IsString() category!: string;
  @IsOptional() @IsString() description?: string;
  @IsDateString() date!: string;
}
export class UpdateTransactionDto {
  @IsOptional() @IsEnum(TransactionType) type?: TransactionType;
  @IsOptional() @Type(() => Number) @IsNumber() @Min(0) amount?: number;
  @IsOptional() @Type(() => Number) @IsNumber() @Min(0) exchangeRateToPrimary?: number;
  @IsOptional() @IsString() category?: string;
  @IsOptional() @IsString() description?: string;
  @IsOptional() @IsDateString() date?: string;
}
