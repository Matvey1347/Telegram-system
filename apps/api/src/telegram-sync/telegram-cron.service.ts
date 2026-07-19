import { Injectable, Logger } from '@nestjs/common';
import { ModuleRef } from '@nestjs/core';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaService } from '../prisma/prisma.service';
import { TelegramChannelsService } from '../telegram-channels/telegram-channels.service';
import { DailyAnalyticsSyncService } from './daily-analytics-sync.service';
import { ApplicationLoggerService } from '../application-logs/application-logger.service';

@Injectable()
export class TelegramCronService {
  private readonly logger = new Logger(TelegramCronService.name);

  constructor(
    private prisma: PrismaService,
    private moduleRef: ModuleRef,
    private readonly applicationLogger: ApplicationLoggerService = ({
      info: () => undefined,
      writeStructured: () => undefined,
    } as unknown) as ApplicationLoggerService,
  ) {}

  @Cron(CronExpression.EVERY_30_MINUTES)
  async syncMtprotoPostMetrics() {
    if (process.env.TELEGRAM_MTTPROTO_SYNC_ENABLED === 'false') return;
    const startedAt = Date.now();
    const channels = await this.prisma.telegramChannel.findMany({
      where: { isActive: true, adminLinks: { some: {} } },
      select: { id: true, workspaceId: true },
    });
    const telegramChannelsService = await this.moduleRef.resolve(
      TelegramChannelsService,
      undefined,
      { strict: false },
    );
    this.applicationLogger.info({
      kind: 'cron',
      source: TelegramCronService.name,
      event: 'telegram.cron.post_metrics.started',
      message: `Starting MTProto post metrics cron for ${channels.length} channels.`,
      metadata: { channelsCount: channels.length },
    });
    for (const channel of channels) {
      try {
        const result =
          await telegramChannelsService.syncPostsMetricsForWorkspace(
            channel.workspaceId,
            channel.id,
            { postLimit: 100 },
          );
        this.logger.log(
          `MTProto post metrics synced for channel=${channel.id}, posts=${result.syncedPosts}`,
        );
      } catch (error) {
        this.logger.warn(
          `MTProto post metrics sync failed for channel=${channel.id}: ${error instanceof Error ? error.message : 'unknown error'}`,
        );
      }
    }
    this.applicationLogger.info({
      kind: 'cron',
      source: TelegramCronService.name,
      event: 'telegram.cron.post_metrics.completed',
      message: `MTProto post metrics cron finished for ${channels.length} channels.`,
      durationMs: Date.now() - startedAt,
      metadata: { channelsCount: channels.length },
    });
  }

  @Cron('0 4 * * *')
  async syncMtprotoBroadcastStats() {
    if (process.env.TELEGRAM_MTTPROTO_SYNC_ENABLED === 'false') return;
    const startedAt = Date.now();
    const channels = await this.prisma.telegramChannel.findMany({
      where: { isActive: true, adminLinks: { some: {} } },
      select: { id: true, workspaceId: true },
    });
    const telegramChannelsService = await this.moduleRef.resolve(
      TelegramChannelsService,
      undefined,
      { strict: false },
    );
    this.applicationLogger.info({
      kind: 'cron',
      source: TelegramCronService.name,
      event: 'telegram.cron.broadcast_stats.started',
      message: `Starting broadcast stats cron for ${channels.length} channels.`,
      metadata: { channelsCount: channels.length },
    });
    for (const channel of channels) {
      try {
        const link = await this.prisma.telegramChannelAdminLink.findFirst({
          where: {
            workspaceId: channel.workspaceId,
            telegramChannelId: channel.id,
          },
          orderBy: { createdAt: 'asc' },
        });
        if (!link) continue;
        const result =
          await telegramChannelsService.syncBroadcastStatsForWorkspace(
            channel.workspaceId,
            channel.id,
            link.telegramUserAccountIntegrationId,
          );
        this.logger.log(
          `MTProto broadcast stats synced for channel=${channel.id}, points=${result.pointsUpserted}`,
        );
      } catch (error) {
        this.logger.warn(
          `MTProto broadcast stats sync failed for channel=${channel.id}: ${error instanceof Error ? error.message : 'unknown error'}`,
        );
      }
    }
    this.applicationLogger.info({
      kind: 'cron',
      source: TelegramCronService.name,
      event: 'telegram.cron.broadcast_stats.completed',
      message: `Broadcast stats cron finished for ${channels.length} channels.`,
      durationMs: Date.now() - startedAt,
      metadata: { channelsCount: channels.length },
    });
  }

  @Cron('0 5 * * *')
  async runDailyAnalyticsSyncCron() {
    if (process.env.TELEGRAM_DAILY_ANALYTICS_SYNC_ENABLED === 'false') return;
    try {
      const dailyAnalyticsSyncService = await this.moduleRef.resolve(
        DailyAnalyticsSyncService,
        undefined,
        { strict: false },
      );
      const result = await dailyAnalyticsSyncService.runDailyAnalyticsSync({
        source: 'cron',
      });
      this.logger.log(
        `Daily analytics sync finished status=${result.status}, channels=${result.channelsProcessed}, campaigns=${result.campaignsProcessed}, snapshots=${result.snapshotsCreated}, errors=${result.errorsCount}`,
      );
      this.applicationLogger.info({
        kind: 'cron',
        source: TelegramCronService.name,
        event: 'telegram.cron.daily_analytics.completed',
        message: `Daily analytics sync finished with status ${result.status}.`,
        metadata: result as Record<string, unknown>,
      });
    } catch (error) {
      this.logger.error(
        `Daily analytics sync cron failed: ${error instanceof Error ? error.message : 'unknown error'}`,
      );
      this.applicationLogger.writeStructured({
        level: 'error',
        kind: 'cron',
        source: TelegramCronService.name,
        event: 'telegram.cron.daily_analytics.failed',
        message:
          error instanceof Error ? error.message : 'Daily analytics sync cron failed',
        errorName: error instanceof Error ? error.name : 'Error',
        stack: error instanceof Error ? error.stack || null : null,
      });
    }
  }
}
