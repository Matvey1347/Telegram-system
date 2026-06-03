import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaService } from '../prisma/prisma.service';
import { TelegramChannelsService } from '../telegram-channels/telegram-channels.service';

@Injectable()
export class TelegramCronService {
  private readonly logger = new Logger(TelegramCronService.name);

  constructor(
    private prisma: PrismaService,
    private telegramChannelsService: TelegramChannelsService,
  ) {}

  @Cron(CronExpression.EVERY_30_MINUTES)
  async syncMtprotoPostMetrics() {
    if (process.env.TELEGRAM_MTTPROTO_SYNC_ENABLED === 'false') return;
    const channels = await this.prisma.telegramChannel.findMany({
      where: { isActive: true, adminLinks: { some: {} } },
      select: { id: true, workspaceId: true },
    });
    for (const channel of channels) {
      try {
        const result =
          await this.telegramChannelsService.syncPostsMetricsForWorkspace(
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
          await this.telegramChannelsService.syncBroadcastStatsForWorkspace(
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
}
