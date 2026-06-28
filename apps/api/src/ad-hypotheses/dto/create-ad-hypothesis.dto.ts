import { ArrayMinSize, IsArray, IsOptional, IsString, MinLength } from 'class-validator';

export class CreateAdHypothesisDto {
  @IsOptional() @IsString() assignedMemberId?: string | null;
  @IsString()
  @MinLength(2)
  name!: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsString()
  status?: string;

  @IsOptional()
  @IsString()
  conclusion?: string;

  @IsArray()
  @ArrayMinSize(1)
  @IsString({ each: true })
  adCampaignIds!: string[];
}
