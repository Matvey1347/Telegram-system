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
    const adjustedViews = posts.map((post) =>
      Math.max(0, Number(post.viewsCount || 0) - post.manualOwnViews),
    );
    const rawReactions = posts.map((post) =>
      Number(post.reactionsCount || 0),
    );
    const adjustedReactions = posts.map((post) =>
      Math.max(0, Number(post.reactionsCount || 0) - post.manualOwnReactions),
    );
    const avgViewsAdjusted = this.average(adjustedViews);
    const subscribersCount = channel.currentSubscribersCount ?? null;
    const knownFakeSubscribersCount = Math.max(
      0,
      Number(channel.knownFakeSubscribersCount || 0),
    );
    const {
      effectiveSubscribers,
      subscriberBaseQuality,
      hasSubscriberBasePollution,
    } = calculateEffectiveSubscribers({
      totalSubscribers: subscribersCount,
      knownFakeSubscribersCount,
      manualSubscriberBaseQuality: channel.subscriberBaseQuality,
    });
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
    const seedSubscribersCount = channel.seedSubscribersCount || 0;
    const organicActiveSubscribersEstimate =
      activeSubscribersEstimate == null
        ? null
        : Math.min(seedSubscribersCount, activeSubscribersEstimate);
    const paidActiveSubscribersEstimate =
      activeSubscribersEstimate == null
        ? null
        : Math.max(0, activeSubscribersEstimate - seedSubscribersCount);

    return {
      subscribersCount,
      knownFakeSubscribersCount,
      effectiveSubscribersCount: effectiveSubscribers,
      subscriberBaseQuality,
      seedSubscribersCount,
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
    const [campaignRows, audience] = await Promise.all([
      (this.prisma.adCampaign as any).findMany({
        where: {
          workspaceId: channel.workspaceId,
          telegramChannelId: channel.id,
          excludeFromAnalytics: false,
        },
        include: { inviteLinks: { select: { joinedCount: true } } },
      }),
      this.getActiveAudienceEstimate(channelId),
    ]);
    const campaigns = campaignRows as any[];
    const totalAdSpend = campaigns.reduce(
      (sum, campaign) => sum + Number(campaign.priceInPrimaryCurrency || 0),
      0,
    );
    const totalJoinedSubscribers = campaigns.reduce((sum, campaign) => {
      if (campaign.newSubscribers != null) {
        return sum + Number(campaign.newSubscribers || 0);
      }
      const campaignJoined = Number(campaign.joinedCount || 0);
      const linksJoined = campaign.inviteLinks.reduce(
        (linkSum, link) => linkSum + Number(link.joinedCount || 0),
        0,
      );
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
    const targetCpa = this.numberOrNull(channel.targetCpa);
    const acceptableCpa = this.numberOrNull(channel.acceptableCpa);
    const stopCpa = this.numberOrNull(channel.stopCpa);
    let kpiStatus: KpiStatus = 'unknown';
    if (avgCpa != null) {
      if (targetCpa != null && avgCpa <= targetCpa) kpiStatus = 'good';
      else if (acceptableCpa != null && avgCpa <= acceptableCpa)
        kpiStatus = 'acceptable';
      else if (stopCpa != null && avgCpa >= stopCpa) kpiStatus = 'bad';
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
      kpiCurrency: channel.kpiCurrency,
    };
  }
}
