import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

type KpiStatus = 'good' | 'acceptable' | 'bad' | 'unknown';

@Injectable()
export class AdCampaignAnalyticsService {
  constructor(private prisma: PrismaService) {}

  private numberOrNull(value: unknown) {
    if (value == null) return null;
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }

  private ratio(numerator: number | null, denominator: number | null) {
    if (numerator == null || denominator == null || denominator <= 0) return null;
    return (numerator / denominator) * 100;
  }

  private unsub(from: number | null, to: number | null) {
    if (from == null || to == null) return null;
    return Math.max(0, from - to);
  }

  private kpiStatus(value: number | null, channel: any): KpiStatus {
    if (value == null || !channel) return 'unknown';
    const target = this.numberOrNull(channel.targetCpa);
    const acceptable = this.numberOrNull(channel.acceptableCpa);
    const stop = this.numberOrNull(channel.stopCpa);
    if (target == null && acceptable == null && stop == null) return 'unknown';
    if (target != null && value <= target) return 'good';
    if (acceptable != null && value <= acceptable) return 'acceptable';
    if (stop != null && value >= stop) return 'bad';
    return 'unknown';
  }

  private retentionStatus(retention7d: number | null): KpiStatus {
    if (retention7d == null) return 'unknown';
    if (retention7d >= 80) return 'good';
    if (retention7d >= 60) return 'acceptable';
    return 'bad';
  }

  private overallStatus(statuses: KpiStatus[]): KpiStatus {
    const known = statuses.filter((status) => status !== 'unknown');
    if (!known.length) return 'unknown';
    if (known.includes('bad')) return 'bad';
    if (known.every((status) => status === 'good')) return 'good';
    return 'acceptable';
  }

  private decisionText(status: KpiStatus) {
    if (status === 'good') return 'Campaign performs well. Candidate for repeat or scaling.';
    if (status === 'acceptable') return 'Campaign is acceptable. Continue testing carefully.';
    if (status === 'bad') return 'Campaign is weak. Do not scale before changing source, creative or offer.';
    return 'Not enough data yet.';
  }

  summary(campaign: any) {
    return {
      cost: this.numberOrNull(campaign.priceInPrimaryCurrency),
      subscribersBefore: campaign.subscribersBefore,
      subscribersAfter24h: campaign.subscribersAfter24h,
      subscribersAfter48h: campaign.subscribersAfter48h,
      subscribersAfter72h: campaign.subscribersAfter72h,
      subscribersAfter7d: campaign.subscribersAfter7d,
      subscribersAfter30d: campaign.subscribersAfter30d,
      newSubscribers: campaign.newSubscribers,
      avgViewsBefore: campaign.avgViewsBefore,
      avgViewsAfter: campaign.avgViewsAfter,
      activeSubscribersFromAd: campaign.activeSubscribersFromAd,
      cpa: this.numberOrNull(campaign.cpa),
      activeCpa: this.numberOrNull(campaign.activeCpa),
      activeRate: campaign.activeRate,
      unsub24h: campaign.unsub24h,
      unsub48h: campaign.unsub48h,
      unsub72h: campaign.unsub72h,
      unsub7d: campaign.unsub7d,
      unsub30d: campaign.unsub30d,
      retention24h: campaign.retention24h,
      retention48h: campaign.retention48h,
      retention72h: campaign.retention72h,
      retention7d: campaign.retention7d,
      retention30d: campaign.retention30d,
      cpaStatus: campaign.cpaStatus || 'unknown',
      activeCpaStatus: campaign.activeCpaStatus || 'unknown',
      retentionStatus: campaign.retentionStatus || 'unknown',
      overallStatus: campaign.overallStatus || 'unknown',
      decisionText: campaign.decisionText || this.decisionText('unknown'),
      analyticsLastCalculatedAt: campaign.analyticsLastCalculatedAt,
      analyticsLastAutoSyncedAt: campaign.analyticsLastAutoSyncedAt,
      analyticsLastManualSyncedAt: campaign.analyticsLastManualSyncedAt,
    };
  }

  async recalculateCampaignAnalytics(workspaceId: string, campaignId: string) {
    const campaign: any = await this.prisma.adCampaign.findFirst({
      where: { id: campaignId, workspaceId },
      include: { telegramChannel: true },
    });
    if (!campaign) throw new NotFoundException('Campaign not found');

    const cost = this.numberOrNull(campaign.priceInPrimaryCurrency) ?? 0;
    const subscribersBefore = this.numberOrNull(campaign.subscribersBefore);
    const after24h = this.numberOrNull(campaign.subscribersAfter24h);
    const after48h = this.numberOrNull(campaign.subscribersAfter48h);
    const after72h = this.numberOrNull(campaign.subscribersAfter72h);
    const after7d = this.numberOrNull(campaign.subscribersAfter7d);
    const after30d = this.numberOrNull(campaign.subscribersAfter30d);
    const avgViewsBefore = this.numberOrNull(campaign.avgViewsBefore);
    const avgViewsAfter = this.numberOrNull(campaign.avgViewsAfter);

    const newSubscribers =
      subscribersBefore != null && after24h != null
        ? after24h - subscribersBefore
        : null;
    const activeSubscribersFromAd =
      avgViewsBefore != null && avgViewsAfter != null
        ? Math.max(0, Math.round(avgViewsAfter - avgViewsBefore))
        : null;
    const cpa =
      newSubscribers != null && newSubscribers > 0 ? cost / newSubscribers : null;
    const activeCpa =
      activeSubscribersFromAd != null && activeSubscribersFromAd > 0
        ? cost / activeSubscribersFromAd
        : null;
    const activeRate = this.ratio(activeSubscribersFromAd, newSubscribers);
    const retention24h = after24h != null && after24h > 0 ? 100 : null;
    const retention48h = this.ratio(after48h, after24h);
    const retention72h = this.ratio(after72h, after24h);
    const retention7d = this.ratio(after7d, after24h);
    const retention30d = this.ratio(after30d, after24h);
    const cpaStatus = this.kpiStatus(cpa, campaign.telegramChannel);
    const activeCpaStatus = this.kpiStatus(activeCpa, campaign.telegramChannel);
    const retentionStatus = this.retentionStatus(retention7d);
    const overallStatus = this.overallStatus([
      cpaStatus,
      activeCpaStatus,
      retentionStatus,
    ]);

    const updated = await (this.prisma.adCampaign as any).update({
      where: { id: campaign.id },
      data: {
        newSubscribers,
        activeSubscribersFromAd,
        cpa,
        activeCpa,
        activeRate,
        unsub24h: this.unsub(after24h, after48h),
        unsub48h: this.unsub(after24h, after72h),
        unsub72h: this.unsub(after24h, after7d),
        unsub7d: this.unsub(after24h, after7d),
        unsub30d: this.unsub(after24h, after30d),
        retention24h,
        retention48h,
        retention72h,
        retention7d,
        retention30d,
        cpaStatus,
        activeCpaStatus,
        retentionStatus,
        overallStatus,
        decisionText: this.decisionText(overallStatus),
        analyticsLastCalculatedAt: new Date(),
      },
      include: { telegramChannel: true },
    });

    return { campaign: updated, summary: this.summary(updated) };
  }
}
