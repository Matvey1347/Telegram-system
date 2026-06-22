import { IsOptional, IsString, MaxLength } from 'class-validator';

export class ListIconsQueryDto {
  @IsOptional()
  @IsString()
  search?: string;
}

export class CreateCustomIconDto {
  @IsString()
  @MaxLength(80)
  name!: string;

  @IsString()
  imageUrl!: string;
}

export class CreateTemporaryImageIconDto {
  @IsString()
  imageUrl!: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  fileName?: string;
}

export class CreateEmojiIconDto {
  @IsString()
  @MaxLength(80)
  name!: string;

  @IsString()
  emoji!: string;
}
