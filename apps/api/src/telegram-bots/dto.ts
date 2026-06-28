import { IsArray, IsOptional, IsString, MinLength } from 'class-validator';

export class CreateTelegramBotDto {
  @IsOptional() @IsString() assignedMemberId?: string | null;
  @IsString() @MinLength(10) botToken!: string;
}

export class UpdateTelegramBotDto {
  @IsOptional() @IsString() assignedMemberId?: string | null;
  @IsOptional() @IsString() label?: string;
  @IsOptional() @IsString() @MinLength(10) botToken?: string;
}

export class ImportTelegramChannelsDto {
  @IsArray() @IsString({ each: true }) channels!: string[];
}
