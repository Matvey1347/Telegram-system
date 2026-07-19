import { IsObject, IsOptional, IsString, MaxLength } from 'class-validator';

export class ClientLogDto {
  @IsString() @MaxLength(2000) message!: string;
  @IsOptional() @IsString() @MaxLength(12000) stack?: string;
  @IsOptional() @IsString() @MaxLength(500) route?: string;
  @IsOptional() @IsString() @MaxLength(1000) userAgent?: string;
  @IsOptional() @IsString() @MaxLength(128) correlationId?: string;
  @IsOptional() @IsObject() metadata?: Record<string, unknown>;
}
