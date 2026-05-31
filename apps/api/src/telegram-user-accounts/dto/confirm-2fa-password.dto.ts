import { IsString } from 'class-validator';

export class Confirm2faPasswordDto {
  @IsString() password!: string;
}
