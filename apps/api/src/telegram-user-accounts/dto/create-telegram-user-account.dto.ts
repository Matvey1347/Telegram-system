import { IsOptional, IsString } from 'class-validator';

export class CreateTelegramUserAccountDto {
  @IsOptional() @IsString() assignedMemberId?: string | null;
  @IsOptional() @IsString() label?: string;
  @IsString() phone!: string;
}
