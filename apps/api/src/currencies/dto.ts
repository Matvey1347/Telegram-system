import { Currency } from '@prisma/client';
import { Type } from 'class-transformer';
import {
  IsDateString,
  IsEnum,
  IsNumber,
  IsOptional,
  IsString,
  Min,
} from 'class-validator';

export class UpdateCurrencySettingsDto {
  @IsEnum(Currency)
  primaryCurrency!: Currency;

  @IsEnum(Currency)
  secondaryCurrency!: Currency;
}

export class CreateCurrencyRateDto {
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

  @IsOptional()
  @IsString()
  source?: string;
}

export class UpdateCurrencyRateDto {
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  rate?: number;

  @IsOptional()
  @IsDateString()
  date?: string;

  @IsOptional()
  @IsString()
  source?: string;
}
