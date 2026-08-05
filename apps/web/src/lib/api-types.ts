import type {
  BulkActionResult,
  BulkActionResultItem,
  PaginatedResponse,
  PaginationMeta,
  StructuredApiError,
  SyncOperationResult,
  TelegramChannelAccessMode,
} from "@telegram-system/shared";

export type {
  BulkActionResult,
  BulkActionResultItem,
  PaginatedResponse,
  PaginationMeta,
  StructuredApiError,
  SyncOperationResult,
  TelegramChannelAccessMode,
};

export type WorkspaceRole = "owner" | "admin" | "MEDIA_BUYER" | "member";
export type PaginationParams = {
  page?: number;
  pageSize?: number;
};
export type CurrencyDisplayMode = "code" | "symbol";
export type IconType = "emoji" | "image";
export type Icon = {
  id: string;
  workspaceId?: string | null;
  type: IconType;
  name: string;
  emoji?: string | null;
  imageUrl?: string | null;
  createdByUserId?: string | null;
  createdAt?: string;
  updatedAt?: string;
};
export type WorkspaceInfo = {
  id: string;
  name: string;
  timezone?: string;
  role: WorkspaceRole;
  primaryCurrency?: Currency;
  secondaryCurrency?: Currency;
  currencyDisplayMode?: CurrencyDisplayMode;
  avatarIcon?: Icon | null;
};
export type User = {
  id: string;
  email: string;
  name: string;
  createdAt?: string;
};
export type AuthResponse = {
  accessToken: string;
  user: User;
  workspace: WorkspaceInfo;
};
export type MeResponse = { user: User; workspace: WorkspaceInfo };
export type AccountMe = {
  id: string;
  email: string;
  name: string;
  createdAt: string;
  avatarIconId?: string | null;
  avatarIcon?: Icon | null;
  telegramUsername?: string | null;
  assignedTelegramUserAccounts?: Array<{
    id: string;
    label: string;
    telegramUserId?: string | null;
    username?: string | null;
    firstName?: string | null;
    lastName?: string | null;
    photoUrl?: string | null;
    status:
      | "pending"
      | "needs_code"
      | "needs_password"
      | "connected"
      | "error"
      | "disabled";
  }>;
  workspace: WorkspaceInfo;
};
export type WorkspaceMember = {
  id: string;
  workspaceId: string;
  userId: string;
  role: WorkspaceRole;
  isHidden?: boolean;
  avatarIconId?: string | null;
  avatarIcon?: Icon | null;
  telegramUsername?: string | null;
  createdAt: string;
  user: User;
  isCurrentUser: boolean;
  assignedTelegramUserAccounts?: Array<{
    id: string;
    label: string;
    telegramUserId?: string | null;
    username?: string | null;
    firstName?: string | null;
    lastName?: string | null;
    photoUrl?: string | null;
    status:
      | "pending"
      | "needs_code"
      | "needs_password"
      | "connected"
      | "error"
      | "disabled";
  }>;
  investmentSummary?: {
    isInvestor: boolean;
    totalInvestedPrimary: number;
    investmentSharePercent: number;
    investmentsCount: number;
  };
  temporaryPassword?: string;
};
export type AssignedMember = WorkspaceMember;
export type EntityAssignment = {
  assignedMemberId?: string | null;
  assignedMember?: AssignedMember | null;
  createdByUserId?: string | null;
  createdByUser?: Pick<User, "id" | "email" | "name"> | null;
};
export type GlobalSearchResult = {
  id: string;
  type: string;
  label: string;
  title: string;
  subtitle?: string | null;
  href: string;
  iconUrl?: string | null;
  iconEmoji?: string | null;
};
export type Currency = string;
export type TransactionType = "income" | "expense";
export type AccountTransactionStats = {
  count: number;
  incomeCount: number;
  expenseCount: number;
  received: number;
  spent: number;
  transferredIn: number;
  transferredOut: number;
  delta: number;
};
export type Account = EntityAssignment & {
  id: string;
  name: string;
  currency: Currency;
  initialBalance: number;
  balance?: number;
  calculatedBalance?: number | null;
  convertedBalance?: number | null;
  convertedCurrency?: Currency;
  transactionStats?: AccountTransactionStats;
  isActive: boolean;
  iconId?: string | null;
  icon?: Icon | null;
};
export type TransactionCategory = {
  id: string;
  name: string;
  type: TransactionType;
  isSystem: boolean;
  key?: string | null;
  iconId?: string | null;
  icon?: Icon | null;
};
export type Transaction = EntityAssignment & {
  id: string;
  accountId: string;
  type: TransactionType;
  amount: number;
  currency: Currency;
  exchangeRateToPrimary: number;
  amountInPrimaryCurrency: number;
  category: string;
  categoryId?: string | null;
  memberId?: string | null;
  description?: string;
  date: string;
  iconId?: string | null;
  icon?: Icon | null;
  account?: Account;
  categoryRef?: TransactionCategory;
  member?: WorkspaceMember;
  adCampaign?: { id: string; title: string } | null;
  investment?: { id: string; notes?: string | null } | null;
  telegramChannel?: {
    id: string;
    title: string;
    username?: string | null;
    photoUrl?: string | null;
  } | null;
  purchasedTelegramChannel?: {
    id: string;
    title: string;
    username?: string | null;
    photoUrl?: string | null;
  } | null;
};
export type Transfer = EntityAssignment & {
  id: string;
  fromAccountId: string;
  toAccountId: string;
  fromAmount: number;
  toAmount: number;
  fromCurrency: Currency;
  toCurrency: Currency;
  exchangeRate?: number;
  transferLossAmount?: number;
  date: string;
  description?: string;
  fromAccount?: Account;
  toAccount?: Account;
};
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
export type TelegramPost = {
  id: string;
  telegramChannelId: string;
  telegramMessageId: string;
  primaryTelegramMessageUrl?: string | null;
  postDate: string;
  text?: string | null;
  formattedText?: string | null;
  hasMedia?: boolean;
  mediaKind?: string | null;
  viewsCount?: number | null;
  forwardsCount?: number | null;
  reactionsCount?: number | null;
  commentsCount?: number | null;
  manualOwnViews: number;
  manualOwnReactions: number;
  excludeFromAnalytics: boolean;
  reactions?: Array<{ reaction: string; count: number }> | null;
};
export type TelegramManagedPostStatus =
  | "DRAFT"
  | "SCHEDULED"
  | "PUBLISHING"
  | "PUBLISHED"
  | "FAILED";
export type TelegramManagedPostRemoteStatus =
  | "NONE"
  | "SCHEDULED"
  | "PUBLISHED"
  | "BROKEN"
  | "MISSING"
  | "UNKNOWN";
export type TelegramManagedPost = {
  id: string;
  workspaceId: string;
  telegramChannelId: string;
  origin: "SYSTEM" | "TELEGRAM";
  assignedMemberId: string;
  assignedMember: WorkspaceMember;
  icon?: string | null;
  iconData?: Icon | null;
  groupId?: string | null;
  groupPosition?: number | null;
  sidebarPosition?: number | null;
  group?: PostGroup | null;
  title: string;
  text?: string | null;
  imageUrls: string[];
  status: TelegramManagedPostStatus;
  scheduledAt?: string | null;
  publishedAt?: string | null;
  telegramMessageIds: string[];
  telegramMessageUrls: string[];
  telegramRemoteStatus: TelegramManagedPostRemoteStatus;
  lastTelegramSyncedAt?: string | null;
  lastTelegramSyncNote?: string | null;
  sourceWasPremium?: boolean | null;
  captionLengthMaxUsed?: number | null;
  messageLengthMaxUsed?: number | null;
  publishMode?: string | null;
  lastError?: string | null;
  createdAt: string;
  updatedAt: string;
};
export type TelegramManagedPostRevision = {
  id: string;
  telegramManagedPostId: string;
  workspaceId: string;
  telegramChannelId: string;
  title: string;
  text?: string | null;
  imageUrls: string[];
  status: TelegramManagedPostStatus;
  scheduledAt?: string | null;
  publishedAt?: string | null;
  telegramMessageIds: string[];
  telegramMessageUrls: string[];
  telegramRemoteStatus: TelegramManagedPostRemoteStatus;
  lastTelegramSyncedAt?: string | null;
  lastTelegramSyncNote?: string | null;
  sourceWasPremium?: boolean | null;
  captionLengthMaxUsed?: number | null;
  messageLengthMaxUsed?: number | null;
  publishMode?: string | null;
  lastError?: string | null;
  assignedMemberId: string;
  icon?: string | null;
  iconData?: Icon | null;
  groupId?: string | null;
  groupPosition?: number | null;
  sidebarPosition?: number | null;
  reason: string;
  createdAt: string;
};
export type TelegramManagedPostLinkTarget = {
  id: string;
  title: string;
  icon?: string | null;
  iconData?: Icon | null;
  status: TelegramManagedPostStatus;
  telegramRemoteStatus: TelegramManagedPostRemoteStatus;
  groupId?: string | null;
  groupTitle?: string | null;
  telegramChannelId: string;
  telegramChannelTitle: string;
  publishedAt?: string | null;
  primaryTelegramMessageUrl?: string | null;
};
export type PromptNote = {
  id: string;
  workspaceId: string;
  title: string;
  content: string;
  emoji?: string | null;
  iconId?: string | null;
  icon?: Icon | null;
  assignedMemberId?: string | null;
  telegramChannelId?: string | null;
  telegramChannelIds: string[];
  postGroupId?: string | null;
  assignedMember?: WorkspaceMember | null;
  telegramChannel?: TelegramChannel | null;
  postGroup?: PostGroup | null;
  createdAt: string;
  updatedAt: string;
};
export type PostGroupStatusSummary = {
  totalPosts: number;
  draftCount: number;
  scheduledCount: number;
  publishedCount: number;
  failedCount: number;
  computedStatus:
    | "EMPTY"
    | "HAS_ERRORS"
    | "ALL_DRAFT"
    | "ALL_SCHEDULED"
    | "ALL_PUBLISHED"
    | "MIXED";
};
export type PostGroup = {
  id: string;
  workspaceId: string;
  telegramChannelId: string;
  title: string;
  description?: string | null;
  icon?: string | null;
  iconData?: Icon | null;
  isSystem?: boolean;
  systemKey?: string | null;
  createdByMemberId: string;
  sidebarPosition?: number | null;
  createdByMember: WorkspaceMember;
  telegramChannel?: TelegramChannel;
  posts?: TelegramManagedPost[];
  postsCount?: number;
  statusSummary: PostGroupStatusSummary;
  createdAt: string;
  updatedAt: string;
};
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
export type TelegramChannelNetworkKpiStatus =
  | "good"
  | "acceptable"
  | "bad"
  | "unknown";
export type TelegramChannelNetworkSummary = {
  channelsCount: number;
  totalSubscribers: number;
  activeSubscribersEstimate: number;
  paidActiveSubscribersEstimate: number;
  viewRate: number | null;
  totalAdSpend: number;
  campaignsCount: number;
  totalJoinedSubscribers: number;
  totalPendingSubscribers?: number;
  totalAttributedSubscribers?: number;
  avgCpa: number | null;
  activeCpa: number | null;
  kpiStatus: TelegramChannelNetworkKpiStatus;
  kpiLabel: string;
};
export type TelegramChannelNetworkMember = {
  id: string;
  title: string;
  name?: string;
  username?: string | null;
  photoUrl?: string | null;
  accessMode?: TelegramChannelAccessMode;
  subscribersCount?: number | null;
  currentSubscribersCount?: number | null;
  activeSubscribersEstimate?: number | null;
};
export type TelegramChannelNetworkChannelSummary = {
  channelId: string;
  id: string;
  title: string;
  name?: string;
  username?: string | null;
  photoUrl?: string | null;
  subscribersCount?: number | null;
  currentSubscribersCount?: number | null;
  activeSubscribersEstimate?: number | null;
  paidActiveSubscribersEstimate?: number | null;
  viewRate?: number | null;
  totalAdSpend: number;
  campaignsCount: number;
  totalJoinedSubscribers: number;
  totalPendingSubscribers?: number;
  totalAttributedSubscribers?: number;
  avgCpa: number | null;
  activeCpa: number | null;
  kpiStatus: TelegramChannelNetworkKpiStatus;
  kpiLabel?: string;
};
export type TelegramChannelNetwork = {
  id: string;
  name: string;
  description?: string | null;
  createdAt: string;
  updatedAt: string;
  channels: TelegramChannelNetworkMember[];
  summary: TelegramChannelNetworkSummary;
};
export type TelegramChannelNetworkDetail = TelegramChannelNetwork & {
  channelSummaries: TelegramChannelNetworkChannelSummary[];
};
export type CreateTelegramChannelNetworkPayload = {
  name: string;
  description?: string | null;
  telegramChannelIds: string[];
};
export type UpdateTelegramChannelNetworkPayload = {
  name?: string;
  description?: string | null;
  telegramChannelIds?: string[];
};
export type TelegramPostAnalyticsItem = {
  id: string;
  telegramMessageId: string;
  postDate: string;
  text?: string | null;
  viewsCount?: number | null;
  forwardsCount?: number | null;
  reactionsCount?: number | null;
  commentsCount?: number | null;
  manualOwnViews?: number;
  manualOwnReactions?: number;
  excludeFromAnalytics?: boolean;
  reactions?: Array<{ reaction: string; count: number }> | null;
  reactionRateByViews?: number | null;
  commentsRateByViews?: number | null;
  reactionRateBySubscribers?: number | null;
  commentsRateBySubscribers?: number | null;
  viewsRateBySubscribers?: number | null;
  primaryTelegramMessageUrl?: string | null;
};
export type TelegramUserAccount = {
  id: string;
  label: string;
  apiId: string;
  phoneMasked?: string;
  telegramUserId?: string;
  username?: string;
  firstName?: string;
  lastName?: string;
  photoUrl?: string;
  nameColor?: number;
  isPremium: boolean;
  premiumCheckedAt?: string | null;
  captionLengthMax: number;
  messageLengthMax: number;
  premiumCapabilities?: {
    maxUploadFileSizeMb: number;
    supportsCustomEmoji: boolean;
    limitsSource: "telegram_config" | "fallback";
  } | null;
  status:
    | "pending"
    | "needs_code"
    | "needs_password"
    | "connected"
    | "error"
    | "disabled";
  lastErrorMessage?: string;
  lastCheckedAt?: string;
  lastSyncedAt?: string;
  isActive: boolean;
  assignedMember?: WorkspaceMember | null;
};
export type TelegramBot = {
  id: string;
  label: string;
  botTokenMasked: string;
  botId?: string;
  username?: string;
  firstName?: string;
  lastErrorMessage?: string;
  lastCheckedAt?: string;
  isActive: boolean;
};
export type TelegramSourceType = "BOT" | "MTPROTO";
export type TelegramChannelSourceRole =
  | "OWNER"
  | "ADMIN"
  | "MEMBER"
  | "UNKNOWN";
export type TelegramChannelDataType =
  | "CHANNEL_INFO"
  | "POSTS"
  | "INVITE_LINKS"
  | "STATS"
  | "MEMBERS"
  | "REACTIONS"
  | "VIEWS"
  | "OTHER";
export type TelegramSourcePermissions = {
  canPostMessages: boolean;
  canEditMessages: boolean;
  canDeleteMessages: boolean;
  canInviteUsers: boolean;
  canManageInviteLinks: boolean;
  canViewStats: boolean;
};
export type TelegramSourceChannelAccess = {
  channelId: string;
  telegramChannelId?: string | null;
  title: string;
  username?: string | null;
  avatarUrl?: string | null;
  currentSubscribersCount?: number | null;
  sourceType: TelegramSourceType;
  role: TelegramChannelSourceRole;
  permissions: TelegramSourcePermissions;
  rawPermissions?: unknown;
  lastCheckedAt?: string | null;
  isPremium?: boolean;
  captionLengthMax?: number;
  messageLengthMax?: number;
  premiumCheckedAt?: string | null;
  canBeUsedForAnalytics: boolean;
};
export type TelegramSyncedDialogChannel = {
  channelId: string;
  workspaceChannelId?: string;
  telegramChannelId?: string | null;
  title: string;
  username?: string | null;
  role: TelegramChannelSourceRole;
  permissions: TelegramSourcePermissions;
  canBeUsedForAnalytics: boolean;
};
export type TelegramUserAccountSyncDialogsResponse = {
  success: boolean;
  message?: string;
  channels?: unknown[];
  matchedChannels?: number;
  syncedChannels?: TelegramSyncedDialogChannel[];
  availableChannels?: TelegramSyncedDialogChannel[];
};
export type TelegramChannelSourceAccess = {
  sourceId: string;
  sourceType: TelegramSourceType;
  displayName: string;
  avatarUrl?: string | null;
  isPremium?: boolean;
  captionLengthMax?: number;
  messageLengthMax?: number;
  premiumCheckedAt?: string | null;
  role: TelegramChannelSourceRole;
  permissions: TelegramSourcePermissions;
  rawPermissions?: unknown;
  lastCheckedAt?: string | null;
  canBeUsedForAnalytics: boolean;
};
export type TelegramAnalyticsSources = {
  channel: {
    id: string;
    telegramChatId?: string | null;
    title: string;
    username?: string | null;
  } | null;
  sources: Array<
    TelegramChannelSourceAccess & { usedFor: TelegramChannelDataType[] }
  >;
  dataAttribution: Array<{
    dataType: TelegramChannelDataType;
    label: string;
    status: "SUCCESS" | "PARTIAL" | "FAILED" | "SKIPPED";
    sources: Array<{
      sourceId: string;
      sourceType: TelegramSourceType;
      displayName?: string | null;
    }>;
    syncedAt?: string | null;
    errorMessage?: string | null;
  }>;
};
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
  creatorMember?: Pick<
    WorkspaceMember,
    "id" | "role" | "telegramUsername" | "avatarIcon"
  > & {
    user: Pick<User, "id" | "name">;
  } | null;
  adCampaign?: AdCampaign;
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
export type Promo = {
  id: string;
  telegramChannelId: string;
  iconId?: string | null;
  icon?: Icon | null;
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
export type DashboardSummary = {
  period: { dateFrom: string; dateTo: string };
  totalBalancePrimary: number;
  totalBalanceSecondary: number;
  primaryCurrency?: Currency;
  secondaryCurrency?: Currency;
  incomeForPeriod: number;
  expensesForPeriod: number;
  profitForPeriod: number;
  investedCapital: number;
  investedCapitalForPeriod: number;
  operatingProfitAllTime: number;
  remainingToBreakEven: number;
  projectedMonthlyProfit: number;
  projectedPaybackMonths: number | null;
  revenueTransactionsCount: number;
  channelsWithRevenueCount: number;
  adSpendForPeriod: number;
  totalJoinedFromAds: number;
  averageCPA: number | null;
  campaignsCount: number;
  periodCampaignsCount: number;
  telegramChannelsCount: number;
  ownChannelsCount: number;
  externalChannelsCount: number;
  workspaceMembersCount: number;
  totalSubscribers: number;
  activeSubscribersEstimate: number;
  anomalousChannelsCount: number;
  dailyTrend: Array<{
    date: string;
    income: number;
    expenses: number;
    profit: number;
    investments: number;
    cumulativeProfitAfterInvestments: number;
    adSpend: number;
    joined: number;
  }>;
  categoryBreakdown: Array<{
    id?: string | null;
    name: string;
    type: TransactionType;
    amount: number;
    count: number;
    iconId?: string | null;
    icon?: Icon | null;
  }>;
  accountBalances: Array<{
    id: string;
    name: string;
    currency: Currency;
    iconId?: string | null;
    icon?: Icon | null;
    balance: number;
    primary: number;
    secondary: number;
  }>;
  channelPerformance: Array<{
    id: string;
    title: string;
    username?: string | null;
    photoUrl?: string | null;
    revenue: number;
    allTimeRevenue: number;
    spend: number;
    acquisitionCost: number;
    net: number;
    remainingToBreakEven: number;
    projectedPaybackMonths: number | null;
    joined: number;
    campaigns: number;
    cpa: number | null;
  }>;
  topOwnChannels: Array<{
    id: string;
    title: string;
    username?: string | null;
    photoUrl?: string | null;
    subscribers: number;
    activeSubscribers: number;
    viewRate?: number | null;
    dataQuality?: string | null;
  }>;
  campaignStatusCounts: Record<string, number>;
  adQualityCounts: Record<string, number>;
  hypothesisStatusCounts: Record<string, number>;
  bestCampaigns: AdCampaign[];
  worstCampaigns: AdCampaign[];
};

