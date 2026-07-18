import {
  ArrayUnique,
  IsArray,
  IsEmail,
  IsOptional,
  IsString,
  MinLength,
} from 'class-validator';

export class UpdateMeDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  name?: string;

  @IsOptional()
  @IsEmail()
  email?: string;

  @IsOptional()
  @IsString()
  avatarIconId?: string | null;

  @IsOptional()
  @IsString()
  telegramUsername?: string | null;

  @IsOptional()
  @IsArray()
  @ArrayUnique()
  @IsString({ each: true })
  telegramUserAccountIds?: string[];
}

export class UpdatePasswordDto {
  @IsString()
  currentPassword!: string;

  @IsString()
  @MinLength(8)
  newPassword!: string;
}

export class UpdateWorkspaceDto {
  @IsString()
  @MinLength(2)
  name!: string;

  @IsOptional()
  @IsString()
  avatarIconId?: string | null;
}
