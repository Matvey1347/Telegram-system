import {
  ArrayMinSize,
  IsArray,
  IsIn,
  IsOptional,
  IsString,
  MinLength,
} from 'class-validator';

export const AD_HYPOTHESIS_STATUSES = [
  'testing',
  'winner',
  'loser',
  'paused',
  'archived',
] as const;

export class UpdateAdHypothesisDto {
  @IsOptional()
  @IsString()
  @MinLength(2)
  name?: string;

  @IsOptional()
  @IsString()
  description?: string | null;

  @IsOptional()
  @IsString()
  @IsIn(AD_HYPOTHESIS_STATUSES)
  status?: string;

  @IsOptional()
  @IsString()
  conclusion?: string | null;

  @IsOptional()
  @IsArray()
  @ArrayMinSize(1)
  @IsString({ each: true })
  adCampaignIds?: string[];
}
