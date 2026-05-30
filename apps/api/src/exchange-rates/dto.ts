import { Currency } from '@prisma/client';
import { Type } from 'class-transformer';
import { IsDateString, IsEnum, IsNumber, IsOptional, IsString, Min } from 'class-validator';

export class CreateExchangeRateDto {
  @IsEnum(Currency)
  baseCurrency!: Currency;
  @IsEnum(Currency)
  targetCurrency!: Currency;
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  rate!: number;
  @IsDateString()
  date!: string;
  @IsOptional() @IsString() source?: string;
}
export class UpdateExchangeRateDto {
  @IsOptional() @Type(() => Number) @IsNumber() @Min(0) rate?: number;
  @IsOptional() @IsDateString() date?: string;
  @IsOptional() @IsString() source?: string;
}
