import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

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
    const activeSubscribersEstimate =
      avgViewsAdjusted == null ? null : Math.round(avgViewsAdjusted);
    const subscribersCount = channel.currentSubscribersCount ?? null;
    const viewRate =
      subscribersCount && activeSubscribersEstimate != null
        ? (activeSubscribersEstimate / subscribersCount) * 100
        : null;
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
      seedSubscribersCount,
      activeSubscribersEstimate,
      organicActiveSubscribersEstimate,
      paidActiveSubscribersEstimate,
      viewRate,
      avgViewsRaw: this.average(rawViews),
      avgViewsAdjusted,
      avgReactionsRaw: this.average(rawReactions),
      avgReactionsAdjusted: this.average(adjustedReactions),
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
    const [campaigns, audience] = await Promise.all([
      this.prisma.adCampaign.findMany({
        where: { workspaceId: channel.workspaceId, telegramChannelId: channel.id },
        include: { inviteLinks: { select: { joinedCount: true } } },
      }),
      this.getActiveAudienceEstimate(channelId),
    ]);
    const totalAdSpend = campaigns.reduce(
      (sum, campaign) => sum + Number(campaign.priceInPrimaryCurrency || 0),
      0,
    );
    const totalJoinedSubscribers = campaigns.reduce((sum, campaign) => {
      const campaignJoined = Number(campaign.joinedCount || 0);
      const linksJoined = campaign.inviteLinks.reduce(
        (linkSum, link) => linkSum + Number(link.joinedCount || 0),
        0,
      );
      return sum + Math.max(campaignJoined, linksJoined);
    }, 0);
    const avgCpa =
      totalJoinedSubscribers > 0 ? totalAdSpend / totalJoinedSubscribers : null;
    const paidActiveSubscribersEstimate =
      audience.paidActiveSubscribersEstimate ?? 0;
    const activeCpa =
      paidActiveSubscribersEstimate > 0
        ? totalAdSpend / paidActiveSubscribersEstimate
        : null;
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
      paidActiveSubscribersEstimate: audience.paidActiveSubscribersEstimate,
      activeCpa,
      kpiStatus,
      kpiLabel,
      kpiCurrency: channel.kpiCurrency,
    };
  }
}
