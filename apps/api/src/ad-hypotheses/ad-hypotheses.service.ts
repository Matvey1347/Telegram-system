import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  effectiveCampaignAttributedSubscribers,
  effectiveCampaignJoinedSubscribers,
  effectiveCampaignPendingSubscribers,
} from '../common/analytics/channel-financial-summary';
import { createPaginatedResponse, normalizePagination } from '../common/pagination/pagination.utils';
import { WorkspaceService } from '../common/workspace.service';
import { PrismaService } from '../prisma/prisma.service';
import { CreateAdHypothesisDto } from './dto/create-ad-hypothesis.dto';
import {
  AD_HYPOTHESIS_STATUSES,
  UpdateAdHypothesisDto,
} from './dto/update-ad-hypothesis.dto';

type KpiStatus = 'good' | 'acceptable' | 'bad' | 'unknown';
type HypothesisStatus = (typeof AD_HYPOTHESIS_STATUSES)[number];

@Injectable()
export class AdHypothesesService {
  constructor(
    private prisma: PrismaService,
    private workspaceService: WorkspaceService,
  ) {}

  private workspace(userId: string) {
    return this.workspaceService.resolveWorkspaceIdForUser(userId);
  }

  private normalizeStatus(status?: string | null): HypothesisStatus {
    const normalized = String(status || 'testing').trim() as HypothesisStatus;
    if (!AD_HYPOTHESIS_STATUSES.includes(normalized)) {
      throw new BadRequestException('Invalid hypothesis status');
    }
    return normalized;
  }

  private dedupeCampaignIds(campaignIds: string[]) {
    const cleanIds = campaignIds
      .map((id) => String(id || '').trim())
      .filter(Boolean);
    const uniqueIds = [...new Set(cleanIds)];
    if (uniqueIds.length !== cleanIds.length) {
      throw new BadRequestException('Ad campaign ids must be unique');
    }
    if (!uniqueIds.length) {
      throw new BadRequestException('Hypothesis must contain at least 1 campaign');
    }
    return uniqueIds;
  }

  private async validateCampaigns(workspaceId: string, campaignIds: string[]) {
    const uniqueIds = this.dedupeCampaignIds(campaignIds);
    const campaigns = await (this.prisma.adCampaign as any).findMany({
      where: { workspaceId, id: { in: uniqueIds } },
      include: this.campaignInclude(),
      orderBy: { createdAt: 'desc' },
    });
    if (campaigns.length !== uniqueIds.length) {
      throw new BadRequestException(
        'All ad campaigns must exist and belong to selected workspace',
      );
    }
    return { uniqueIds, campaigns };
  }

  private async validateTelegramChannel(
    workspaceId: string,
    telegramChannelId?: string | null,
  ) {
    const normalizedId = String(telegramChannelId || '').trim();
    if (!normalizedId) {
      throw new BadRequestException('Telegram channel is required');
    }
    const channel = await this.prisma.telegramChannel.findFirst({
      where: { id: normalizedId, workspaceId },
    });
    if (!channel) {
      throw new BadRequestException(
        'Telegram channel must exist and belong to selected workspace',
      );
    }
    return channel;
  }

  private campaignInclude() {
    return {
      assignedMember: WorkspaceService.assignedMemberInclude,
      telegramChannel: {
        include: {
          inviteLinks: {
            select: { id: true, joinedCount: true, requestedCount: true },
          },
        },
      },
      promo: { include: { icon: true, telegramChannel: true } },
      promos: {
        include: {
          promo: { include: { icon: true, telegramChannel: true } },
        },
      },
      inviteLinks: {
        select: {
          id: true,
          telegramChannelId: true,
          adCampaignId: true,
          name: true,
          url: true,
          joinedCount: true,
          requestedCount: true,
          isRevoked: true,
          lastSyncedAt: true,
          createdAt: true,
          updatedAt: true,
          creatorTelegramUserId: true,
          creatorUsername: true,
          creatorFirstName: true,
          creatorLastName: true,
          creatorPhotoUrl: true,
          creatorMatchSource: true,
          creatorMember: WorkspaceService.assignedMemberInclude,
        },
      },
      advertisingTelegramChannels: {
        include: {
          telegramChannel: {
            include: { adminLinks: true },
          },
        },
      },
      advertisingChannels: { include: { advertisingSource: true } },
    } as const;
  }

  private includeHypothesisCampaigns() {
    return {
      assignedMember: WorkspaceService.assignedMemberInclude,
      createdByUser: WorkspaceService.createdByUserInclude,
      icon: true,
      telegramChannel: true,
      campaigns: {
        include: {
          adCampaign: {
            include: this.campaignInclude(),
          },
        },
        orderBy: { createdAt: 'asc' },
      },
    } as const;
  }

  private decimal(value: unknown) {
    const parsed = Number(value ?? 0);
    return Number.isFinite(parsed) ? parsed : 0;
  }

  private nullableNumber(value: unknown) {
    if (value == null) return null;
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }

  private inRange(value: number, from: number | null, to: number | null) {
    if (from == null && to == null) return false;
    if (from != null && value < from) return false;
    if (to != null && value > to) return false;
    return true;
  }

  private average(values: Array<number | null | undefined>) {
    const clean = values.filter((value): value is number => value != null);
    return clean.length
      ? clean.reduce((sum, value) => sum + value, 0) / clean.length
      : null;
  }

  private campaignJoined(campaign: any) {
    return this.decimal(
      effectiveCampaignJoinedSubscribers({
        inviteLinks: Array.isArray(campaign.inviteLinks) ? campaign.inviteLinks : [],
        joinedCount:
          this.nullableNumber(campaign.analytics?.joinedCount) ??
          campaign.joinedCount,
        newSubscribers: campaign.newSubscribers,
      }),
    );
  }

  private campaignPending(campaign: any) {
    return this.decimal(
      effectiveCampaignPendingSubscribers({
        inviteLinks: Array.isArray(campaign.inviteLinks) ? campaign.inviteLinks : [],
        requestedCount:
          this.nullableNumber(campaign.analytics?.requestedCount) ??
          campaign.requestedCount,
      }),
    );
  }

  private campaignAttributed(campaign: any) {
    return this.decimal(
      effectiveCampaignAttributedSubscribers({
        inviteLinks: Array.isArray(campaign.inviteLinks) ? campaign.inviteLinks : [],
        joinedCount:
          this.nullableNumber(campaign.analytics?.joinedCount) ??
          campaign.joinedCount,
        requestedCount:
          this.nullableNumber(campaign.analytics?.requestedCount) ??
          campaign.requestedCount,
        newSubscribers: campaign.newSubscribers,
      }),
    );
  }

  private campaignLeft(campaign: any) {
    const analyticsLeft = this.nullableNumber(campaign.analytics?.leftCount);
    return this.nullableNumber(analyticsLeft ?? campaign.leftCount);
  }

  private sourceLabel(campaign: any) {
    const telegramSources = (campaign.advertisingTelegramChannels || [])
      .map((link: any) => link.telegramChannel?.title || link.telegramChannel?.username)
      .filter(Boolean);
    const peopleSources = (campaign.advertisingChannels || [])
      .map((link: any) => link.advertisingSource?.name)
      .filter(Boolean);
    return [...telegramSources, ...peopleSources].join(', ') || null;
  }

  private campaignKpiStatus(campaign: any, cpa: number | null): KpiStatus {
    const channel = campaign.telegramChannel;
    if (!channel || cpa == null) return 'unknown';
    const targetFrom = this.nullableNumber(channel.targetCpaFrom);
    const target = this.nullableNumber(channel.targetCpa);
    const acceptableFrom = this.nullableNumber(channel.acceptableCpaFrom);
    const acceptable = this.nullableNumber(channel.acceptableCpa);
    const stopFrom =
      this.nullableNumber(channel.stopCpaFrom) ?? this.nullableNumber(channel.stopCpa);
    if (
      targetFrom == null &&
      target == null &&
      acceptableFrom == null &&
      acceptable == null &&
      stopFrom == null
    ) return 'unknown';
    if (this.inRange(cpa, targetFrom, target)) return 'good';
    if (this.inRange(cpa, acceptableFrom, acceptable)) return 'acceptable';
    if (this.inRange(cpa, stopFrom, null)) return 'bad';
    return 'unknown';
  }

  private aggregateKpiStatus(statuses: KpiStatus[]): KpiStatus {
    const known = statuses.filter((status) => status !== 'unknown');
    if (!known.length) return 'unknown';
    const counts = known.reduce(
      (acc, status) => ({ ...acc, [status]: acc[status] + 1 }),
      { good: 0, acceptable: 0, bad: 0 },
    );
    if (counts.bad > known.length / 2) return 'bad';
    if (counts.good > known.length / 2) return 'good';
    return 'acceptable';
  }

  private hypothesisKpiStatus(
    campaignSummaries: ReturnType<typeof this.campaignSummary>[],
    avgCpa: number | null,
    hypothesisChannel?: any,
  ) {
    if (hypothesisChannel?.id && avgCpa != null) {
      return this.campaignKpiStatus(
        { telegramChannel: hypothesisChannel },
        avgCpa,
      );
    }

    const channels = campaignSummaries
      .map((campaign) => campaign.targetChannel)
      .filter((channel): channel is NonNullable<typeof campaignSummaries[number]['targetChannel']> => Boolean(channel?.id));
    const uniqueChannelIds = [...new Set(channels.map((channel) => channel.id))];

    if (uniqueChannelIds.length === 1 && avgCpa != null) {
      return this.campaignKpiStatus(
        { telegramChannel: channels[0] },
        avgCpa,
      );
    }

    return this.aggregateKpiStatus(
      campaignSummaries.map((campaign) => campaign.kpiStatus),
    );
  }

  private effectiveKpiStatus(storedStatus: unknown, calculatedStatus: KpiStatus) {
    return storedStatus && storedStatus !== 'unknown'
      ? (storedStatus as KpiStatus)
      : calculatedStatus;
  }

  private decision(status: KpiStatus) {
    if (status === 'good') {
      return 'Hypothesis performs well. Candidate for repeat and scaling.';
    }
    if (status === 'acceptable') {
      return 'Hypothesis is acceptable. Continue testing with tighter control.';
    }
    if (status === 'bad') {
      return 'Hypothesis is weak. Do not scale before changing source, offer or creative.';
    }
    return 'Not enough data yet.';
  }

  private campaignSummary(campaign: any) {
    const spend = this.decimal(campaign.priceInPrimaryCurrency);
    const nativeSpend = this.decimal(campaign.price ?? campaign.costAmount);
    const joinedSubscribers = this.campaignJoined(campaign);
    const pendingSubscribers = this.campaignPending(campaign);
    const attributedSubscribers = joinedSubscribers + pendingSubscribers;
    const leftSubscribers = this.campaignLeft(campaign);
    const cpa = attributedSubscribers > 0 ? spend / attributedSubscribers : null;
    const views = this.nullableNumber(campaign.sourcePostViews);
    const reactions = null;
    const engagementRate =
      views && reactions ? (Number(reactions) / Number(views)) * 100 : null;
    const kpiStatus = this.campaignKpiStatus(campaign, cpa);
    const effectiveKpiStatus = this.effectiveKpiStatus(
      campaign.overallStatus,
      kpiStatus,
    );
    return {
      id: campaign.id,
      campaignId: campaign.id,
      title: campaign.title,
      status: campaign.status,
      currency: campaign.currency,
      spend,
      nativeSpend,
      joinedSubscribers,
      pendingSubscribers,
      attributedSubscribers,
      leftSubscribers,
      cpa,
      views,
      reactions,
      engagementRate,
      activeSubscribersEstimate: this.nullableNumber(campaign.activeSubscribersFromAd),
      activeCpa: this.nullableNumber(campaign.activeCpa),
      activeRate: this.nullableNumber(campaign.activeRate),
      retention7d: this.nullableNumber(campaign.retention7d),
      overallStatus: campaign.overallStatus || 'unknown',
      analyticsLastCalculatedAt: campaign.analyticsLastCalculatedAt,
      targetChannel: campaign.telegramChannel
        ? {
            id: campaign.telegramChannel.id,
            title: campaign.telegramChannel.title,
            username: campaign.telegramChannel.username,
            photoUrl: campaign.telegramChannel.photoUrl,
          }
        : null,
      source: this.sourceLabel(campaign),
      sourcePostUrl: campaign.sourcePostUrl,
      kpiStatus: effectiveKpiStatus,
      excludeFromAnalytics: Boolean(campaign.excludeFromAnalytics),
    };
  }

  private aggregateSummary(
    campaignSummaries: ReturnType<typeof this.campaignSummary>[],
    hypothesisChannel?: any,
  ) {
    const totalSpend = campaignSummaries.reduce(
      (sum, campaign) => sum + campaign.spend,
      0,
    );
    const currencies = [
      ...new Set(
        campaignSummaries
          .map((campaign) => String(campaign.currency || '').trim().toUpperCase())
          .filter(Boolean),
      ),
    ];
    const displayCurrency = currencies.length === 1 ? currencies[0] : null;
    const totalSpendDisplay =
      displayCurrency != null
        ? campaignSummaries.reduce(
            (sum, campaign) =>
              sum +
              (String(campaign.currency || '').trim().toUpperCase() ===
              displayCurrency
                ? Number(campaign.nativeSpend || 0)
                : 0),
            0,
          )
        : null;
    const totalJoinedSubscribers = campaignSummaries.reduce(
      (sum, campaign) => sum + campaign.joinedSubscribers,
      0,
    );
    const totalPendingSubscribers = campaignSummaries.reduce(
      (sum, campaign) => sum + campaign.pendingSubscribers,
      0,
    );
    const totalAttributedSubscribers = campaignSummaries.reduce(
      (sum, campaign) => sum + campaign.attributedSubscribers,
      0,
    );
    const totalViews = campaignSummaries.reduce(
      (sum, campaign) => sum + Number(campaign.views || 0),
      0,
    );
    const activeSubscribersEstimate = campaignSummaries.reduce(
      (sum, campaign) => sum + Number(campaign.activeSubscribersEstimate || 0),
      0,
    );
    const reactionsWithData = campaignSummaries
      .map((campaign) => campaign.reactions)
      .filter((value) => value != null);
    const totalReactions = reactionsWithData.length
      ? reactionsWithData.reduce((sum, value) => sum + Number(value || 0), 0)
      : null;
    const bestCampaign =
      campaignSummaries
        .filter((campaign) => campaign.cpa != null)
        .sort((a, b) => Number(a.cpa) - Number(b.cpa))[0] || null;
    const worstCampaign =
      campaignSummaries
        .filter((campaign) => campaign.cpa != null)
        .sort((a, b) => Number(b.cpa) - Number(a.cpa))[0] || null;
    const avgCpa =
      totalAttributedSubscribers > 0
        ? totalSpend / totalAttributedSubscribers
        : null;
    const kpiStatus = this.hypothesisKpiStatus(
      campaignSummaries,
      avgCpa,
      hypothesisChannel,
    );
    return {
      campaignsCount: campaignSummaries.length,
      totalSpend,
      displayCurrency,
      totalSpendDisplay,
      totalJoinedSubscribers,
      totalPendingSubscribers,
      totalAttributedSubscribers,
      avgCpa,
      avgCpaDisplay:
        totalAttributedSubscribers > 0 && totalSpendDisplay != null
          ? totalSpendDisplay / totalAttributedSubscribers
          : null,
      activeSubscribersEstimate,
      activeCpa:
        activeSubscribersEstimate > 0 ? totalSpend / activeSubscribersEstimate : null,
      avgActiveRate: this.average(
        campaignSummaries.map((campaign) => campaign.activeRate),
      ),
      avgRetention7d: this.average(
        campaignSummaries.map((campaign) => campaign.retention7d),
      ),
      totalViews: totalViews || null,
      totalReactions,
      engagementRate:
        totalViews > 0 && totalReactions != null
          ? (totalReactions / totalViews) * 100
          : null,
      bestCampaign,
      worstCampaign,
      kpiStatus,
      decision: this.decision(kpiStatus),
    };
  }

  private inviteLinkHistoryPoints<T extends { syncedAt: Date; joinedCount: number; requestedCount: number }>(
    rows: T[],
  ) {
    let peakJoinedCount = 0;
    let peakTotalAttributed = 0;
    return rows.map((row) => {
      const joinedCount = Number(row.joinedCount || 0);
      const requestedCount = Number(row.requestedCount || 0);
      const totalAttributed = joinedCount + requestedCount;
      peakJoinedCount = Math.max(peakJoinedCount, joinedCount);
      peakTotalAttributed = Math.max(peakTotalAttributed, totalAttributed);
      const drawdownFromPeak = Math.max(0, peakTotalAttributed - totalAttributed);
      const drawdownPercent =
        peakTotalAttributed > 0
          ? (drawdownFromPeak / peakTotalAttributed) * 100
          : 0;
      return {
        syncedAt: row.syncedAt,
        joinedCount,
        requestedCount,
        totalAttributed,
        peakJoinedCount,
        drawdownFromPeak,
        drawdownPercent,
      };
    });
  }

  private inviteLinkHistorySummary<
    T extends {
      joinedCount: number;
      requestedCount: number;
      totalAttributed: number;
      peakJoinedCount: number;
      drawdownFromPeak: number;
      drawdownPercent: number;
    },
  >(points: T[]) {
    const current = points[points.length - 1] ?? null;
    const peakJoinedCount = points.reduce(
      (max, point) => Math.max(max, Number(point.peakJoinedCount || 0)),
      0,
    );
    const peakRequestedCount = points.reduce(
      (max, point) => Math.max(max, Number(point.requestedCount || 0)),
      0,
    );
    const peakTotalAttributed = points.reduce(
      (max, point) => Math.max(max, Number(point.totalAttributed || 0)),
      0,
    );
    return {
      currentJoinedCount: Number(current?.joinedCount || 0),
      currentRequestedCount: Number(current?.requestedCount || 0),
      currentTotalAttributed:
        Number(current?.joinedCount || 0) + Number(current?.requestedCount || 0),
      peakJoinedCount,
      peakRequestedCount,
      peakTotalAttributed,
      drawdownFromPeak: Number(current?.drawdownFromPeak || 0),
      drawdownPercent: Number(current?.drawdownPercent || 0),
      hasHighDropoff: Number(current?.drawdownPercent || 0) >= 15,
    };
  }

  private buildHypothesisInviteLinkHistoryPayload(
    hypothesis: {
      id: string;
      name: string;
      campaigns: Array<{
        id: string;
        telegramChannelId: string;
        inviteLinks: Array<{
          id: string;
          name: string;
          url: string;
          joinedCount: number;
          requestedCount?: number | null;
          isRevoked?: boolean | null;
        }>;
      }>;
    },
    rowsAsc: Array<{
      adCampaignId: string | null;
      inviteLinkId: string;
      syncedAt: Date;
      joinedCount: number;
      requestedCount: number;
      isRevoked: boolean | null;
    }>,
  ) {
    const flattenedInviteLinks = hypothesis.campaigns.flatMap((campaign) =>
      campaign.inviteLinks.map((link) => ({
        ...link,
        adCampaignId: campaign.id,
        telegramChannelId: campaign.telegramChannelId,
        requestedCount: Number(link.requestedCount ?? 0),
        isRevoked: Boolean(link.isRevoked),
      })),
    );
    const grouped = new Map<
      string,
      { syncedAt: Date; joinedCount: number; requestedCount: number }
    >();
    for (const row of rowsAsc) {
      const key = row.syncedAt.toISOString();
      const current = grouped.get(key);
      if (current) {
        current.joinedCount += Number(row.joinedCount || 0);
        current.requestedCount += Number(row.requestedCount || 0);
      } else {
        grouped.set(key, {
          syncedAt: row.syncedAt,
          joinedCount: Number(row.joinedCount || 0),
          requestedCount: Number(row.requestedCount || 0),
        });
      }
    }
    if (!grouped.size) {
      grouped.set(new Date().toISOString(), {
        syncedAt: new Date(),
        joinedCount: flattenedInviteLinks.reduce(
          (sum, link) => sum + Number(link.joinedCount || 0),
          0,
        ),
        requestedCount: flattenedInviteLinks.reduce(
          (sum, link) => sum + Number(link.requestedCount || 0),
          0,
        ),
      });
    }
    const aggregatePoints = this.inviteLinkHistoryPoints([...grouped.values()]);

    const rowsByInviteLinkId = new Map<
      string,
      Array<{ syncedAt: Date; joinedCount: number; requestedCount: number; isRevoked: boolean | null }>
    >();
    for (const row of rowsAsc) {
      const list = rowsByInviteLinkId.get(row.inviteLinkId) ?? [];
      list.push(row);
      rowsByInviteLinkId.set(row.inviteLinkId, list);
    }

    return {
      hypothesis: {
        id: hypothesis.id,
        name: hypothesis.name,
      },
      inviteLinks: flattenedInviteLinks.map((link) => {
        const points = this.inviteLinkHistoryPoints(
          rowsByInviteLinkId.get(link.id)?.map((row) => ({
            syncedAt: row.syncedAt,
            joinedCount: Number(row.joinedCount || 0),
            requestedCount: Number(row.requestedCount || 0),
          })) ?? [
            {
              syncedAt: new Date(),
              joinedCount: Number(link.joinedCount || 0),
              requestedCount: Number(link.requestedCount || 0),
            },
          ],
        );
        return {
          ...link,
          summary: this.inviteLinkHistorySummary(points),
        };
      }),
      points: aggregatePoints,
      summary: {
        ...this.inviteLinkHistorySummary(aggregatePoints),
        inviteLinksCount: flattenedInviteLinks.length,
        campaignsCount: hypothesis.campaigns.length,
      },
    };
  }

  private enrichHypothesis(hypothesis: any, detailed = false) {
    const campaignRows = (hypothesis.campaigns || []).map((link: any) => ({
      ...link.adCampaign,
      promos: Array.isArray(link.adCampaign?.promos)
        ? link.adCampaign.promos
            .map((promoLink: any) => promoLink?.promo)
            .filter(Boolean)
        : [],
    }));
    const campaignSummaries = campaignRows.map((campaign: any) =>
      this.campaignSummary(campaign),
    );
    const summary = this.aggregateSummary(
      campaignSummaries,
      hypothesis.telegramChannel,
    );
    const base = {
      id: hypothesis.id,
      name: hypothesis.name,
      description: hypothesis.description,
      status: hypothesis.status,
      conclusion: hypothesis.conclusion,
      iconId: hypothesis.iconId,
      icon: hypothesis.icon ?? null,
      telegramChannelId: hypothesis.telegramChannelId ?? null,
      telegramChannel: hypothesis.telegramChannel ?? null,
      createdAt: hypothesis.createdAt,
      updatedAt: hypothesis.updatedAt,
      assignedMemberId: hypothesis.assignedMemberId,
      assignedMember: hypothesis.assignedMember,
      createdByUserId: hypothesis.createdByUserId,
      createdByUser: hypothesis.createdByUser,
      allCampaignsExcludedFromAnalytics:
        campaignRows.length > 0 &&
        campaignRows.every((campaign: any) => Boolean(campaign.excludeFromAnalytics)),
      excludedCampaignsCount: campaignRows.filter((campaign: any) =>
        Boolean(campaign.excludeFromAnalytics),
      ).length,
      campaignsCount: summary.campaignsCount,
      summary,
    };
    if (!detailed) return base;
    return {
      ...base,
      campaigns: campaignRows,
      campaignSummaries,
    };
  }

  async list(
    userId: string,
    query: { page?: number; pageSize?: number } = {},
  ) {
    const workspaceId = await this.workspace(userId);
    const pagination = normalizePagination(query);
    const [hypotheses, totalItems] = await this.prisma.$transaction([
      (this.prisma.adHypothesis as any).findMany({
        where: { workspaceId },
        include: this.includeHypothesisCampaigns(),
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        skip: pagination.skip,
        take: pagination.take,
      }),
      this.prisma.adHypothesis.count({ where: { workspaceId } }),
    ]);
    const items = hypotheses.map((hypothesis: any) =>
      this.enrichHypothesis(hypothesis, false),
    );
    return createPaginatedResponse(items, totalItems, pagination);
  }

  async getById(userId: string, hypothesisId: string) {
    const workspaceId = await this.workspace(userId);
    const hypothesis = await (this.prisma.adHypothesis as any).findFirst({
      where: { id: hypothesisId, workspaceId },
      include: this.includeHypothesisCampaigns(),
    });
    if (!hypothesis) throw new NotFoundException('Ad hypothesis not found');
    return this.enrichHypothesis(hypothesis, true);
  }

  async create(userId: string, dto: CreateAdHypothesisDto) {
    const { workspaceId, assignedMemberId } = await this.workspaceService.resolveAssignedMemberId(userId, dto.assignedMemberId);
    const telegramChannel = await this.validateTelegramChannel(
      workspaceId,
      dto.telegramChannelId,
    );
    const { uniqueIds, campaigns } = await this.validateCampaigns(
      workspaceId,
      dto.adCampaignIds,
    );
    if (
      campaigns.some(
        (campaign: any) => campaign.telegramChannelId !== telegramChannel.id,
      )
    ) {
      throw new BadRequestException(
        'All selected campaigns must belong to the selected Telegram channel',
      );
    }
    const hypothesis = await (this.prisma.adHypothesis as any).create({
      data: {
        workspaceId,
        name: dto.name.trim(),
        description: dto.description?.trim() || null,
        status: this.normalizeStatus(dto.status),
        conclusion: dto.conclusion?.trim() || null,
        iconId: dto.iconId?.trim() || null,
        telegramChannelId: telegramChannel.id,
        assignedMemberId,
        createdByUserId: userId,
        campaigns: {
          create: uniqueIds.map((adCampaignId) => ({
            workspaceId,
            adCampaignId,
          })),
        },
      },
    });
    return this.getById(userId, hypothesis.id);
  }

  async update(
    userId: string,
    hypothesisId: string,
    dto: UpdateAdHypothesisDto,
  ) {
    const workspaceId = await this.workspace(userId);
    const existing = await (this.prisma.adHypothesis as any).findFirst({
      where: { id: hypothesisId, workspaceId },
      select: { id: true, telegramChannelId: true },
    });
    if (!existing) throw new NotFoundException('Ad hypothesis not found');
    const assignedMemberId = dto.assignedMemberId === undefined ? undefined : (
      await this.workspaceService.resolveAssignedMemberId(userId, dto.assignedMemberId)
    ).assignedMemberId;

    const nextTelegramChannelId =
      dto.telegramChannelId === undefined
        ? existing.telegramChannelId
        : (await this.validateTelegramChannel(workspaceId, dto.telegramChannelId)).id;

    const validatedCampaigns = dto.adCampaignIds
      ? await this.validateCampaigns(workspaceId, dto.adCampaignIds)
      : null;
    const uniqueIds = validatedCampaigns?.uniqueIds ?? null;

    if (
      validatedCampaigns?.campaigns.some(
        (campaign: any) => campaign.telegramChannelId !== nextTelegramChannelId,
      )
    ) {
      throw new BadRequestException(
        'All selected campaigns must belong to the selected Telegram channel',
      );
    }

    await this.prisma.$transaction(async (tx) => {
      await (tx.adHypothesis as any).update({
        where: { id: hypothesisId },
        data: {
          name: dto.name === undefined ? undefined : dto.name.trim(),
          description:
            dto.description === undefined
              ? undefined
              : dto.description?.trim() || null,
          status:
            dto.status === undefined ? undefined : this.normalizeStatus(dto.status),
          conclusion:
            dto.conclusion === undefined
              ? undefined
              : dto.conclusion?.trim() || null,
          iconId:
            dto.iconId === undefined ? undefined : dto.iconId?.trim() || null,
          telegramChannelId:
            dto.telegramChannelId === undefined ? undefined : nextTelegramChannelId,
          assignedMemberId,
        },
      });
      if (uniqueIds) {
        await (tx.adHypothesisCampaign as any).deleteMany({
          where: { hypothesisId, workspaceId },
        });
        await (tx.adHypothesisCampaign as any).createMany({
          data: uniqueIds.map((adCampaignId) => ({
            workspaceId,
            hypothesisId,
            adCampaignId,
          })),
        });
      }
    });

    return this.getById(userId, hypothesisId);
  }

  async remove(userId: string, hypothesisId: string) {
    const workspaceId = await this.workspace(userId);
    const existing = await (this.prisma.adHypothesis as any).findFirst({
      where: { id: hypothesisId, workspaceId },
      select: { id: true },
    });
    if (!existing) throw new NotFoundException('Ad hypothesis not found');
    await (this.prisma.adHypothesis as any).delete({
      where: { id: hypothesisId },
    });
    return { success: true };
  }

  async getHypothesisSummary(userId: string, hypothesisId: string) {
    const hypothesis = await this.getById(userId, hypothesisId);
    return hypothesis.summary;
  }

  async inviteLinkHistory(userId: string, hypothesisId: string) {
    const hypothesis = (await this.getById(userId, hypothesisId)) as any;
    const campaignIds = (hypothesis.campaigns || []).map(
      (campaign: any) => campaign.id,
    );
    const rowsAsc = campaignIds.length
      ? await this.prisma.telegramInviteLinkSnapshot.findMany({
          where: {
            workspaceId: await this.workspace(userId),
            adCampaignId: { in: campaignIds },
          },
          orderBy: [{ syncedAt: 'asc' }, { inviteLinkId: 'asc' }],
          select: {
            adCampaignId: true,
            inviteLinkId: true,
            syncedAt: true,
            joinedCount: true,
            requestedCount: true,
            isRevoked: true,
          },
        })
      : [];
    return this.buildHypothesisInviteLinkHistoryPayload(
      {
        id: hypothesis.id,
        name: hypothesis.name,
        campaigns: (hypothesis.campaigns || []).map((campaign: any) => ({
          id: campaign.id,
          telegramChannelId: campaign.telegramChannelId,
          inviteLinks: Array.isArray(campaign.inviteLinks) ? campaign.inviteLinks : [],
        })),
      },
      rowsAsc,
    );
  }
}
