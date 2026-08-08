import { Injectable } from '@nestjs/common';
import { ModuleRef } from '@nestjs/core';
import { ApplicationLogsService } from '../application-logs/application-logs.service';
import { CurrenciesService } from '../currencies/currencies.service';
import { TelegramAdSalesService } from '../telegram-ad-sales/telegram-ad-sales.service';
import { DailyAnalyticsSyncService } from '../telegram-sync/daily-analytics-sync.service';
import { TelegramWorkspaceSyncTasksService } from '../telegram-sync/telegram-workspace-sync-tasks.service';
import type {
  ScheduledTaskExecutionContext,
  ScheduledTaskExecutionResult,
} from './scheduled-task.types';

@Injectable()
export class ScheduledTaskExecutorService {
  constructor(private readonly moduleRef: ModuleRef) {}

  readonly executors = {
    'telegram.post_metrics.sync': (context: ScheduledTaskExecutionContext) =>
      this.telegramWorkspaceSyncTasks().then((service) =>
        service.syncPostMetricsForWorkspace(this.requireWorkspace(context)),
      ),
    'telegram.broadcast_stats.sync': (context: ScheduledTaskExecutionContext) =>
      this.telegramWorkspaceSyncTasks().then((service) =>
        service.syncBroadcastStatsForWorkspace(this.requireWorkspace(context)),
      ),
    'telegram.daily_analytics.sync': (context: ScheduledTaskExecutionContext) =>
      this.runDailyAnalytics(context),
    'currencies.rates.sync': (context: ScheduledTaskExecutionContext) =>
      this.currenciesService().then(async (service) => {
        const result = await service.syncRatesForWorkspaceTask(
          this.requireWorkspace(context),
        );
        return { summary: `Updated ${result.updated} exchange rates.` };
      }),
    'telegram_ad_sales.due_deletions': async () => {
      const result = await (
        await this.adSalesService()
      ).processDueDeletionBatch(20);
      return {
        summary: `Processed ${result.processed} placements, ${result.failed} failed.`,
      };
    },
    'application_logs.cleanup': async () => {
      const result = await (
        await this.applicationLogsService()
      ).cleanupExpiredLogs();
      if (result.disabled) {
        return {
          summary: 'Application log retention is disabled.',
          skipped: true,
        };
      }
      return { summary: `Deleted ${result.deletedCount} expired logs.` };
    },
  } satisfies Record<
    string,
    (
      context: ScheduledTaskExecutionContext,
    ) => Promise<ScheduledTaskExecutionResult | void>
  >;

  private async runDailyAnalytics(context: ScheduledTaskExecutionContext) {
    if (process.env.TELEGRAM_DAILY_ANALYTICS_SYNC_ENABLED === 'false') {
      return {
        summary: 'Daily analytics sync is disabled by environment.',
        skipped: true,
      };
    }
    type DailyAnalyticsResult = {
      channelsProcessed: number;
      campaignsProcessed: number;
      errorsCount: number;
    };
    const result = (await (
      await this.dailyAnalyticsSyncService()
    ).runDailyAnalyticsSync({
      workspaceId: this.requireWorkspace(context),
      source: context.trigger === 'MANUAL' ? 'manual' : 'cron',
    })) as DailyAnalyticsResult;
    return {
      summary: `Processed ${result.channelsProcessed} channels, ${result.campaignsProcessed} campaigns, ${result.errorsCount} errors.`,
    };
  }

  private requireWorkspace(context: ScheduledTaskExecutionContext) {
    if (!context.workspaceId) throw new Error('Workspace context is required');
    return context.workspaceId;
  }

  private telegramWorkspaceSyncTasks() {
    return this.moduleRef.resolve(
      TelegramWorkspaceSyncTasksService,
      undefined,
      {
        strict: false,
      },
    );
  }

  private dailyAnalyticsSyncService() {
    return this.moduleRef.resolve(DailyAnalyticsSyncService, undefined, {
      strict: false,
    });
  }

  private currenciesService() {
    return this.moduleRef.resolve(CurrenciesService, undefined, {
      strict: false,
    });
  }

  private adSalesService() {
    return this.moduleRef.resolve(TelegramAdSalesService, undefined, {
      strict: false,
    });
  }

  private applicationLogsService() {
    return this.moduleRef.resolve(ApplicationLogsService, undefined, {
      strict: false,
    });
  }
}
