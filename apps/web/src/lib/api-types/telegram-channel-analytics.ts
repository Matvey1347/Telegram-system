import type { TelegramChannel } from "./telegram-channels";
import type { TelegramPostAnalyticsItem } from "./telegram-posts";
import type { TelegramInviteLink } from "./telegram-invite-links";
import type { AdCampaign } from "./ad-campaigns";

export type TelegramChannelAudience = {
  subscribersCount: number | null;
  knownFakeSubscribersCount?: number;
  effectiveSubscribersCount?: number | null;
  subscriberBaseQuality?: string | null;
  seedSubscribersCount: number;
  ownViewsPerPost?: number;
  ownReactionsPerPost?: number;
  rawActiveSubscribersEstimate?: number | null;
  activeSubscribersEstimate: number | null;
  cappedActiveSubscribersEstimate?: number | null;
  organicActiveSubscribersEstimate: number | null;
  paidActiveSubscribersEstimate: number | null;
  rawViewRate?: number | null;
  viewRate: number | null;
  cappedViewRate?: number | null;
  avgViewsRaw: number | null;
  avgViewsAdjusted: number | null;
  avgReactionsRaw: number | null;
  avgReactionsAdjusted: number | null;
  rawAvgViews?: number | null;
  rawAvgReactions?: number | null;
  dataQuality?: string | null;
  dataQualityReason?: string | null;
  dataQualityWarning?: string | null;
  hasExternalTrafficAnomaly?: boolean;
  hasSubscriberBasePollution?: boolean;
  postsWindow: number;
  postsUsed: number;
};
export type TelegramChannelAudienceSnapshot = {
  id: string;
  workspaceId: string;
  telegramChannelId: string;
  collectedAt: string;
  subscribersCount?: number | null;
  activeSubscribersEstimate?: number | null;
  viewRate?: number | null;
  avgViewsRaw?: number | null;
  avgViewsAdjusted?: number | null;
  avgReactionsRaw?: number | null;
  avgReactionsAdjusted?: number | null;
  rawAvgViews?: number | null;
  rawAvgReactions?: number | null;
  rawViewRate?: number | null;
  effectiveSubscribersCount?: number | null;
  cappedActiveSubscribersEstimate?: number | null;
  cappedViewRate?: number | null;
  dataQuality?: string | null;
  dataQualityReason?: string | null;
  hasExternalTrafficAnomaly?: boolean;
  hasSubscriberBasePollution?: boolean;
  postsWindow: number;
  source: string;
  createdAt: string;
};
export type TelegramChannelFinancialSummary = {
  acquisitionCost?: number;
  totalSpend?: number;
  totalAdSpend: number;
  campaignsCount: number;
  totalJoinedSubscribers: number;
  totalPendingSubscribers: number;
  totalAttributedSubscribers: number;
  avgCpa: number | null;
  activeSubscribersEstimate: number | null;
  paidActiveSubscribersEstimate: number | null;
  activeCpa: number | null;
  avgActiveRate?: number | null;
  avgRetention7d?: number | null;
  dataQuality?: string | null;
  dataQualityReason?: string | null;
  dataQualityWarning?: string | null;
  hasExternalTrafficAnomaly?: boolean;
  hasSubscriberBasePollution?: boolean;
  kpiStatus: "good" | "acceptable" | "bad" | "unknown";
  kpiLabel: string;
};

export type TelegramChannelAnalyticsSummary = {
  subscribersCurrent: number | null;
  joinedHistoricalByLinks: number;
  joinedToday: number | null;
  leftToday: number | null;
  netGrowthToday: number | null;
  leftTotal: number | null;
  netGrowth: number | null;
  inviteLinksCount: number;
  campaignsCount: number;
  postsTotal: number;
  viewsTotal: number;
  forwardsTotal: number;
  reactionsTotal: number;
  commentsTotal: number;
  requestedJoinsTotal: number;
  totalAdSpend: number;
  totalJoinedSubscribers: number;
  avgCpa: number | null;
  activeCpa: number | null;
};

export type TelegramChannelAnalyticsResponse = {
  source: string;
  channel: TelegramChannel;
  summary: TelegramChannelAnalyticsSummary;
  dailyStats: Array<Record<string, unknown>>;
  recentEvents: Array<Record<string, unknown>>;
  channelStatsSnapshot:
    | ({
        normalizedStats?: {
          graphs?: Record<string, unknown>;
          followers?: { current?: number | null };
        } | null;
      } & Record<string, unknown>)
    | null;
  channelStatsPoints: Array<Record<string, unknown>>;
  financialSummary: TelegramChannelFinancialSummary;
  range: {
    from: string;
    to: string;
    maxRangeDays: number;
  };
  recentPosts?: TelegramPostAnalyticsItem[];
  inviteLinks?: TelegramInviteLink[];
  campaigns?: AdCampaign[];
};
