import { WorkspaceRole } from '@prisma/client';
import {
  IsArray,
  IsEmail,
  IsEnum,
  IsOptional,
  IsString,
  MinLength,
  ArrayUnique,
} from 'class-validator';

export class CreateWorkspaceMemberDto {
  @IsEmail()
  email!: string;

  @IsOptional()
  @IsString()
  @MinLength(2)
  name?: string;

  @IsOptional()
  @IsString()
  @MinLength(8)
  password?: string;

  @IsOptional()
  @IsEnum(WorkspaceRole)
  role?: WorkspaceRole;

  @IsOptional()
  @IsString()
  avatarIconId?: string | null;

  @IsOptional()
  @IsString()
  telegramUsername?: string | null;
}

export class UpdateWorkspaceMemberDto {
  @IsOptional()
  @IsEnum(WorkspaceRole)
  role?: WorkspaceRole;

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
