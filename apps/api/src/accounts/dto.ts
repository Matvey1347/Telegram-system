import { Transform, Type } from 'class-transformer';
import {
  IsBoolean,
  IsNumber,
  IsOptional,
  IsString,
  Matches,
  Min,
} from 'class-validator';
import { PaginationQueryDto } from '../common/pagination/pagination-query.dto';

const normalizeCurrency = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim().toUpperCase() : value;

export class CreateAccountDto {
  @IsOptional() @IsString() assignedMemberId?: string | null;
  @IsString()
  name!: string;

  @IsOptional()
  @IsString()
  iconId?: string | null;

  @Transform(normalizeCurrency)
  @IsString()
  @Matches(/^[A-Z]{3}$/)
  currency!: string;

  @Type(() => Number)
  @IsNumber()
  initialBalance!: number;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

export class UpdateAccountDto {
  @IsOptional() @IsString() assignedMemberId?: string | null;
  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsString()
  iconId?: string | null;

  @IsOptional()
  @Transform(normalizeCurrency)
  @IsString()
  @Matches(/^[A-Z]{3}$/)
  currency?: string;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  initialBalance?: number;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

export class AccountQueryDto extends PaginationQueryDto {
  @IsOptional() @IsString() assignedMemberId?: string;
}
