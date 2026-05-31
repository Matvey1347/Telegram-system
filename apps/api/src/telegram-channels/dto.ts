import { Type } from 'class-transformer';
import { IsInt, IsOptional, IsString } from 'class-validator';

export class CreateTelegramChannelDto {
  @IsString() title!: string;
  @IsOptional() @IsString() username?: string;
  @IsOptional() @IsString() telegramChatId?: string;
  @IsOptional() @IsString() telegramBotIntegrationId?: string;
  @IsOptional() @IsString() description?: string;
  @IsOptional() @Type(() => Number) @IsInt() currentSubscribersCount?: number;
}

export class UpdateTelegramChannelDto {
  @IsOptional() @IsString() title?: string;
  @IsOptional() @IsString() username?: string;
  @IsOptional() @IsString() telegramChatId?: string;
  @IsOptional() @IsString() telegramBotIntegrationId?: string;
  @IsOptional() @IsString() description?: string;
  @IsOptional() @Type(() => Number) @IsInt() currentSubscribersCount?: number;
}

export class CheckBotAccessDto {
  @IsOptional() @IsString() telegramBotIntegrationId?: string;
}
