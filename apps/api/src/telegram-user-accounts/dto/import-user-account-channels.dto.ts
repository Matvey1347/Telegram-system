import {
  ArrayNotEmpty,
  IsArray,
  IsDateString,
  IsIn,
  IsOptional,
  IsString,
  ValidateIf,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';

export class ImportUserAccountChannelItemDto {
  @IsString()
  telegramChannelId!: string;

  @IsOptional()
  @IsIn(['CREATED', 'PURCHASED'])
  acquisitionType?: 'CREATED' | 'PURCHASED';

  @IsOptional()
  @ValidateIf((_, value) => value !== undefined && value !== null)
  @IsDateString()
  postsSyncFrom?: string | null;

  @IsOptional()
  @ValidateIf((_, value) => value !== undefined && value !== null)
  @IsDateString()
  inviteLinksSyncFrom?: string | null;
}

export class ImportUserAccountChannelsDto {
  @IsArray()
  @ArrayNotEmpty()
  @ValidateNested({ each: true })
  @Type(() => ImportUserAccountChannelItemDto)
  channels!: ImportUserAccountChannelItemDto[];
}
