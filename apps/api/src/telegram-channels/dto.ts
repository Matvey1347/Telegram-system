import { IsInt, IsOptional, IsString } from 'class-validator';

export class CreateTelegramChannelDto { @IsString() title!: string; @IsOptional() @IsString() username?: string; @IsOptional() @IsString() description?: string; @IsOptional() @IsInt() currentSubscribersCount?: number; }
export class UpdateTelegramChannelDto { @IsOptional() @IsString() title?: string; @IsOptional() @IsString() username?: string; @IsOptional() @IsString() description?: string; @IsOptional() @IsInt() currentSubscribersCount?: number; }
