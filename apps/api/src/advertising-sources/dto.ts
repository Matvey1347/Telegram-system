import { IsOptional, IsString } from 'class-validator';

export class CreateAdvertisingSourceDto {
  @IsString() title!: string;
  @IsOptional() @IsString() telegramUrl?: string;
  @IsOptional() @IsString() username?: string;
  @IsOptional() @IsString() notes?: string;
}

export class UpdateAdvertisingSourceDto {
  @IsOptional() @IsString() title?: string;
  @IsOptional() @IsString() telegramUrl?: string;
  @IsOptional() @IsString() username?: string;
  @IsOptional() @IsString() notes?: string;
}
