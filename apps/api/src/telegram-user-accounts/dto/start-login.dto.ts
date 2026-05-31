import { IsOptional, IsString } from 'class-validator';

export class StartLoginDto {
  @IsOptional() @IsString() phone?: string;
}
