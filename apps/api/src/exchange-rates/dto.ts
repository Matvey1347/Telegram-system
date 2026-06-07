import { Transform, Type } from 'class-transformer';
import {
  IsDateString,
  IsNumber,
  IsOptional,
  IsString,
  Matches,
  Min,
} from 'class-validator';

const normalizeCurrency = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim().toUpperCase() : value;

export class CreateExchangeRateDto {
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
  @IsOptional() @IsString() source?: string;
}
export class UpdateExchangeRateDto {
  @IsOptional() @Type(() => Number) @IsNumber() @Min(0) rate?: number;
  @IsOptional() @IsDateString() date?: string;
  @IsOptional() @IsString() source?: string;
}
