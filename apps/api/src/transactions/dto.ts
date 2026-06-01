import { TransactionType } from '@prisma/client';
import { Type } from 'class-transformer';
import {
  IsDateString,
  IsEnum,
  IsNumber,
  IsOptional,
  IsString,
  Min,
} from 'class-validator';

export class CreateTransactionDto {
  @IsString() accountId!: string;
  @IsEnum(TransactionType) type!: TransactionType;
  @Type(() => Number) @IsNumber() @Min(0) amount!: number;
  @IsOptional() @Type(() => Number) @IsNumber() @Min(0) exchangeRateToPrimary?: number;
  @IsString() categoryId!: string;
  @IsOptional() @IsString() memberId?: string;
  @IsOptional() @IsString() description?: string;
  @IsDateString() date!: string;
}

export class UpdateTransactionDto {
  @IsOptional() @IsString() accountId?: string;
  @IsOptional() @IsEnum(TransactionType) type?: TransactionType;
  @IsOptional() @Type(() => Number) @IsNumber() @Min(0) amount?: number;
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  exchangeRateToPrimary?: number;
  @IsOptional() @IsString() categoryId?: string;
  @IsOptional() @IsString() memberId?: string | null;
  @IsOptional() @IsString() description?: string;
  @IsOptional() @IsDateString() date?: string;
}
