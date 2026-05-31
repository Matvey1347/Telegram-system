import { IsString } from 'class-validator';

export class ConfirmLoginCodeDto {
  @IsString() code!: string;
}
