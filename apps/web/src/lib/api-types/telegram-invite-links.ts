import type { MemberSummary } from "./core";
import type { AdCampaign } from "./ad-campaigns";

export type TelegramInviteLink = {
  id: string;
  telegramChannelId: string;
  adCampaignId?: string;
  name: string;
  url: string;
  joinedCount: number;
  requestedCount: number;
  isRevoked: boolean;
  expireDate?: string;
  memberLimit?: number;
  createsJoinRequest?: boolean;
  creatorTelegramUserId?: string | null;
  creatorUsername?: string | null;
  creatorFirstName?: string | null;
  creatorLastName?: string | null;
  creatorPhotoUrl?: string | null;
  creatorMatchSource?:
    | "TELEGRAM_USER_ID"
    | "MTPROTO_USERNAME"
    | "MEMBER_USERNAME"
    | "UNRESOLVED"
    | null;
  creatorMember?: MemberSummary | null;
  adCampaign?: Pick<AdCampaign, "id" | "title">;
  history?: TelegramInviteLinkHistory | null;
};
export type InviteLinkHistoryPoint = {
  syncedAt: string;
  joinedCount: number;
  requestedCount: number;
  totalAttributed: number;
  peakJoinedCount: number;
  drawdownFromPeak: number;
  drawdownPercent: number;
  isRevoked?: boolean;
};
export type InviteLinkHistorySummary = {
  currentJoinedCount: number;
  currentRequestedCount: number;
  currentTotalAttributed: number;
  peakJoinedCount: number;
  peakRequestedCount: number;
  peakTotalAttributed: number;
  drawdownFromPeak: number;
  drawdownPercent: number;
  hasHighDropoff: boolean;
};
export type TelegramInviteLinkHistory = {
  inviteLink: TelegramInviteLink;
  points: InviteLinkHistoryPoint[];
  summary: InviteLinkHistorySummary;
};
export type AdCampaignInviteLinkHistory = {
  campaign: {
    id: string;
    title?: string | null;
  };
  inviteLinks: Array<
    Pick<
      TelegramInviteLink,
      "id" | "name" | "url" | "joinedCount" | "requestedCount" | "isRevoked"
    > & {
      summary: InviteLinkHistorySummary;
    }
  >;
  points: InviteLinkHistoryPoint[];
  summary: InviteLinkHistorySummary & {
    inviteLinksCount: number;
  };
};
