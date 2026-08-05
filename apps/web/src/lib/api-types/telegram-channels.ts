import type { SyncOperationResult, StructuredApiError, TelegramChannelAccessMode, EntityAssignment, Icon, WorkspaceMember } from "./core";
import type { TelegramChannelAudience, TelegramChannelFinancialSummary } from "./telegram-channel-analytics";

export type TelegramChannelAdAnalysisStatus =
  | "NEW"
  | "APPROVED"
  | "REJECTED"
  | "WATCH_LATER"
  | "BLACKLIST"
  | "TESTED";
export type TelegramChannelAdAnalysis = {
  id: string;
  workspaceId: string;
  telegramChannelId: string;
  assignedMemberId?: string | null;
  assignedMember?: WorkspaceMember | null;
  analyzedAt: string;
  status: TelegramChannelAdAnalysisStatus;
  verdict?: string | null;
  price?: number | string | null;
  currency: string;
  avgViews?: number | null;
  avgReactions?: number | null;
  avgForwards?: number | null;
  postsCount?: number | null;
  cpm?: number | string | null;
  reasonTags: string[];
  reasonSummary?: string | null;
  notes?: string | null;
  nextReviewAt?: string | null;
  createdAt: string;
  updatedAt: string;
  warning?: string | null;
};
export type TelegramChannelAdAnalysisPayload = {
  analyzedAt: string;
  status: "APPROVED" | "REJECTED";
  price?: number;
  currency?: string;
  notes?: string;
  postLimit?: number;
  assignedMemberId?: string | null;
};
export type TelegramChannelAdminLink = {
  id: string;
  telegramUserAccountIntegrationId: string;
  telegramUserAccountIntegration?: {
    id: string;
    username?: string;
    firstName?: string;
    lastName?: string;
    photoUrl?: string;
  };
};
export type TelegramChannelTimePost = {
  id: string;
  title: string;
  time: string;
  position?: number;
  iconId?: string | null;
  icon?: Icon | null;
};
export type TelegramChannel = EntityAssignment & {
  id: string;
  title: string;
  username?: string;
  telegramChatId?: string;
  telegramAccessHash?: string | null;
  accessMode?: TelegramChannelAccessMode;
  requiresJoinRequest?: boolean;
  lastEntityResolvedAt?: string | null;
  inviteLink?: string;
  description?: string;
  language?: string;
  niche?: string;
  currentSubscribersCount?: number;
  seedSubscribersCount?: number;
  activeSubscribersWindow?: number;
  knownFakeSubscribersCount?: number;
  ownViewsPerPost?: number;
  ownReactionsPerPost?: number;
  subscriberBaseQuality?: string | null;
  dataQualityNotes?: string | null;
  targetCpaFrom?: number | string | null;
  targetCpa?: number | string | null;
  acceptableCpaFrom?: number | string | null;
  acceptableCpa?: number | string | null;
  stopCpaFrom?: number | string | null;
  stopCpa?: number | string | null;
  acquisitionType?: "CREATED" | "PURCHASED";
  postsSyncFrom?: string | null;
  inviteLinksSyncFrom?: string | null;
  purchaseTransactionId?: string | null;
  purchaseTransaction?: {
    id: string;
    amount: number | string;
    currency: string;
    amountInPrimaryCurrency: number | string;
    date: string;
    description?: string | null;
    account?: {
      id: string;
      name: string;
    } | null;
  } | null;
  photoUrl?: string;
  sourceType?: string;
  lastPublicSyncedAt?: string;
  syncIncludePublicInfo?: boolean;
  syncIncludeInviteLinks?: boolean;
  syncIncludeHistoricalPosts?: boolean;
  syncIncludePostMetrics?: boolean;
  syncIncludeOlderPosts?: boolean;
  syncIncludeChannelStats?: boolean;
  syncIncludeManagedPosts?: boolean;
  syncIncludeAudienceSnapshot?: boolean;
  adminLinks?: TelegramChannelAdminLink[];
  timePosts?: TelegramChannelTimePost[];
  isActive: boolean;
  preview?: {
    audience: Pick<
      TelegramChannelAudience,
      | "subscribersCount"
      | "activeSubscribersEstimate"
      | "paidActiveSubscribersEstimate"
      | "viewRate"
      | "dataQuality"
      | "dataQualityReason"
      | "dataQualityWarning"
      | "rawViewRate"
      | "subscriberBaseQuality"
      | "hasExternalTrafficAnomaly"
      | "hasSubscriberBasePollution"
      | "postsWindow"
    >;
    financialSummary: TelegramChannelFinancialSummary;
    sourcesCount: number;
    canPostMessages?: boolean;
    adAnalysis?: {
      latest?: TelegramChannelAdAnalysis | null;
      historyCount: number;
      metrics?: {
        avgViews?: number | null;
        avgReactions?: number | null;
        avgForwards?: number | null;
        postsCount?: number | null;
        cpm?: number | string | null;
      };
    };
  };
};

export type TelegramSyncResult = SyncOperationResult & {
  publicInfo?: Record<string, unknown>;
  historical?: Record<string, unknown>;
  postsMetricsSync?: Record<string, unknown>;
  olderPostsBackfill?: Record<string, unknown>;
  channelStatsSync?: Record<string, unknown>;
  managedPostsSync?: Record<string, unknown> | null;
  audienceSnapshot?: Record<string, unknown> | null;
};

export type TelegramChannelSyncSelection = {
  syncIncludePublicInfo: boolean;
  syncIncludeInviteLinks: boolean;
  syncIncludeHistoricalPosts: boolean;
  syncIncludePostMetrics: boolean;
  syncIncludeOlderPosts: boolean;
  syncIncludeChannelStats: boolean;
  syncIncludeManagedPosts: boolean;
  syncIncludeAudienceSnapshot: boolean;
};

export type TelegramChannelSyncNowPayload = Partial<
  TelegramChannelSyncSelection
> & {
  telegramUserAccountId?: string;
  saveSelection?: boolean;
  postLimit?: number;
};

export type TelegramChannelImportPayload = {
  input?: string;
  username?: string;
  telegramAccountId?: string;
  acquisitionType?: "CREATED" | "PURCHASED";
  postsSyncFrom?: string | null;
  inviteLinksSyncFrom?: string | null;
  purchaseTransactionId?: string | null;
};

export type TelegramAccountChannelImportItem = {
  telegramChannelId: string;
  acquisitionType?: "CREATED" | "PURCHASED";
  postsSyncFrom?: string | null;
  inviteLinksSyncFrom?: string | null;
};

export type ApiErrorPayload = StructuredApiError;
