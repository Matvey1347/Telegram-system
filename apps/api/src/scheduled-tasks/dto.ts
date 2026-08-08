import {
  IsBoolean,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Matches,
  Max,
  Min,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';

class ScheduledTaskScheduleDto {
  @IsIn(['DAILY', 'INTERVAL'])
  frequency!: 'DAILY' | 'INTERVAL';

  @IsOptional()
  @Matches(/^([01]\d|2[0-3]):([0-5]\d)$/)
  time?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(1440)
  intervalMinutes?: number;

  @IsString()
  timezone!: string;
}

class ScheduledTaskNotificationsDto {
  @IsBoolean()
  notifyOnSuccess!: boolean;

  @IsBoolean()
  notifyOnFailure!: boolean;

  @IsIn(['SYSTEM_TELEGRAM_BOT'])
  channel!: 'SYSTEM_TELEGRAM_BOT';
}

export class UpdateScheduledTaskDto {
  @IsOptional()
  @IsBoolean()
  enabled?: boolean;

  @IsOptional()
  @ValidateNested()
  @Type(() => ScheduledTaskScheduleDto)
  schedule?: ScheduledTaskScheduleDto;

  @IsOptional()
  @ValidateNested()
  @Type(() => ScheduledTaskNotificationsDto)
  notifications?: ScheduledTaskNotificationsDto;
}
