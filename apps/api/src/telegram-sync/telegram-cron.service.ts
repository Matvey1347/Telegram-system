import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Cron, CronExpression, Interval } from '@nestjs/schedule';
import { PrismaService } from '../prisma/prisma.service';
import { TokenEncryptionService } from '../common/security/token-encryption.service';
import { TelegramBotApiClient } from '../telegram/shared/telegram-bot-api.client';
import { TelegramSyncService } from './telegram-sync.service';
import { TelegramMtprotoClient } from '../telegram/shared/telegram-mtproto.client';

@Injectable()
export class TelegramCronService {
  private readonly logger = new Logger(TelegramCronService.name);

  constructor(
    private prisma: PrismaService,
    private encryption: TokenEncryptionService,
    private telegramApi: TelegramBotApiClient,
    private syncService: TelegramSyncService,
    private configService: ConfigService,
    private mtprotoClient: TelegramMtprotoClient,
  ) {}

  private async uploadChannelPhotoToB2(params: {
    fileBuffer: Buffer;
    fileSize: number;
    contentType?: string;
    extension?: string;
  }) {
    const keyId = this.configService.get<string>('B2_KEY_ID')?.trim();
    const appKey = this.configService.get<string>('B2_APP_KEY')?.trim();
    const bucketName = this.configService.get<string>('B2_BUCKET_NAME')?.trim();
    const endpoint = this.configService.get<string>('B2_ENDPOINT')?.trim();
    if (!keyId || !appKey || !bucketName) return null;

    const authHeader = Buffer.from(`${keyId}:${appKey}`).toString('base64');
    const authRes = await fetch(
      'https://api.backblazeb2.com/b2api/v2/b2_authorize_account',
      { method: 'GET', headers: { Authorization: `Basic ${authHeader}` } },
    );
    if (!authRes.ok) return null;
    const authData = (await authRes.json()) as {
      apiUrl: string;
      authorizationToken: string;
      downloadUrl: string;
      accountId: string;
    };

    const listBucketsRes = await fetch(
      `${authData.apiUrl}/b2api/v2/b2_list_buckets`,
      {
        method: 'POST',
        headers: {
          Authorization: authData.authorizationToken,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ accountId: authData.accountId, bucketName }),
      },
    );
    if (!listBucketsRes.ok) return null;
    const listBucketsData = (await listBucketsRes.json()) as {
      buckets?: Array<{ bucketId: string; bucketName: string }>;
    };
    const bucket = listBucketsData.buckets?.find((b) => b.bucketName === bucketName);
    if (!bucket?.bucketId) return null;

    const uploadUrlRes = await fetch(
      `${authData.apiUrl}/b2api/v2/b2_get_upload_url`,
      {
        method: 'POST',
        headers: {
          Authorization: authData.authorizationToken,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ bucketId: bucket.bucketId }),
      },
    );
    if (!uploadUrlRes.ok) return null;
    const uploadUrlData = (await uploadUrlRes.json()) as {
      uploadUrl: string;
      authorizationToken: string;
    };

    const safeExtension = (params.extension || 'jpg')
      .toLowerCase()
      .replace(/[^a-z0-9]/g, '') || 'jpg';
    const fileName = `channels/${Date.now()}-${Math.random().toString(36).slice(2, 10)}.${safeExtension}`;

    const uploadRes = await fetch(uploadUrlData.uploadUrl, {
      method: 'POST',
      headers: {
        Authorization: uploadUrlData.authorizationToken,
        'X-Bz-File-Name': encodeURIComponent(fileName),
        'Content-Type': params.contentType || 'b2/x-auto',
        'Content-Length': String(params.fileSize),
        'X-Bz-Content-Sha1': 'do_not_verify',
      },
      body: new Uint8Array(params.fileBuffer),
    });
    if (!uploadRes.ok) return null;

    if (!endpoint) return `${authData.downloadUrl}/file/${bucketName}/${fileName}`;
    const cleanEndpoint = endpoint.replace(/\/+$/, '');
    const s3HostLike = /(^https?:\/\/)?s3\./i.test(cleanEndpoint);
    const hasBucketInPath = new RegExp(`/${bucketName}(/|$)`, 'i').test(cleanEndpoint);
    if (s3HostLike && !hasBucketInPath) return `${cleanEndpoint}/${bucketName}/${fileName}`;
    return `${cleanEndpoint}/${fileName}`;
  }

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
        const photoBigFileId = chat.photo?.big_file_id || null;
        const photoNeedsRefresh =
          !!photoBigFileId &&
          (photoBigFileId !== channel.photoBigFileId ||
            !channel.photoUrl ||
            channel.photoUrl.includes('api.telegram.org/file/'));
        let photoUrl = channel.photoUrl;
        if (photoNeedsRefresh) {
          const file = await this.telegramApi.getFile(token, photoBigFileId);
          if (file.file_path) {
            const telegramFileUrl = `https://api.telegram.org/file/bot${token}/${file.file_path}`;
            const fileRes = await fetch(telegramFileUrl);
            if (fileRes.ok) {
              const contentType = fileRes.headers.get('content-type') || 'image/jpeg';
              const arr = await fileRes.arrayBuffer();
              const fileBuffer = Buffer.from(arr);
              if (fileBuffer.length) {
                const extension = String(file.file_path).split('.').pop() || 'jpg';
                const uploadedUrl = await this.uploadChannelPhotoToB2({
                  fileBuffer,
                  fileSize: fileBuffer.length,
                  contentType,
                  extension,
                });
                if (uploadedUrl) photoUrl = uploadedUrl;
              }
            }
          }
        }

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
            photoBigFileId,
            photoUrl,
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

  @Cron(CronExpression.EVERY_30_MINUTES)
  async syncMtprotoPostMetrics() {
    if (process.env.TELEGRAM_MTTPROTO_SYNC_ENABLED === 'false') return;

    const channels = await this.prisma.telegramChannel.findMany({
      where: { isActive: true },
      select: {
        id: true,
        workspaceId: true,
        username: true,
        telegramChatId: true,
        telegramBotIntegrationId: true,
      },
    });

    for (const channel of channels) {
      try {
        const link = await this.prisma.telegramChannelAdminLink.findFirst({
          where: { workspaceId: channel.workspaceId, telegramChannelId: channel.id },
          orderBy: { createdAt: 'asc' },
        });
        if (!link) continue;
        const account = await this.prisma.telegramUserAccountIntegration.findFirst({
          where: {
            id: link.telegramUserAccountIntegrationId,
            workspaceId: channel.workspaceId,
            isActive: true,
            status: 'connected',
          },
        });
        if (!account) continue;

        const apiHash = this.encryption.decrypt({
          encrypted: account.apiHashEncrypted,
          iv: account.apiHashIv,
          authTag: account.apiHashAuthTag,
        });
        const session = this.encryption.decrypt({
          encrypted: account.sessionEncrypted || '',
          iv: account.sessionIv || '',
          authTag: account.sessionAuthTag || '',
        });
        const channelRef = channel.username
          ? String(channel.username).startsWith('@')
            ? String(channel.username)
            : `@${String(channel.username)}`
          : channel.telegramChatId
            ? String(channel.telegramChatId)
            : null;
        if (!channelRef) continue;

        const posts = await this.mtprotoClient.getChannelPostsMetrics({
          apiId: account.apiId,
          apiHash,
          session,
          channelRef,
          postLimit: 100,
        });
        const affectedDays = new Set<string>();
        for (const post of posts) {
          const row = await this.prisma.telegramPost.upsert({
            where: {
              telegramChannelId_telegramMessageId: {
                telegramChannelId: channel.id,
                telegramMessageId: post.telegramMessageId,
              },
            },
            create: {
              workspaceId: channel.workspaceId,
              telegramChannelId: channel.id,
              telegramBotIntegrationId: channel.telegramBotIntegrationId || null,
              telegramMessageId: post.telegramMessageId,
              postDate: post.postDate,
              text: post.text,
              viewsCount: post.viewsCount,
              forwardsCount: post.forwardsCount,
              reactionsCount: post.reactionsCount,
              commentsCount: post.commentsCount,
              reactions: post.reactions as any,
              rawMessage: post.rawMessage as any,
            },
            update: {
              postDate: post.postDate,
              text: post.text,
              viewsCount: post.viewsCount,
              forwardsCount: post.forwardsCount,
              reactionsCount: post.reactionsCount,
              commentsCount: post.commentsCount,
              reactions: post.reactions as any,
              rawMessage: post.rawMessage as any,
            },
          });
          await this.prisma.telegramPostMetricSnapshot.create({
            data: {
              telegramPostId: row.id,
              viewsCount: post.viewsCount,
              forwardsCount: post.forwardsCount,
              reactionsCount: post.reactionsCount,
              commentsCount: post.commentsCount,
              reactions: post.reactions as any,
            },
          });
          affectedDays.add(post.postDate.toISOString().slice(0, 10));
        }
        for (const day of affectedDays) {
          const dayStart = new Date(`${day}T00:00:00.000Z`);
          const dayEnd = new Date(dayStart.getTime() + 24 * 3600 * 1000);
          const agg = await this.prisma.telegramPost.aggregate({
            where: {
              telegramChannelId: channel.id,
              postDate: { gte: dayStart, lt: dayEnd },
            },
            _sum: { viewsCount: true, reactionsCount: true, forwardsCount: true },
          });
          await this.prisma.telegramChannelDailyStats.upsert({
            where: {
              telegramChannelId_date: { telegramChannelId: channel.id, date: dayStart },
            },
            create: {
              telegramChannelId: channel.id,
              date: dayStart,
              viewsCount: agg._sum.viewsCount ?? 0,
              reactionsCount: agg._sum.reactionsCount ?? 0,
              forwardsCount: agg._sum.forwardsCount ?? 0,
            },
            update: {
              viewsCount: agg._sum.viewsCount ?? 0,
              reactionsCount: agg._sum.reactionsCount ?? 0,
              forwardsCount: agg._sum.forwardsCount ?? 0,
            },
          });
        }
        this.logger.log(`MTProto metrics synced for channel=${channel.id}, posts=${posts.length}`);
      } catch (error) {
        this.logger.warn(
          `MTProto metrics sync failed for channel=${channel.id}: ${error instanceof Error ? error.message : 'unknown error'}`,
        );
      }
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
