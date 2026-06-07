import { TransactionType } from '@prisma/client';
import { Type } from 'class-transformer';
import {
  IsDateString,
  IsEnum,
  IsIn,
  IsNumber,
  IsOptional,
  IsString,
  Min,
} from 'class-validator';

export class CreateTransactionDto {
  @IsString() accountId!: string;
  @IsEnum(TransactionType) type!: TransactionType;
  @Type(() => Number) @IsNumber() @Min(0) amount!: number;
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  exchangeRateToPrimary?: number;
  @IsString() categoryId!: string;
  @IsOptional() @IsString() memberId?: string;
  @IsOptional() @IsString() iconId?: string | null;
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
  @IsOptional() @IsString() iconId?: string | null;
  @IsOptional() @IsString() description?: string;
  @IsOptional() @IsDateString() date?: string;
}

export class TransactionQueryDto {
  @IsOptional() @IsDateString() dateFrom?: string;
  @IsOptional() @IsDateString() dateTo?: string;
  @IsOptional() @IsString() categoryId?: string;
  @IsOptional() @IsIn(['income', 'expense', 'all']) type?:
    | 'income'
    | 'expense'
    | 'all';
  @IsOptional() @IsString() accountId?: string;
  @IsOptional() @IsIn(['date_desc', 'date_asc']) sort?:
    | 'date_desc'
    | 'date_asc';
  @IsOptional() @IsString() search?: string;
}
