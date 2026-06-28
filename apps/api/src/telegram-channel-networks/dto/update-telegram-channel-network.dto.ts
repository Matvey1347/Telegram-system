import { ArrayMinSize, IsArray, IsOptional, IsString, MinLength } from 'class-validator';

export class UpdateTelegramChannelNetworkDto {
  @IsOptional() @IsString() assignedMemberId?: string | null;
  @IsOptional()
  @IsString()
  @MinLength(2)
  name?: string;

  @IsOptional()
  @IsString()
  description?: string | null;

  @IsOptional()
  @IsArray()
  @ArrayMinSize(2)
  @IsString({ each: true })
  telegramChannelIds?: string[];
}
