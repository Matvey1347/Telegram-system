import { Currency } from '@prisma/client';
import { Type } from 'class-transformer';
import { IsBoolean, IsEnum, IsNumber, IsOptional, IsString, Min } from 'class-validator';

export class CreateAccountDto {
  @IsString()
  name!: string;

  @IsEnum(Currency)
  currency!: Currency;

  @Type(() => Number)
  @IsNumber()
  initialBalance!: number;
}

export class UpdateAccountDto {
  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsEnum(Currency)
  currency?: Currency;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  initialBalance?: number;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
