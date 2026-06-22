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
export class AdCampaignAnalyticsService {
  constructor(private prisma: PrismaService) {}

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
    const targetFrom = this.numberOrNull(channel.targetCpaFrom);
    const target = this.numberOrNull(channel.targetCpa);
    const acceptableFrom = this.numberOrNull(channel.acceptableCpaFrom);
    const acceptable = this.numberOrNull(channel.acceptableCpa);
    const stopFrom =
      this.numberOrNull(channel.stopCpaFrom) ?? this.numberOrNull(channel.stopCpa);
    if (
      targetFrom == null &&
      target == null &&
      acceptableFrom == null &&
      acceptable == null &&
      stopFrom == null
    ) return 'unknown';
    if (this.inRange(value, targetFrom, target)) return 'good';
    if (this.inRange(value, acceptableFrom, acceptable)) return 'acceptable';
    if (this.inRange(value, stopFrom, null)) return 'bad';
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
      rawActiveSubscribersFromAd: campaign.rawActiveSubscribersFromAd,
      rawViewRateAfter: campaign.rawViewRateAfter,
      cappedActiveSubscribersFromAd: campaign.cappedActiveSubscribersFromAd,
      cappedActiveRate: campaign.cappedActiveRate,
      cappedActiveCpa: this.numberOrNull(campaign.cappedActiveCpa),
      cappedViewRateAfter: campaign.cappedViewRateAfter,
      adDataQuality: campaign.adDataQuality || 'normal',
      adDataQualityReason: campaign.adDataQualityReason || null,
      adDataQualityWarning: buildDataQualityWarning(
        campaign.adDataQuality || 'normal',
        campaign.adDataQualityReason || null,
      ),
      hasViewAnomaly: Boolean(campaign.hasViewAnomaly),
      hasSubscriberBasePollution: Boolean(campaign.hasSubscriberBasePollution),
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
    const {
      effectiveSubscribers: effectiveSubscribersBeforeSeed,
      subscriberBaseQuality,
      hasSubscriberBasePollution,
    } = calculateEffectiveSubscribers({
      totalSubscribers: after24h,
      knownFakeSubscribersCount: Number(
        campaign.telegramChannel?.knownFakeSubscribersCount || 0,
      ),
      manualSubscriberBaseQuality: campaign.telegramChannel?.subscriberBaseQuality,
    });
    const effectiveSubscribers =
      effectiveSubscribersBeforeSeed == null
        ? null
        : Math.max(
            0,
            effectiveSubscribersBeforeSeed -
              Number(campaign.telegramChannel?.seedSubscribersCount || 0),
          );

    const newSubscribers =
      subscribersBefore != null && after24h != null
        ? Math.max(0, after24h - subscribersBefore)
        : null;
    const rawActiveSubscribersFromAd =
      avgViewsBefore != null && avgViewsAfter != null
        ? Math.max(0, Math.round(avgViewsAfter - avgViewsBefore))
        : null;
    const rawViewRateAfter =
      avgViewsAfter != null && effectiveSubscribers != null && effectiveSubscribers > 0
        ? (avgViewsAfter / effectiveSubscribers) * 100
        : null;
    const cappedActiveSubscribersFromAd =
      rawActiveSubscribersFromAd != null && newSubscribers != null
        ? Math.min(rawActiveSubscribersFromAd, newSubscribers)
        : null;
    const activeSubscribersFromAd = cappedActiveSubscribersFromAd;
    const cappedViewRateAfter =
      rawViewRateAfter == null ? null : Math.min(rawViewRateAfter, 100);
    const cpa =
      newSubscribers != null && newSubscribers > 0 ? cost / newSubscribers : null;
    const activeCpa =
      activeSubscribersFromAd != null && activeSubscribersFromAd > 0
        ? cost / activeSubscribersFromAd
        : null;
    const activeRate = this.ratio(activeSubscribersFromAd, newSubscribers);
    const cappedActiveRate = activeRate;
    const cappedActiveCpa = activeCpa;
    const retention24h = after24h != null && after24h > 0 ? 100 : null;
    const retention48h = this.ratio(after48h, after24h);
    const retention72h = this.ratio(after72h, after24h);
    const retention7d = this.ratio(after7d, after24h);
    const retention30d = this.ratio(after30d, after24h);
    const cpaStatus = this.kpiStatus(cpa, campaign.telegramChannel);
    const activeCpaStatus = this.kpiStatus(cappedActiveCpa, campaign.telegramChannel);
    const retentionStatus = this.retentionStatus(retention7d);
    const classified = classifyViewRate(rawViewRateAfter);
    let adDataQuality: DataQuality = classified.dataQuality;
    let adDataQualityReason = classified.reason;
    const upliftExceedsNewSubscribers =
      rawActiveSubscribersFromAd != null &&
      newSubscribers != null &&
      rawActiveSubscribersFromAd > newSubscribers;
    const upliftWithoutNewSubscribers =
      rawActiveSubscribersFromAd != null &&
      rawActiveSubscribersFromAd > 0 &&
      newSubscribers === 0;
    if (upliftWithoutNewSubscribers) {
      adDataQuality = maxDataQuality(adDataQuality, 'suspicious');
      adDataQualityReason = 'views_uplift_without_new_subscribers';
    } else if (upliftExceedsNewSubscribers) {
      adDataQuality = maxDataQuality(adDataQuality, 'suspicious');
      adDataQualityReason = 'views_uplift_exceeds_new_subscribers';
    }
    if (subscriberBaseQuality === 'polluted' || subscriberBaseQuality === 'suspicious') {
      adDataQuality = maxDataQuality(adDataQuality, 'suspicious');
      adDataQualityReason = 'subscriber_base_polluted';
    }
    if (subscriberBaseQuality === 'invalid') {
      adDataQuality = 'invalid';
      adDataQualityReason = 'missing_required_data';
    }
    const hasViewAnomaly =
      classified.hasExternalTrafficAnomaly || upliftExceedsNewSubscribers;
    const overallStatus = this.overallStatus([
      cpaStatus,
      activeCpaStatus,
      retentionStatus,
    ]);
    const decisionText =
      adDataQuality === 'anomalous'
        ? 'Campaign data is anomalous. Active subscribers are capped. Do not scale based only on this result.'
        : adDataQuality === 'suspicious'
          ? 'Campaign data is suspicious. Check external reach, reposts or view manipulation before scaling.'
          : this.decisionText(overallStatus);

    const updated = await (this.prisma.adCampaign as any).update({
      where: { id: campaign.id },
      data: {
        newSubscribers,
        rawActiveSubscribersFromAd,
        rawViewRateAfter,
        cappedActiveSubscribersFromAd,
        activeSubscribersFromAd,
        cpa,
        activeCpa: cappedActiveCpa,
        activeRate,
        cappedActiveRate,
        cappedActiveCpa,
        cappedViewRateAfter,
        adDataQuality,
        adDataQualityReason,
        hasViewAnomaly,
        hasSubscriberBasePollution,
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
        decisionText,
        analyticsLastCalculatedAt: new Date(),
      },
      include: { telegramChannel: true },
    });

    return { campaign: updated, summary: this.summary(updated) };
  }
}
