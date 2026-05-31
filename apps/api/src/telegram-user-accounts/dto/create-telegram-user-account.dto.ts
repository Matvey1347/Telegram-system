import { IsOptional, IsString } from 'class-validator';

export class CreateTelegramUserAccountDto {
  @IsOptional() @IsString() label?: string;
  @IsString() phone!: string;
}
