import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { TelegramChannelsService } from '../telegram-channels/telegram-channels.service';
import { ApplicationLoggerService } from '../application-logs/application-logger.service';

@Injectable()
export class TelegramWorkspaceSyncTasksService {
  private readonly logger = new Logger(TelegramWorkspaceSyncTasksService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly telegramChannelsService: TelegramChannelsService,
    private readonly applicationLogger: ApplicationLoggerService,
  ) {}

  async syncPostMetricsForWorkspace(workspaceId: string) {
    if (process.env.TELEGRAM_MTTPROTO_SYNC_ENABLED === 'false') {
      return {
        summary: 'MTProto sync is disabled by environment.',
        skipped: true,
      };
    }
    const startedAt = Date.now();
    const channels = await this.channelsWithAdminLinks(workspaceId);
    let synced = 0;
    let failed = 0;
    for (const channel of channels) {
      try {
        await this.telegramChannelsService.syncPostsMetricsForWorkspace(
          workspaceId,
          channel.id,
          { postLimit: 100 },
        );
        synced += 1;
      } catch (error) {
        failed += 1;
        this.logger.warn(
          `Post metrics sync failed for channel=${channel.id}: ${
            error instanceof Error ? error.message : 'unknown error'
          }`,
        );
      }
    }
    this.applicationLogger.info({
      kind: 'cron',
      source: TelegramWorkspaceSyncTasksService.name,
      event: 'telegram.scheduled.post_metrics.completed',
      message: `Post metrics task finished: ${synced}/${channels.length} channels synced.`,
      workspaceId,
      durationMs: Date.now() - startedAt,
      metadata: { synced, failed, total: channels.length },
    });
    return {
      summary: `Synced post metrics for ${synced}/${channels.length} channels${
        failed ? `, ${failed} failed` : ''
      }.`,
    };
  }

  async syncBroadcastStatsForWorkspace(workspaceId: string) {
    if (process.env.TELEGRAM_MTTPROTO_SYNC_ENABLED === 'false') {
      return {
        summary: 'MTProto sync is disabled by environment.',
        skipped: true,
      };
    }
    const startedAt = Date.now();
    const channels = await this.channelsWithAdminLinks(workspaceId);
    let synced = 0;
    let failed = 0;
    for (const channel of channels) {
      try {
        const link = await this.prisma.telegramChannelAdminLink.findFirst({
          where: { workspaceId, telegramChannelId: channel.id },
          orderBy: { createdAt: 'asc' },
        });
        if (!link) continue;
        await this.telegramChannelsService.syncBroadcastStatsForWorkspace(
          workspaceId,
          channel.id,
          link.telegramUserAccountIntegrationId,
        );
        synced += 1;
      } catch (error) {
        failed += 1;
        this.logger.warn(
          `Broadcast stats sync failed for channel=${channel.id}: ${
            error instanceof Error ? error.message : 'unknown error'
          }`,
        );
      }
    }
    this.applicationLogger.info({
      kind: 'cron',
      source: TelegramWorkspaceSyncTasksService.name,
      event: 'telegram.scheduled.broadcast_stats.completed',
      message: `Broadcast stats task finished: ${synced}/${channels.length} channels synced.`,
      workspaceId,
      durationMs: Date.now() - startedAt,
      metadata: { synced, failed, total: channels.length },
    });
    return {
      summary: `Synced broadcast stats for ${synced}/${channels.length} channels${
        failed ? `, ${failed} failed` : ''
      }.`,
    };
  }

  private channelsWithAdminLinks(workspaceId: string) {
    return this.prisma.telegramChannel.findMany({
      where: { workspaceId, isActive: true, adminLinks: { some: {} } },
      select: { id: true },
    });
  }
}
