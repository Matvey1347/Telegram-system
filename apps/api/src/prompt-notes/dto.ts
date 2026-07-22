import { IsArray, IsOptional, IsString, MaxLength } from 'class-validator';
import { PaginationQueryDto } from '../common/pagination/pagination-query.dto';

export class PromptNotesQueryDto extends PaginationQueryDto {
  @IsOptional() @IsString() search?: string;
  @IsOptional() @IsString() telegramChannelId?: string;
  @IsOptional() @IsString() postGroupId?: string;
}

export class CreatePromptNoteDto {
  @IsOptional() @IsString() @MaxLength(300) title?: string;
  @IsString() content!: string;
  @IsOptional() @IsString() @MaxLength(8) emoji?: string;
  @IsOptional() @IsString() iconId?: string | null;
  @IsOptional() @IsString() assignedMemberId?: string | null;
  @IsOptional() @IsString() telegramChannelId?: string | null;
  @IsOptional() @IsArray() @IsString({ each: true }) telegramChannelIds?: string[];
  @IsOptional() @IsString() postGroupId?: string | null;
}

export class UpdatePromptNoteDto {
  @IsOptional() @IsString() @MaxLength(300) title?: string;
  @IsOptional() @IsString() content?: string;
  @IsOptional() @IsString() @MaxLength(8) emoji?: string | null;
  @IsOptional() @IsString() iconId?: string | null;
  @IsOptional() @IsString() assignedMemberId?: string | null;
  @IsOptional() @IsString() telegramChannelId?: string | null;
  @IsOptional() @IsArray() @IsString({ each: true }) telegramChannelIds?: string[];
  @IsOptional() @IsString() postGroupId?: string | null;
}
