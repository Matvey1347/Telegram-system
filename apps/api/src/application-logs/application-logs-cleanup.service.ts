import { Injectable } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { ApplicationLoggerService } from './application-logger.service';
import { ApplicationLogsService } from './application-logs.service';

@Injectable()
export class ApplicationLogsCleanupService {
  constructor(
    private readonly logsService: ApplicationLogsService,
    private readonly applicationLogger: ApplicationLoggerService,
  ) {}

  @Cron(CronExpression.EVERY_DAY_AT_MIDNIGHT)
  async cleanup() {
    const startedAt = Date.now();
    try {
      const result = await this.logsService.cleanupExpiredLogs();
      this.applicationLogger.info({
        kind: 'cron',
        source: ApplicationLogsCleanupService.name,
        event: 'application_logs.cleanup.completed',
        message: result.disabled
          ? 'Application log cleanup skipped because retention is disabled.'
          : `Application log cleanup deleted ${result.deletedCount} records.`,
        durationMs: Date.now() - startedAt,
        metadata: result,
      });
    } catch (error) {
      this.applicationLogger.writeStructured({
        level: 'error',
        kind: 'cron',
        source: ApplicationLogsCleanupService.name,
        event: 'application_logs.cleanup.failed',
        message:
          error instanceof Error
            ? error.message
            : 'Application log cleanup failed',
        durationMs: Date.now() - startedAt,
        errorName: error instanceof Error ? error.name : 'Error',
        stack: error instanceof Error ? error.stack || null : null,
      });
    }
  }
}
