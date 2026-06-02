import {
  BadRequestException,
  Injectable,
  InternalServerErrorException,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import { WorkspaceService } from '../common/workspace.service';
import { TokenEncryptionService } from '../common/security/token-encryption.service';
import {
  AttachCampaignDto,
  CheckBotAccessDto,
  CreateInviteLinkDto,
  DeepSyncDto,
  CreateTelegramChannelDto,
  HistoricalSyncDto,
  UpdateInviteLinkDto,
  UpdateTelegramChannelDto,
} from './dto';
import {
  TelegramApiError,
  TelegramBotApiClient,
} from '../telegram/shared/telegram-bot-api.client';
import { TelegramUserAccountStatus } from '@prisma/client';
import { TelegramMtprotoClient } from '../telegram/shared/telegram-mtproto.client';

@Injectable()
export class TelegramChannelsService {
  private readonly logger = new Logger(TelegramChannelsService.name);

  constructor(
    private prisma: PrismaService,
    private workspaceService: WorkspaceService,
    private encryptionService: TokenEncryptionService,
    private telegramApi: TelegramBotApiClient,
    private mtprotoClient: TelegramMtprotoClient,
    private configService: ConfigService,
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

    if (!keyId || !appKey || !bucketName) {
      throw new InternalServerErrorException(
        'B2 env vars missing: B2_KEY_ID, B2_APP_KEY, B2_BUCKET_NAME',
      );
    }

    const authHeader = Buffer.from(`${keyId}:${appKey}`).toString('base64');
    const authRes = await fetch(
      'https://api.backblazeb2.com/b2api/v2/b2_authorize_account',
      {
        method: 'GET',
        headers: { Authorization: `Basic ${authHeader}` },
      },
    );
    if (!authRes.ok) {
      throw new InternalServerErrorException('Failed to authorize Backblaze B2');
    }
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
        body: JSON.stringify({
          accountId: authData.accountId,
          bucketName,
        }),
      },
    );
    if (!listBucketsRes.ok) {
      throw new InternalServerErrorException('Failed to resolve B2 bucket');
    }
    const listBucketsData = (await listBucketsRes.json()) as {
      buckets?: Array<{ bucketId: string; bucketName: string }>;
    };
    const bucket = listBucketsData.buckets?.find((b) => b.bucketName === bucketName);
    if (!bucket?.bucketId) {
      throw new InternalServerErrorException(`B2 bucket not found: ${bucketName}`);
    }

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
    if (!uploadUrlRes.ok) {
      throw new InternalServerErrorException('Failed to get B2 upload URL');
    }
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
    if (!uploadRes.ok) {
      throw new InternalServerErrorException('Failed to upload image to B2');
    }

    if (!endpoint) {
      return `${authData.downloadUrl}/file/${bucketName}/${fileName}`;
    }

    const cleanEndpoint = endpoint.replace(/\/+$/, '');
    const s3HostLike = /(^https?:\/\/)?s3\./i.test(cleanEndpoint);
    const hasBucketInPath = new RegExp(`/${bucketName}(/|$)`, 'i').test(
      cleanEndpoint,
    );

    if (s3HostLike && !hasBucketInPath) {
      return `${cleanEndpoint}/${bucketName}/${fileName}`;
    }

    return `${cleanEndpoint}/${fileName}`;
  }

  private async resolveStoredChannelPhotoUrl(params: {
    token: string;
    photoBigFileId: string | null;
    currentPhotoBigFileId: string | null;
    currentPhotoUrl: string | null;
  }) {
    const { token, photoBigFileId, currentPhotoBigFileId, currentPhotoUrl } = params;
    if (!photoBigFileId) return null;

    const currentIsTelegramDirect = !!currentPhotoUrl?.includes(
      'api.telegram.org/file/',
    );
    const shouldRefresh =
      photoBigFileId !== currentPhotoBigFileId ||
      !currentPhotoUrl ||
      currentIsTelegramDirect;

    if (!shouldRefresh) return currentPhotoUrl;

    const file = await this.telegramApi.getFile(token, photoBigFileId);
    if (!file.file_path) return currentPhotoUrl || null;

    const telegramFileUrl = `https://api.telegram.org/file/bot${token}/${file.file_path}`;
    const fileRes = await fetch(telegramFileUrl);
    if (!fileRes.ok) return currentPhotoUrl || null;
    const contentType = fileRes.headers.get('content-type') || 'image/jpeg';
    const arr = await fileRes.arrayBuffer();
    const fileBuffer = Buffer.from(arr);
    if (!fileBuffer.length) return currentPhotoUrl || null;
    const extension = String(file.file_path).split('.').pop() || 'jpg';

    return this.uploadChannelPhotoToB2({
      fileBuffer,
      fileSize: fileBuffer.length,
      contentType,
      extension,
    });
  }

  async findAll(userId: string) {
    const workspaceId =
      await this.workspaceService.resolveWorkspaceIdForUser(userId);
    return this.prisma.telegramChannel.findMany({
      where: { workspaceId },
      include: {
        telegramBotIntegration: true,
        adminLinks: {
          include: {
            telegramUserAccountIntegration: {
              select: {
                id: true,
                username: true,
                firstName: true,
                lastName: true,
                photoUrl: true,
              },
            },
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async findOne(userId: string, id: string) {
    const workspaceId =
      await this.workspaceService.resolveWorkspaceIdForUser(userId);
    const row = await this.prisma.telegramChannel.findFirst({
      where: { id, workspaceId },
      include: {
        telegramBotIntegration: true,
        adminLinks: {
          include: {
            telegramUserAccountIntegration: {
              select: {
                id: true,
                username: true,
                firstName: true,
                lastName: true,
                photoUrl: true,
              },
            },
          },
        },
      },
    });
    if (!row) throw new NotFoundException('Telegram channel not found');
    return row;
  }

  async create(userId: string, dto: CreateTelegramChannelDto) {
    const workspaceId =
      await this.workspaceService.resolveWorkspaceIdForUser(userId);
    return this.prisma.telegramChannel.create({
      data: { workspaceId, ...dto },
      include: {
        telegramBotIntegration: true,
        adminLinks: {
          include: { telegramUserAccountIntegration: true },
        },
      },
    });
  }

  async update(userId: string, id: string, dto: UpdateTelegramChannelDto) {
    await this.findOne(userId, id);
    return this.prisma.telegramChannel.update({
      where: { id },
      data: dto,
      include: {
        telegramBotIntegration: true,
        adminLinks: {
          include: { telegramUserAccountIntegration: true },
        },
      },
    });
  }

  async remove(userId: string, id: string) {
    const workspaceId =
      await this.workspaceService.resolveWorkspaceIdForUser(userId);
    await this.findOne(userId, id);

    return this.prisma.$transaction(async (tx) => {
      const campaigns = await tx.adCampaign.findMany({
        where: { workspaceId, telegramChannelId: id },
        select: { id: true },
      });
      const campaignIds = campaigns.map((c) => c.id);
      const inviteLinks = await tx.telegramInviteLink.findMany({
        where: { workspaceId, telegramChannelId: id },
        select: { id: true },
      });
      const inviteIds = inviteLinks.map((x) => x.id);

      if (campaignIds.length) {
        await tx.transaction.deleteMany({
          where: { workspaceId, adCampaignId: { in: campaignIds } },
        });
      }

      await tx.subscriberEvent.deleteMany({
        where: {
          workspaceId,
          OR: [
            { telegramChannelId: id },
            campaignIds.length
              ? { adCampaignId: { in: campaignIds } }
              : undefined,
            inviteIds.length ? { inviteLinkId: { in: inviteIds } } : undefined,
          ].filter(Boolean) as any,
        },
      });

      await tx.promo.deleteMany({
        where: { workspaceId, telegramChannelId: id },
      });
      await tx.telegramInviteLink.deleteMany({
        where: { workspaceId, telegramChannelId: id },
      });
      await tx.adCampaign.deleteMany({
        where: { workspaceId, telegramChannelId: id },
      });
      await tx.telegramChannelDailyStats.deleteMany({
        where: { telegramChannelId: id },
      });
      await tx.telegramChannelAdminLink.deleteMany({
        where: { workspaceId, telegramChannelId: id },
      });
      await tx.telegramChannel.delete({ where: { id } });

      return { success: true };
    });
  }

  async checkBotAccess(
    userId: string,
    channelId: string,
    dto: CheckBotAccessDto,
  ) {
    const workspaceId =
      await this.workspaceService.resolveWorkspaceIdForUser(userId);
    const channel = await this.prisma.telegramChannel.findFirst({
      where: { id: channelId, workspaceId },
    });
    if (!channel) throw new NotFoundException('Telegram channel not found');

    const botId =
      dto.telegramBotIntegrationId || channel.telegramBotIntegrationId;
    if (!botId)
      throw new BadRequestException(
        'No bot selected. Assign a Telegram bot to this channel first.',
      );

    const bot = await this.prisma.telegramBotIntegration.findFirst({
      where: { id: botId, workspaceId, isActive: true },
    });
    if (!bot) throw new NotFoundException('Telegram bot not found');
    const token = this.encryptionService.decrypt({
      encrypted: bot.botTokenEncrypted,
      iv: bot.botTokenIv,
      authTag: bot.botTokenAuthTag,
    });

    const target = channel.telegramChatId || channel.username;
    if (!target)
      throw new BadRequestException(
        'Channel has no username or chatId. Add one before checking bot access.',
      );
    const chatId =
      target.startsWith('@') || target.startsWith('-') ? target : `@${target}`;

    try {
      const chat = await this.telegramApi.getChat(token, chatId);
      const membersCount = await this.telegramApi.getChatMemberCount(
        token,
        chatId,
      );
      const member = await this.telegramApi.getChatMember(
        token,
        chatId,
        bot.botId || '',
      );
      const admins = await this.telegramApi.getChatAdministrators(
        token,
        chatId,
      );
      const botAdmin = admins.find(
        (a) => String(a.user.id) === String(bot.botId),
      );
      const photoBigFileId = chat.photo?.big_file_id || null;
      const photoSmallFileId = chat.photo?.small_file_id || null;
      const photoUrl = await this.resolveStoredChannelPhotoUrl({
        token,
        photoBigFileId,
        currentPhotoBigFileId: channel.photoBigFileId,
        currentPhotoUrl: channel.photoUrl,
      });

      const isAdmin =
        member.status === 'administrator' || member.status === 'creator';
      const canInviteUsers = !!(
        member.can_invite_users ?? botAdmin?.can_invite_users
      );
      const canManageChat = !!(
        member.can_manage_chat ?? botAdmin?.can_manage_chat
      );
      const canPostMessages = !!(
        member.can_post_messages ?? botAdmin?.can_post_messages
      );

      const diagnostics = {
        botStatus: member.status || (isAdmin ? 'administrator' : 'member'),
        botIsAdmin: isAdmin,
        botCanInviteUsers: canInviteUsers,
        botCanManageChat: canManageChat,
        botCanPostMessages: canPostMessages,
        botCheckedAt: new Date(),
        currentSubscribersCount: membersCount,
        photoSmallFileId,
        photoBigFileId,
        photoUrl,
      };

      await this.prisma.telegramChannel.update({
        where: { id: channel.id },
        data: diagnostics,
      });

      if (!isAdmin) {
        return {
          ...diagnostics,
          message:
            'Bot has access to channel but is not admin. Please promote the bot to admin.',
        };
      }
      return diagnostics;
    } catch (error) {
      const message =
        error instanceof TelegramApiError
          ? error.message
          : 'Bot cannot access this channel';
      const diagnostics = {
        botStatus: 'no_access',
        botIsAdmin: false,
        botCanInviteUsers: false,
        botCanManageChat: false,
        botCanPostMessages: false,
        botCheckedAt: new Date(),
      };
      await this.prisma.telegramChannel.update({
        where: { id: channel.id },
        data: diagnostics,
      });
      return { ...diagnostics, message };
    }
  }

  async syncNow(userId: string, channelId: string) {
    const botStatus = await this.checkBotAccess(userId, channelId, {});
    const workspaceId =
      await this.workspaceService.resolveWorkspaceIdForUser(userId);

    const linkedAdmin = await this.prisma.telegramChannelAdminLink.findFirst({
      where: { workspaceId, telegramChannelId: channelId },
      orderBy: { createdAt: 'asc' },
      select: { telegramUserAccountIntegrationId: true },
    });

    if (!linkedAdmin?.telegramUserAccountIntegrationId) {
      return {
        ...botStatus,
        inviteLinksSync: {
          success: false,
          reason: 'No linked Telegram user account for invite-links sync',
        },
        channelStatsSync: {
          success: false,
          reason: 'No linked Telegram user account for broadcast stats sync',
        },
      };
    }

    const account = await this.prisma.telegramUserAccountIntegration.findFirst({
      where: {
        id: linkedAdmin.telegramUserAccountIntegrationId,
        workspaceId,
        isActive: true,
      },
      select: { id: true, status: true },
    });

    if (!account || account.status !== TelegramUserAccountStatus.connected) {
      return {
        ...botStatus,
        inviteLinksSync: {
          success: false,
          reason: 'Linked Telegram user account is not connected',
        },
        channelStatsSync: {
          success: false,
          reason: 'Linked Telegram user account is not connected',
        },
      };
    }

    const historical = await this.syncHistorical(userId, channelId, {
      telegramUserAccountId: account.id,
      syncInviteLinks: true,
      syncPosts: false,
      inviteLinks: [],
    });
    const postsMetricsSync = await this.syncPostsMetrics(userId, channelId, {
      telegramUserAccountId: account.id,
      postLimit: 100,
    }).catch((error: any) => ({
      error: error?.message || 'Post metrics sync failed',
    }));
    const channelStatsSync = await this.syncBroadcastStats(userId, channelId, {
      telegramUserAccountId: account.id,
    }).catch((error: any) => ({
      success: false,
      error: error?.message || 'Broadcast stats sync failed',
    }));

    return {
      ...botStatus,
      inviteLinksSync: {
        success: true,
        imported: historical.imported,
        updated: historical.updated,
      },
      postsMetricsSync,
      channelStatsSync,
    };
  }

  async syncBroadcastStats(
    userId: string,
    channelId: string,
    dto: { telegramUserAccountId?: string },
  ) {
    const workspaceId =
      await this.workspaceService.resolveWorkspaceIdForUser(userId);
    await this.findOne(userId, channelId);
    const linkedAdmin = !dto.telegramUserAccountId
      ? await this.prisma.telegramChannelAdminLink.findFirst({
          where: { workspaceId, telegramChannelId: channelId },
          orderBy: { createdAt: 'asc' },
          select: { telegramUserAccountIntegrationId: true },
        })
      : null;
    const accountId =
      dto.telegramUserAccountId ||
      linkedAdmin?.telegramUserAccountIntegrationId;
    if (!accountId) {
      throw new BadRequestException(
        'No connected Telegram user account selected for broadcast stats sync',
      );
    }
    return this.syncBroadcastStatsForWorkspace(workspaceId, channelId, accountId);
  }

  async syncBroadcastStatsForWorkspace(
    workspaceId: string,
    channelId: string,
    accountId: string,
  ) {
    const channel = await this.prisma.telegramChannel.findFirst({
      where: { id: channelId, workspaceId, isActive: true },
    });
    if (!channel) throw new NotFoundException('Telegram channel not found');
    const account = await this.prisma.telegramUserAccountIntegration.findFirst({
      where: { id: accountId, workspaceId, isActive: true },
    });
    if (!account || account.status !== TelegramUserAccountStatus.connected) {
      throw new BadRequestException('Telegram user account is not connected');
    }

    const apiHash = this.encryptionService.decrypt({
      encrypted: account.apiHashEncrypted,
      iv: account.apiHashIv,
      authTag: account.apiHashAuthTag,
    });
    const session = this.encryptionService.decrypt({
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
    if (!channelRef) {
      throw new BadRequestException('Channel must have username or chatId');
    }

    const stats = await this.mtprotoClient.getBroadcastStats({
      apiId: account.apiId,
      apiHash,
      session,
      channelRef,
    });
    const syncedAt = new Date();
    const snapshotDate = this.toUtcDay(syncedAt);
    const points = this.extractBroadcastStatsPoints({
      workspaceId,
      telegramChannelId: channel.id,
      syncedAt,
      normalizedStats: stats.normalized,
    });
    const snapshot = await this.prisma.telegramChannelStatsSnapshot.upsert({
      where: {
        telegramChannelId_snapshotDate: {
          telegramChannelId: channel.id,
          snapshotDate,
        },
      },
      create: {
        workspaceId,
        telegramChannelId: channel.id,
        syncedAt,
        snapshotDate,
        rawStats: stats.raw as any,
        normalizedStats: stats.normalized as any,
        availableFields: stats.availableFields,
        warnings: stats.warnings,
      },
      update: {
        syncedAt,
        rawStats: stats.raw as any,
        normalizedStats: stats.normalized as any,
        availableFields: stats.availableFields,
        warnings: stats.warnings,
      },
    });
    await this.prisma.$transaction(
      points.map((point) =>
        this.prisma.telegramChannelStatsPoint.upsert({
          where: {
            telegramChannelId_metric_series_date: {
              telegramChannelId: point.telegramChannelId,
              metric: point.metric,
              series: point.series,
              date: point.date,
            },
          },
          create: point,
          update: {
            seriesLabel: point.seriesLabel,
            color: point.color,
            graphType: point.graphType,
            value: point.value,
            latestSyncedAt: point.latestSyncedAt,
          },
        }),
      ),
    );

    return {
      success: stats.normalized.status === 'available',
      snapshot,
      pointsUpserted: points.length,
    };
  }

  private extractBroadcastStatsPoints(params: {
    workspaceId: string;
    telegramChannelId: string;
    syncedAt: Date;
    normalizedStats: any;
  }) {
    const points: Array<{
      workspaceId: string;
      telegramChannelId: string;
      metric: string;
      series: string;
      seriesLabel: string;
      color: string | null;
      graphType: string;
      date: Date;
      value: number;
      latestSyncedAt: Date;
    }> = [];
    for (const [metric, graph] of Object.entries(
      params.normalizedStats?.graphs || {},
    )) {
      if ((graph as any)?.status !== 'available') continue;
      let payload = (graph as any).data;
      if (typeof payload === 'string') {
        try {
          payload = JSON.parse(payload);
        } catch {
          continue;
        }
      }
      if (!Array.isArray(payload?.columns)) continue;
      const columns = payload.columns.filter(
        (column: unknown) => Array.isArray(column) && column.length > 1,
      ) as Array<Array<string | number>>;
      const xColumn = columns.find((column) => column[0] === 'x');
      if (!xColumn) continue;
      for (const valueColumn of columns.filter((column) => column[0] !== 'x')) {
        const series = String(valueColumn[0]);
        for (let index = 1; index < xColumn.length; index += 1) {
          const date = this.toTelegramStatsDay(xColumn[index]);
          const value = Number(valueColumn[index]);
          if (!date || !Number.isFinite(value)) continue;
          points.push({
            workspaceId: params.workspaceId,
            telegramChannelId: params.telegramChannelId,
            metric,
            series,
            seriesLabel: String(payload.names?.[series] || series),
            color: payload.colors?.[series]
              ? String(payload.colors[series])
              : null,
            graphType: String(payload.types?.[series] || 'line'),
            date,
            value,
            latestSyncedAt: params.syncedAt,
          });
        }
      }
    }
    return points;
  }

  private toTelegramStatsDay(value: unknown) {
    const numericValue = Number(value);
    if (!Number.isFinite(numericValue)) return null;
    const milliseconds =
      numericValue < 100_000_000_000 ? numericValue * 1000 : numericValue;
    const date = new Date(milliseconds);
    return Number.isNaN(date.getTime()) ? null : this.toUtcDay(date);
  }

  private toUtcDay(value: Date) {
    return new Date(
      Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), value.getUTCDate()),
    );
  }

  async deepSync(userId: string, channelId: string, dto: DeepSyncDto) {
    const workspaceId =
      await this.workspaceService.resolveWorkspaceIdForUser(userId);
    const channel = await this.findOne(userId, channelId);

    const linkedAdmin = await this.prisma.telegramChannelAdminLink.findFirst({
      where: { workspaceId, telegramChannelId: channelId },
      orderBy: { createdAt: 'asc' },
      select: { telegramUserAccountIntegrationId: true },
    });
    const accountId =
      dto.telegramUserAccountId || linkedAdmin?.telegramUserAccountIntegrationId;

    const bot = await this.syncNow(userId, channelId).catch((error: any) => ({
      error: error?.message || 'Bot sync failed',
    }));
    const historical = await this.syncHistorical(userId, channelId, {
      telegramUserAccountId: accountId,
      syncInviteLinks: true,
      syncPosts: true,
      postLimit: dto.postLimit || 300,
      inviteLinks: [],
    }).catch((error: any) => ({
      error: error?.message || 'Historical sync failed',
    }));

    return {
      message: 'Deep sync completed',
      channel: { id: channel.id, title: channel.title },
      bot,
      historical,
      sourceSelection: {
        requestedTelegramUserAccountId: dto.telegramUserAccountId || null,
        usedTelegramUserAccountId: accountId || null,
      },
    };
  }

  async syncHistorical(
    userId: string,
    channelId: string,
    dto: HistoricalSyncDto,
  ) {
    const workspaceId =
      await this.workspaceService.resolveWorkspaceIdForUser(userId);
    const channel = await this.findOne(userId, channelId);
    let account = null as any;
    if (dto.telegramUserAccountId) {
      account = await this.prisma.telegramUserAccountIntegration.findFirst({
        where: {
          id: dto.telegramUserAccountId,
          workspaceId,
          isActive: true,
        },
      });
      if (!account) throw new NotFoundException('Telegram user account not found');
      if (account.status !== TelegramUserAccountStatus.connected) {
        throw new BadRequestException(
          'Telegram user account must be connected before historical sync',
        );
      }
    }

    let pulledInviteLinks: Array<{
      url: string;
      name?: string;
      joinedCount?: number;
      isRevoked?: boolean;
    }> = [];
    let pulledDailyStats: Array<{
      date: string;
      viewsCount: number;
      reactionsCount: number;
      forwardsCount: number;
    }> = [];

    if (account && (dto.syncInviteLinks || dto.syncPosts)) {
      const apiHash = this.encryptionService.decrypt({
        encrypted: account.apiHashEncrypted,
        iv: account.apiHashIv,
        authTag: account.apiHashAuthTag,
      });
      const session = this.encryptionService.decrypt({
        encrypted: account.sessionEncrypted,
        iv: account.sessionIv,
        authTag: account.sessionAuthTag,
      });
      const channelRef = channel.username
        ? String(channel.username).startsWith('@')
          ? String(channel.username)
          : `@${String(channel.username)}`
        : channel.telegramChatId
          ? String(channel.telegramChatId)
          : null;
      if (!channelRef) {
        throw new BadRequestException(
          'Channel must have username or chatId for MTProto historical sync',
        );
      }

      const historical = await this.mtprotoClient.getChannelHistorical({
        apiId: account.apiId,
        apiHash,
        session,
        channelRef,
        postLimit: dto.postLimit || 100,
      });
      pulledInviteLinks = historical.inviteLinks || [];
      pulledDailyStats = historical.dailyStats || [];
    }

    const incomingInviteLinks = [
      ...(dto.inviteLinks || []),
      ...(dto.syncInviteLinks ? pulledInviteLinks : []),
    ];

    if (!incomingInviteLinks.length && !pulledDailyStats.length) {
      return {
        message: 'Historical sync completed. No data returned from MTProto.',
        imported: 0,
        updated: 0,
        postsUpdated: 0,
      };
    }

    let imported = 0;
    let updated = 0;
    for (const row of incomingInviteLinks) {
      const existing = await this.prisma.telegramInviteLink.findFirst({
        where: { workspaceId, telegramChannelId: channelId, url: row.url },
      });
      if (existing) {
        await this.prisma.telegramInviteLink.update({
          where: { id: existing.id },
          data: {
            name: row.name || existing.name,
            joinedCount: row.joinedCount ?? existing.joinedCount,
            isRevoked: row.isRevoked ?? existing.isRevoked,
            lastSyncedAt: new Date(),
          },
        });
        updated += 1;
      } else {
        await this.prisma.telegramInviteLink.create({
          data: {
            workspaceId,
            telegramChannelId: channelId,
            name: row.name || 'Imported historical link',
            url: row.url,
            telegramInviteLinkId: row.url,
            joinedCount: row.joinedCount ?? 0,
            isRevoked: row.isRevoked ?? false,
            lastSyncedAt: new Date(),
          },
        });
        imported += 1;
      }
    }

    let postsUpdated = 0;
    if (dto.syncPosts && pulledDailyStats.length) {
      for (const row of pulledDailyStats) {
        await this.prisma.telegramChannelDailyStats.upsert({
          where: {
            telegramChannelId_date: {
              telegramChannelId: channelId,
              date: new Date(row.date),
            },
          },
          create: {
            telegramChannelId: channelId,
            date: new Date(row.date),
            viewsCount: row.viewsCount,
            reactionsCount: row.reactionsCount,
            forwardsCount: row.forwardsCount,
          },
          update: {
            viewsCount: row.viewsCount,
            reactionsCount: row.reactionsCount,
            forwardsCount: row.forwardsCount,
          },
        });
        postsUpdated += 1;
      }
    }

    // Important: historical aggregate import must not create exact subscriber events.
    return {
      message: 'Historical sync completed.',
      imported,
      updated,
      postsUpdated,
      pulledInviteLinks: pulledInviteLinks.length,
    };
  }

  async events(userId: string, channelId: string, page = 1, limit = 50) {
    const workspaceId =
      await this.workspaceService.resolveWorkspaceIdForUser(userId);
    await this.findOne(userId, channelId);
    const safePage = Math.max(1, page);
    const safeLimit = Math.max(1, Math.min(200, limit));
    const skip = (safePage - 1) * safeLimit;
    const [items, total] = await Promise.all([
      this.prisma.subscriberEvent.findMany({
        where: { workspaceId, telegramChannelId: channelId },
        include: { inviteLink: true, adCampaign: true },
        orderBy: { eventDate: 'desc' },
        skip,
        take: safeLimit,
      }),
      this.prisma.subscriberEvent.count({
        where: { workspaceId, telegramChannelId: channelId },
      }),
    ]);
    return { items, total, page: safePage, limit: safeLimit };
  }

  async channelStatsSnapshots(userId: string, channelId: string, limit = 20) {
    const workspaceId =
      await this.workspaceService.resolveWorkspaceIdForUser(userId);
    await this.findOne(userId, channelId);
    const safeLimit = Math.max(1, Math.min(100, limit));
    return this.prisma.telegramChannelStatsSnapshot.findMany({
      where: { workspaceId, telegramChannelId: channelId },
      orderBy: { syncedAt: 'desc' },
      take: safeLimit,
    });
  }

  async updateLogs(userId: string, channelId: string, limit = 50, offset = 0) {
    const workspaceId =
      await this.workspaceService.resolveWorkspaceIdForUser(userId);
    const channel = await this.findOne(userId, channelId);
    if (!channel.telegramBotIntegrationId) {
      return { items: [], total: 0, limit, offset };
    }

    const safeLimit = Math.max(1, Math.min(200, limit));
    const safeOffset = Math.max(0, offset);
    const [items, total] = await Promise.all([
      this.prisma.telegramBotUpdateLog.findMany({
        where: {
          workspaceId,
          telegramBotIntegrationId: channel.telegramBotIntegrationId,
          OR: [
            { chatId: channel.telegramChatId || undefined },
            { updateType: { in: ['my_chat_member'] } },
          ],
        },
        orderBy: { createdAt: 'desc' },
        skip: safeOffset,
        take: safeLimit,
      }),
      this.prisma.telegramBotUpdateLog.count({
        where: {
          workspaceId,
          telegramBotIntegrationId: channel.telegramBotIntegrationId,
          OR: [
            { chatId: channel.telegramChatId || undefined },
            { updateType: { in: ['my_chat_member'] } },
          ],
        },
      }),
    ]);

    return { items, total, limit: safeLimit, offset: safeOffset };
  }

  async inviteLinks(userId: string, channelId: string) {
    const workspaceId =
      await this.workspaceService.resolveWorkspaceIdForUser(userId);
    await this.findOne(userId, channelId);
    return this.prisma.telegramInviteLink.findMany({
      where: { workspaceId, telegramChannelId: channelId },
      include: { adCampaign: true },
      orderBy: { createdAt: 'desc' },
    });
  }

  async promosByChannel(userId: string, channelId: string) {
    const workspaceId =
      await this.workspaceService.resolveWorkspaceIdForUser(userId);
    await this.findOne(userId, channelId);
    return this.prisma.promo.findMany({
      where: { workspaceId, telegramChannelId: channelId },
      orderBy: { createdAt: 'desc' },
    });
  }

  async posts(userId: string, channelId: string, limit = 50, offset = 0) {
    const workspaceId =
      await this.workspaceService.resolveWorkspaceIdForUser(userId);
    const safeLimit = Math.max(1, Math.min(200, limit));
    const safeOffset = Math.max(0, offset);
    const channel = await this.findOne(userId, channelId);
    const subscribersCurrent = channel.currentSubscribersCount ?? null;
    const where = { workspaceId, telegramChannelId: channelId };
    const [items, total] = await Promise.all([
      this.prisma.telegramPost.findMany({
        where,
        orderBy: { postDate: 'desc' },
        skip: safeOffset,
        take: safeLimit,
      }),
      this.prisma.telegramPost.count({ where }),
    ]);
    return {
      items: items.map((x) => {
        const viewsCount = x.viewsCount ?? null;
        const reactionsCount = x.reactionsCount ?? null;
        const commentsCount = x.commentsCount ?? null;
        const reactionRateByViews =
          viewsCount && reactionsCount != null ? (reactionsCount / viewsCount) * 100 : null;
        const commentsRateByViews =
          viewsCount && commentsCount != null ? (commentsCount / viewsCount) * 100 : null;
        const reactionRateBySubscribers =
          subscribersCurrent && reactionsCount != null
            ? (reactionsCount / subscribersCurrent) * 100
            : null;
        const commentsRateBySubscribers =
          subscribersCurrent && commentsCount != null
            ? (commentsCount / subscribersCurrent) * 100
            : null;
        const viewsRateBySubscribers =
          subscribersCurrent && viewsCount != null ? (viewsCount / subscribersCurrent) * 100 : null;
        return {
          ...x,
          reactionRateByViews,
          commentsRateByViews,
          reactionRateBySubscribers,
          commentsRateBySubscribers,
          viewsRateBySubscribers,
        };
      }),
      total,
      limit: safeLimit,
      offset: safeOffset,
    };
  }

  private startOfUtcDay(date: Date) {
    return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  }

  private async recalculateDailyStatsFromPosts(
    channelId: string,
    affectedDates: string[],
  ) {
    for (const dateStr of affectedDates) {
      const dayStart = new Date(`${dateStr}T00:00:00.000Z`);
      const dayEnd = new Date(dayStart.getTime() + 24 * 3600 * 1000);
      const aggregate = await this.prisma.telegramPost.aggregate({
        where: {
          telegramChannelId: channelId,
          postDate: { gte: dayStart, lt: dayEnd },
        },
        _sum: { viewsCount: true, reactionsCount: true, forwardsCount: true, commentsCount: true },
      });
      await this.prisma.telegramChannelDailyStats.upsert({
        where: { telegramChannelId_date: { telegramChannelId: channelId, date: dayStart } },
        create: {
          telegramChannelId: channelId,
          date: dayStart,
          viewsCount: aggregate._sum.viewsCount ?? 0,
          reactionsCount: aggregate._sum.reactionsCount ?? 0,
          forwardsCount: aggregate._sum.forwardsCount ?? 0,
        },
        update: {
          viewsCount: aggregate._sum.viewsCount ?? 0,
          reactionsCount: aggregate._sum.reactionsCount ?? 0,
          forwardsCount: aggregate._sum.forwardsCount ?? 0,
        },
      });
    }
  }

  async syncPostsMetrics(
    userId: string,
    channelId: string,
    dto: { telegramUserAccountId?: string; postLimit?: number },
  ) {
    const workspaceId = await this.workspaceService.resolveWorkspaceIdForUser(userId);
    const channel = await this.findOne(userId, channelId);

    const linkedAdmin = !dto.telegramUserAccountId
      ? await this.prisma.telegramChannelAdminLink.findFirst({
          where: { workspaceId, telegramChannelId: channelId },
          orderBy: { createdAt: 'asc' },
        })
      : null;
    const accountId = dto.telegramUserAccountId || linkedAdmin?.telegramUserAccountIntegrationId;
    if (!accountId) {
      throw new BadRequestException('No connected Telegram user account selected for sync');
    }
    const account = await this.prisma.telegramUserAccountIntegration.findFirst({
      where: { id: accountId, workspaceId, isActive: true },
    });
    if (!account || account.status !== TelegramUserAccountStatus.connected) {
      throw new BadRequestException('Telegram user account is not connected');
    }

    const apiHash = this.encryptionService.decrypt({
      encrypted: account.apiHashEncrypted,
      iv: account.apiHashIv,
      authTag: account.apiHashAuthTag,
    });
    const session = this.encryptionService.decrypt({
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
    if (!channelRef) throw new BadRequestException('Channel must have username or chatId');

    try {
      const metrics = await this.mtprotoClient.getChannelPostsMetrics({
        apiId: account.apiId,
        apiHash,
        session,
        channelRef,
        postLimit: dto.postLimit || 100,
      });
      let snapshotsCreated = 0;
      const affectedDays = new Set<string>();

      for (const post of metrics) {
        const upserted = await this.prisma.telegramPost.upsert({
          where: {
            telegramChannelId_telegramMessageId: {
              telegramChannelId: channel.id,
              telegramMessageId: post.telegramMessageId,
            },
          },
          create: {
            workspaceId,
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
            telegramPostId: upserted.id,
            viewsCount: post.viewsCount,
            forwardsCount: post.forwardsCount,
            reactionsCount: post.reactionsCount,
            commentsCount: post.commentsCount,
            reactions: post.reactions as any,
          },
        });
        snapshotsCreated += 1;
        affectedDays.add(post.postDate.toISOString().slice(0, 10));
      }

      await this.recalculateDailyStatsFromPosts(channel.id, Array.from(affectedDays));
      return {
        syncedPosts: metrics.length,
        snapshotsCreated,
        affectedDays: Array.from(affectedDays).sort(),
        channelId: channel.id,
      };
    } catch (error) {
      this.logger.error(
        `syncPostsMetrics failed for channel=${channelId}: ${error instanceof Error ? error.message : 'unknown error'}`,
      );
      throw new InternalServerErrorException('Failed to sync channel post metrics');
    }
  }

  async syncSubscribersCount(userId: string, channelId: string) {
    const workspaceId =
      await this.workspaceService.resolveWorkspaceIdForUser(userId);
    const channel = await this.findOne(userId, channelId);
    const botId = channel.telegramBotIntegrationId;
    if (!botId)
      throw new BadRequestException(
        'Channel has no assigned bot for subscriber count sync',
      );

    const bot = await this.prisma.telegramBotIntegration.findFirst({
      where: { id: botId, workspaceId, isActive: true },
    });
    if (!bot) throw new NotFoundException('Telegram bot not found');
    const token = this.encryptionService.decrypt({
      encrypted: bot.botTokenEncrypted,
      iv: bot.botTokenIv,
      authTag: bot.botTokenAuthTag,
    });
    const target = channel.telegramChatId || channel.username;
    if (!target)
      throw new BadRequestException('Channel has no username or chatId');
    const count = await this.telegramApi.getChatMemberCount(token, target);

    await this.prisma.telegramChannel.update({
      where: { id: channel.id },
      data: { currentSubscribersCount: count, botCheckedAt: new Date() },
    });
    const today = new Date();
    const date = new Date(
      Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate()),
    );
    await this.prisma.telegramChannelDailyStats.upsert({
      where: {
        telegramChannelId_date: { telegramChannelId: channel.id, date },
      },
      create: {
        telegramChannelId: channel.id,
        date,
        subscribersCount: count,
      },
      update: {
        subscribersCount: count,
      },
    });

    return { success: true, subscribersCount: count, checkedAt: new Date() };
  }

  async analytics(
    userId: string,
    channelId: string,
    from?: string,
    to?: string,
  ) {
    const workspaceId =
      await this.workspaceService.resolveWorkspaceIdForUser(userId);
    const channel = await this.findOne(userId, channelId);
    const fromDate = from
      ? new Date(from)
      : new Date(Date.now() - 30 * 24 * 3600 * 1000);
    const toDate = to ? new Date(to) : new Date();

    const [
      joinedByUser,
      leftByUser,
      inviteLinks,
      campaigns,
      dailyStats,
      recentEvents,
      recentPosts,
      latestChannelStatsSnapshot,
      channelStatsPoints,
    ] = await Promise.all([
      this.prisma.subscriberEvent.groupBy({
        by: ['telegramUserId'],
        where: {
          workspaceId,
          telegramChannelId: channelId,
          eventType: 'joined',
          eventDate: { gte: fromDate, lte: toDate },
        },
        _count: { _all: true },
      }),
      this.prisma.subscriberEvent.groupBy({
        by: ['telegramUserId'],
        where: {
          workspaceId,
          telegramChannelId: channelId,
          eventType: 'left',
          eventDate: { gte: fromDate, lte: toDate },
        },
        _count: { _all: true },
      }),
      this.prisma.telegramInviteLink.findMany({
        where: { workspaceId, telegramChannelId: channelId },
        include: { adCampaign: true },
      }),
      this.prisma.adCampaign.findMany({
        where: { workspaceId, telegramChannelId: channelId },
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.telegramChannelDailyStats.findMany({
        where: {
          telegramChannelId: channelId,
          date: { gte: fromDate, lte: toDate },
        },
        orderBy: { date: 'asc' },
      }),
      this.prisma.subscriberEvent.findMany({
        where: { workspaceId, telegramChannelId: channelId },
        include: { inviteLink: true, adCampaign: true },
        orderBy: { eventDate: 'desc' },
        take: 50,
      }),
      this.prisma.telegramPost.findMany({
        where: { workspaceId, telegramChannelId: channelId },
        orderBy: { postDate: 'desc' },
        take: 100,
      }),
      this.prisma.telegramChannelStatsSnapshot.findFirst({
        where: { workspaceId, telegramChannelId: channelId },
        orderBy: { syncedAt: 'desc' },
      }),
      this.prisma.telegramChannelStatsPoint.findMany({
        where: {
          workspaceId,
          telegramChannelId: channelId,
          date: { gte: fromDate, lte: toDate },
        },
        orderBy: [{ date: 'asc' }, { metric: 'asc' }, { series: 'asc' }],
      }),
    ]);
    const joinedTotal = joinedByUser.reduce(
      (sum, row) => sum + (row.telegramUserId ? 1 : row._count._all),
      0,
    );
    const leftTotal = leftByUser.reduce(
      (sum, row) => sum + (row.telegramUserId ? 1 : row._count._all),
      0,
    );
    const inviteLinksJoinedTotal = inviteLinks.reduce(
      (sum, row) => sum + Number(row.joinedCount || 0),
      0,
    );
    const now = new Date();
    const startOfToday = this.startOfUtcDay(now);
    const oneDayAgo = new Date(now.getTime() - 24 * 3600 * 1000);
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 3600 * 1000);
    const eligiblePosts = recentPosts.filter(
      (p: any) => p.postDate <= oneDayAgo && p.postDate >= thirtyDaysAgo && (p.viewsCount ?? 0) > 0,
    );
    const average = (values: number[]) =>
      values.length ? values.reduce((s, v) => s + v, 0) / values.length : null;
    const joinedToday = await this.prisma.subscriberEvent.count({
      where: {
        workspaceId,
        telegramChannelId: channelId,
        eventType: 'joined',
        eventDate: { gte: startOfToday },
      },
    });
    const leftToday = await this.prisma.subscriberEvent.count({
      where: {
        workspaceId,
        telegramChannelId: channelId,
        eventType: 'left',
        eventDate: { gte: startOfToday },
      },
    });
    const todaySnapshot = await this.prisma.telegramChannelDailyStats.findUnique({
      where: {
        telegramChannelId_date: { telegramChannelId: channelId, date: startOfToday },
      },
    });
    const subscribersCurrent = channel.currentSubscribersCount ?? 0;
    const netGrowthToday = joinedToday - leftToday;
    const [joinedSinceConnected, leftSinceConnected] = await Promise.all([
      this.prisma.subscriberEvent.count({
        where: {
          workspaceId,
          telegramChannelId: channelId,
          eventType: 'joined',
          eventDate: { gte: channel.createdAt },
        },
      }),
      this.prisma.subscriberEvent.count({
        where: {
          workspaceId,
          telegramChannelId: channelId,
          eventType: 'left',
          eventDate: { gte: channel.createdAt },
        },
      }),
    ]);
    const netGrowthSinceConnected = joinedSinceConnected - leftSinceConnected;
    const subscribersTodayChange =
      todaySnapshot?.subscribersCount != null
        ? subscribersCurrent - todaySnapshot.subscribersCount
        : netGrowthToday;
    const averagePostViews = average(
      recentPosts.map((p: any) => Number(p.viewsCount || 0)).filter((v: number) => v > 0),
    );
    const averagePostViewsEligible = average(
      eligiblePosts.map((p: any) => Number(p.viewsCount || 0)).filter((v: number) => v > 0),
    );
    const err =
      subscribersCurrent > 0 && averagePostViewsEligible != null
        ? (averagePostViewsEligible / subscribersCurrent) * 100
        : null;
    const averageReactionRateByViews = average(
      eligiblePosts
        .map((p: any) =>
          p.viewsCount ? (Number(p.reactionsCount || 0) / Number(p.viewsCount || 0)) * 100 : null,
        )
        .filter((v: number | null): v is number => v != null),
    );
    const averageReactionRateBySubscribers =
      subscribersCurrent > 0
        ? average(
            eligiblePosts.map(
              (p: any) => (Number(p.reactionsCount || 0) / subscribersCurrent) * 100,
            ),
          )
        : null;

    const campaignsWithMetrics = await Promise.all(
      campaigns.map(async (campaign: any) => {
        const where: any = {
          workspaceId,
          inviteLinkId: campaign.telegramInviteLinkId || undefined,
        };
        if (campaign.startedAt && campaign.endedAt) {
          where.eventDate = { gte: campaign.startedAt, lte: campaign.endedAt };
        } else if (campaign.placementDate) {
          where.eventDate = { gte: campaign.placementDate };
        }

        const [joinedEventsCount, leftCount, inviteLink] = await Promise.all([
          this.prisma.subscriberEvent.count({
            where: { ...where, eventType: 'joined' },
          }),
          this.prisma.subscriberEvent.count({
            where: { ...where, eventType: 'left' },
          }),
          campaign.telegramInviteLinkId
            ? this.prisma.telegramInviteLink.findFirst({
                where: {
                  id: campaign.telegramInviteLinkId,
                  workspaceId,
                },
                select: { joinedCount: true },
              })
            : null,
        ]);

        const joinedCount = Number(inviteLink?.joinedCount ?? joinedEventsCount ?? 0);
        const netGrowth = joinedCount - leftCount;
        const costAmount = Number(campaign.price || 0);
        const cpa = joinedCount > 0 ? costAmount / joinedCount : null;

        return {
          ...campaign,
          joinedCount,
          leftCount,
          netGrowthCount: netGrowth,
          cpa,
          costAmount,
        };
      }),
    );

    return {
      channel: {
        id: channel.id,
        title: channel.title,
        username: channel.username,
        photoUrl: channel.photoUrl,
        currentSubscribersCount: channel.currentSubscribersCount,
        botStatus: channel.botStatus,
        botIsAdmin: channel.botIsAdmin,
        botCanInviteUsers: channel.botCanInviteUsers,
        botCheckedAt: channel.botCheckedAt,
        adminLinks: channel.adminLinks,
      },
      summary: {
        subscribersCurrent,
        subscribersTodayChange,
        joinedToday,
        leftToday,
        netGrowthToday,
        joinedSinceConnected,
        leftSinceConnected,
        netGrowthSinceConnected,
        averagePostViews,
        averagePostViewsEligible,
        err,
        postsCount: recentPosts.length,
        eligiblePostsCount: eligiblePosts.length,
        joinedTotal,
        joinedHistoricalByLinks: inviteLinksJoinedTotal,
        leftTotal,
        netGrowth: joinedTotal - leftTotal,
        inviteLinksCount: inviteLinks.length,
        campaignsCount: campaigns.length,
        postsTotal: recentPosts.length,
        viewsTotal: recentPosts.reduce(
          (sum, p: any) => sum + Number(p?.viewsCount || 0),
          0,
        ),
        forwardsTotal: recentPosts.reduce(
          (sum, p: any) => sum + Number(p?.forwardsCount || 0),
          0,
        ),
        reactionsTotal: recentPosts.reduce((sum, p: any) => sum + Number(p?.reactionsCount || 0), 0),
        commentsTotal: recentPosts.reduce((sum, p: any) => sum + Number(p?.commentsCount || 0), 0),
        averageReactionRateByViews,
        averageReactionRateBySubscribers,
      },
      dailyStats,
      inviteLinks: inviteLinks.map((x) => ({
        ...x,
        campaignTitle: x.adCampaign?.title || null,
      })),
      campaigns: campaignsWithMetrics,
      recentEvents: recentEvents.map((x) => ({
        id: x.id,
        eventType: x.eventType,
        eventDate: x.eventDate,
        telegramUserId: x.telegramUserId,
        inviteLinkName: x.inviteLink?.name || null,
        inviteLinkUrl:
          (x.rawEvent as any)?.invite_link?.invite_link || x.inviteLink?.url || null,
        campaignTitle: x.adCampaign?.title || null,
      })),
      recentPosts: recentPosts,
      channelStatsSnapshot: latestChannelStatsSnapshot,
      channelStatsPoints,
    };
  }

  async createInviteLink(
    userId: string,
    channelId: string,
    dto: CreateInviteLinkDto,
  ) {
    const workspaceId =
      await this.workspaceService.resolveWorkspaceIdForUser(userId);
    const channel = await this.prisma.telegramChannel.findFirst({
      where: { id: channelId, workspaceId },
    });
    if (!channel) throw new NotFoundException('Telegram channel not found');
    if (!channel.telegramBotIntegrationId)
      throw new BadRequestException('Channel has no assigned bot');

    const bot = await this.prisma.telegramBotIntegration.findFirst({
      where: {
        id: channel.telegramBotIntegrationId,
        workspaceId,
        isActive: true,
      },
    });
    if (!bot) throw new NotFoundException('Telegram bot not found');
    const token = this.encryptionService.decrypt({
      encrypted: bot.botTokenEncrypted,
      iv: bot.botTokenIv,
      authTag: bot.botTokenAuthTag,
    });

    const target = channel.telegramChatId || channel.username;
    if (!target)
      throw new BadRequestException('Channel has no username or chatId');

    const result = await this.telegramApi.createChatInviteLink(token, target, {
      name: dto.name,
      expire_date: dto.expireDate
        ? Math.floor(new Date(dto.expireDate).getTime() / 1000)
        : undefined,
      member_limit: dto.memberLimit,
      creates_join_request: dto.createsJoinRequest,
    });

    return this.prisma.telegramInviteLink.create({
      data: {
        workspaceId,
        telegramChannelId: channel.id,
        adCampaignId: dto.adCampaignId || null,
        telegramBotIntegrationId: bot.id,
        name: dto.name,
        url: result.invite_link,
        telegramInviteLinkId: result.invite_link,
        createsJoinRequest:
          result.creates_join_request ?? dto.createsJoinRequest ?? false,
        expireDate: dto.expireDate ? new Date(dto.expireDate) : null,
        memberLimit: dto.memberLimit,
      },
    });
  }

  async updateInviteLink(
    userId: string,
    inviteLinkId: string,
    dto: UpdateInviteLinkDto,
  ) {
    const workspaceId =
      await this.workspaceService.resolveWorkspaceIdForUser(userId);
    const link = await this.prisma.telegramInviteLink.findFirst({
      where: { id: inviteLinkId, workspaceId },
      include: { telegramChannel: true, telegramBotIntegration: true },
    });
    if (!link) throw new NotFoundException('Invite link not found');
    if (!link.telegramBotIntegration)
      throw new BadRequestException('Invite link has no bot integration');

    const token = this.encryptionService.decrypt({
      encrypted: link.telegramBotIntegration.botTokenEncrypted,
      iv: link.telegramBotIntegration.botTokenIv,
      authTag: link.telegramBotIntegration.botTokenAuthTag,
    });
    const target =
      link.telegramChannel.telegramChatId || link.telegramChannel.username;
    if (!target)
      throw new BadRequestException('Channel has no username or chatId');

    const result = await this.telegramApi.editChatInviteLink(
      token,
      target,
      link.url,
      {
        name: dto.name ?? link.name,
        expire_date: dto.expireDate
          ? Math.floor(new Date(dto.expireDate).getTime() / 1000)
          : undefined,
        member_limit: dto.memberLimit,
        creates_join_request: dto.createsJoinRequest,
      },
    );

    return this.prisma.telegramInviteLink.update({
      where: { id: link.id },
      data: {
        name: dto.name ?? link.name,
        url: result.invite_link || link.url,
        createsJoinRequest: dto.createsJoinRequest ?? link.createsJoinRequest,
        expireDate: dto.expireDate ? new Date(dto.expireDate) : link.expireDate,
        memberLimit: dto.memberLimit ?? link.memberLimit,
        lastSyncedAt: new Date(),
      },
    });
  }

  async revokeInviteLink(userId: string, inviteLinkId: string) {
    const workspaceId =
      await this.workspaceService.resolveWorkspaceIdForUser(userId);
    const link = await this.prisma.telegramInviteLink.findFirst({
      where: { id: inviteLinkId, workspaceId },
      include: { telegramChannel: true, telegramBotIntegration: true },
    });
    if (!link) throw new NotFoundException('Invite link not found');
    if (!link.telegramBotIntegration) {
      return this.prisma.telegramInviteLink.update({
        where: { id: link.id },
        data: { isRevoked: true, lastSyncedAt: new Date() },
      });
    }

    const token = this.encryptionService.decrypt({
      encrypted: link.telegramBotIntegration.botTokenEncrypted,
      iv: link.telegramBotIntegration.botTokenIv,
      authTag: link.telegramBotIntegration.botTokenAuthTag,
    });
    const target =
      link.telegramChannel.telegramChatId || link.telegramChannel.username;
    if (!target)
      throw new BadRequestException('Channel has no username or chatId');

    await this.telegramApi.revokeChatInviteLink(token, target, link.url);
    return this.prisma.telegramInviteLink.update({
      where: { id: link.id },
      data: { isRevoked: true, lastSyncedAt: new Date() },
    });
  }

  async deleteInviteLink(userId: string, inviteLinkId: string) {
    const workspaceId =
      await this.workspaceService.resolveWorkspaceIdForUser(userId);
    const link = await this.prisma.telegramInviteLink.findFirst({
      where: { id: inviteLinkId, workspaceId },
      include: { telegramChannel: true, telegramBotIntegration: true },
    });
    if (!link) throw new NotFoundException('Invite link not found');

    if (link.telegramBotIntegration) {
      try {
        const token = this.encryptionService.decrypt({
          encrypted: link.telegramBotIntegration.botTokenEncrypted,
          iv: link.telegramBotIntegration.botTokenIv,
          authTag: link.telegramBotIntegration.botTokenAuthTag,
        });
        const target =
          link.telegramChannel.telegramChatId || link.telegramChannel.username;
        if (target) {
          await this.telegramApi.revokeChatInviteLink(token, target, link.url);
        }
      } catch {
        // Do not block deletion in our system if Telegram revoke fails.
      }
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.subscriberEvent.updateMany({
        where: { workspaceId, inviteLinkId: link.id },
        data: { inviteLinkId: null },
      });
      await tx.telegramInviteLink.delete({ where: { id: link.id } });
    });

    if (link.adCampaignId) {
      await this.recalculateCampaignMetricsById(link.adCampaignId);
    }

    return { success: true };
  }

  async attachInviteLinkCampaign(
    userId: string,
    inviteLinkId: string,
    dto: AttachCampaignDto,
  ) {
    const workspaceId =
      await this.workspaceService.resolveWorkspaceIdForUser(userId);
    const [link, campaign] = await Promise.all([
      this.prisma.telegramInviteLink.findFirst({
        where: { id: inviteLinkId, workspaceId },
      }),
      this.prisma.adCampaign.findFirst({
        where: { id: dto.adCampaignId, workspaceId },
      }),
    ]);
    if (!link) throw new NotFoundException('Invite link not found');
    if (!campaign) throw new NotFoundException('Campaign not found');
    if (campaign.telegramChannelId !== link.telegramChannelId)
      throw new BadRequestException(
        'Campaign and invite link must belong to the same channel',
      );

    const updated = await this.prisma.telegramInviteLink.update({
      where: { id: link.id },
      data: { adCampaignId: campaign.id, lastSyncedAt: new Date() },
      include: { adCampaign: true },
    });
    await this.recalculateCampaignMetricsById(campaign.id);
    return updated;
  }

  async detachInviteLinkCampaign(userId: string, inviteLinkId: string) {
    const workspaceId =
      await this.workspaceService.resolveWorkspaceIdForUser(userId);
    const link = await this.prisma.telegramInviteLink.findFirst({
      where: { id: inviteLinkId, workspaceId },
    });
    if (!link) throw new NotFoundException('Invite link not found');
    const previousCampaignId = link.adCampaignId;
    const updated = await this.prisma.telegramInviteLink.update({
      where: { id: link.id },
      data: { adCampaignId: null, lastSyncedAt: new Date() },
      include: { adCampaign: true },
    });
    if (previousCampaignId)
      await this.recalculateCampaignMetricsById(previousCampaignId);
    return updated;
  }

  async recalculateCampaignMetricsById(campaignId: string) {
    const campaign = await this.prisma.adCampaign.findUnique({
      where: { id: campaignId },
    });
    if (!campaign) return null;
    const [joinedCount, leftCount] = await Promise.all([
      this.prisma.subscriberEvent.count({
        where: { adCampaignId: campaignId, eventType: 'joined' },
      }),
      this.prisma.subscriberEvent.count({
        where: { adCampaignId: campaignId, eventType: 'left' },
      }),
    ]);
    const cpa =
      joinedCount > 0
        ? Number(campaign.priceInPrimaryCurrency) / joinedCount
        : null;
    return this.prisma.adCampaign.update({
      where: { id: campaignId },
      data: {
        joinedCount,
        leftCount,
        netGrowthCount: joinedCount - leftCount,
        cpa,
      },
    });
  }
}
