import {
  BadRequestException,
  Injectable,
  InternalServerErrorException,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import {
  TelegramChannelDataType,
  TelegramDataSourceStatus,
  TelegramSourceType,
  TelegramUserAccountStatus,
} from '@prisma/client';
import { WorkspaceService } from '../common/workspace.service';
import { TokenEncryptionService } from '../common/security/token-encryption.service';
import { PrismaService } from '../prisma/prisma.service';
import { TelegramMtprotoClient } from '../telegram/shared/telegram-mtproto.client';
import { TelegramSourceAccessService } from '../telegram/shared/telegram-source-access.service';
import {
  AttachCampaignDto,
  CreateTelegramChannelDto,
  DeepSyncDto,
  HistoricalSyncDto,
  ImportTelegramChannelDto,
  UpdateTelegramChannelDto,
  UpdateTelegramPostManualMetricsDto,
} from './dto';
import { TelegramChannelAnalyticsService } from './telegram-channel-analytics.service';

@Injectable()
export class TelegramChannelsService {
  private readonly logger = new Logger(TelegramChannelsService.name);
  private readonly defaultPostSyncLimit = 100;
  private readonly initialPostBackfillLimit = 10_000;
  private readonly olderPostBackfillMaxPages = 5;

  constructor(
    private prisma: PrismaService,
    private workspaceService: WorkspaceService,
    private encryptionService: TokenEncryptionService,
    private mtprotoClient: TelegramMtprotoClient,
    private sourceAccessService: TelegramSourceAccessService,
    private analyticsService: TelegramChannelAnalyticsService,
  ) {}

  private workspace(userId: string) {
    return this.workspaceService.resolveWorkspaceIdForUser(userId);
  }

  private async createAudienceSnapshotSafely(channelId: string, source = 'sync') {
    try {
      return await this.analyticsService.createAudienceSnapshot(
        channelId,
        source,
      );
    } catch (error) {
      this.logger.warn(
        `Audience snapshot skipped for channel=${channelId}: ${error instanceof Error ? error.message : 'unknown error'}`,
      );
      return null;
    }
  }

  private toUtcDay(value: Date) {
    return new Date(
      Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), value.getUTCDate()),
    );
  }

  private channelRef(channel: {
    username: string | null;
    telegramChatId: string | null;
  }) {
    if (channel.username) {
      return channel.username.startsWith('@')
        ? channel.username
        : `@${channel.username}`;
    }
    return channel.telegramChatId || null;
  }

  private normalizeUsername(value?: string | null) {
    const normalized = String(value || '')
      .trim()
      .replace(/^@/, '')
      .toLowerCase();
    return normalized || null;
  }

  private normalizeChatId(value?: string | null) {
    const digits = String(value || '').trim();
    if (!digits) return null;
    return digits.replace(/^-100/, '').replace(/^-/, '') || null;
  }

  private normalizePublicChannelInput(input: string) {
    const trimmed = String(input || '').trim();
    if (!trimmed)
      throw new BadRequestException('Telegram channel input is required');
    let normalized = trimmed
      .replace(/^https?:\/\//i, '')
      .replace(/^tg:\/\//i, '');
    normalized = normalized.replace(/^www\./i, '');
    if (/^(t\.me|telegram\.me)\//i.test(normalized)) {
      normalized = normalized.replace(/^(t\.me|telegram\.me)\//i, '');
    }
    normalized = normalized
      .split(/[?#]/)[0]
      .replace(/^s\//i, '')
      .replace(/\/+$/, '');
    const firstPathPart = normalized.split('/')[0] || normalized;
    const username = this.normalizeUsername(firstPathPart);
    if (!username)
      throw new BadRequestException('Telegram channel input is invalid');
    return `@${username}`;
  }

  private async connectedAccount(
    workspaceId: string,
    channelId: string,
    requestedAccountId?: string,
  ) {
    const linkedAdmin = requestedAccountId
      ? null
      : await this.prisma.telegramChannelAdminLink.findFirst({
          where: { workspaceId, telegramChannelId: channelId },
          orderBy: { createdAt: 'asc' },
        });
    const accountId =
      requestedAccountId || linkedAdmin?.telegramUserAccountIntegrationId;
    if (!accountId) {
      throw new BadRequestException(
        'No connected Telegram user account selected for MTProto sync',
      );
    }
    const account = await this.prisma.telegramUserAccountIntegration.findFirst({
      where: { id: accountId, workspaceId, isActive: true },
    });
    if (!account || account.status !== TelegramUserAccountStatus.connected) {
      throw new BadRequestException('Telegram user account is not connected');
    }
    return account;
  }

  private sourceDisplayName(account: {
    label: string;
    username: string | null;
    firstName: string | null;
    phoneMasked?: string | null;
  }) {
    return account.username
      ? `@${account.username}`
      : account.firstName ||
          account.label ||
          account.phoneMasked ||
          'MTProto account';
  }

  private async bestMtprotoAccountId(
    workspaceId: string,
    channelId: string,
    dataType: TelegramChannelDataType,
  ) {
    const best = await this.sourceAccessService.bestMtprotoSource(
      workspaceId,
      channelId,
      dataType,
    );
    return best?.sourceId;
  }

  private accountCredentials(account: {
    apiId: string;
    apiHashEncrypted: string;
    apiHashIv: string;
    apiHashAuthTag: string;
    sessionEncrypted: string | null;
    sessionIv: string | null;
    sessionAuthTag: string | null;
  }) {
    return {
      apiId: account.apiId,
      apiHash: this.encryptionService.decrypt({
        encrypted: account.apiHashEncrypted,
        iv: account.apiHashIv,
        authTag: account.apiHashAuthTag,
      }),
      session: this.encryptionService.decrypt({
        encrypted: account.sessionEncrypted || '',
        iv: account.sessionIv || '',
        authTag: account.sessionAuthTag || '',
      }),
    };
  }

  private async postSyncLimitForChannel(channelId: string) {
    const existingPosts = await this.prisma.telegramPost.count({
      where: { telegramChannelId: channelId },
    });
    return existingPosts > 0
      ? this.defaultPostSyncLimit
      : this.initialPostBackfillLimit;
  }

  private async runInitialImportBackfill(params: {
    userId: string;
    workspaceId: string;
    channelId: string;
    accountId: string;
  }) {
    try {
      const historical = await this.syncHistorical(
        params.userId,
        params.channelId,
        {
          telegramUserAccountId: params.accountId,
          syncInviteLinks: true,
          syncPosts: true,
          postLimit: this.initialPostBackfillLimit,
        },
      );
      const postsMetricsSync = await this.syncPostsMetricsForWorkspace(
        params.workspaceId,
        params.channelId,
        {
          telegramUserAccountId: params.accountId,
          postLimit: this.initialPostBackfillLimit,
        },
      );
      const olderPostsBackfill =
        await this.syncOlderPostsMetricsBackfillForWorkspace(
          params.workspaceId,
          params.channelId,
          {
            telegramUserAccountId: params.accountId,
            maxPages: this.olderPostBackfillMaxPages,
          },
        );
      const channelStatsSync = await this.syncBroadcastStatsForWorkspace(
        params.workspaceId,
        params.channelId,
        params.accountId,
      );
      return {
        success: true,
        historical,
        postsMetricsSync,
        olderPostsBackfill,
        channelStatsSync,
      };
    } catch (error) {
      this.logger.warn(
        `Initial Telegram import backfill skipped for channel=${params.channelId}: ${error instanceof Error ? error.message : 'unknown error'}`,
      );
      return {
        success: false,
        error: error instanceof Error ? error.message : 'unknown error',
      };
    }
  }

  private async firstConnectedAccount(workspaceId: string) {
    const account = await this.prisma.telegramUserAccountIntegration.findFirst({
      where: {
        workspaceId,
        isActive: true,
        status: TelegramUserAccountStatus.connected,
      },
      orderBy: { createdAt: 'asc' },
    });
    if (!account) {
      throw new BadRequestException(
        'Connect an active Telegram user account before importing public channels',
      );
    }
    return account;
  }

  private async findMatchingChannels(
    workspaceId: string,
    username: string | null,
    telegramChatId: string | null,
  ) {
    if (!username && !telegramChatId) return [];
    const normalizedChatId = this.normalizeChatId(telegramChatId);
    const candidates = await this.prisma.telegramChannel.findMany({
      where: {
        workspaceId,
        OR: [
          ...(username ? [{ username: { not: null } }] : []),
          ...(telegramChatId ? [{ telegramChatId: { not: null } }] : []),
        ],
      },
      include: { adminLinks: true },
      orderBy: { createdAt: 'asc' },
    });
    return candidates.filter((channel) => {
      const sameUsername =
        username && this.normalizeUsername(channel.username) === username;
      const sameChatId =
        normalizedChatId &&
        this.normalizeChatId(channel.telegramChatId) === normalizedChatId;
      return Boolean(sameUsername || sameChatId);
    });
  }

  private async upsertImportedPerson(
    workspaceId: string,
    info: {
      title: string;
      username: string | null;
      description?: string | null;
      photoUrl?: string | null;
    },
  ) {
    const existing = info.username
      ? await this.prisma.advertisingSource.findFirst({
          where: {
            workspaceId,
            type: { not: 'telegram_channel' },
            telegramUsername: info.username,
          },
        })
      : null;
    const data = {
      workspaceId,
      name: info.title,
      type: 'direct' as const,
      url: info.username ? `https://t.me/${info.username}` : undefined,
      telegramUsername: info.username || undefined,
      description: info.description || undefined,
      imageUrl: info.photoUrl || undefined,
      subscribersCount: 0,
    };
    const row = existing
      ? await this.prisma.advertisingSource.update({
          where: { id: existing.id },
          data,
        })
      : await this.prisma.advertisingSource.create({ data });
    return {
      id: row.id,
      selectionId: `source:${row.id}`,
      kind: 'person',
      title: row.name,
      telegramUrl: row.url,
      username: row.telegramUsername,
      contactInfo: row.contactInfo,
      notes: row.notes,
      imageUrl: row.imageUrl,
      subscribersCount: 0,
      channelTags: Array.isArray(row.channelTags) ? row.channelTags : [],
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    };
  }

  private pickCanonicalChannel(
    channels: Array<{ id: string; adminLinks?: unknown[]; createdAt: Date }>,
  ) {
    return [...channels].sort((left, right) => {
      const leftAdmin = (left.adminLinks?.length || 0) > 0 ? 0 : 1;
      const rightAdmin = (right.adminLinks?.length || 0) > 0 ? 0 : 1;
      if (leftAdmin !== rightAdmin) return leftAdmin - rightAdmin;
      return left.createdAt.getTime() - right.createdAt.getTime();
    })[0];
  }

  private async mergeDuplicateChannels(
    tx: any,
    workspaceId: string,
    canonicalId: string,
    duplicateIds: string[],
  ) {
    if (!duplicateIds.length) return;
    const adminLinks = await tx.telegramChannelAdminLink.findMany({
      where: { workspaceId, telegramChannelId: { in: duplicateIds } },
      select: { telegramUserAccountIntegrationId: true, source: true },
    });
    if (adminLinks.length) {
      await tx.telegramChannelAdminLink.createMany({
        data: adminLinks.map((link: any) => ({
          workspaceId,
          telegramChannelId: canonicalId,
          telegramUserAccountIntegrationId:
            link.telegramUserAccountIntegrationId,
          source: link.source || 'mtproto',
        })),
        skipDuplicates: true,
      });
    }

    const placements = await tx.adCampaignTelegramChannelPlacement.findMany({
      where: { telegramChannelId: { in: duplicateIds } },
      select: { adCampaignId: true },
    });
    if (placements.length) {
      await tx.adCampaignTelegramChannelPlacement.createMany({
        data: placements.map((placement: any) => ({
          adCampaignId: placement.adCampaignId,
          telegramChannelId: canonicalId,
        })),
        skipDuplicates: true,
      });
    }

    await tx.telegramChannelAdminLink.deleteMany({
      where: { workspaceId, telegramChannelId: { in: duplicateIds } },
    });
    await tx.adCampaignTelegramChannelPlacement.deleteMany({
      where: { telegramChannelId: { in: duplicateIds } },
    });
    await tx.adCampaign.updateMany({
      where: { workspaceId, telegramChannelId: { in: duplicateIds } },
      data: { telegramChannelId: canonicalId },
    });
    await tx.telegramInviteLink.updateMany({
      where: { workspaceId, telegramChannelId: { in: duplicateIds } },
      data: { telegramChannelId: canonicalId },
    });
    await tx.promo.updateMany({
      where: { workspaceId, telegramChannelId: { in: duplicateIds } },
      data: { telegramChannelId: canonicalId },
    });
    await tx.telegramChannel.updateMany({
      where: { workspaceId, id: { in: duplicateIds } },
      data: { isActive: false },
    });
  }

  async findAll(userId: string) {
    const workspaceId = await this.workspace(userId);
    return this.prisma.telegramChannel.findMany({
      where: { workspaceId, isActive: true },
      include: {
        adminLinks: { include: { telegramUserAccountIntegration: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async findOne(userId: string, id: string) {
    const workspaceId = await this.workspace(userId);
    const channel = await this.prisma.telegramChannel.findFirst({
      where: { id, workspaceId },
      include: {
        adminLinks: { include: { telegramUserAccountIntegration: true } },
      },
    });
    if (!channel) throw new NotFoundException('Telegram channel not found');
    return channel;
  }

  async channelSources(userId: string, channelId: string) {
    const workspaceId = await this.workspace(userId);
    await this.findOne(userId, channelId);
    return this.sourceAccessService.sourcesForChannel(workspaceId, channelId);
  }

  async analyticsSources(userId: string, channelId: string) {
    const workspaceId = await this.workspace(userId);
    await this.findOne(userId, channelId);
    return this.sourceAccessService.analyticsSources(workspaceId, channelId);
  }

  async create(userId: string, dto: CreateTelegramChannelDto) {
    const workspaceId = await this.workspace(userId);
    return this.prisma.telegramChannel.create({
      data: {
        workspaceId,
        ...dto,
        username: this.normalizeUsername(dto.username),
      },
    });
  }

  async update(userId: string, id: string, dto: UpdateTelegramChannelDto) {
    await this.findOne(userId, id);
    return this.prisma.telegramChannel.update({
      where: { id },
      data: {
        ...dto,
        username:
          dto.username === undefined
            ? undefined
            : this.normalizeUsername(dto.username),
        kpiCurrency:
          dto.kpiCurrency === undefined
            ? undefined
            : String(dto.kpiCurrency || '').trim().toUpperCase() || null,
      },
    });
  }

  async audience(userId: string, channelId: string) {
    await this.findOne(userId, channelId);
    return this.analyticsService.getActiveAudienceEstimate(channelId);
  }

  async createAudienceSnapshot(
    userId: string,
    channelId: string,
    source = 'manual',
  ) {
    await this.findOne(userId, channelId);
    return this.analyticsService.createAudienceSnapshot(channelId, source);
  }

  async audienceSnapshots(userId: string, channelId: string, limit = 50) {
    const workspaceId = await this.workspace(userId);
    await this.findOne(userId, channelId);
    const safeLimit = Math.max(1, Math.min(200, limit));
    const rows = await this.prisma.telegramChannelAudienceSnapshot.findMany({
      where: { workspaceId, telegramChannelId: channelId },
      orderBy: { collectedAt: 'desc' },
      take: safeLimit,
    });
    return rows.reverse();
  }

  async financialSummary(userId: string, channelId: string) {
    await this.findOne(userId, channelId);
    return this.analyticsService.getChannelFinancialSummary(channelId);
  }

  async updatePostManualMetrics(
    userId: string,
    channelId: string,
    postId: string,
    dto: UpdateTelegramPostManualMetricsDto,
  ) {
    const workspaceId = await this.workspace(userId);
    await this.findOne(userId, channelId);
    const post = await this.prisma.telegramPost.findFirst({
      where: { id: postId, workspaceId, telegramChannelId: channelId },
    });
    if (!post) throw new NotFoundException('Telegram post not found');
    return this.prisma.telegramPost.update({
      where: { id: post.id },
      data: {
        manualOwnViews: dto.manualOwnViews,
        manualOwnReactions: dto.manualOwnReactions,
        excludeFromAnalytics: dto.excludeFromAnalytics,
      },
    });
  }

  async importChannel(userId: string, dto: ImportTelegramChannelDto) {
    const workspaceId = await this.workspace(userId);
    const account = await this.firstConnectedAccount(workspaceId);
    const channelRef = this.normalizePublicChannelInput(dto.input);
    const info = await this.mtprotoClient.getPublicChannelInfo({
      ...this.accountCredentials(account),
      channelRef,
    });
    const username = this.normalizeUsername(info.username);
    if (info.kind === 'person') {
      return this.upsertImportedPerson(workspaceId, {
        title: info.title,
        username,
        description: info.description,
        photoUrl: info.photoUrl,
      });
    }
    const telegramChatId = info.telegramChatId || null;
    const matchingChannels = await this.findMatchingChannels(
      workspaceId,
      username,
      telegramChatId,
    );
    const existing = this.pickCanonicalChannel(matchingChannels);
    const payload = {
      title: info.title,
      username,
      telegramChatId,
      description: info.description,
      currentSubscribersCount: info.participantsCount,
      photoUrl: info.photoUrl,
      sourceType: 'telegram',
      lastPublicSyncedAt: new Date(),
    };
    const channel = await this.prisma.$transaction(async (tx) => {
      if (!existing) {
        return tx.telegramChannel.create({
          data: {
            workspaceId,
            ...payload,
          },
        });
      }
      const duplicateIds = matchingChannels
        .filter((candidate) => candidate.id !== existing.id)
        .map((candidate) => candidate.id);
      await this.mergeDuplicateChannels(
        tx,
        workspaceId,
        existing.id,
        duplicateIds,
      );
      return tx.telegramChannel.update({
        where: { id: existing.id },
        data: { ...payload, isActive: true },
      });
    });
    await this.sourceAccessService.recordDataSource({
      workspaceId,
      channelId: channel.id,
      sourceId: account.id,
      sourceType: TelegramSourceType.MTPROTO,
      dataType: TelegramChannelDataType.CHANNEL_INFO,
      status: TelegramDataSourceStatus.SUCCESS,
      sourceDisplayName: this.sourceDisplayName(account),
      metadata: { source: 'public_channel_import' },
    });
    const importedChannel = await this.findOne(userId, channel.id);
    const initialSync = await this.runInitialImportBackfill({
      userId,
      workspaceId,
      channelId: channel.id,
      accountId: account.id,
    });
    return { ...importedChannel, initialSync };
  }

  async remove(userId: string, id: string) {
    const workspaceId = await this.workspace(userId);
    await this.findOne(userId, id);
    return this.prisma.$transaction(async (tx) => {
      const campaigns = await tx.adCampaign.findMany({
        where: { workspaceId, telegramChannelId: id },
        select: { id: true },
      });
      const campaignIds = campaigns.map((campaign) => campaign.id);
      if (campaignIds.length) {
        await tx.transaction.deleteMany({
          where: { workspaceId, adCampaignId: { in: campaignIds } },
        });
      }
      await tx.promo.deleteMany({
        where: { workspaceId, telegramChannelId: id },
      });
      await tx.telegramInviteLink.deleteMany({
        where: { workspaceId, telegramChannelId: id },
      });
      await tx.adCampaign.deleteMany({
        where: { workspaceId, telegramChannelId: id },
      });
      await tx.telegramChannel.delete({ where: { id } });
      return { success: true };
    });
  }

  async syncNow(userId: string, channelId: string) {
    const workspaceId = await this.workspace(userId);
    const account = await this.connectedAccount(
      workspaceId,
      channelId,
      await this.bestMtprotoAccountId(
        workspaceId,
        channelId,
        TelegramChannelDataType.STATS,
      ),
    );
    const publicInfo = await this.syncPublicChannelInfo(
      workspaceId,
      channelId,
      account,
    );
    const postLimit = await this.postSyncLimitForChannel(channelId);
    const historical = await this.syncHistorical(userId, channelId, {
      telegramUserAccountId: account.id,
      syncInviteLinks: true,
      syncPosts: true,
      postLimit,
    });
    const postsMetricsSync = await this.syncPostsMetrics(userId, channelId, {
      telegramUserAccountId: account.id,
      postLimit,
    });
    const olderPostsBackfill =
      await this.syncOlderPostsMetricsBackfillForWorkspace(
        workspaceId,
        channelId,
        {
          telegramUserAccountId: account.id,
          maxPages:
            postLimit === this.initialPostBackfillLimit
              ? this.olderPostBackfillMaxPages
              : 1,
        },
      );
    const channelStatsSync = await this.syncBroadcastStats(userId, channelId, {
      telegramUserAccountId: account.id,
    });
    const audienceSnapshot = await this.createAudienceSnapshotSafely(
      channelId,
      'sync',
    );
    return {
      source: 'mtproto',
      publicInfo,
      historical,
      postsMetricsSync,
      olderPostsBackfill,
      channelStatsSync,
      audienceSnapshot,
    };
  }

  async deepSync(userId: string, channelId: string, dto: DeepSyncDto) {
    const workspaceId = await this.workspace(userId);
    const account = await this.connectedAccount(
      workspaceId,
      channelId,
      dto.telegramUserAccountId ||
        (await this.bestMtprotoAccountId(
          workspaceId,
          channelId,
          TelegramChannelDataType.STATS,
        )),
    );
    const publicInfo = await this.syncPublicChannelInfo(
      workspaceId,
      channelId,
      account,
    );
    const historical = await this.syncHistorical(userId, channelId, {
      telegramUserAccountId: account.id,
      syncInviteLinks: true,
      syncPosts: true,
      postLimit: dto.postLimit || this.initialPostBackfillLimit,
    });
    const postsMetricsSync = await this.syncPostsMetrics(userId, channelId, {
      telegramUserAccountId: account.id,
      postLimit: dto.postLimit || this.initialPostBackfillLimit,
    });
    const olderPostsBackfill =
      await this.syncOlderPostsMetricsBackfillForWorkspace(
        workspaceId,
        channelId,
        {
          telegramUserAccountId: account.id,
          maxPages: this.olderPostBackfillMaxPages,
        },
      );
    const channelStatsSync = await this.syncBroadcastStats(userId, channelId, {
      telegramUserAccountId: account.id,
    });
    const audienceSnapshot = await this.createAudienceSnapshotSafely(
      channelId,
      'sync',
    );
    return {
      message: 'Deep MTProto sync completed',
      source: 'mtproto',
      publicInfo,
      historical,
      postsMetricsSync,
      olderPostsBackfill,
      channelStatsSync,
      audienceSnapshot,
    };
  }

  private async syncPublicChannelInfo(
    workspaceId: string,
    channelId: string,
    account: {
      id: string;
      apiId: string;
      apiHashEncrypted: string;
      apiHashIv: string;
      apiHashAuthTag: string;
      sessionEncrypted: string | null;
      sessionIv: string | null;
      sessionAuthTag: string | null;
      label: string;
      username: string | null;
      firstName: string | null;
      phoneMasked: string | null;
    },
  ) {
    const channel = await this.prisma.telegramChannel.findFirst({
      where: { id: channelId, workspaceId, isActive: true },
    });
    if (!channel) throw new NotFoundException('Telegram channel not found');
    const channelRef = this.channelRef(channel);
    if (!channelRef)
      throw new BadRequestException('Channel must have username or chatId');
    const info = await this.mtprotoClient.getPublicChannelInfo({
      ...this.accountCredentials(account),
      channelRef,
    });
    if (info.kind !== 'channel') {
      return {
        updated: false,
        reason: 'Resolved Telegram entity is not a channel',
      };
    }
    const updated = await this.prisma.telegramChannel.update({
      where: { id: channelId },
      data: {
        title: info.title,
        username: this.normalizeUsername(info.username),
        telegramChatId: info.telegramChatId || channel.telegramChatId,
        description: info.description,
        currentSubscribersCount: info.participantsCount,
        photoUrl: info.photoUrl,
        lastPublicSyncedAt: new Date(),
      },
    });
    await this.sourceAccessService.recordDataSource({
      workspaceId,
      channelId,
      sourceId: account.id,
      sourceType: TelegramSourceType.MTPROTO,
      dataType: TelegramChannelDataType.CHANNEL_INFO,
      status: TelegramDataSourceStatus.SUCCESS,
      sourceDisplayName: this.sourceDisplayName(account),
      metadata: {
        source: 'sync_public_channel_info',
        subscribersCount: updated.currentSubscribersCount,
      },
    });
    return {
      updated: true,
      title: updated.title,
      subscribersCount: updated.currentSubscribersCount,
      username: updated.username,
    };
  }

  async syncHistorical(
    userId: string,
    channelId: string,
    dto: HistoricalSyncDto,
  ) {
    const workspaceId = await this.workspace(userId);
    const channel = await this.findOne(userId, channelId);
    const account = await this.connectedAccount(
      workspaceId,
      channelId,
      dto.telegramUserAccountId,
    );
    const channelRef = this.channelRef(channel);
    if (!channelRef)
      throw new BadRequestException('Channel must have username or chatId');
    const historical = await this.mtprotoClient.getChannelHistorical({
      ...this.accountCredentials(account),
      channelRef,
      postLimit: dto.postLimit || this.defaultPostSyncLimit,
    });
    let imported = 0;
    let updated = 0;
    const affectedCampaignIds = new Set<string>();
    if (dto.syncInviteLinks) {
      for (const row of historical.inviteLinks || []) {
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
          if (existing.adCampaignId)
            affectedCampaignIds.add(existing.adCampaignId);
        } else {
          await this.prisma.telegramInviteLink.create({
            data: {
              workspaceId,
              telegramChannelId: channelId,
              name: row.name || 'Imported MTProto link',
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
      for (const campaignId of affectedCampaignIds) {
        await this.recalculateCampaignMetricsById(campaignId);
      }
      await this.sourceAccessService.recordDataSource({
        workspaceId,
        channelId,
        sourceId: account.id,
        sourceType: TelegramSourceType.MTPROTO,
        dataType: TelegramChannelDataType.INVITE_LINKS,
        status: TelegramDataSourceStatus.SUCCESS,
        sourceDisplayName: this.sourceDisplayName(account),
        metadata: { imported, updated },
      });
    }
    let postsUpdated = 0;
    if (dto.syncPosts) {
      for (const row of historical.dailyStats || []) {
        const date = new Date(`${row.date}T00:00:00.000Z`);
        await this.prisma.telegramChannelDailyStats.upsert({
          where: {
            telegramChannelId_date: { telegramChannelId: channelId, date },
          },
          create: {
            telegramChannelId: channelId,
            date,
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
      await this.sourceAccessService.recordDataSource({
        workspaceId,
        channelId,
        sourceId: account.id,
        sourceType: TelegramSourceType.MTPROTO,
        dataType: TelegramChannelDataType.POSTS,
        status: TelegramDataSourceStatus.SUCCESS,
        sourceDisplayName: this.sourceDisplayName(account),
        metadata: { postsUpdated },
      });
    }
    const audienceSnapshot =
      dto.syncPosts || dto.syncInviteLinks
        ? await this.createAudienceSnapshotSafely(channelId, 'sync')
        : null;
    return {
      message: 'Historical MTProto sync completed',
      source: 'mtproto',
      imported,
      updated,
      postsUpdated,
      audienceSnapshot,
    };
  }

  async syncPostsMetrics(
    userId: string,
    channelId: string,
    dto: { telegramUserAccountId?: string; postLimit?: number },
  ) {
    const workspaceId = await this.workspace(userId);
    return this.syncPostsMetricsForWorkspace(workspaceId, channelId, dto);
  }

  async syncPostsMetricsForWorkspace(
    workspaceId: string,
    channelId: string,
    dto: { telegramUserAccountId?: string; postLimit?: number },
  ) {
    const channel = await this.prisma.telegramChannel.findFirst({
      where: { id: channelId, workspaceId, isActive: true },
    });
    if (!channel) throw new NotFoundException('Telegram channel not found');
    const account = await this.connectedAccount(
      workspaceId,
      channelId,
      dto.telegramUserAccountId,
    );
    const channelRef = this.channelRef(channel);
    if (!channelRef)
      throw new BadRequestException('Channel must have username or chatId');
    try {
      const metrics = await this.mtprotoClient.getChannelPostsMetrics({
        ...this.accountCredentials(account),
        channelRef,
        postLimit: dto.postLimit || this.defaultPostSyncLimit,
      });
      await this.persistPostMetrics(workspaceId, channel.id, metrics);
      for (const dataType of [
        TelegramChannelDataType.POSTS,
        TelegramChannelDataType.VIEWS,
        TelegramChannelDataType.REACTIONS,
      ]) {
        await this.sourceAccessService.recordDataSource({
          workspaceId,
          channelId,
          sourceId: account.id,
          sourceType: TelegramSourceType.MTPROTO,
          dataType,
          status: TelegramDataSourceStatus.SUCCESS,
          sourceDisplayName: this.sourceDisplayName(account),
          metadata: { syncedPosts: metrics.length },
        });
      }
      const audienceSnapshot = await this.createAudienceSnapshotSafely(
        channelId,
        'sync',
      );
      return { source: 'mtproto', syncedPosts: metrics.length, audienceSnapshot };
    } catch (error) {
      this.logger.error(
        `MTProto post metrics sync failed for channel=${channelId}: ${error instanceof Error ? error.message : 'unknown error'}`,
      );
      throw new InternalServerErrorException(
        'Failed to sync channel post metrics',
      );
    }
  }

  private async persistPostMetrics(
    workspaceId: string,
    channelId: string,
    metrics: any[],
  ) {
    const affectedDays = new Set<string>();
    for (const post of metrics) {
      const upserted = await this.prisma.telegramPost.upsert({
        where: {
          telegramChannelId_telegramMessageId: {
            telegramChannelId: channelId,
            telegramMessageId: post.telegramMessageId,
          },
        },
        create: {
          workspaceId,
          telegramChannelId: channelId,
          telegramMessageId: post.telegramMessageId,
          postDate: post.postDate,
          text: post.text,
          viewsCount: post.viewsCount,
          forwardsCount: post.forwardsCount,
          reactionsCount: post.reactionsCount,
          commentsCount: post.commentsCount,
          reactions: post.reactions,
          rawMessage: post.rawMessage,
        },
        update: {
          postDate: post.postDate,
          text: post.text,
          viewsCount: post.viewsCount,
          forwardsCount: post.forwardsCount,
          reactionsCount: post.reactionsCount,
          commentsCount: post.commentsCount,
          reactions: post.reactions,
          rawMessage: post.rawMessage,
        },
      });
      await this.prisma.telegramPostMetricSnapshot.create({
        data: {
          telegramPostId: upserted.id,
          viewsCount: post.viewsCount,
          forwardsCount: post.forwardsCount,
          reactionsCount: post.reactionsCount,
          commentsCount: post.commentsCount,
          reactions: post.reactions,
        },
      });
      affectedDays.add(post.postDate.toISOString().slice(0, 10));
    }
    await this.recalculateDailyStatsFromPosts(channelId, [...affectedDays]);
    return { affectedDays: affectedDays.size };
  }

  private oldestMessageId(metrics: Array<{ telegramMessageId: string }>) {
    return metrics.reduce<string | null>((oldest, post) => {
      const current = this.toFiniteMessageId(post.telegramMessageId);
      const previous = this.toFiniteMessageId(oldest);
      if (current == null) return oldest;
      if (previous == null || current < previous) return post.telegramMessageId;
      return oldest;
    }, null);
  }

  private toFiniteMessageId(value: unknown) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }

  private async syncOlderPostsMetricsBackfillForWorkspace(
    workspaceId: string,
    channelId: string,
    dto: { telegramUserAccountId?: string; maxPages?: number },
  ) {
    const channel = await this.prisma.telegramChannel.findFirst({
      where: { id: channelId, workspaceId, isActive: true },
    });
    if (!channel) throw new NotFoundException('Telegram channel not found');
    const account = await this.connectedAccount(
      workspaceId,
      channelId,
      dto.telegramUserAccountId,
    );
    const channelRef = this.channelRef(channel);
    if (!channelRef)
      throw new BadRequestException('Channel must have username or chatId');

    const oldestStored = await this.prisma.telegramPost.findFirst({
      where: { telegramChannelId: channel.id },
      orderBy: [{ postDate: 'asc' }, { telegramMessageId: 'asc' }],
      select: { telegramMessageId: true, postDate: true },
    });
    if (!oldestStored?.telegramMessageId) {
      return { source: 'mtproto', syncedPosts: 0, pagesFetched: 0 };
    }
    let beforeMessageId = oldestStored.telegramMessageId;
    const backfillStart = oldestStored;

    let syncedPosts = 0;
    let pagesFetched = 0;
    const maxPages = Math.max(1, dto.maxPages || 1);
    for (let page = 0; page < maxPages; page += 1) {
      const metrics = await this.mtprotoClient.getChannelPostsMetrics({
        ...this.accountCredentials(account),
        channelRef,
        postLimit: this.initialPostBackfillLimit,
        beforeMessageId,
      });
      if (!metrics.length) break;
      await this.persistPostMetrics(workspaceId, channel.id, metrics);
      syncedPosts += metrics.length;
      pagesFetched += 1;

      const nextBeforeMessageId = this.oldestMessageId(metrics);
      const next = this.toFiniteMessageId(nextBeforeMessageId);
      const current = this.toFiniteMessageId(beforeMessageId);
      if (
        !nextBeforeMessageId ||
        next == null ||
        current == null ||
        next >= current
      )
        break;
      beforeMessageId = nextBeforeMessageId;
    }

    if (syncedPosts > 0) {
      await this.sourceAccessService.recordDataSource({
        workspaceId,
        channelId,
        sourceId: account.id,
        sourceType: TelegramSourceType.MTPROTO,
        dataType: TelegramChannelDataType.POSTS,
        status: TelegramDataSourceStatus.SUCCESS,
        sourceDisplayName: this.sourceDisplayName(account),
        metadata: { olderSyncedPosts: syncedPosts, pagesFetched },
      });
    }

    return {
      source: 'mtproto',
      syncedPosts,
      pagesFetched,
      fromMessageId: backfillStart.telegramMessageId,
      fromDate: backfillStart.postDate,
      nextBeforeMessageId: beforeMessageId,
    };
  }

  private async recalculateDailyStatsFromPosts(
    channelId: string,
    dates: string[],
  ) {
    for (const value of dates) {
      const date = new Date(`${value}T00:00:00.000Z`);
      const nextDate = new Date(date.getTime() + 24 * 3600 * 1000);
      const aggregate = await this.prisma.telegramPost.aggregate({
        where: {
          telegramChannelId: channelId,
          postDate: { gte: date, lt: nextDate },
        },
        _sum: { viewsCount: true, reactionsCount: true, forwardsCount: true },
      });
      await this.prisma.telegramChannelDailyStats.upsert({
        where: {
          telegramChannelId_date: { telegramChannelId: channelId, date },
        },
        create: {
          telegramChannelId: channelId,
          date,
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

  async syncBroadcastStats(
    userId: string,
    channelId: string,
    dto: { telegramUserAccountId?: string },
  ) {
    const workspaceId = await this.workspace(userId);
    const account = await this.connectedAccount(
      workspaceId,
      channelId,
      dto.telegramUserAccountId,
    );
    return this.syncBroadcastStatsForWorkspace(
      workspaceId,
      channelId,
      account.id,
    );
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
    const account = await this.connectedAccount(
      workspaceId,
      channelId,
      accountId,
    );
    const channelRef = this.channelRef(channel);
    if (!channelRef)
      throw new BadRequestException('Channel must have username or chatId');
    const stats = await this.mtprotoClient.getBroadcastStats({
      ...this.accountCredentials(account),
      channelRef,
    });
    const syncedAt = new Date();
    const snapshotDate = this.toUtcDay(syncedAt);
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
    const points = this.extractBroadcastStatsPoints(
      workspaceId,
      channel.id,
      syncedAt,
      stats.normalized,
    );
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
    await this.sourceAccessService.recordDataSource({
      workspaceId,
      channelId,
      sourceId: account.id,
      sourceType: TelegramSourceType.MTPROTO,
      dataType: TelegramChannelDataType.STATS,
      status:
        stats.normalized.status === 'available'
          ? TelegramDataSourceStatus.SUCCESS
          : TelegramDataSourceStatus.FAILED,
      sourceDisplayName: this.sourceDisplayName(account),
      errorMessage:
        stats.normalized.status === 'available'
          ? null
          : Array.isArray(stats.warnings)
            ? stats.warnings.join('; ')
            : 'Stats unavailable from this source',
      metadata: {
        availableFields: stats.availableFields,
        warnings: stats.warnings,
      },
    });
    const audienceSnapshot = await this.createAudienceSnapshotSafely(
      channelId,
      'sync',
    );
    return {
      source: 'mtproto',
      success: stats.normalized.status === 'available',
      snapshot,
      pointsUpserted: points.length,
      audienceSnapshot,
    };
  }

  private extractBroadcastStatsPoints(
    workspaceId: string,
    telegramChannelId: string,
    syncedAt: Date,
    normalizedStats: any,
  ) {
    const points: any[] = [];
    for (const [metric, graph] of Object.entries(
      normalizedStats?.graphs || {},
    )) {
      if ((graph as any)?.status !== 'available') continue;
      const payload = (graph as any).data;
      if (!Array.isArray(payload?.columns)) continue;
      const columns = payload.columns.filter((column: unknown) =>
        Array.isArray(column),
      );
      const dates = columns.find((column: any[]) => column[0] === 'x');
      if (!dates) continue;
      for (const values of columns.filter(
        (column: any[]) => column[0] !== 'x',
      )) {
        for (let index = 1; index < dates.length; index += 1) {
          const timestamp = Number(dates[index]);
          const value = Number(values[index]);
          if (!Number.isFinite(timestamp) || !Number.isFinite(value)) continue;
          points.push({
            workspaceId,
            telegramChannelId,
            metric,
            series: String(values[0]),
            seriesLabel: String(payload.names?.[values[0]] || values[0]),
            color: payload.colors?.[values[0]] || null,
            graphType: String(payload.types?.[values[0]] || 'line'),
            date: this.toUtcDay(
              new Date(
                timestamp < 100_000_000_000 ? timestamp * 1000 : timestamp,
              ),
            ),
            value,
            latestSyncedAt: syncedAt,
          });
        }
      }
    }
    return points;
  }

  async channelStatsSnapshots(userId: string, channelId: string, limit = 20) {
    const workspaceId = await this.workspace(userId);
    await this.findOne(userId, channelId);
    return this.prisma.telegramChannelStatsSnapshot.findMany({
      where: { workspaceId, telegramChannelId: channelId },
      orderBy: { syncedAt: 'desc' },
      take: Math.max(1, Math.min(100, limit)),
    });
  }

  async inviteLinks(userId: string, channelId: string) {
    const workspaceId = await this.workspace(userId);
    await this.findOne(userId, channelId);
    return this.prisma.telegramInviteLink.findMany({
      where: { workspaceId, telegramChannelId: channelId },
      include: { adCampaign: true },
      orderBy: { createdAt: 'desc' },
    });
  }

  async promosByChannel(userId: string, channelId: string) {
    const workspaceId = await this.workspace(userId);
    await this.findOne(userId, channelId);
    return this.prisma.promo.findMany({
      where: { workspaceId, telegramChannelId: channelId },
      orderBy: { createdAt: 'desc' },
    });
  }

  async posts(userId: string, channelId: string, limit = 50, offset = 0) {
    const workspaceId = await this.workspace(userId);
    await this.findOne(userId, channelId);
    const safeLimit = Math.max(1, Math.min(200, limit));
    const safeOffset = Math.max(0, offset);
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
      source: 'mtproto',
      items,
      total,
      limit: safeLimit,
      offset: safeOffset,
    };
  }

  async analytics(
    userId: string,
    channelId: string,
    from?: string,
    to?: string,
  ) {
    const workspaceId = await this.workspace(userId);
    const channel = await this.findOne(userId, channelId);
    const fromDate = from
      ? new Date(from)
      : new Date(Date.now() - 30 * 24 * 3600 * 1000);
    const toDate = to ? new Date(to) : new Date();
    const [
      dailyStats,
      inviteLinks,
      campaigns,
      recentPosts,
      channelStatsSnapshot,
      channelStatsPoints,
    ] = await Promise.all([
      this.prisma.telegramChannelDailyStats.findMany({
        where: {
          telegramChannelId: channelId,
          date: { gte: fromDate, lte: toDate },
        },
        orderBy: { date: 'asc' },
      }),
      this.prisma.telegramInviteLink.findMany({
        where: { workspaceId, telegramChannelId: channelId },
        include: { adCampaign: true },
      }),
      this.prisma.adCampaign.findMany({
        where: { workspaceId, telegramChannelId: channelId },
        orderBy: { createdAt: 'desc' },
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
    const linksById = new Map(inviteLinks.map((link) => [link.id, link]));
    const campaignsWithMetrics = campaigns.map((campaign) => {
      const joinedCount = Number(
        campaign.telegramInviteLinkId
          ? linksById.get(campaign.telegramInviteLinkId)?.joinedCount || 0
          : 0,
      );
      return {
        ...campaign,
        joinedCount,
        leftCount: null,
        netGrowthCount: null,
        cpa: joinedCount > 0 ? Number(campaign.price) / joinedCount : null,
        attributionSource: 'mtproto_invite_link_usage',
      };
    });
    const inviteLinksJoinedTotal = inviteLinks.reduce(
      (sum, link) => sum + Number(link.joinedCount || 0),
      0,
    );
    return {
      source: 'mtproto',
      channel,
      summary: {
        subscribersCurrent: channel.currentSubscribersCount ?? null,
        joinedHistoricalByLinks: inviteLinksJoinedTotal,
        joinedToday: null,
        leftToday: null,
        netGrowthToday: null,
        leftTotal: null,
        netGrowth: null,
        inviteLinksCount: inviteLinks.length,
        campaignsCount: campaigns.length,
        postsTotal: recentPosts.length,
        viewsTotal: recentPosts.reduce(
          (sum, post) => sum + Number(post.viewsCount || 0),
          0,
        ),
        forwardsTotal: recentPosts.reduce(
          (sum, post) => sum + Number(post.forwardsCount || 0),
          0,
        ),
        reactionsTotal: recentPosts.reduce(
          (sum, post) => sum + Number(post.reactionsCount || 0),
          0,
        ),
      },
      dailyStats,
      inviteLinks,
      campaigns: campaignsWithMetrics,
      recentPosts,
      recentEvents: [],
      channelStatsSnapshot,
      channelStatsPoints,
    };
  }

  async attachInviteLinkCampaign(
    userId: string,
    inviteLinkId: string,
    dto: AttachCampaignDto,
  ) {
    const workspaceId = await this.workspace(userId);
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
    if (campaign.telegramChannelId !== link.telegramChannelId) {
      throw new BadRequestException(
        'Campaign and invite link must belong to the same channel',
      );
    }
    const updated = await this.prisma.telegramInviteLink.update({
      where: { id: link.id },
      data: { adCampaignId: campaign.id, lastSyncedAt: new Date() },
      include: { adCampaign: true },
    });
    await this.recalculateCampaignMetricsById(campaign.id);
    return updated;
  }

  async detachInviteLinkCampaign(userId: string, inviteLinkId: string) {
    const workspaceId = await this.workspace(userId);
    const link = await this.prisma.telegramInviteLink.findFirst({
      where: { id: inviteLinkId, workspaceId },
    });
    if (!link) throw new NotFoundException('Invite link not found');
    const updated = await this.prisma.telegramInviteLink.update({
      where: { id: link.id },
      data: { adCampaignId: null, lastSyncedAt: new Date() },
      include: { adCampaign: true },
    });
    if (link.adCampaignId)
      await this.recalculateCampaignMetricsById(link.adCampaignId);
    return updated;
  }

  async recalculateCampaignMetricsById(campaignId: string) {
    const campaign = await this.prisma.adCampaign.findUnique({
      where: { id: campaignId },
    });
    if (!campaign) return null;
    const links = await this.prisma.telegramInviteLink.findMany({
      where: { adCampaignId: campaignId },
      select: { joinedCount: true },
    });
    const joinedCount = links.reduce((sum, link) => sum + link.joinedCount, 0);
    return this.prisma.adCampaign.update({
      where: { id: campaignId },
      data: {
        joinedCount,
        leftCount: null,
        netGrowthCount: null,
        cpa:
          joinedCount > 0
            ? Number(campaign.priceInPrimaryCurrency) / joinedCount
            : null,
      },
    });
  }
}
