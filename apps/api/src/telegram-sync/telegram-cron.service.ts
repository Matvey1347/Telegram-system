import { Injectable, Logger } from '@nestjs/common';
import { ModuleRef } from '@nestjs/core';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaService } from '../prisma/prisma.service';
import { TelegramChannelsService } from '../telegram-channels/telegram-channels.service';
import { DailyAnalyticsSyncService } from './daily-analytics-sync.service';

@Injectable()
export class TelegramCronService {
  private readonly logger = new Logger(TelegramCronService.name);

  constructor(
    private prisma: PrismaService,
    private moduleRef: ModuleRef,
  ) {}

  @Cron(CronExpression.EVERY_30_MINUTES)
  async syncMtprotoPostMetrics() {
    if (process.env.TELEGRAM_MTTPROTO_SYNC_ENABLED === 'false') return;
    const channels = await this.prisma.telegramChannel.findMany({
      where: { isActive: true, adminLinks: { some: {} } },
      select: { id: true, workspaceId: true },
    });
    const telegramChannelsService = await this.moduleRef.resolve(
      TelegramChannelsService,
      undefined,
      { strict: false },
    );
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
  }

  @Cron('0 4 * * *')
  async syncMtprotoBroadcastStats() {
    if (process.env.TELEGRAM_MTTPROTO_SYNC_ENABLED === 'false') return;
    const channels = await this.prisma.telegramChannel.findMany({
      where: { isActive: true, adminLinks: { some: {} } },
      select: { id: true, workspaceId: true },
    });
    const telegramChannelsService = await this.moduleRef.resolve(
      TelegramChannelsService,
      undefined,
      { strict: false },
    );
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
    } catch (error) {
      this.logger.error(
        `Daily analytics sync cron failed: ${error instanceof Error ? error.message : 'unknown error'}`,
      );
    }
  }
}
