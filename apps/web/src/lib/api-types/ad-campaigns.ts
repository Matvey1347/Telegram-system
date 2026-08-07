import type { Currency, Icon, ResolvedEmoji, WorkspaceMember } from "./core";
import type { TelegramChannel } from "./telegram-channels";
import type { TelegramInviteLink, AdCampaignInviteLinkHistory } from "./telegram-invite-links";
import type { AdHypothesisStatus } from "./ad-hypotheses";

export type Promo = {
  id: string;
  telegramChannelId: string;
  iconId?: string | null;
  icon?: Icon | null;
  iconPresentation?: ResolvedEmoji | null;
  assignedMemberId?: string | null;
  assignedMember?: WorkspaceMember | null;
  title: string;
  text?: string;
  imageData?: string;
  status: "draft" | "active" | "archived";
  telegramChannel?: TelegramChannel;
};
export type AdvertisingChannel = {
  id: string;
  selectionId?: string;
  kind?: "person" | "legacy_channel";
  title: string;
  telegramUrl?: string;
  username?: string;
  contactInfo?: string;
  notes?: string;
  imageUrl?: string;
  subscribersCount?: number;
  channelTags?: string[];
  createdAt?: string;
  updatedAt?: string;
};
export type ImportedTelegramSource = TelegramChannel | AdvertisingChannel;
export type AdCampaignHypothesisLink = {
  id: string;
  hypothesis: { id: string; name: string; status: AdHypothesisStatus };
};
export type AdCampaignKpiStatus = "good" | "acceptable" | "bad" | "unknown";
export type AdCampaignAnalyticsInput = {
  subscribersBefore?: number | null;
  avgViewsBefore?: number | null;
  avgReactionsBefore?: number | null;
  subscribersAfter24h?: number | null;
  subscribersAfter48h?: number | null;
  subscribersAfter72h?: number | null;
  subscribersAfter7d?: number | null;
  subscribersAfter30d?: number | null;
  avgViewsAfter?: number | null;
  avgReactionsAfter?: number | null;
  clicksAfter?: number | null;
  analyticsNotes?: string | null;
  excludeFromAnalytics?: boolean;
};
export type AdCampaignAnalyticsFields = AdCampaignAnalyticsInput & {
  newSubscribers?: number | null;
  rawActiveSubscribersFromAd?: number | null;
  rawViewRateAfter?: number | null;
  cappedActiveSubscribersFromAd?: number | null;
  cappedActiveRate?: number | null;
  cappedActiveCpa?: number | string | null;
  cappedViewRateAfter?: number | null;
  adDataQuality?: string | null;
  adDataQualityReason?: string | null;
  adDataQualityWarning?: string | null;
  hasViewAnomaly?: boolean;
  hasSubscriberBasePollution?: boolean;
  activeSubscribersFromAd?: number | null;
  cpa?: number | string | null;
  activeCpa?: number | string | null;
  activeRate?: number | null;
  unsub24h?: number | null;
  unsub48h?: number | null;
  unsub72h?: number | null;
  unsub7d?: number | null;
  unsub30d?: number | null;
  retention24h?: number | null;
  retention48h?: number | null;
  retention72h?: number | null;
  retention7d?: number | null;
  retention30d?: number | null;
  cpaStatus?: AdCampaignKpiStatus | null;
  activeCpaStatus?: AdCampaignKpiStatus | null;
  retentionStatus?: AdCampaignKpiStatus | null;
  overallStatus?: AdCampaignKpiStatus | null;
  decisionText?: string | null;
  analyticsLastCalculatedAt?: string | null;
  analyticsLastAutoSyncedAt?: string | null;
  analyticsLastManualSyncedAt?: string | null;
};
export type AdmissionAnalyticsDataQuality =
  | "GOOD"
  | "PARTIAL"
  | "INSUFFICIENT"
  | "SUSPICIOUS";
export type AdmissionAnalyticsDetectionMode =
  | "EXACT_DELTA"
  | "BOOTSTRAPPED_CUMULATIVE";
export type AdmissionAnalyticsBaselineMethod =
  | "PRE_ADMISSION"
  | "EARLIEST_OBSERVED"
  | "UNAVAILABLE";
export type AdCampaignAdmissionViewPoint = {
  collectedAt: string;
  avgViews: number | null;
  cumulativeAvgViewsUplift: number | null;
  incrementalAvgViewsUplift: number | null;
  estimatedActiveSubscribers: number | null;
  activationRate: number | null;
};
export type AdCampaignAdmissionLatestBatch = {
  id: string;
  status: "ACTIVE" | "CLOSED";
  detectionMode: AdmissionAnalyticsDetectionMode;
  dataQuality: AdmissionAnalyticsDataQuality;
  dataQualityReason: string | null;
  analysisStartedAt: string;
  firstObservedAt: string;
  endedAt: string | null;
  timeBoundarySource?: string;
  releasedSubscribersCount: number;
  baselineMethod: AdmissionAnalyticsBaselineMethod;
  baselineAvgViews: number | null;
  currentAvgViews: number | null;
  cumulativeAvgViewsUplift: number | null;
  incrementalAvgViewsUplift: number | null;
  estimatedActiveSubscribers: number | null;
  activationRate: number | null;
  trackedPostsCount: number;
  originalTrackedPostsCount: number;
  lastCollectedAt: string | null;
};
export type AdCampaignAdmissionViewAnalytics = {
  batchesCount: number;
  latestBatch: AdCampaignAdmissionLatestBatch | null;
  points: AdCampaignAdmissionViewPoint[];
};
export type AdCampaignAdmissionAnalyticsHistory =
  AdCampaignAdmissionViewAnalytics & {
    campaign: { id: string; title: string };
    batches: Array<
      AdCampaignAdmissionLatestBatch & {
        startedAt: string;
        timeBoundarySource: string;
        joinedBefore: number;
        joinedAfter: number;
        requestedBefore: number;
        requestedAfter: number;
        sourceLinks: unknown;
        baselineSnapshotAt: string | null;
        baselineAvgReactions: number | null;
        points: Array<
          AdCampaignAdmissionViewPoint & {
            avgReactions: number | null;
            trackedPostsCount: number;
            dataQuality: AdmissionAnalyticsDataQuality;
            dataQualityReason: string | null;
          }
        >;
      }
    >;
  };
export type AdCampaign = AdCampaignAnalyticsFields & {
  id: string;
  title: string;
  status?: string;
  telegramChannelId: string;
  ownTelegramChannelId?: string;
  promoId?: string | null;
  promoIds?: string[];
  telegramInviteLinkId?: string | null;
  inviteLinkIds?: string[];
  accountId?: string;
  telegramChannel?: TelegramChannel;
  promo?: Promo | null;
  promos?: Promo[];
  telegramInviteLink?: TelegramInviteLink | null;
  inviteLinks?: TelegramInviteLink[];
  advertisingChannels: Array<TelegramChannel | AdvertisingChannel>;
  price: number;
  costAmount?: number;
  exchangeRateToPrimary: number;
  priceInPrimaryCurrency: number;
  currency: Currency;
  placementDate?: string;
  startedAt?: string;
  endedAt?: string;
  joinedCount: number;
  leftCount?: number;
  netGrowthCount?: number;
  sourcePostViews?: number | null;
  sourcePostUrl?: string | null;
  notes?: string;
  customTitleTemplate?: string | null;
  isMixedAttribution?: boolean;
  assignedMemberId?: string | null;
  assignedMember?: WorkspaceMember | null;
  hypothesisLinks?: AdCampaignHypothesisLink[];
  inviteLinkHistory?: AdCampaignInviteLinkHistory | null;
  admissionViewAnalytics?: AdCampaignAdmissionViewAnalytics | null;
  analytics?: {
    joinedCount: number;
    requestedCount?: number;
    attributedCount?: number;
    leftCount: number;
    netGrowth: number;
    costPerJoinedSubscriber?: number | null;
    costPerNetSubscriber?: number | null;
  };
};
export type AdCampaignAnalyticsSummary = AdCampaignAnalyticsFields & {
  cost?: number | null;
  cpa?: number | null;
};
export type DailyAnalyticsSyncRun = {
  id: string;
  workspaceId?: string | null;
  startedAt: string;
  finishedAt?: string | null;
  status: string;
  source: string;
  channelsProcessed: number;
  campaignsProcessed: number;
  snapshotsCreated: number;
  errorsCount: number;
  errorMessage?: string | null;
};

export type AdCampaignPerformanceSummary = {
  campaignsCount: number;
  totalSpend: number;
  totalNewSubscribers: number;
  totalActiveSubscribersFromAd: number;
  avgCpa: number | null;
  avgActiveCpa: number | null;
  avgActiveRate: number | null;
  avgRetention7d: number | null;
  goodCount: number;
  acceptableCount: number;
  badCount: number;
  unknownCount: number;
  anomalousCount: number;
  suspiciousCount: number;
  pollutedCount: number;
  normalDataCount: number;
  bestCampaigns: AdCampaign[];
  worstCampaigns: AdCampaign[];
  lastDailyAnalyticsSync?: DailyAnalyticsSyncRun | null;
};
