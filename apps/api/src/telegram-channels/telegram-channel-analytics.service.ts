import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import {
  buildDataQualityWarning,
  calculateEffectiveSubscribers,
  classifyViewRate,
  maxDataQuality,
  type DataQuality,
} from '../common/analytics/data-quality';

type KpiStatus = 'good' | 'acceptable' | 'bad' | 'unknown';

@Injectable()
export class TelegramChannelAnalyticsService {
  constructor(private prisma: PrismaService) {}

  private average(values: number[]) {
    return values.length
      ? values.reduce((sum, value) => sum + value, 0) / values.length
      : null;
  }

  private numberOrNull(value: unknown) {
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

  async getActiveAudienceEstimate(channelId: string) {
    const channel = await this.prisma.telegramChannel.findUnique({
      where: { id: channelId },
    });
    if (!channel) throw new NotFoundException('Telegram channel not found');

    const postsWindow = Math.max(1, channel.activeSubscribersWindow || 5);
    const posts = await this.prisma.telegramPost.findMany({
      where: {
        workspaceId: channel.workspaceId,
        telegramChannelId: channel.id,
        excludeFromAnalytics: false,
      },
      orderBy: { postDate: 'desc' },
      take: postsWindow,
    });

    const rawViews = posts.map((post) => Number(post.viewsCount || 0));
    const ownViewsPerPost = Math.max(0, Number(channel.ownViewsPerPost || 0));
    const ownReactionsPerPost = Math.max(
      0,
      Number(channel.ownReactionsPerPost || 0),
    );
    const adjustedViews = posts.map((post) =>
      Math.max(
        0,
        Number(post.viewsCount || 0) -
          ownViewsPerPost -
          Number(post.manualOwnViews || 0),
      ),
    );
    const rawReactions = posts.map((post) =>
      Number(post.reactionsCount || 0),
    );
    const adjustedReactions = posts.map((post) =>
      Math.max(
        0,
        Number(post.reactionsCount || 0) -
          ownReactionsPerPost -
          Number(post.manualOwnReactions || 0),
      ),
    );
    const avgViewsAdjusted = this.average(adjustedViews);
    const subscribersCount = channel.currentSubscribersCount ?? null;
    const knownFakeSubscribersCount = Math.max(
      0,
      Number(channel.knownFakeSubscribersCount || 0),
    );
    const seedSubscribersCount = Math.max(
      0,
      Number(channel.seedSubscribersCount || 0),
    );
    const {
      effectiveSubscribers: effectiveSubscribersBeforeSeed,
      subscriberBaseQuality,
      hasSubscriberBasePollution,
    } = calculateEffectiveSubscribers({
      totalSubscribers: subscribersCount,
      knownFakeSubscribersCount,
      manualSubscriberBaseQuality: channel.subscriberBaseQuality,
    });
    const effectiveSubscribers =
      effectiveSubscribersBeforeSeed == null
        ? null
        : Math.max(0, effectiveSubscribersBeforeSeed - seedSubscribersCount);
    const rawActiveSubscribersEstimate =
      avgViewsAdjusted == null ? null : Math.round(avgViewsAdjusted);
    const rawViewRate =
      effectiveSubscribers && rawActiveSubscribersEstimate != null
        ? (rawActiveSubscribersEstimate / effectiveSubscribers) * 100
        : null;
    const cappedActiveSubscribersEstimate =
      effectiveSubscribers == null || rawActiveSubscribersEstimate == null
        ? null
        : Math.min(rawActiveSubscribersEstimate, effectiveSubscribers);
    const cappedViewRate =
      rawViewRate == null ? null : Math.min(rawViewRate, 100);
    const classified = classifyViewRate(rawViewRate);
    let dataQuality: DataQuality = classified.dataQuality;
    let dataQualityReason = classified.reason;
    let hasExternalTrafficAnomaly = classified.hasExternalTrafficAnomaly;
    if (subscriberBaseQuality === 'polluted' || subscriberBaseQuality === 'suspicious') {
      dataQuality = maxDataQuality(dataQuality, 'suspicious');
      dataQualityReason = 'subscriber_base_polluted';
    }
    if (subscriberBaseQuality === 'invalid') {
      dataQuality = 'invalid';
      dataQualityReason = 'missing_subscribers_or_views';
      hasExternalTrafficAnomaly = false;
    }
    const dataQualityWarning = buildDataQualityWarning(
      dataQuality,
      dataQualityReason,
    );
    const activeSubscribersEstimate = cappedActiveSubscribersEstimate;
    const viewRate = cappedViewRate;
    const organicActiveSubscribersEstimate = 0;
    const paidActiveSubscribersEstimate =
      activeSubscribersEstimate == null
        ? null
        : activeSubscribersEstimate;

    return {
      subscribersCount,
      knownFakeSubscribersCount,
      effectiveSubscribersCount: effectiveSubscribers,
      subscriberBaseQuality,
      seedSubscribersCount,
      ownViewsPerPost,
      ownReactionsPerPost,
      rawActiveSubscribersEstimate,
      activeSubscribersEstimate,
      cappedActiveSubscribersEstimate,
      organicActiveSubscribersEstimate,
      paidActiveSubscribersEstimate,
      rawViewRate,
      viewRate,
      cappedViewRate,
      avgViewsRaw: this.average(rawViews),
      avgViewsAdjusted,
      avgReactionsRaw: this.average(rawReactions),
      avgReactionsAdjusted: this.average(adjustedReactions),
      rawAvgViews: this.average(rawViews),
      rawAvgReactions: this.average(rawReactions),
      dataQuality,
      dataQualityReason,
      dataQualityWarning,
      hasExternalTrafficAnomaly,
      hasSubscriberBasePollution,
      postsWindow,
      postsUsed: posts.length,
    };
  }

  async createAudienceSnapshot(channelId: string, source = 'sync') {
    const channel = await this.prisma.telegramChannel.findUnique({
      where: { id: channelId },
    });
    if (!channel) throw new NotFoundException('Telegram channel not found');
    const analytics = await this.getActiveAudienceEstimate(channelId);
    return this.prisma.telegramChannelAudienceSnapshot.create({
      data: {
        workspaceId: channel.workspaceId,
        telegramChannelId: channel.id,
        subscribersCount: analytics.subscribersCount,
        activeSubscribersEstimate: analytics.activeSubscribersEstimate,
        viewRate: analytics.viewRate,
        avgViewsRaw: analytics.avgViewsRaw,
        avgViewsAdjusted: analytics.avgViewsAdjusted,
        avgReactionsRaw: analytics.avgReactionsRaw,
        avgReactionsAdjusted: analytics.avgReactionsAdjusted,
        rawAvgViews: analytics.rawAvgViews,
        rawAvgReactions: analytics.rawAvgReactions,
        rawViewRate: analytics.rawViewRate,
        effectiveSubscribersCount: analytics.effectiveSubscribersCount,
        cappedActiveSubscribersEstimate:
          analytics.cappedActiveSubscribersEstimate,
        cappedViewRate: analytics.cappedViewRate,
        dataQuality: analytics.dataQuality,
        dataQualityReason: analytics.dataQualityReason,
        hasExternalTrafficAnomaly: analytics.hasExternalTrafficAnomaly,
        hasSubscriberBasePollution: analytics.hasSubscriberBasePollution,
        postsWindow: analytics.postsWindow,
        source,
      },
    });
  }

  async audienceSnapshots(channelId: string, limit = 50) {
    const safeLimit = Math.max(1, Math.min(200, limit));
    return this.prisma.telegramChannelAudienceSnapshot.findMany({
      where: { telegramChannelId: channelId },
      orderBy: { collectedAt: 'asc' },
      take: safeLimit,
    });
  }

  async getChannelFinancialSummary(channelId: string) {
    const channel = await this.prisma.telegramChannel.findUnique({
      where: { id: channelId },
    });
    if (!channel) throw new NotFoundException('Telegram channel not found');
    const [campaignRows, audience, channelInviteLinks] = await Promise.all([
      (this.prisma.adCampaign as any).findMany({
        where: {
          workspaceId: channel.workspaceId,
          telegramChannelId: channel.id,
          excludeFromAnalytics: false,
        },
        include: { inviteLinks: { select: { joinedCount: true } } },
      }),
      this.getActiveAudienceEstimate(channelId),
      this.prisma.telegramInviteLink.findMany({
        where: { workspaceId: channel.workspaceId, telegramChannelId: channel.id },
        select: { id: true, joinedCount: true },
      }),
    ]);
    const campaigns = campaignRows as any[];
    const inviteLinksById = new Map(
      channelInviteLinks.map((link) => [link.id, Number(link.joinedCount || 0)]),
    );
    const totalAdSpend = campaigns.reduce(
      (sum, campaign) => sum + Number(campaign.priceInPrimaryCurrency || 0),
      0,
    );
    const totalJoinedSubscribers = campaigns.reduce((sum, campaign) => {
      const selectedLinkId = String(campaign.telegramInviteLinkId || '').trim();
      if (selectedLinkId && inviteLinksById.has(selectedLinkId)) {
        return sum + Number(inviteLinksById.get(selectedLinkId) || 0);
      }
      const campaignJoined = Number(campaign.joinedCount || 0);
      const linksJoined = campaign.inviteLinks.reduce(
        (linkSum, link) => linkSum + Number(link.joinedCount || 0),
        0,
      );
      if (linksJoined > 0 || campaignJoined > 0) {
        return sum + Math.max(campaignJoined, linksJoined);
      }
      if (campaign.newSubscribers != null) {
        return sum + Number(campaign.newSubscribers || 0);
      }
      return sum + Math.max(campaignJoined, linksJoined);
    }, 0);
    const avgCpa =
      totalJoinedSubscribers > 0 ? totalAdSpend / totalJoinedSubscribers : null;
    const campaignActiveSubscribersEstimate = campaigns.reduce(
      (sum, campaign) => sum + Number(campaign.activeSubscribersFromAd || 0),
      0,
    );
    const paidActiveSubscribersEstimate =
      campaignActiveSubscribersEstimate > 0
        ? campaignActiveSubscribersEstimate
        : (audience.paidActiveSubscribersEstimate ?? 0);
    const activeCpa =
      paidActiveSubscribersEstimate > 0
        ? totalAdSpend / paidActiveSubscribersEstimate
        : null;
    const avgActiveRate = this.average(
      campaigns
        .map((campaign) => this.numberOrNull(campaign.activeRate))
        .filter((value): value is number => value != null),
    );
    const avgRetention7d = this.average(
      campaigns
        .map((campaign) => this.numberOrNull(campaign.retention7d))
        .filter((value): value is number => value != null),
    );
    const targetCpaFrom = this.numberOrNull(channel.targetCpaFrom);
    const targetCpa = this.numberOrNull(channel.targetCpa);
    const acceptableCpaFrom = this.numberOrNull(channel.acceptableCpaFrom);
    const acceptableCpa = this.numberOrNull(channel.acceptableCpa);
    const stopCpaFrom =
      this.numberOrNull(channel.stopCpaFrom) ?? this.numberOrNull(channel.stopCpa);
    let kpiStatus: KpiStatus = 'unknown';
    if (avgCpa != null) {
      if (this.inRange(avgCpa, targetCpaFrom, targetCpa)) kpiStatus = 'good';
      else if (this.inRange(avgCpa, acceptableCpaFrom, acceptableCpa))
        kpiStatus = 'acceptable';
      else if (this.inRange(avgCpa, stopCpaFrom, null)) kpiStatus = 'bad';
    }
    const kpiLabel =
      kpiStatus === 'good'
        ? 'Good'
        : kpiStatus === 'acceptable'
          ? 'Acceptable'
          : kpiStatus === 'bad'
            ? 'Stop'
            : '-';

    return {
      totalAdSpend,
      campaignsCount: campaigns.length,
      totalJoinedSubscribers,
      avgCpa,
      activeSubscribersEstimate: audience.activeSubscribersEstimate,
      paidActiveSubscribersEstimate,
      activeCpa,
      avgActiveRate,
      avgRetention7d,
      dataQuality: audience.dataQuality,
      dataQualityReason: audience.dataQualityReason,
      dataQualityWarning: audience.dataQualityWarning,
      hasExternalTrafficAnomaly: audience.hasExternalTrafficAnomaly,
      hasSubscriberBasePollution: audience.hasSubscriberBasePollution,
      kpiStatus,
      kpiLabel,
    };
  }
}
