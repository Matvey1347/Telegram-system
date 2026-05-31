import { IsArray, IsOptional, IsString, MinLength } from 'class-validator';

export class CreateTelegramBotDto {
  @IsString() label!: string;
  @IsString() @MinLength(10) botToken!: string;
}

export class UpdateTelegramBotDto {
  @IsOptional() @IsString() label?: string;
  @IsOptional() @IsString() @MinLength(10) botToken?: string;
}

export class ImportTelegramChannelsDto {
  @IsArray() @IsString({ each: true }) channels!: string[];
}
