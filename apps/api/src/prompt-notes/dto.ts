import { IsOptional, IsString, MaxLength } from 'class-validator';

export class PromptNotesQueryDto {
  @IsOptional() @IsString() search?: string;
}

export class CreatePromptNoteDto {
  @IsString() @MaxLength(300) title!: string;
  @IsString() content!: string;
}

export class UpdatePromptNoteDto {
  @IsOptional() @IsString() @MaxLength(300) title?: string;
  @IsOptional() @IsString() content?: string;
}
