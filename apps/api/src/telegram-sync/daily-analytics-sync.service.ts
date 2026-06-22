import { Injectable, Logger } from '@nestjs/common';
import { AdCampaignAnalyticsService } from '../ad-campaigns/ad-campaign-analytics.service';
import { PrismaService } from '../prisma/prisma.service';
import { TelegramChannelAnalyticsService } from '../telegram-channels/telegram-channel-analytics.service';
import { TelegramChannelsService } from '../telegram-channels/telegram-channels.service';

@Injectable()
export class DailyAnalyticsSyncService {
  private readonly logger = new Logger(DailyAnalyticsSyncService.name);

  constructor(
    private prisma: PrismaService,
    private telegramChannelsService: TelegramChannelsService,
    private telegramChannelAnalyticsService: TelegramChannelAnalyticsService,
    private adCampaignAnalyticsService: AdCampaignAnalyticsService,
  ) {}

  async runDailyAnalyticsSync(options: { workspaceId?: string; source?: 'cron' | 'manual' } = {}) {
    const source = options.source || 'cron';
    const run = await (this.prisma as any).dailyAnalyticsSyncRun.create({
      data: {
        workspaceId: options.workspaceId || null,
        source,
        status: 'running',
      },
    });

    let channelsProcessed = 0;
    let campaignsProcessed = 0;
    let snapshotsCreated = 0;
    let errorsCount = 0;
    const errors: string[] = [];

    try {
      const workspaces = options.workspaceId
        ? [{ id: options.workspaceId }]
        : await this.prisma.workspace.findMany({ select: { id: true } });

      for (const workspace of workspaces) {
        const channels = await this.prisma.telegramChannel.findMany({
          where: { workspaceId: workspace.id, isActive: true },
          select: { id: true, workspaceId: true },
        });

        for (const channel of channels) {
          try {
            await this.telegramChannelsService.syncPostsMetricsForWorkspace(
              channel.workspaceId,
              channel.id,
              { postLimit: 100 },
            );
            const adminLink = await this.prisma.telegramChannelAdminLink.findFirst({
              where: {
                workspaceId: channel.workspaceId,
                telegramChannelId: channel.id,
              },
              orderBy: { createdAt: 'asc' },
            });
            if (adminLink) {
              await this.telegramChannelsService.syncBroadcastStatsForWorkspace(
                channel.workspaceId,
                channel.id,
                adminLink.telegramUserAccountIntegrationId,
              );
            }
            await this.telegramChannelAnalyticsService.createAudienceSnapshot(
              channel.id,
              source === 'manual' ? 'manual_daily_sync' : 'daily_cron',
            );
            channelsProcessed += 1;
            snapshotsCreated += 1;
          } catch (error) {
            errorsCount += 1;
            const message = `channel=${channel.id}: ${error instanceof Error ? error.message : 'unknown error'}`;
            errors.push(message);
            this.logger.warn(`Daily analytics channel sync failed: ${message}`);
          }
        }

        const campaigns = await (this.prisma.adCampaign as any).findMany({
          where: { workspaceId: workspace.id, excludeFromAnalytics: false },
          select: { id: true },
        });
        for (const campaign of campaigns) {
          try {
            await this.adCampaignAnalyticsService.recalculateCampaignAnalytics(
              workspace.id,
              campaign.id,
            );
            await (this.prisma.adCampaign as any).update({
              where: { id: campaign.id },
              data:
                source === 'manual'
                  ? { analyticsLastManualSyncedAt: new Date() }
                  : { analyticsLastAutoSyncedAt: new Date() },
            });
            campaignsProcessed += 1;
          } catch (error) {
            errorsCount += 1;
            const message = `campaign=${campaign.id}: ${error instanceof Error ? error.message : 'unknown error'}`;
            errors.push(message);
            this.logger.warn(`Daily analytics campaign recalc failed: ${message}`);
          }
        }
      }

      const status = errorsCount > 0 ? 'partial_failed' : 'success';
      return (this.prisma as any).dailyAnalyticsSyncRun.update({
        where: { id: run.id },
        data: {
          status,
          finishedAt: new Date(),
          channelsProcessed,
          campaignsProcessed,
          snapshotsCreated,
          errorsCount,
          errorMessage: errors.slice(0, 5).join('\n') || null,
        },
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'unknown error';
      this.logger.error(`Daily analytics sync failed: ${message}`);
      return (this.prisma as any).dailyAnalyticsSyncRun.update({
        where: { id: run.id },
        data: {
          status: 'failed',
          finishedAt: new Date(),
          channelsProcessed,
          campaignsProcessed,
          snapshotsCreated,
          errorsCount: errorsCount + 1,
          errorMessage: message,
        },
      });
    }
  }
}
