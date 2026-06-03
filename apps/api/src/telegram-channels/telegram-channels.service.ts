import {
  BadRequestException,
  Injectable,
  InternalServerErrorException,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { TelegramUserAccountStatus } from '@prisma/client';
import { WorkspaceService } from '../common/workspace.service';
import { TokenEncryptionService } from '../common/security/token-encryption.service';
import { PrismaService } from '../prisma/prisma.service';
import { TelegramMtprotoClient } from '../telegram/shared/telegram-mtproto.client';
import {
  AttachCampaignDto,
  CreateTelegramChannelDto,
  DeepSyncDto,
  HistoricalSyncDto,
  UpdateTelegramChannelDto,
} from './dto';

@Injectable()
export class TelegramChannelsService {
  private readonly logger = new Logger(TelegramChannelsService.name);

  constructor(
    private prisma: PrismaService,
    private workspaceService: WorkspaceService,
    private encryptionService: TokenEncryptionService,
    private mtprotoClient: TelegramMtprotoClient,
  ) {}

  private workspace(userId: string) {
    return this.workspaceService.resolveWorkspaceIdForUser(userId);
  }

  private toUtcDay(value: Date) {
    return new Date(
      Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), value.getUTCDate()),
    );
  }

  private channelRef(channel: { username: string | null; telegramChatId: string | null }) {
    if (channel.username) {
      return channel.username.startsWith('@')
        ? channel.username
        : `@${channel.username}`;
    }
    return channel.telegramChatId || null;
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

  async findAll(userId: string) {
    const workspaceId = await this.workspace(userId);
    return this.prisma.telegramChannel.findMany({
      where: { workspaceId },
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

  async create(userId: string, dto: CreateTelegramChannelDto) {
    const workspaceId = await this.workspace(userId);
    return this.prisma.telegramChannel.create({ data: { workspaceId, ...dto } });
  }

  async update(userId: string, id: string, dto: UpdateTelegramChannelDto) {
    await this.findOne(userId, id);
    return this.prisma.telegramChannel.update({ where: { id }, data: dto });
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
      await tx.promo.deleteMany({ where: { workspaceId, telegramChannelId: id } });
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
    const account = await this.connectedAccount(workspaceId, channelId);
    const historical = await this.syncHistorical(userId, channelId, {
      telegramUserAccountId: account.id,
      syncInviteLinks: true,
      syncPosts: true,
    });
    const postsMetricsSync = await this.syncPostsMetrics(userId, channelId, {
      telegramUserAccountId: account.id,
      postLimit: 100,
    });
    const channelStatsSync = await this.syncBroadcastStats(userId, channelId, {
      telegramUserAccountId: account.id,
    });
    return { source: 'mtproto', historical, postsMetricsSync, channelStatsSync };
  }

  async deepSync(userId: string, channelId: string, dto: DeepSyncDto) {
    const workspaceId = await this.workspace(userId);
    const account = await this.connectedAccount(
      workspaceId,
      channelId,
      dto.telegramUserAccountId,
    );
    const historical = await this.syncHistorical(userId, channelId, {
      telegramUserAccountId: account.id,
      syncInviteLinks: true,
      syncPosts: true,
      postLimit: dto.postLimit || 300,
    });
    const postsMetricsSync = await this.syncPostsMetrics(userId, channelId, {
      telegramUserAccountId: account.id,
      postLimit: dto.postLimit || 300,
    });
    const channelStatsSync = await this.syncBroadcastStats(userId, channelId, {
      telegramUserAccountId: account.id,
    });
    return {
      message: 'Deep MTProto sync completed',
      source: 'mtproto',
      historical,
      postsMetricsSync,
      channelStatsSync,
    };
  }

  async syncHistorical(userId: string, channelId: string, dto: HistoricalSyncDto) {
    const workspaceId = await this.workspace(userId);
    const channel = await this.findOne(userId, channelId);
    const account = await this.connectedAccount(
      workspaceId,
      channelId,
      dto.telegramUserAccountId,
    );
    const channelRef = this.channelRef(channel);
    if (!channelRef) throw new BadRequestException('Channel must have username or chatId');
    const historical = await this.mtprotoClient.getChannelHistorical({
      ...this.accountCredentials(account),
      channelRef,
      postLimit: dto.postLimit || 100,
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
          if (existing.adCampaignId) affectedCampaignIds.add(existing.adCampaignId);
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
    }
    let postsUpdated = 0;
    if (dto.syncPosts) {
      for (const row of historical.dailyStats || []) {
        const date = new Date(`${row.date}T00:00:00.000Z`);
        await this.prisma.telegramChannelDailyStats.upsert({
          where: { telegramChannelId_date: { telegramChannelId: channelId, date } },
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
    }
    return {
      message: 'Historical MTProto sync completed',
      source: 'mtproto',
      imported,
      updated,
      postsUpdated,
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
    if (!channelRef) throw new BadRequestException('Channel must have username or chatId');
    try {
      const metrics = await this.mtprotoClient.getChannelPostsMetrics({
        ...this.accountCredentials(account),
        channelRef,
        postLimit: dto.postLimit || 100,
      });
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
        affectedDays.add(post.postDate.toISOString().slice(0, 10));
      }
      await this.recalculateDailyStatsFromPosts(channel.id, [...affectedDays]);
      return { source: 'mtproto', syncedPosts: metrics.length };
    } catch (error) {
      this.logger.error(
        `MTProto post metrics sync failed for channel=${channelId}: ${error instanceof Error ? error.message : 'unknown error'}`,
      );
      throw new InternalServerErrorException('Failed to sync channel post metrics');
    }
  }

  private async recalculateDailyStatsFromPosts(channelId: string, dates: string[]) {
    for (const value of dates) {
      const date = new Date(`${value}T00:00:00.000Z`);
      const nextDate = new Date(date.getTime() + 24 * 3600 * 1000);
      const aggregate = await this.prisma.telegramPost.aggregate({
        where: { telegramChannelId: channelId, postDate: { gte: date, lt: nextDate } },
        _sum: { viewsCount: true, reactionsCount: true, forwardsCount: true },
      });
      await this.prisma.telegramChannelDailyStats.upsert({
        where: { telegramChannelId_date: { telegramChannelId: channelId, date } },
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
    return this.syncBroadcastStatsForWorkspace(workspaceId, channelId, account.id);
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
    const account = await this.connectedAccount(workspaceId, channelId, accountId);
    const channelRef = this.channelRef(channel);
    if (!channelRef) throw new BadRequestException('Channel must have username or chatId');
    const stats = await this.mtprotoClient.getBroadcastStats({
      ...this.accountCredentials(account),
      channelRef,
    });
    const syncedAt = new Date();
    const snapshotDate = this.toUtcDay(syncedAt);
    const snapshot = await this.prisma.telegramChannelStatsSnapshot.upsert({
      where: { telegramChannelId_snapshotDate: { telegramChannelId: channel.id, snapshotDate } },
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
    return { source: 'mtproto', success: stats.normalized.status === 'available', snapshot, pointsUpserted: points.length };
  }

  private extractBroadcastStatsPoints(
    workspaceId: string,
    telegramChannelId: string,
    syncedAt: Date,
    normalizedStats: any,
  ) {
    const points: any[] = [];
    for (const [metric, graph] of Object.entries(normalizedStats?.graphs || {})) {
      if ((graph as any)?.status !== 'available') continue;
      const payload = (graph as any).data;
      if (!Array.isArray(payload?.columns)) continue;
      const columns = payload.columns.filter((column: unknown) => Array.isArray(column));
      const dates = columns.find((column: any[]) => column[0] === 'x');
      if (!dates) continue;
      for (const values of columns.filter((column: any[]) => column[0] !== 'x')) {
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
            date: this.toUtcDay(new Date(timestamp < 100_000_000_000 ? timestamp * 1000 : timestamp)),
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
      this.prisma.telegramPost.findMany({ where, orderBy: { postDate: 'desc' }, skip: safeOffset, take: safeLimit }),
      this.prisma.telegramPost.count({ where }),
    ]);
    return { source: 'mtproto', items, total, limit: safeLimit, offset: safeOffset };
  }

  async analytics(userId: string, channelId: string, from?: string, to?: string) {
    const workspaceId = await this.workspace(userId);
    const channel = await this.findOne(userId, channelId);
    const fromDate = from ? new Date(from) : new Date(Date.now() - 30 * 24 * 3600 * 1000);
    const toDate = to ? new Date(to) : new Date();
    const [dailyStats, inviteLinks, campaigns, recentPosts, channelStatsSnapshot, channelStatsPoints] =
      await Promise.all([
        this.prisma.telegramChannelDailyStats.findMany({
          where: { telegramChannelId: channelId, date: { gte: fromDate, lte: toDate } },
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
          where: { workspaceId, telegramChannelId: channelId, date: { gte: fromDate, lte: toDate } },
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
        viewsTotal: recentPosts.reduce((sum, post) => sum + Number(post.viewsCount || 0), 0),
        forwardsTotal: recentPosts.reduce((sum, post) => sum + Number(post.forwardsCount || 0), 0),
        reactionsTotal: recentPosts.reduce((sum, post) => sum + Number(post.reactionsCount || 0), 0),
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

  async attachInviteLinkCampaign(userId: string, inviteLinkId: string, dto: AttachCampaignDto) {
    const workspaceId = await this.workspace(userId);
    const [link, campaign] = await Promise.all([
      this.prisma.telegramInviteLink.findFirst({ where: { id: inviteLinkId, workspaceId } }),
      this.prisma.adCampaign.findFirst({ where: { id: dto.adCampaignId, workspaceId } }),
    ]);
    if (!link) throw new NotFoundException('Invite link not found');
    if (!campaign) throw new NotFoundException('Campaign not found');
    if (campaign.telegramChannelId !== link.telegramChannelId) {
      throw new BadRequestException('Campaign and invite link must belong to the same channel');
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
    if (link.adCampaignId) await this.recalculateCampaignMetricsById(link.adCampaignId);
    return updated;
  }

  async recalculateCampaignMetricsById(campaignId: string) {
    const campaign = await this.prisma.adCampaign.findUnique({ where: { id: campaignId } });
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
        cpa: joinedCount > 0 ? Number(campaign.priceInPrimaryCurrency) / joinedCount : null,
      },
    });
  }
}
