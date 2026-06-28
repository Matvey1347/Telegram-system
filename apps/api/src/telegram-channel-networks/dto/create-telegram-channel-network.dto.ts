import { ArrayMinSize, IsArray, IsOptional, IsString, MinLength } from 'class-validator';

export class CreateTelegramChannelNetworkDto {
  @IsOptional() @IsString() assignedMemberId?: string | null;
  @IsString()
  @MinLength(2)
  name!: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsArray()
  @ArrayMinSize(2)
  @IsString({ each: true })
  telegramChannelIds!: string[];
}
