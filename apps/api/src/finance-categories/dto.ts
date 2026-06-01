import { TransactionType } from '@prisma/client';
import { IsEnum, IsOptional, IsString, MaxLength } from 'class-validator';

export class CreateFinanceCategoryDto {
  @IsString() @MaxLength(80) name!: string;
  @IsEnum(TransactionType) type!: TransactionType;
}

export class UpdateFinanceCategoryDto {
  @IsOptional() @IsString() @MaxLength(80) name?: string;
}
