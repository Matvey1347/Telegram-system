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
import ExcelJS from 'exceljs';
import { HTMLParser } from 'telegram/extensions/html';
import { WorkspaceService } from '../common/workspace.service';
import { TokenEncryptionService } from '../common/security/token-encryption.service';
import { PrismaService } from '../prisma/prisma.service';
import { TelegramMtprotoClient } from '../telegram/shared/telegram-mtproto.client';
import { TelegramSourceAccessService } from '../telegram/shared/telegram-source-access.service';
import {
  AttachCampaignDto,
  CreateTelegramChannelAdAnalysisDto,
  CreateTelegramChannelDto,
  CreateTelegramManagedPostDto,
  DeepSyncDto,
  HistoricalSyncDto,
  ImportTelegramChannelDto,
  ScheduleTelegramManagedPostDto,
  PublishTelegramManagedPostDto,
  UpdateTelegramChannelDto,
  UpdateTelegramChannelAdAnalysisDto,
  UpdateTelegramPostManualMetricsDto,
  UpdateTelegramManagedPostDto,
} from './dto';
import { TelegramChannelAnalyticsService } from './telegram-channel-analytics.service';
import {
  telegramHtmlToMtprotoHtml,
  telegramMarkupToHtml,
} from '../telegram/shared/telegram-markup';

const TELEGRAM_CAPTION_LIMIT = 1024;
const TELEGRAM_TEXT_MESSAGE_LIMIT = 4096;

type BotMessageEntity = {
  type: string;
  offset: number;
  length: number;
  url?: string;
  language?: string;
  custom_emoji_id?: string;
};

@Injectable()
export class TelegramChannelsService {
  private readonly logger = new Logger(TelegramChannelsService.name);
  private readonly defaultPostSyncLimit = 100;
  private readonly initialPostBackfillLimit = 10_000;
  private readonly olderPostBackfillMaxPages = 5;
  private readonly managedPostInclude = {
    assignedMember: WorkspaceService.assignedMemberInclude,
    createdByUser: WorkspaceService.createdByUserInclude,
  } as const;

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

  private async createAudienceSnapshotSafely(
    channelId: string,
    source = 'sync',
  ) {
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
    const channels = await this.prisma.telegramChannel.findMany({
      where: { workspaceId, isActive: true },
      include: {
        assignedMember: WorkspaceService.assignedMemberInclude,
        createdByUser: WorkspaceService.createdByUserInclude,
        adAnalyses: {
          orderBy: { analyzedAt: 'desc' },
          take: 1,
          include: {
            assignedMember: WorkspaceService.assignedMemberInclude,
          },
        },
        _count: { select: { adAnalyses: true } },
        adminLinks: { include: { telegramUserAccountIntegration: true } },
        sourceAccesses: { select: { id: true, canPostMessages: true } },
        audienceSnapshots: {
          orderBy: { collectedAt: 'desc' },
          take: 1,
          select: {
            subscribersCount: true,
            activeSubscribersEstimate: true,
            viewRate: true,
            dataQuality: true,
            dataQualityReason: true,
            hasExternalTrafficAnomaly: true,
            hasSubscriberBasePollution: true,
            postsWindow: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    if (!channels.length) return channels;

    const channelIds = channels.map((channel) => channel.id);
    const [campaigns, inviteLinks] = await Promise.all([
      this.prisma.adCampaign.findMany({
        where: {
          workspaceId,
          telegramChannelId: { in: channelIds },
          excludeFromAnalytics: false,
        },
        include: { inviteLinks: { select: { joinedCount: true } } },
      }),
      this.prisma.telegramInviteLink.findMany({
        where: { workspaceId, telegramChannelId: { in: channelIds } },
        select: { id: true, telegramChannelId: true, joinedCount: true },
      }),
    ]);

    const campaignsByChannel = new Map<string, typeof campaigns>();
    for (const campaign of campaigns) {
      const items = campaignsByChannel.get(campaign.telegramChannelId) ?? [];
      items.push(campaign);
      campaignsByChannel.set(campaign.telegramChannelId, items);
    }
    const inviteLinksByChannel = new Map<string, typeof inviteLinks>();
    for (const link of inviteLinks) {
      const items = inviteLinksByChannel.get(link.telegramChannelId) ?? [];
      items.push(link);
      inviteLinksByChannel.set(link.telegramChannelId, items);
    }

    return channels.map((channel) => {
      const {
        sourceAccesses,
        audienceSnapshots,
        adAnalyses,
        _count,
        ...channelData
      } = channel;
      const snapshot = audienceSnapshots[0];
      const audience = {
        subscribersCount:
          snapshot?.subscribersCount ?? channel.currentSubscribersCount ?? null,
        activeSubscribersEstimate: snapshot?.activeSubscribersEstimate ?? null,
        paidActiveSubscribersEstimate:
          snapshot?.activeSubscribersEstimate ?? null,
        viewRate: snapshot?.viewRate ?? null,
        dataQuality: snapshot?.dataQuality ?? null,
        dataQualityReason: snapshot?.dataQualityReason ?? null,
        dataQualityWarning: null,
        rawViewRate: null,
        subscriberBaseQuality: null,
        hasExternalTrafficAnomaly: snapshot?.hasExternalTrafficAnomaly ?? false,
        hasSubscriberBasePollution:
          snapshot?.hasSubscriberBasePollution ?? false,
        postsWindow: snapshot?.postsWindow ?? channel.activeSubscribersWindow,
      };
      const channelCampaigns = campaignsByChannel.get(channel.id) ?? [];
      const channelInviteLinks = inviteLinksByChannel.get(channel.id) ?? [];
      const selectedInviteLinks = new Map(
        channelInviteLinks.map((link) => [
          link.id,
          Number(link.joinedCount || 0),
        ]),
      );
      const totalAdSpend = channelCampaigns.reduce(
        (sum, campaign) => sum + Number(campaign.priceInPrimaryCurrency || 0),
        0,
      );
      const totalJoinedSubscribers = channelCampaigns.reduce(
        (sum, campaign) => {
          const selectedLinkId = String(
            campaign.telegramInviteLinkId || '',
          ).trim();
          if (selectedLinkId && selectedInviteLinks.has(selectedLinkId)) {
            return sum + Number(selectedInviteLinks.get(selectedLinkId) || 0);
          }
          const campaignJoined = Number(campaign.joinedCount || 0);
          const linkedJoined = campaign.inviteLinks.reduce(
            (linkSum, link) => linkSum + Number(link.joinedCount || 0),
            0,
          );
          return (
            sum +
            Math.max(
              campaignJoined,
              linkedJoined,
              Number(campaign.newSubscribers || 0),
            )
          );
        },
        0,
      );
      const paidFromCampaigns = channelCampaigns.reduce(
        (sum, campaign) => sum + Number(campaign.activeSubscribersFromAd || 0),
        0,
      );
      const paidActiveSubscribersEstimate =
        paidFromCampaigns || audience.paidActiveSubscribersEstimate || 0;
      const average = (values: Array<number | null>) => {
        const present = values.filter(
          (value): value is number => value != null && Number.isFinite(value),
        );
        return present.length
          ? present.reduce((sum, value) => sum + value, 0) / present.length
          : null;
      };
      const avgCpa =
        totalJoinedSubscribers > 0
          ? totalAdSpend / totalJoinedSubscribers
          : null;
      const targetFrom =
        channel.targetCpaFrom == null ? null : Number(channel.targetCpaFrom);
      const targetTo =
        channel.targetCpa == null ? null : Number(channel.targetCpa);
      const acceptableFrom =
        channel.acceptableCpaFrom == null
          ? null
          : Number(channel.acceptableCpaFrom);
      const acceptableTo =
        channel.acceptableCpa == null ? null : Number(channel.acceptableCpa);
      const stopFrom =
        channel.stopCpaFrom == null
          ? channel.stopCpa == null
            ? null
            : Number(channel.stopCpa)
          : Number(channel.stopCpaFrom);
      const inRange = (value: number, from: number | null, to: number | null) =>
        (from != null || to != null) &&
        (from == null || value >= from) &&
        (to == null || value <= to);
      const kpiStatus =
        avgCpa == null
          ? 'unknown'
          : inRange(avgCpa, targetFrom, targetTo)
            ? 'good'
            : inRange(avgCpa, acceptableFrom, acceptableTo)
              ? 'acceptable'
              : inRange(avgCpa, stopFrom, null)
                ? 'bad'
                : 'unknown';

      return {
        ...channelData,
        preview: {
          audience,
          sourcesCount: sourceAccesses.length || channel.adminLinks.length,
          canPostMessages: sourceAccesses.some(
            (source) => source.canPostMessages,
          ),
          adAnalysis: {
            latest: adAnalyses[0] ?? null,
            historyCount: _count.adAnalyses,
            metrics: adAnalyses[0]
              ? {
                  avgViews: adAnalyses[0].avgViews,
                  avgReactions: adAnalyses[0].avgReactions,
                  avgForwards: adAnalyses[0].avgForwards,
                  postsCount: adAnalyses[0].postsCount,
                  cpm: adAnalyses[0].cpm,
                }
              : undefined,
          },
          financialSummary: {
            totalAdSpend,
            campaignsCount: channelCampaigns.length,
            totalJoinedSubscribers,
            avgCpa,
            activeSubscribersEstimate: audience.activeSubscribersEstimate,
            paidActiveSubscribersEstimate,
            activeCpa:
              paidActiveSubscribersEstimate > 0
                ? totalAdSpend / paidActiveSubscribersEstimate
                : null,
            avgActiveRate: average(
              channelCampaigns.map((campaign) => campaign.activeRate),
            ),
            avgRetention7d: average(
              channelCampaigns.map((campaign) => campaign.retention7d),
            ),
            dataQuality: audience.dataQuality,
            dataQualityReason: audience.dataQualityReason,
            dataQualityWarning: null,
            hasExternalTrafficAnomaly: audience.hasExternalTrafficAnomaly,
            hasSubscriberBasePollution: audience.hasSubscriberBasePollution,
            kpiStatus,
            kpiLabel:
              kpiStatus === 'good'
                ? 'Good'
                : kpiStatus === 'acceptable'
                  ? 'Acceptable'
                  : kpiStatus === 'bad'
                    ? 'Stop'
                    : '-',
          },
        },
      };
    });
  }

  async findOne(userId: string, id: string) {
    const workspaceId = await this.workspace(userId);
    const channel = await this.prisma.telegramChannel.findFirst({
      where: { id, workspaceId },
      include: {
        adminLinks: { include: { telegramUserAccountIntegration: true } },
        assignedMember: WorkspaceService.assignedMemberInclude,
        createdByUser: WorkspaceService.createdByUserInclude,
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
    const { workspaceId, assignedMemberId } =
      await this.workspaceService.resolveAssignedMemberId(
        userId,
        dto.assignedMemberId,
      );
    return this.prisma.telegramChannel.create({
      data: {
        workspaceId,
        ...dto,
        username: this.normalizeUsername(dto.username),
        assignedMemberId,
        createdByUserId: userId,
      },
      include: {
        assignedMember: WorkspaceService.assignedMemberInclude,
        createdByUser: WorkspaceService.createdByUserInclude,
      },
    });
  }

  async update(userId: string, id: string, dto: UpdateTelegramChannelDto) {
    await this.findOne(userId, id);
    const assignedMemberId =
      dto.assignedMemberId === undefined
        ? undefined
        : (
            await this.workspaceService.resolveAssignedMemberId(
              userId,
              dto.assignedMemberId,
            )
          ).assignedMemberId;
    return this.prisma.telegramChannel.update({
      where: { id },
      data: {
        ...dto,
        username:
          dto.username === undefined
            ? undefined
            : this.normalizeUsername(dto.username),
        dataQualityNotes:
          dto.dataQualityNotes === undefined
            ? undefined
            : String(dto.dataQualityNotes || '').trim() || null,
        assignedMemberId,
      },
      include: {
        assignedMember: WorkspaceService.assignedMemberInclude,
        createdByUser: WorkspaceService.createdByUserInclude,
      },
    });
  }

  private async calculateAdAnalysisMetrics(
    workspaceId: string,
    channelId: string,
    postLimit = 20,
    price?: number | null,
  ) {
    const posts = await this.prisma.telegramPost.findMany({
      where: {
        workspaceId,
        telegramChannelId: channelId,
        excludeFromAnalytics: false,
      },
      orderBy: { postDate: 'desc' },
      take: Math.max(1, Math.min(200, postLimit)),
      select: {
        viewsCount: true,
        reactionsCount: true,
        forwardsCount: true,
      },
    });
    const average = (values: Array<number | null>) => {
      const present = values.filter((value): value is number => value != null);
      return present.length
        ? present.reduce((sum, value) => sum + value, 0) / present.length
        : null;
    };
    const avgViews = average(posts.map((post) => post.viewsCount));
    const avgReactions = average(posts.map((post) => post.reactionsCount));
    const avgForwards = average(posts.map((post) => post.forwardsCount));
    return {
      postsCount: posts.length,
      avgViews,
      avgReactions,
      avgForwards,
      cpm:
        price != null && avgViews != null && avgViews > 0
          ? (price / avgViews) * 1000
          : null,
    };
  }

  async managedPosts(userId: string, channelId: string) {
    const workspaceId = await this.workspace(userId);
    await this.findOne(userId, channelId);
    return this.prisma.telegramManagedPost.findMany({
      where: { workspaceId, telegramChannelId: channelId },
      orderBy: { createdAt: 'desc' },
      include: this.managedPostInclude,
    });
  }

  async createManagedPost(
    userId: string,
    channelId: string,
    dto: CreateTelegramManagedPostDto,
  ) {
    const { workspaceId, assignedMemberId } =
      await this.workspaceService.resolveAssignedMemberId(
        userId,
        dto.assignedMemberId,
      );
    await this.findOne(userId, channelId);
    const title = dto.title.trim();
    if (!title) throw new BadRequestException('Title is required');
    return this.prisma.telegramManagedPost.create({
      data: {
        workspaceId,
        telegramChannelId: channelId,
        title,
        text: dto.text ?? null,
        imageUrls: dto.imageUrls ?? [],
        assignedMemberId,
        createdByUserId: userId,
      },
      include: this.managedPostInclude,
    });
  }

  async updateManagedPost(
    userId: string,
    channelId: string,
    postId: string,
    dto: UpdateTelegramManagedPostDto,
  ) {
    const workspaceId = await this.workspace(userId);
    const post = await this.prisma.telegramManagedPost.findFirst({
      where: { id: postId, workspaceId, telegramChannelId: channelId },
    });
    if (!post) throw new NotFoundException('Post draft not found');
    if (post.status === 'PUBLISHED')
      throw new BadRequestException('Published posts cannot be edited');
    if (dto.title !== undefined && !dto.title.trim())
      throw new BadRequestException('Title is required');
    const assignedMemberId =
      dto.assignedMemberId === undefined
        ? undefined
        : (
            await this.workspaceService.resolveAssignedMemberId(
              userId,
              dto.assignedMemberId,
            )
          ).assignedMemberId;
    return this.prisma.telegramManagedPost.update({
      where: { id: postId },
      data: {
        title: dto.title?.trim(),
        text: dto.text,
        imageUrls: dto.imageUrls,
        assignedMemberId,
        lastError: null,
      },
      include: this.managedPostInclude,
    });
  }

  private async publishManagedPost(
    workspaceId: string,
    channelId: string,
    postId: string,
    scheduleAt?: Date,
    longTextMode: 'IMAGES_THEN_TEXT' | 'CAPTION_THEN_TEXT' = 'IMAGES_THEN_TEXT',
  ) {
    const [post, channel, sources] = await Promise.all([
      this.prisma.telegramManagedPost.findFirst({
        where: { id: postId, workspaceId, telegramChannelId: channelId },
      }),
      this.prisma.telegramChannel.findFirst({
        where: { id: channelId, workspaceId, isActive: true },
      }),
      this.sourceAccessService.sourcesForChannel(workspaceId, channelId),
    ]);
    if (!post || !channel)
      throw new NotFoundException('Post or channel not found');
    if (!post.text?.trim() && !post.imageUrls.length)
      throw new BadRequestException('Text or at least one image is required');
    const existingScheduledSource =
      scheduleAt && post.status === 'SCHEDULED' && post.sourceId
        ? sources.find(
            (item) =>
              item.sourceType === TelegramSourceType.MTPROTO &&
              item.sourceId === post.sourceId &&
              item.permissions.canPostMessages,
          )
        : undefined;
    const mtprotoSource =
      existingScheduledSource ??
      sources.find(
        (item) =>
          item.sourceType === TelegramSourceType.MTPROTO &&
          item.permissions.canPostMessages,
      );
    const source =
      mtprotoSource ??
      sources.find(
        (item) =>
          item.sourceType === TelegramSourceType.BOT &&
          item.permissions.canPostMessages,
      );
    if (!source) {
      throw new BadRequestException(
        'No connected source has posting permission',
      );
    }
    if (scheduleAt && source.sourceType !== TelegramSourceType.MTPROTO)
      throw new BadRequestException(
        'Scheduling requires a connected MTProto source with posting permission',
      );
    const channelRef = this.channelRef(channel);
    if (!channelRef)
      throw new BadRequestException('Channel has no Telegram reference');
    try {
      const html = telegramMarkupToHtml(post.text || '');
      const [plainText] = HTMLParser.parse(html);
      let captionHtml = html;
      let followupHtmlParts: string[] = [];
      let textHtmlParts = [html];
      let publishMode = post.imageUrls.length
        ? 'IMAGE_WITH_CAPTION'
        : 'TEXT_ONLY';
      if (post.imageUrls.length && plainText.length > TELEGRAM_CAPTION_LIMIT) {
        publishMode = longTextMode;
        if (longTextMode === 'CAPTION_THEN_TEXT') {
          const [caption, remainder] = this.splitTelegramMarkupOnce(
            post.text || '',
            TELEGRAM_CAPTION_LIMIT,
          );
          captionHtml = telegramMarkupToHtml(caption);
          followupHtmlParts = this.splitTelegramMarkup(
            remainder,
            TELEGRAM_TEXT_MESSAGE_LIMIT,
          ).map((part) => telegramMarkupToHtml(part));
        } else {
          captionHtml = '';
          followupHtmlParts = this.splitTelegramMarkup(
            post.text || '',
            TELEGRAM_TEXT_MESSAGE_LIMIT,
          ).map((part) => telegramMarkupToHtml(part));
        }
      } else if (
        !post.imageUrls.length &&
        plainText.length > TELEGRAM_TEXT_MESSAGE_LIMIT
      ) {
        publishMode = 'TEXT_PARTS';
        textHtmlParts = this.splitTelegramMarkup(
          post.text || '',
          TELEGRAM_TEXT_MESSAGE_LIMIT,
        ).map((part) => telegramMarkupToHtml(part));
      }
      let ids: string[];
      if (source.sourceType === TelegramSourceType.MTPROTO) {
        const account = await this.connectedAccount(
          workspaceId,
          channelId,
          source.sourceId,
        );
        if (
          scheduleAt &&
          post.status === 'SCHEDULED' &&
          post.telegramMessageIds.length
        ) {
          await this.mtprotoClient.deleteScheduledPost({
            ...this.accountCredentials(account),
            channelRef,
            messageIds: post.telegramMessageIds,
          });
        }
        ids = await this.mtprotoClient.publishPost({
          ...this.accountCredentials(account),
          channelRef,
          html,
          textHtmlParts,
          captionHtml,
          followupHtmlParts,
          imageUrls: post.imageUrls,
          scheduleAt,
        });
      } else {
        const bot = await this.prisma.telegramBotIntegration.findFirst({
          where: { id: source.sourceId, workspaceId, isActive: true },
        });
        if (!bot)
          throw new BadRequestException('Telegram bot is not connected');
        const token = this.encryptionService.decrypt({
          encrypted: bot.botTokenEncrypted,
          iv: bot.botTokenIv,
          authTag: bot.botTokenAuthTag,
        });
        const chatId = channel.username
          ? `@${channel.username}`
          : channel.telegramChatId;
        const call = async (method: string, body: Record<string, unknown>) => {
          const response = await fetch(
            `https://api.telegram.org/bot${token}/${method}`,
            {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ chat_id: chatId, ...body }),
            },
          );
          const payload = (await response.json()) as {
            ok?: boolean;
            description?: string;
            result?: any;
          };
          if (!response.ok || !payload.ok)
            throw new BadRequestException(
              payload.description || 'Telegram Bot API publish failed',
            );
          return payload.result;
        };
        const toBotFormattedText = (html: string) => {
          const [text, entities] = HTMLParser.parse(
            telegramHtmlToMtprotoHtml(html),
          );
          return {
            text,
            entities: entities
              .map((entity) => this.toBotMessageEntity(entity))
              .filter((entity): entity is BotMessageEntity => Boolean(entity)),
          };
        };
        if (post.imageUrls.length > 1) {
          const caption = toBotFormattedText(captionHtml);
          const result = (await call('sendMediaGroup', {
            media: post.imageUrls.map((media, index) => ({
              type: 'photo',
              media,
              ...(index === 0 && captionHtml
                ? {
                    caption: caption.text,
                    caption_entities: caption.entities,
                  }
                : {}),
            })),
          })) as Array<{ message_id: number }>;
          ids = result.map((message) => String(message.message_id));
          for (const followupHtml of followupHtmlParts) {
            const followup = toBotFormattedText(followupHtml);
            const textResult = (await call('sendMessage', {
              text: followup.text,
              entities: followup.entities,
            })) as { message_id: number };
            ids.push(String(textResult.message_id));
          }
        } else if (post.imageUrls.length === 1) {
          const caption = toBotFormattedText(captionHtml);
          const result = (await call('sendPhoto', {
            photo: post.imageUrls[0],
            caption: caption.text,
            caption_entities: caption.entities,
          })) as { message_id: number };
          ids = [String(result.message_id)];
          for (const followupHtml of followupHtmlParts) {
            const followup = toBotFormattedText(followupHtml);
            const textResult = (await call('sendMessage', {
              text: followup.text,
              entities: followup.entities,
            })) as { message_id: number };
            ids.push(String(textResult.message_id));
          }
        } else {
          ids = [];
          for (const textHtml of textHtmlParts) {
            const message = toBotFormattedText(textHtml);
            const result = (await call('sendMessage', {
              text: message.text,
              entities: message.entities,
            })) as { message_id: number };
            ids.push(String(result.message_id));
          }
        }
      }
      return this.prisma.telegramManagedPost.update({
        where: { id: post.id },
        data: {
          status: scheduleAt ? 'SCHEDULED' : 'PUBLISHED',
          scheduledAt: scheduleAt ?? null,
          publishedAt: scheduleAt ? null : new Date(),
          telegramMessageIds: ids,
          sourceType: source.sourceType,
          sourceId: source.sourceId,
          publishMode,
          lastError: null,
        },
        include: this.managedPostInclude,
      });
    } catch (error) {
      const rawMessage =
        error instanceof Error ? error.message : 'Telegram publish failed';
      const publicMessage = /MEDIA_INVALID/i.test(rawMessage)
        ? 'Telegram rejected one of the images. Remove it, upload it again, and retry.'
        : /AUTH_KEY|SESSION|AUTH_KEY_UNREGISTERED/i.test(rawMessage)
          ? 'The connected Telegram account session is no longer valid. Reconnect the account and retry.'
          : rawMessage;
      await this.prisma.telegramManagedPost.update({
        where: { id: post.id },
        data: {
          status: 'FAILED',
          lastError: publicMessage,
        },
      });
      if (error instanceof BadRequestException) throw error;
      throw new BadRequestException(publicMessage);
    }
  }

  async publishManagedPostNow(
    userId: string,
    channelId: string,
    postId: string,
    dto: PublishTelegramManagedPostDto,
  ) {
    const workspaceId = await this.workspace(userId);
    return this.publishManagedPost(
      workspaceId,
      channelId,
      postId,
      undefined,
      (dto.longTextMode as 'IMAGES_THEN_TEXT' | 'CAPTION_THEN_TEXT') ||
        'IMAGES_THEN_TEXT',
    );
  }

  async scheduleManagedPost(
    userId: string,
    channelId: string,
    postId: string,
    dto: ScheduleTelegramManagedPostDto,
  ) {
    const scheduledAt = new Date(dto.scheduledAt);
    if (scheduledAt.getTime() <= Date.now())
      throw new BadRequestException('Schedule date must be in the future');
    const workspaceId = await this.workspace(userId);
    return this.publishManagedPost(
      workspaceId,
      channelId,
      postId,
      scheduledAt,
      (dto.longTextMode as 'IMAGES_THEN_TEXT' | 'CAPTION_THEN_TEXT') ||
        'IMAGES_THEN_TEXT',
    );
  }

  private splitTelegramMarkup(rawText: string, maxPlainLength: number) {
    const parts: string[] = [];
    let remaining = rawText.trim();
    while (remaining) {
      const [current, next] = this.splitTelegramMarkupOnce(
        remaining,
        maxPlainLength,
      );
      parts.push(current);
      if (!next) break;
      remaining = next;
    }
    return parts;
  }

  private splitTelegramMarkupOnce(
    rawText: string,
    maxPlainLength: number,
  ): [string, string] {
    const html = telegramMarkupToHtml(rawText);
    const [plain] = HTMLParser.parse(html);
    if (plain.length <= maxPlainLength) return [rawText.trim(), ''];
    const boundaries = new Set<number>();
    for (const match of rawText.matchAll(/\n\s*\n/g)) {
      boundaries.add((match.index || 0) + match[0].length);
    }
    for (const match of rawText.matchAll(/[.!?…](?:["'»”)]*)\s+/g)) {
      boundaries.add((match.index || 0) + match[0].length);
    }
    for (const match of rawText.matchAll(/\n/g)) {
      boundaries.add((match.index || 0) + 1);
    }
    for (const match of rawText.matchAll(/\s+/g)) {
      boundaries.add((match.index || 0) + match[0].length);
    }
    const splitAt = [...boundaries]
      .sort((a, b) => b - a)
      .find((position) => {
        const candidate = rawText.slice(0, position).trimEnd();
        if (!candidate || !this.hasBalancedTelegramMarkup(candidate)) {
          return false;
        }
        const [plain] = HTMLParser.parse(telegramMarkupToHtml(candidate));
        return plain.length <= maxPlainLength;
      });
    const fallbackAt =
      splitAt ?? this.findHardTelegramMarkupSplit(rawText, maxPlainLength);
    if (!fallbackAt) return [rawText.trim(), ''];
    const currentRaw = rawText.slice(0, fallbackAt).trimEnd();
    const remainderRaw = rawText.slice(fallbackAt).trimStart();
    return [currentRaw, remainderRaw];
  }

  private findHardTelegramMarkupSplit(rawText: string, maxPlainLength: number) {
    for (
      let position = Math.min(rawText.length, maxPlainLength);
      position > 0;
      position -= 1
    ) {
      const candidate = rawText.slice(0, position).trimEnd();
      if (!candidate || !this.hasBalancedTelegramMarkup(candidate)) continue;
      const [plain] = HTMLParser.parse(telegramMarkupToHtml(candidate));
      if (plain.length <= maxPlainLength) return position;
    }
    return 0;
  }

  private toBotMessageEntity(entity: {
    className?: string;
    offset?: number;
    length?: number;
    url?: string;
    language?: string;
    documentId?: unknown;
  }): BotMessageEntity | null {
    const offset = entity.offset ?? 0;
    const length = entity.length ?? 0;
    const base = { offset, length };
    switch (entity.className) {
      case 'MessageEntityBold':
        return { ...base, type: 'bold' };
      case 'MessageEntityItalic':
        return { ...base, type: 'italic' };
      case 'MessageEntityUnderline':
        return { ...base, type: 'underline' };
      case 'MessageEntityStrike':
        return { ...base, type: 'strikethrough' };
      case 'MessageEntitySpoiler':
        return { ...base, type: 'spoiler' };
      case 'MessageEntityCode':
        return { ...base, type: 'code' };
      case 'MessageEntityPre':
        return {
          ...base,
          type: 'pre',
          ...(entity.language ? { language: entity.language } : {}),
        };
      case 'MessageEntityTextUrl':
        return entity.url
          ? { ...base, type: 'text_link', url: entity.url }
          : null;
      case 'MessageEntityBlockquote':
        return { ...base, type: 'blockquote' };
      case 'MessageEntityCustomEmoji':
        return entity.documentId
          ? {
              ...base,
              type: 'custom_emoji',
              custom_emoji_id: String(entity.documentId),
            }
          : null;
      default:
        return null;
    }
  }

  private hasBalancedTelegramMarkup(value: string) {
    if ((value.match(/```/g) || []).length % 2 !== 0) return false;
    const withoutFenced = value.replace(/```[\s\S]*?```/g, '');
    if ((withoutFenced.match(/`/g) || []).length % 2 !== 0) return false;
    return ['**', '__', '++', '~~', '||'].every((marker) => {
      let count = 0;
      let cursor = 0;
      while ((cursor = withoutFenced.indexOf(marker, cursor)) !== -1) {
        count += 1;
        cursor += marker.length;
      }
      return count % 2 === 0;
    });
  }

  async deleteManagedPost(userId: string, channelId: string, postId: string) {
    const workspaceId = await this.workspace(userId);
    const post = await this.prisma.telegramManagedPost.findFirst({
      where: { id: postId, workspaceId, telegramChannelId: channelId },
      include: { telegramChannel: true },
    });
    if (!post) throw new NotFoundException('Post draft not found');
    if (post.status === 'SCHEDULED' && post.telegramMessageIds.length) {
      if (post.sourceType !== TelegramSourceType.MTPROTO || !post.sourceId) {
        throw new BadRequestException(
          'Scheduled post has no MTProto source and cannot be cancelled safely',
        );
      }
      const account = await this.connectedAccount(
        workspaceId,
        channelId,
        post.sourceId,
      );
      const channelRef = this.channelRef(post.telegramChannel);
      if (!channelRef)
        throw new BadRequestException('Channel has no Telegram reference');
      await this.mtprotoClient.deleteScheduledPost({
        ...this.accountCredentials(account),
        channelRef,
        messageIds: post.telegramMessageIds,
      });
    }
    return this.prisma.telegramManagedPost.delete({ where: { id: postId } });
  }

  async adAnalyses(userId: string, channelId: string) {
    const workspaceId = await this.workspace(userId);
    await this.findOne(userId, channelId);
    return this.prisma.telegramChannelAdAnalysis.findMany({
      where: { workspaceId, telegramChannelId: channelId },
      include: {
        assignedMember: WorkspaceService.assignedMemberInclude,
      },
      orderBy: { analyzedAt: 'desc' },
    });
  }

  async createAdAnalysis(
    userId: string,
    channelId: string,
    dto: CreateTelegramChannelAdAnalysisDto,
  ) {
    const { workspaceId, assignedMemberId } =
      await this.workspaceService.resolveAssignedMemberId(
        userId,
        dto.assignedMemberId,
      );
    const channel = await this.prisma.telegramChannel.findFirst({
      where: { id: channelId, workspaceId, isActive: true },
    });
    if (!channel) throw new NotFoundException('Telegram channel not found');

    let warning: string | null = null;
    if (channel.username || channel.telegramChatId) {
      try {
        const account = await this.connectedAccount(
          workspaceId,
          channelId,
          await this.bestMtprotoAccountId(
            workspaceId,
            channelId,
            TelegramChannelDataType.POSTS,
          ),
        );
        await this.syncPublicChannelInfo(workspaceId, channelId, account);
        await this.syncPostsMetricsForWorkspace(workspaceId, channelId, {
          telegramUserAccountId: account.id,
          postLimit: dto.postLimit ?? 20,
        });
      } catch (error) {
        warning =
          error instanceof Error
            ? error.message
            : 'Telegram post metrics sync failed';
        this.logger.warn(
          `Ad analysis continues without fresh sync for channel=${channelId}: ${warning}`,
        );
      }
    }

    const metrics = await this.calculateAdAnalysisMetrics(
      workspaceId,
      channelId,
      dto.postLimit,
      dto.price,
    );
    const analysis = await this.prisma.telegramChannelAdAnalysis.create({
      data: {
        workspaceId,
        telegramChannelId: channelId,
        assignedMemberId,
        analyzedAt: new Date(dto.analyzedAt),
        status: dto.status,
        verdict: dto.verdict?.trim() || null,
        price: dto.price,
        currency: (dto.currency || 'USD').trim().toUpperCase(),
        reasonTags: dto.reasonTags ?? [],
        reasonSummary: dto.reasonSummary?.trim() || null,
        notes: dto.notes?.trim() || null,
        nextReviewAt: dto.nextReviewAt ? new Date(dto.nextReviewAt) : null,
        ...metrics,
      },
      include: {
        assignedMember: WorkspaceService.assignedMemberInclude,
      },
    });
    return { ...analysis, warning };
  }

  async updateAdAnalysis(
    userId: string,
    channelId: string,
    analysisId: string,
    dto: UpdateTelegramChannelAdAnalysisDto,
  ) {
    const workspaceId = await this.workspace(userId);
    const existing = await this.prisma.telegramChannelAdAnalysis.findFirst({
      where: { id: analysisId, workspaceId, telegramChannelId: channelId },
    });
    if (!existing) throw new NotFoundException('Ad analysis not found');
    const assignedMemberId =
      dto.assignedMemberId === undefined
        ? undefined
        : (
            await this.workspaceService.resolveAssignedMemberId(
              userId,
              dto.assignedMemberId,
            )
          ).assignedMemberId;
    const price =
      dto.price === undefined
        ? existing.price == null
          ? null
          : Number(existing.price)
        : dto.price;
    const metrics = await this.calculateAdAnalysisMetrics(
      workspaceId,
      channelId,
      dto.postLimit,
      price,
    );
    return this.prisma.telegramChannelAdAnalysis.update({
      where: { id: analysisId },
      data: {
        assignedMemberId,
        analyzedAt: dto.analyzedAt ? new Date(dto.analyzedAt) : undefined,
        status: dto.status,
        verdict:
          dto.verdict === undefined ? undefined : dto.verdict.trim() || null,
        price: dto.price,
        currency: dto.currency?.trim().toUpperCase(),
        reasonTags: dto.reasonTags,
        reasonSummary:
          dto.reasonSummary === undefined
            ? undefined
            : dto.reasonSummary.trim() || null,
        notes: dto.notes === undefined ? undefined : dto.notes.trim() || null,
        nextReviewAt:
          dto.nextReviewAt === undefined
            ? undefined
            : new Date(dto.nextReviewAt),
        ...metrics,
      },
      include: {
        assignedMember: WorkspaceService.assignedMemberInclude,
      },
    });
  }

  async deleteAdAnalysis(
    userId: string,
    channelId: string,
    analysisId: string,
  ) {
    const workspaceId = await this.workspace(userId);
    const existing = await this.prisma.telegramChannelAdAnalysis.findFirst({
      where: { id: analysisId, workspaceId, telegramChannelId: channelId },
      select: { id: true },
    });
    if (!existing) throw new NotFoundException('Ad analysis not found');
    return this.prisma.telegramChannelAdAnalysis.delete({
      where: { id: analysisId },
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
      return {
        source: 'mtproto',
        syncedPosts: metrics.length,
        audienceSnapshot,
      };
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

  private exportValue(value: unknown): string | number | boolean | Date | null {
    if (value == null) return null;
    if (value instanceof Date) return value;
    if (typeof value === 'bigint') return value.toString();
    if (
      typeof value === 'string' ||
      typeof value === 'number' ||
      typeof value === 'boolean'
    ) {
      return value;
    }
    if (
      typeof value === 'object' &&
      'toNumber' in value &&
      typeof (value as any).toNumber === 'function'
    ) {
      return (value as any).toNumber();
    }
    return JSON.stringify(value);
  }

  private dateOnly(value: Date | null | undefined) {
    return value ? value.toISOString().slice(0, 10) : null;
  }

  private safeSheetName(value: string) {
    return value.replace(/[\\/?*[\]:]/g, ' ').slice(0, 31) || 'Sheet';
  }

  private safeFileName(value: string) {
    return (
      value
        .trim()
        .replace(/^@/, '')
        .replace(/[^a-zA-Z0-9а-яА-ЯёЁ._-]+/g, '_')
        .replace(/^_+|_+$/g, '')
        .slice(0, 80) || 'telegram-channel'
    );
  }

  private addKeyValueSheet(
    workbook: ExcelJS.Workbook,
    name: string,
    rows: Array<[string, unknown]>,
  ) {
    const sheet = workbook.addWorksheet(this.safeSheetName(name));
    sheet.columns = [
      { header: 'Field', key: 'field', width: 36 },
      { header: 'Value', key: 'value', width: 90 },
    ];
    rows.forEach(([field, value]) =>
      sheet.addRow({ field, value: this.exportValue(value) }),
    );
    sheet.getRow(1).font = { bold: true };
    sheet.views = [{ state: 'frozen', ySplit: 1 }];
    return sheet;
  }

  private addTableSheet(
    workbook: ExcelJS.Workbook,
    name: string,
    columns: Array<{ header: string; key: string; width?: number }>,
    rows: Array<Record<string, unknown>>,
  ) {
    const sheet = workbook.addWorksheet(this.safeSheetName(name));
    sheet.columns = columns.map((column) => ({
      header: column.header,
      key: column.key,
      width: column.width || 18,
    }));
    rows.forEach((row) => {
      const normalized: Record<string, unknown> = {};
      for (const column of columns) {
        normalized[column.key] = this.exportValue(row[column.key]);
      }
      sheet.addRow(normalized);
    });
    sheet.getRow(1).font = { bold: true };
    sheet.views = [{ state: 'frozen', ySplit: 1 }];
    sheet.autoFilter = {
      from: { row: 1, column: 1 },
      to: { row: 1, column: Math.max(columns.length, 1) },
    };
    return sheet;
  }

  private addPromoImages(
    workbook: ExcelJS.Workbook,
    sheet: ExcelJS.Worksheet,
    promos: Array<{ imageData?: string | null }>,
  ) {
    promos.forEach((promo, index) => {
      const imageData = String(promo.imageData || '');
      const match = imageData.match(/^data:image\/(png|jpeg|jpg);base64,(.+)$/);
      if (!match) return;
      const extension =
        match[1] === 'jpg' ? 'jpeg' : (match[1] as 'png' | 'jpeg');
      try {
        const imageId = workbook.addImage({ base64: imageData, extension });
        const row = index + 2;
        sheet.getRow(row).height = 90;
        sheet.addImage(imageId, {
          tl: { col: 6, row: row - 1 },
          ext: { width: 120, height: 80 },
        });
      } catch {
        // Invalid user-uploaded image data should not break the whole export.
      }
    });
  }

  async exportChannelWorkbook(userId: string, channelId: string) {
    const workspaceId = await this.workspace(userId);
    const channel = await this.prisma.telegramChannel.findFirst({
      where: { id: channelId, workspaceId, isActive: true },
      include: {
        adminLinks: { include: { telegramUserAccountIntegration: true } },
        dataSources: true,
        sourceAccesses: true,
      },
    });
    if (!channel) throw new NotFoundException('Telegram channel not found');

    const [
      audience,
      financialSummary,
      firstPost,
      lastPost,
      firstDaily,
      lastDaily,
      firstStatsPoint,
      lastStatsPoint,
      firstAudienceSnapshot,
      lastAudienceSnapshot,
      posts,
      postSnapshots,
      dailyStats,
      statsPoints,
      statsSnapshots,
      audienceSnapshots,
      inviteLinks,
      promos,
      campaigns,
    ] = await Promise.all([
      this.analyticsService.getActiveAudienceEstimate(channel.id),
      this.analyticsService.getChannelFinancialSummary(channel.id),
      this.prisma.telegramPost.findFirst({
        where: { workspaceId, telegramChannelId: channel.id },
        orderBy: { postDate: 'asc' },
      }),
      this.prisma.telegramPost.findFirst({
        where: { workspaceId, telegramChannelId: channel.id },
        orderBy: { postDate: 'desc' },
      }),
      this.prisma.telegramChannelDailyStats.findFirst({
        where: { telegramChannelId: channel.id },
        orderBy: { date: 'asc' },
      }),
      this.prisma.telegramChannelDailyStats.findFirst({
        where: { telegramChannelId: channel.id },
        orderBy: { date: 'desc' },
      }),
      this.prisma.telegramChannelStatsPoint.findFirst({
        where: { workspaceId, telegramChannelId: channel.id },
        orderBy: { date: 'asc' },
      }),
      this.prisma.telegramChannelStatsPoint.findFirst({
        where: { workspaceId, telegramChannelId: channel.id },
        orderBy: { date: 'desc' },
      }),
      this.prisma.telegramChannelAudienceSnapshot.findFirst({
        where: { workspaceId, telegramChannelId: channel.id },
        orderBy: { collectedAt: 'asc' },
      }),
      this.prisma.telegramChannelAudienceSnapshot.findFirst({
        where: { workspaceId, telegramChannelId: channel.id },
        orderBy: { collectedAt: 'desc' },
      }),
      this.prisma.telegramPost.findMany({
        where: { workspaceId, telegramChannelId: channel.id },
        orderBy: { postDate: 'asc' },
      }),
      this.prisma.telegramPostMetricSnapshot.findMany({
        where: {
          telegramPost: { workspaceId, telegramChannelId: channel.id },
        },
        include: { telegramPost: { select: { telegramMessageId: true } } },
        orderBy: { collectedAt: 'asc' },
      }),
      this.prisma.telegramChannelDailyStats.findMany({
        where: { telegramChannelId: channel.id },
        orderBy: { date: 'asc' },
      }),
      this.prisma.telegramChannelStatsPoint.findMany({
        where: { workspaceId, telegramChannelId: channel.id },
        orderBy: [{ metric: 'asc' }, { series: 'asc' }, { date: 'asc' }],
      }),
      this.prisma.telegramChannelStatsSnapshot.findMany({
        where: { workspaceId, telegramChannelId: channel.id },
        orderBy: { snapshotDate: 'asc' },
      }),
      this.prisma.telegramChannelAudienceSnapshot.findMany({
        where: { workspaceId, telegramChannelId: channel.id },
        orderBy: { collectedAt: 'asc' },
      }),
      this.prisma.telegramInviteLink.findMany({
        where: { workspaceId, telegramChannelId: channel.id },
        include: { adCampaign: true },
        orderBy: { createdAt: 'asc' },
      }),
      this.prisma.promo.findMany({
        where: { workspaceId, telegramChannelId: channel.id },
        orderBy: { createdAt: 'asc' },
      }),
      (this.prisma.adCampaign as any).findMany({
        where: { workspaceId, telegramChannelId: channel.id },
        include: {
          promo: true,
          account: true,
          expenseTransaction: {
            include: { account: true, categoryRef: true, member: true },
          },
          inviteLinks: true,
          advertisingChannels: { include: { advertisingSource: true } },
          advertisingTelegramChannels: { include: { telegramChannel: true } },
          hypothesisLinks: { include: { hypothesis: true } },
        },
        orderBy: { createdAt: 'asc' },
      }),
    ]);

    const telegramDates = [
      firstPost?.postDate,
      lastPost?.postDate,
      firstDaily?.date,
      lastDaily?.date,
      firstStatsPoint?.date,
      lastStatsPoint?.date,
      firstAudienceSnapshot?.collectedAt,
      lastAudienceSnapshot?.collectedAt,
    ].filter(Boolean) as Date[];
    const tgFrom =
      telegramDates.length > 0
        ? new Date(Math.min(...telegramDates.map((date) => date.getTime())))
        : null;
    const tgTo =
      telegramDates.length > 0
        ? new Date(Math.max(...telegramDates.map((date) => date.getTime())))
        : null;

    const workbook = new ExcelJS.Workbook();
    workbook.creator = 'Telegram System';
    workbook.created = new Date();
    workbook.modified = new Date();

    this.addKeyValueSheet(workbook, 'Overview', [
      ['Channel', channel.title],
      ['Username', channel.username ? `@${channel.username}` : null],
      ['Telegram chat id', channel.telegramChatId],
      ['System period from', channel.createdAt],
      ['System period to', new Date()],
      ['Telegram data period from', tgFrom],
      ['Telegram data period to', tgTo],
      [
        'Period note',
        `Channel is in system from ${this.dateOnly(channel.createdAt) || '-'}; Telegram data in this export from ${this.dateOnly(tgFrom) || '-'} to ${this.dateOnly(tgTo) || '-'}.`,
      ],
      ['Exported at', new Date()],
      ['Posts exported', posts.length],
      ['Promos exported', promos.length],
      ['Campaigns exported', campaigns.length],
      ['Invite links exported', inviteLinks.length],
    ]);

    this.addKeyValueSheet(workbook, 'Channel Settings', [
      ['ID', channel.id],
      ['Title', channel.title],
      ['Description', channel.description],
      ['Language', channel.language],
      ['Niche', channel.niche],
      ['Invite link', channel.inviteLink],
      ['Photo URL', channel.photoUrl],
      ['Source type', channel.sourceType],
      ['Current subscribers', channel.currentSubscribersCount],
      ['Seed subscribers', channel.seedSubscribersCount],
      ['Known fake subscribers', channel.knownFakeSubscribersCount],
      ['Own views per post', channel.ownViewsPerPost],
      ['Own reactions per post', channel.ownReactionsPerPost],
      ['Active subscribers window', channel.activeSubscribersWindow],
      ['Subscriber base quality', channel.subscriberBaseQuality],
      ['Data quality notes', channel.dataQualityNotes],
      ['Target CPA from', channel.targetCpaFrom],
      ['Target CPA to', channel.targetCpa],
      ['Acceptable CPA from', channel.acceptableCpaFrom],
      ['Acceptable CPA to', channel.acceptableCpa],
      ['Stop CPA from', channel.stopCpaFrom],
      ['Stop CPA to', channel.stopCpa],
      ['Last public sync', channel.lastPublicSyncedAt],
      ['Created at', channel.createdAt],
      ['Updated at', channel.updatedAt],
    ]);

    this.addKeyValueSheet(workbook, 'Calculated Metrics', [
      ...Object.entries(audience).map(
        ([key, value]) => [`audience.${key}`, value] as [string, unknown],
      ),
      ...Object.entries(financialSummary).map(
        ([key, value]) => [`finance.${key}`, value] as [string, unknown],
      ),
    ]);

    this.addTableSheet(
      workbook,
      'Posts',
      [
        { header: 'Post date', key: 'postDate', width: 22 },
        { header: 'Message ID', key: 'telegramMessageId', width: 16 },
        { header: 'Text', key: 'text', width: 80 },
        { header: 'Views', key: 'viewsCount' },
        { header: 'Forwards', key: 'forwardsCount' },
        { header: 'Reactions', key: 'reactionsCount' },
        { header: 'Comments', key: 'commentsCount' },
        { header: 'Channel own views per post', key: 'channelOwnViews' },
        { header: 'Manual own views', key: 'manualOwnViews' },
        { header: 'Adjusted views', key: 'adjustedViews' },
        {
          header: 'Channel own reactions per post',
          key: 'channelOwnReactions',
        },
        { header: 'Manual own reactions', key: 'manualOwnReactions' },
        { header: 'Adjusted reactions', key: 'adjustedReactions' },
        { header: 'Exclude from analytics', key: 'excludeFromAnalytics' },
        { header: 'Reactions JSON', key: 'reactions', width: 50 },
        { header: 'Raw message JSON', key: 'rawMessage', width: 80 },
      ],
      posts.map((post) => ({
        ...post,
        channelOwnViews: channel.ownViewsPerPost,
        channelOwnReactions: channel.ownReactionsPerPost,
        adjustedViews: Math.max(
          0,
          Number(post.viewsCount || 0) -
            Number(channel.ownViewsPerPost || 0) -
            Number(post.manualOwnViews || 0),
        ),
        adjustedReactions: Math.max(
          0,
          Number(post.reactionsCount || 0) -
            Number(channel.ownReactionsPerPost || 0) -
            Number(post.manualOwnReactions || 0),
        ),
      })),
    );

    this.addTableSheet(
      workbook,
      'Post Metric Snapshots',
      [
        { header: 'Collected at', key: 'collectedAt', width: 22 },
        { header: 'Message ID', key: 'telegramMessageId' },
        { header: 'Views', key: 'viewsCount' },
        { header: 'Forwards', key: 'forwardsCount' },
        { header: 'Reactions', key: 'reactionsCount' },
        { header: 'Comments', key: 'commentsCount' },
        { header: 'Reactions JSON', key: 'reactions', width: 60 },
      ],
      postSnapshots.map((snapshot: any) => ({
        ...snapshot,
        telegramMessageId: snapshot.telegramPost?.telegramMessageId,
      })),
    );

    this.addTableSheet(
      workbook,
      'Daily Stats',
      [
        { header: 'Date', key: 'date', width: 16 },
        { header: 'Subscribers', key: 'subscribersCount' },
        { header: 'Joined', key: 'joinedCount' },
        { header: 'Left', key: 'leftCount' },
        { header: 'Net growth', key: 'netGrowthCount' },
        { header: 'Views', key: 'viewsCount' },
        { header: 'Reactions', key: 'reactionsCount' },
        { header: 'Forwards', key: 'forwardsCount' },
        { header: 'Created at', key: 'createdAt', width: 22 },
      ],
      dailyStats,
    );

    this.addTableSheet(
      workbook,
      'Stats Points',
      [
        { header: 'Date', key: 'date', width: 16 },
        { header: 'Metric', key: 'metric' },
        { header: 'Series', key: 'series' },
        { header: 'Series label', key: 'seriesLabel' },
        { header: 'Graph type', key: 'graphType' },
        { header: 'Value', key: 'value' },
        { header: 'Latest synced at', key: 'latestSyncedAt', width: 22 },
      ],
      statsPoints,
    );

    this.addTableSheet(
      workbook,
      'Stats Snapshots',
      [
        { header: 'Snapshot date', key: 'snapshotDate', width: 16 },
        { header: 'Synced at', key: 'syncedAt', width: 22 },
        { header: 'Available fields', key: 'availableFields', width: 40 },
        { header: 'Warnings', key: 'warnings', width: 40 },
        { header: 'Normalized stats JSON', key: 'normalizedStats', width: 80 },
        { header: 'Raw stats JSON', key: 'rawStats', width: 80 },
      ],
      statsSnapshots,
    );

    this.addTableSheet(
      workbook,
      'Audience Snapshots',
      [
        { header: 'Collected at', key: 'collectedAt', width: 22 },
        { header: 'Subscribers', key: 'subscribersCount' },
        { header: 'Effective subscribers', key: 'effectiveSubscribersCount' },
        { header: 'Active subscribers', key: 'activeSubscribersEstimate' },
        {
          header: 'Capped active subscribers',
          key: 'cappedActiveSubscribersEstimate',
        },
        { header: 'View rate', key: 'viewRate' },
        { header: 'Raw view rate', key: 'rawViewRate' },
        { header: 'Capped view rate', key: 'cappedViewRate' },
        { header: 'Avg views raw', key: 'avgViewsRaw' },
        { header: 'Avg views adjusted', key: 'avgViewsAdjusted' },
        { header: 'Avg reactions raw', key: 'avgReactionsRaw' },
        { header: 'Avg reactions adjusted', key: 'avgReactionsAdjusted' },
        { header: 'Data quality', key: 'dataQuality' },
        { header: 'Data quality reason', key: 'dataQualityReason' },
        {
          header: 'External traffic anomaly',
          key: 'hasExternalTrafficAnomaly',
        },
        {
          header: 'Subscriber base pollution',
          key: 'hasSubscriberBasePollution',
        },
        { header: 'Posts window', key: 'postsWindow' },
        { header: 'Source', key: 'source' },
      ],
      audienceSnapshots,
    );

    this.addTableSheet(
      workbook,
      'Invite Links',
      [
        { header: 'Name', key: 'name', width: 24 },
        { header: 'URL', key: 'url', width: 60 },
        { header: 'Campaign', key: 'campaignTitle', width: 30 },
        { header: 'Joined', key: 'joinedCount' },
        { header: 'Revoked', key: 'isRevoked' },
        { header: 'Expire date', key: 'expireDate', width: 22 },
        { header: 'Member limit', key: 'memberLimit' },
        { header: 'Creates join request', key: 'createsJoinRequest' },
        { header: 'Last synced at', key: 'lastSyncedAt', width: 22 },
        { header: 'Created at', key: 'createdAt', width: 22 },
      ],
      inviteLinks.map((link: any) => ({
        ...link,
        campaignTitle: link.adCampaign?.title,
      })),
    );

    const promosSheet = this.addTableSheet(
      workbook,
      'Creatives',
      [
        { header: 'Title', key: 'title', width: 28 },
        { header: 'Status', key: 'status' },
        { header: 'Angle', key: 'angle', width: 28 },
        { header: 'Text', key: 'text', width: 90 },
        { header: 'Image data or URL', key: 'imageData', width: 60 },
        { header: 'Created at', key: 'createdAt', width: 22 },
        { header: 'Image preview', key: 'imagePreview', width: 20 },
      ],
      promos.map((promo) => ({ ...promo, imagePreview: '' })),
    );
    this.addPromoImages(workbook, promosSheet, promos);

    this.addTableSheet(
      workbook,
      'Campaigns',
      [
        { header: 'Title', key: 'title', width: 30 },
        { header: 'Status', key: 'status' },
        { header: 'Promo', key: 'promoTitle', width: 24 },
        { header: 'Advertising sources', key: 'advertisingSources', width: 50 },
        { header: 'Hypotheses', key: 'hypotheses', width: 40 },
        { header: 'Price', key: 'price' },
        { header: 'Currency', key: 'currency' },
        { header: 'Price in primary currency', key: 'priceInPrimaryCurrency' },
        { header: 'Exchange rate to primary', key: 'exchangeRateToPrimary' },
        { header: 'Placement date', key: 'placementDate', width: 18 },
        { header: 'Started at', key: 'startedAt', width: 18 },
        { header: 'Ended at', key: 'endedAt', width: 18 },
        { header: 'Joined', key: 'joinedCount' },
        { header: 'Left', key: 'leftCount' },
        { header: 'Net growth', key: 'netGrowthCount' },
        { header: 'CPA', key: 'cpa' },
        { header: 'CPM', key: 'cpm' },
        {
          header: 'Active subscribers from ad',
          key: 'activeSubscribersFromAd',
        },
        { header: 'Active CPA', key: 'activeCpa' },
        { header: 'Active rate', key: 'activeRate' },
        {
          header: 'Capped active subscribers',
          key: 'cappedActiveSubscribersFromAd',
        },
        { header: 'Capped active CPA', key: 'cappedActiveCpa' },
        { header: 'Retention 7d', key: 'retention7d' },
        { header: 'CPA status', key: 'cpaStatus' },
        { header: 'Active CPA status', key: 'activeCpaStatus' },
        { header: 'Overall status', key: 'overallStatus' },
        { header: 'Data quality', key: 'adDataQuality' },
        { header: 'Data quality reason', key: 'adDataQualityReason' },
        { header: 'View anomaly', key: 'hasViewAnomaly' },
        {
          header: 'Subscriber base pollution',
          key: 'hasSubscriberBasePollution',
        },
        { header: 'Source post URL', key: 'sourcePostUrl', width: 44 },
        { header: 'Source post views', key: 'sourcePostViews' },
        { header: 'Notes', key: 'notes', width: 60 },
        { header: 'Analytics notes', key: 'analyticsNotes', width: 60 },
        { header: 'Expense transaction ID', key: 'expenseTransactionId' },
        { header: 'Expense account', key: 'expenseAccount' },
        { header: 'Created at', key: 'createdAt', width: 22 },
      ],
      campaigns.map((campaign: any) => ({
        ...campaign,
        promoTitle: campaign.promo?.title,
        advertisingSources: [
          ...(campaign.advertisingChannels || []).map(
            (item: any) => item.advertisingSource?.name,
          ),
          ...(campaign.advertisingTelegramChannels || []).map(
            (item: any) => item.telegramChannel?.title,
          ),
        ]
          .filter(Boolean)
          .join(', '),
        hypotheses: (campaign.hypothesisLinks || [])
          .map((item: any) => item.hypothesis?.name)
          .filter(Boolean)
          .join(', '),
        expenseTransactionId: campaign.expenseTransaction?.id,
        expenseAccount: campaign.expenseTransaction?.account?.name,
      })),
    );

    this.addTableSheet(
      workbook,
      'Finance Transactions',
      [
        { header: 'Date', key: 'date', width: 18 },
        { header: 'Campaign', key: 'campaignTitle', width: 30 },
        { header: 'Type', key: 'type' },
        { header: 'Amount', key: 'amount' },
        { header: 'Currency', key: 'currency' },
        {
          header: 'Amount in primary currency',
          key: 'amountInPrimaryCurrency',
        },
        { header: 'Exchange rate to primary', key: 'exchangeRateToPrimary' },
        { header: 'Account', key: 'accountName' },
        { header: 'Category', key: 'categoryName' },
        { header: 'Member', key: 'memberName' },
        { header: 'Description', key: 'description', width: 60 },
      ],
      campaigns
        .filter((campaign: any) => campaign.expenseTransaction)
        .map((campaign: any) => ({
          ...campaign.expenseTransaction,
          campaignTitle: campaign.title,
          accountName: campaign.expenseTransaction.account?.name,
          categoryName:
            campaign.expenseTransaction.categoryRef?.name ||
            campaign.expenseTransaction.category,
          memberName: campaign.expenseTransaction.member?.name,
        })),
    );

    this.addTableSheet(
      workbook,
      'Data Sources',
      [
        { header: 'Type', key: 'dataType' },
        { header: 'Source type', key: 'sourceType' },
        { header: 'Source display name', key: 'sourceDisplayName', width: 30 },
        { header: 'Status', key: 'status' },
        { header: 'Last synced at', key: 'lastSyncedAt', width: 22 },
        { header: 'Error', key: 'errorMessage', width: 50 },
        { header: 'Metadata JSON', key: 'metadata', width: 70 },
      ],
      channel.dataSources,
    );

    this.addTableSheet(
      workbook,
      'Source Access',
      [
        { header: 'Source type', key: 'sourceType' },
        { header: 'Source display name', key: 'sourceDisplayName', width: 30 },
        { header: 'Role', key: 'role' },
        { header: 'Can view stats', key: 'canViewStats' },
        { header: 'Can view members', key: 'canViewMembers' },
        { header: 'Can view invite links', key: 'canViewInviteLinks' },
        { header: 'Can post messages', key: 'canPostMessages' },
        { header: 'Last checked at', key: 'lastCheckedAt', width: 22 },
      ],
      channel.sourceAccesses,
    );

    this.addTableSheet(
      workbook,
      'Admin Links',
      [
        { header: 'Source', key: 'source' },
        { header: 'Account label', key: 'accountLabel', width: 24 },
        { header: 'Username', key: 'username' },
        { header: 'First name', key: 'firstName' },
        { header: 'Created at', key: 'createdAt', width: 22 },
      ],
      channel.adminLinks.map((link: any) => ({
        ...link,
        accountLabel: link.telegramUserAccountIntegration?.label,
        username: link.telegramUserAccountIntegration?.username,
        firstName: link.telegramUserAccountIntegration?.firstName,
      })),
    );

    const rawBuffer = await workbook.xlsx.writeBuffer();
    const buffer = Buffer.isBuffer(rawBuffer)
      ? rawBuffer
      : Buffer.from(rawBuffer as ArrayBuffer);
    const filename = `${this.safeFileName(channel.username || channel.title)}_export_${new Date().toISOString().slice(0, 10)}.xlsx`;
    return { buffer, filename };
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
        include: {
          telegramChannel: true,
          promo: true,
          advertisingTelegramChannels: {
            include: {
              telegramChannel: true,
            },
          },
          advertisingChannels: { include: { advertisingSource: true } },
        },
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
