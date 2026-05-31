import { Type } from 'class-transformer';
import { IsDateString, IsNumber, IsOptional, IsString, Min } from 'class-validator';

export class CreateInvestmentDto {
  @IsString() workspaceMemberId!: string;
  @IsString() accountId!: string;
  @Type(() => Number) @IsNumber() @Min(0) amount!: number;
  @IsOptional() @Type(() => Number) @IsNumber() @Min(0.0000001) exchangeRateToPrimary?: number;
  @IsDateString() date!: string;
  @IsOptional() @IsString() notes?: string;
}

export class UpdateInvestmentDto {
  @IsOptional() @IsString() workspaceMemberId?: string;
  @IsOptional() @IsString() accountId?: string;
  @IsOptional() @Type(() => Number) @IsNumber() @Min(0) amount?: number;
  @IsOptional() @Type(() => Number) @IsNumber() @Min(0.0000001) exchangeRateToPrimary?: number;
  @IsOptional() @IsDateString() date?: string;
  @IsOptional() @IsString() notes?: string;
}
