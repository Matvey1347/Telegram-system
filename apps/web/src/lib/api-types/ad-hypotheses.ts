import type { Currency, Icon, WorkspaceMember } from "./core";
import type { AdCampaign, AdCampaignKpiStatus } from "./ad-campaigns";
import type { TelegramChannel } from "./telegram-channels";
import type { InviteLinkHistoryPoint, InviteLinkHistorySummary, TelegramInviteLink } from "./telegram-invite-links";

export type AdHypothesisStatus =
  | "testing"
  | "winner"
  | "loser"
  | "paused"
  | "archived";
export type AdHypothesisKpiStatus = "good" | "acceptable" | "bad" | "unknown";
export type AdHypothesisCampaignSummary = {
  id: string;
  campaignId: string;
  title: string;
  status: string;
  currency: Currency;
  spend: number;
  joinedSubscribers: number;
  pendingSubscribers: number;
  attributedSubscribers: number;
  leftSubscribers?: number | null;
  cpa?: number | null;
  views?: number | null;
  reactions?: number | null;
  engagementRate?: number | null;
  activeSubscribersEstimate?: number | null;
  activeCpa?: number | null;
  activeRate?: number | null;
  retention7d?: number | null;
  overallStatus?: AdCampaignKpiStatus | null;
  analyticsLastCalculatedAt?: string | null;
  targetChannel?: {
    id: string;
    title: string;
    username?: string | null;
    photoUrl?: string | null;
  } | null;
  source?: string | null;
  sourcePostUrl?: string | null;
  kpiStatus: AdHypothesisKpiStatus;
  excludeFromAnalytics?: boolean;
};
export type AdHypothesisSummary = {
  campaignsCount: number;
  totalSpend: number;
  displayCurrency?: string | null;
  totalSpendDisplay?: number | null;
  totalJoinedSubscribers: number;
  totalPendingSubscribers: number;
  totalAttributedSubscribers: number;
  avgCpa?: number | null;
  avgCpaDisplay?: number | null;
  activeSubscribersEstimate?: number | null;
  activeCpa?: number | null;
  avgActiveRate?: number | null;
  avgRetention7d?: number | null;
  totalViews?: number | null;
  totalReactions?: number | null;
  engagementRate?: number | null;
  bestCampaign?: AdHypothesisCampaignSummary | null;
  worstCampaign?: AdHypothesisCampaignSummary | null;
  kpiStatus: AdHypothesisKpiStatus;
  decision: string;
};
export type AdHypothesis = {
  id: string;
  name: string;
  iconId?: string | null;
  icon?: Icon | null;
  telegramChannelId?: string | null;
  telegramChannel?: TelegramChannel | null;
  description?: string | null;
  status: AdHypothesisStatus;
  conclusion?: string | null;
  assignedMemberId?: string | null;
  assignedMember?: WorkspaceMember | null;
  createdAt: string;
  updatedAt: string;
  allCampaignsExcludedFromAnalytics?: boolean;
  excludedCampaignsCount?: number;
  campaignsCount: number;
  summary: AdHypothesisSummary;
};
export type AdHypothesisCampaign = {
  id: string;
  adCampaignId: string;
  adCampaign: AdCampaign;
};
export type AdHypothesisDetail = AdHypothesis & {
  campaigns: AdCampaign[];
  campaignSummaries: AdHypothesisCampaignSummary[];
};
export type AdHypothesisInviteLinkHistory = {
  hypothesis: {
    id: string;
    name: string;
  };
  inviteLinks: Array<
    Pick<
      TelegramInviteLink,
      | "id"
      | "name"
      | "url"
      | "joinedCount"
      | "requestedCount"
      | "isRevoked"
      | "adCampaignId"
      | "telegramChannelId"
    > & {
      summary: InviteLinkHistorySummary;
    }
  >;
  points: InviteLinkHistoryPoint[];
  summary: InviteLinkHistorySummary & {
    inviteLinksCount: number;
    campaignsCount: number;
  };
};
export type CreateAdHypothesisPayload = {
  name: string;
  iconId?: string | null;
  telegramChannelId?: string | null;
  assignedMemberId?: string | null;
  description?: string | null;
  status?: AdHypothesisStatus;
  conclusion?: string | null;
  adCampaignIds: string[];
};
export type UpdateAdHypothesisPayload = {
  name?: string;
  iconId?: string | null;
  telegramChannelId?: string | null;
  assignedMemberId?: string | null;
  description?: string | null;
  status?: AdHypothesisStatus;
  conclusion?: string | null;
  adCampaignIds?: string[];
};
