import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression, Interval } from '@nestjs/schedule';
import { PrismaService } from '../prisma/prisma.service';
import { TokenEncryptionService } from '../common/security/token-encryption.service';
import { TelegramBotApiClient } from '../telegram/shared/telegram-bot-api.client';
import { TelegramSyncService } from './telegram-sync.service';

@Injectable()
export class TelegramCronService {
  private readonly logger = new Logger(TelegramCronService.name);

  constructor(
    private prisma: PrismaService,
    private encryption: TokenEncryptionService,
    private telegramApi: TelegramBotApiClient,
    private syncService: TelegramSyncService,
  ) {}

  @Cron(CronExpression.EVERY_5_MINUTES)
  async syncChannelsSnapshot() {
    if (process.env.TELEGRAM_SYNC_ENABLED === 'false') return;

    const channels = await this.prisma.telegramChannel.findMany({
      where: { isActive: true, telegramBotIntegrationId: { not: null } },
      include: { telegramBotIntegration: true },
    });

    for (const channel of channels) {
      const bot = channel.telegramBotIntegration;
      if (!bot?.isActive) continue;
      const target = channel.telegramChatId || channel.username;
      if (!target) continue;

      try {
        const token = this.encryption.decrypt({
          encrypted: bot.botTokenEncrypted,
          iv: bot.botTokenIv,
          authTag: bot.botTokenAuthTag,
        });
        const chat = await this.telegramApi.getChat(token, target);
        const membersCount = await this.telegramApi.getChatMemberCount(
          token,
          target,
        );
        const botMember = bot.botId
          ? await this.telegramApi.getChatMember(token, target, bot.botId)
          : null;

        await this.prisma.telegramChannel.update({
          where: { id: channel.id },
          data: {
            title: chat.title || channel.title,
            username: chat.username
              ? `@${String(chat.username).replace('@', '')}`
              : channel.username,
            currentSubscribersCount: membersCount,
            botStatus: botMember?.status || channel.botStatus,
            botIsAdmin: botMember
              ? ['administrator', 'creator'].includes(botMember.status)
              : channel.botIsAdmin,
            botCanInviteUsers:
              botMember?.can_invite_users ?? channel.botCanInviteUsers,
            botCanManageChat:
              botMember?.can_manage_chat ?? channel.botCanManageChat,
            botCanPostMessages:
              botMember?.can_post_messages ?? channel.botCanPostMessages,
            botCheckedAt: new Date(),
            photoSmallFileId:
              chat.photo?.small_file_id || channel.photoSmallFileId,
            photoBigFileId: chat.photo?.big_file_id || channel.photoBigFileId,
          },
        });
      } catch (error) {
        this.logger.warn(
          `Snapshot sync failed for channel=${channel.id}: ${error instanceof Error ? error.message : 'unknown error'}`,
        );
      }
    }
  }

  @Cron(CronExpression.EVERY_HOUR)
  async syncDailyStats() {
    const channels = await this.prisma.telegramChannel.findMany({
      where: { isActive: true },
    });
    const date = new Date();
    date.setHours(0, 0, 0, 0);

    for (const channel of channels) {
      const [joinedCount, leftCount] = await Promise.all([
        this.prisma.subscriberEvent.count({
          where: {
            telegramChannelId: channel.id,
            eventType: 'joined',
            eventDate: { gte: date },
          },
        }),
        this.prisma.subscriberEvent.count({
          where: {
            telegramChannelId: channel.id,
            eventType: 'left',
            eventDate: { gte: date },
          },
        }),
      ]);

      await this.prisma.telegramChannelDailyStats.upsert({
        where: {
          telegramChannelId_date: { telegramChannelId: channel.id, date },
        },
        update: {
          subscribersCount: channel.currentSubscribersCount,
          joinedCount,
          leftCount,
          netGrowthCount: joinedCount - leftCount,
        },
        create: {
          telegramChannelId: channel.id,
          date,
          subscribersCount: channel.currentSubscribersCount,
          joinedCount,
          leftCount,
          netGrowthCount: joinedCount - leftCount,
        },
      });
    }
  }

  @Interval(15000)
  async pollUpdatesFallback() {
    const mode = (process.env.TELEGRAM_UPDATES_MODE || 'off').toLowerCase();
    if (mode !== 'polling') return;

    const bots = await this.prisma.telegramBotIntegration.findMany({
      where: { isActive: true },
    });
    for (const bot of bots) {
      if (bot.webhookActive) continue;
      await this.syncService.pollBotUpdates(bot.id);
    }
  }
}
