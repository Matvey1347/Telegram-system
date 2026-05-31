import { Type } from 'class-transformer';
import {
  IsDateString,
  IsNumber,
  IsOptional,
  IsString,
  Min,
} from 'class-validator';

export class CreateTransferDto {
  @IsString() fromAccountId!: string;
  @IsString() toAccountId!: string;
  @Type(() => Number) @IsNumber() @Min(0) fromAmount!: number;
  @Type(() => Number) @IsNumber() @Min(0) toAmount!: number;
  @IsDateString() date!: string;
  @IsOptional() @IsString() description?: string;
}
export class UpdateTransferDto {
  @IsOptional() @Type(() => Number) @IsNumber() @Min(0) fromAmount?: number;
  @IsOptional() @Type(() => Number) @IsNumber() @Min(0) toAmount?: number;
  @IsOptional() @IsDateString() date?: string;
  @IsOptional() @IsString() description?: string;
}
