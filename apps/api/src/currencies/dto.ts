import { CurrencyDisplayMode } from '@prisma/client';
import { Transform, Type } from 'class-transformer';
import {
  IsDateString,
  IsEnum,
  IsNumber,
  IsOptional,
  IsString,
  Matches,
  Min,
} from 'class-validator';

const normalizeCurrency = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim().toUpperCase() : value;

export class UpdateCurrencySettingsDto {
  @Transform(normalizeCurrency)
  @IsString()
  @Matches(/^[A-Z]{3}$/)
  primaryCurrency!: string;

  @Transform(normalizeCurrency)
  @IsString()
  @Matches(/^[A-Z]{3}$/)
  secondaryCurrency!: string;

  @IsOptional()
  @IsEnum(CurrencyDisplayMode)
  currencyDisplayMode?: CurrencyDisplayMode;
}

export class CreateCurrencyRateDto {
  @Transform(normalizeCurrency)
  @IsString()
  @Matches(/^[A-Z]{3}$/)
  baseCurrency!: string;

  @Transform(normalizeCurrency)
  @IsString()
  @Matches(/^[A-Z]{3}$/)
  targetCurrency!: string;

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
