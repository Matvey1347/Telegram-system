import { ArrayNotEmpty, IsArray, IsString } from 'class-validator';

export class ImportUserAccountChannelsDto {
  @IsArray()
  @ArrayNotEmpty()
  @IsString({ each: true })
  channelIds!: string[];
}
