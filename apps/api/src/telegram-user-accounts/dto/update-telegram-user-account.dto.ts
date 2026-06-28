import { IsBoolean, IsOptional, IsString, MinLength } from 'class-validator';

export class UpdateTelegramUserAccountDto {
  @IsOptional() @IsString() assignedMemberId?: string | null;
  @IsOptional() @IsString() label?: string;
  @IsOptional() @IsString() apiId?: string;
  @IsOptional() @IsString() @MinLength(8) apiHash?: string;
  @IsOptional() @IsBoolean() isActive?: boolean;
}
