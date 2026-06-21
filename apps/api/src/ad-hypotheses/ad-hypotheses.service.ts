import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
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

  private campaignInclude() {
    return {
      telegramChannel: true,
      promo: true,
      inviteLinks: {
        select: { id: true, joinedCount: true },
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

  private campaignJoined(campaign: any) {
    const analyticsJoined = this.nullableNumber(campaign.analytics?.joinedCount);
    const inviteLinksJoined = Array.isArray(campaign.inviteLinks)
      ? campaign.inviteLinks
          .filter(
            (link: any) =>
              !campaign.telegramInviteLinkId ||
              link.id === campaign.telegramInviteLinkId,
          )
          .reduce((sum: number, link: any) => sum + Number(link.joinedCount || 0), 0)
      : null;
    return this.decimal(
      analyticsJoined ??
        (inviteLinksJoined && inviteLinksJoined > 0 ? inviteLinksJoined : null) ??
        campaign.joinedCount,
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
    const target = this.nullableNumber(channel.targetCpa);
    const acceptable = this.nullableNumber(channel.acceptableCpa);
    const stop = this.nullableNumber(channel.stopCpa);
    if (target == null && acceptable == null && stop == null) return 'unknown';
    if (target != null && cpa <= target) return 'good';
    if (acceptable != null && cpa <= acceptable) return 'acceptable';
    if (stop != null && cpa >= stop) return 'bad';
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
    const joinedSubscribers = this.campaignJoined(campaign);
    const leftSubscribers = this.campaignLeft(campaign);
    const cpa = joinedSubscribers > 0 ? spend / joinedSubscribers : null;
    const views = this.nullableNumber(campaign.sourcePostViews);
    const reactions = null;
    const engagementRate =
      views && reactions ? (Number(reactions) / Number(views)) * 100 : null;
    const kpiStatus = this.campaignKpiStatus(campaign, cpa);
    return {
      id: campaign.id,
      campaignId: campaign.id,
      title: campaign.title,
      status: campaign.status,
      currency: campaign.currency,
      spend,
      joinedSubscribers,
      leftSubscribers,
      cpa,
      views,
      reactions,
      engagementRate,
      activeSubscribersEstimate: null,
      activeCpa: null,
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
      kpiStatus,
    };
  }

  private aggregateSummary(campaignSummaries: ReturnType<typeof this.campaignSummary>[]) {
    const totalSpend = campaignSummaries.reduce(
      (sum, campaign) => sum + campaign.spend,
      0,
    );
    const totalJoinedSubscribers = campaignSummaries.reduce(
      (sum, campaign) => sum + campaign.joinedSubscribers,
      0,
    );
    const totalViews = campaignSummaries.reduce(
      (sum, campaign) => sum + Number(campaign.views || 0),
      0,
    );
    const reactionsWithData = campaignSummaries
      .map((campaign) => campaign.reactions)
      .filter((value) => value != null);
    const totalReactions = reactionsWithData.length
      ? reactionsWithData.reduce((sum, value) => sum + Number(value || 0), 0)
      : null;
    const activeSubscribersEstimate = null;
    const bestCampaign =
      campaignSummaries
        .filter((campaign) => campaign.cpa != null)
        .sort((a, b) => Number(a.cpa) - Number(b.cpa))[0] || null;
    const worstCampaign =
      campaignSummaries
        .filter((campaign) => campaign.cpa != null)
        .sort((a, b) => Number(b.cpa) - Number(a.cpa))[0] || null;
    const kpiStatus = this.aggregateKpiStatus(
      campaignSummaries.map((campaign) => campaign.kpiStatus),
    );
    return {
      campaignsCount: campaignSummaries.length,
      totalSpend,
      totalJoinedSubscribers,
      avgCpa:
        totalJoinedSubscribers > 0 ? totalSpend / totalJoinedSubscribers : null,
      activeSubscribersEstimate,
      activeCpa: null,
      avgActiveRate: null,
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

  private enrichHypothesis(hypothesis: any, detailed = false) {
    const campaignRows = (hypothesis.campaigns || []).map(
      (link: any) => link.adCampaign,
    );
    const campaignSummaries = campaignRows.map((campaign: any) =>
      this.campaignSummary(campaign),
    );
    const summary = this.aggregateSummary(campaignSummaries);
    const base = {
      id: hypothesis.id,
      name: hypothesis.name,
      description: hypothesis.description,
      status: hypothesis.status,
      conclusion: hypothesis.conclusion,
      createdAt: hypothesis.createdAt,
      updatedAt: hypothesis.updatedAt,
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

  async list(userId: string) {
    const workspaceId = await this.workspace(userId);
    const hypotheses = await (this.prisma.adHypothesis as any).findMany({
      where: { workspaceId },
      include: this.includeHypothesisCampaigns(),
      orderBy: { createdAt: 'desc' },
    });
    return hypotheses.map((hypothesis: any) =>
      this.enrichHypothesis(hypothesis, false),
    );
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
    const workspaceId = await this.workspace(userId);
    const { uniqueIds } = await this.validateCampaigns(
      workspaceId,
      dto.adCampaignIds,
    );
    const hypothesis = await (this.prisma.adHypothesis as any).create({
      data: {
        workspaceId,
        name: dto.name.trim(),
        description: dto.description?.trim() || null,
        status: this.normalizeStatus(dto.status),
        conclusion: dto.conclusion?.trim() || null,
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
      select: { id: true },
    });
    if (!existing) throw new NotFoundException('Ad hypothesis not found');

    const uniqueIds = dto.adCampaignIds
      ? (await this.validateCampaigns(workspaceId, dto.adCampaignIds)).uniqueIds
      : null;

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
}
