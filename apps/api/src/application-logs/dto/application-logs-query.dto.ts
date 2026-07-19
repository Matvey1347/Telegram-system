import { Transform, Type } from 'class-transformer';
import {
  IsArray,
  IsDateString,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Max,
  Min,
} from 'class-validator';

const LOG_LEVELS = ['debug', 'info', 'warn', 'error'] as const;
const LOG_KINDS = [
  'http',
  'application',
  'integration',
  'cron',
  'client',
  'audit',
] as const;
const METHODS = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'] as const;

function toArray(value: unknown) {
  if (Array.isArray(value)) return value.filter(Boolean);
  if (typeof value !== 'string') return [];
  return value
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
}

export class ApplicationLogsQueryDto {
  @IsOptional() @IsString() cursor?: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(200) limit?: number;
  @IsOptional() @IsDateString() dateFrom?: string;
  @IsOptional() @IsDateString() dateTo?: string;
  @IsOptional() @Transform(({ value }) => toArray(value)) @IsArray() @IsIn(LOG_LEVELS, { each: true }) levels?: string[];
  @IsOptional() @Transform(({ value }) => toArray(value)) @IsArray() @IsIn(LOG_KINDS, { each: true }) kinds?: string[];
  @IsOptional() @Transform(({ value }) => toArray(value)) @IsArray() @IsString({ each: true }) sources?: string[];
  @IsOptional() @Transform(({ value }) => toArray(value)) @IsArray() @IsString({ each: true }) events?: string[];
  @IsOptional() @Transform(({ value }) => toArray(value)) @IsArray() @IsIn(METHODS, { each: true }) methods?: string[];
  @IsOptional() @IsString() endpoint?: string;
  @IsOptional() @Type(() => Number) @IsInt() statusCode?: number;
  @IsOptional() @Type(() => Number) @IsInt() statusCodeFrom?: number;
  @IsOptional() @Type(() => Number) @IsInt() statusCodeTo?: number;
  @IsOptional() @IsString() correlationId?: string;
  @IsOptional() @IsString() userId?: string;
  @IsOptional() @IsString() search?: string;
}
