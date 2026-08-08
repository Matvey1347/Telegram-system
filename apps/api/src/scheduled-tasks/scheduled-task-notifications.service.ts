import { Injectable, Logger } from '@nestjs/common';

@Injectable()
export class ScheduledTaskNotificationsService {
  private readonly logger = new Logger(ScheduledTaskNotificationsService.name);

  notify(params: {
    taskKey: string;
    workspaceId: string | null;
    status: 'SUCCESS' | 'FAILED' | 'SKIPPED';
    enabled: boolean;
  }) {
    if (!params.enabled) return { status: 'DISABLED' as const };
    this.logger.debug(
      `Notification skipped for ${params.taskKey}: SYSTEM_TELEGRAM_BOT is not configured yet.`,
    );
    return { status: 'NOT_CONFIGURED' as const };
  }
}
