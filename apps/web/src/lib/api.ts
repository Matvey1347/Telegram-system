import axios from 'axios';
import { clearAccessToken, getAccessToken } from './auth';

function resolveApiBaseUrl() {
  const raw = process.env.NEXT_PUBLIC_API_URL?.trim();

  if (!raw && process.env.NODE_ENV === 'production') {
    throw new Error('NEXT_PUBLIC_API_URL is not defined');
  }

  const base = raw || 'http://localhost:4000/api';

  return base.endsWith('/api') ? base : `${base.replace(/\/+$/, '')}/api`;
}

export const api = axios.create({ baseURL: resolveApiBaseUrl(), withCredentials: true });

export function isApiNetworkError(error: unknown) {
  return (
    axios.isAxiosError(error) &&
    !error.response &&
    (error.code === 'ERR_NETWORK' ||
      error.code === 'ERR_FAILED' ||
      error.code == null)
  );
}

api.interceptors.request.use((config) => {
  const token = getAccessToken();
  if (token) config.headers.Authorization = `Bearer ${token}`;
  if (typeof window !== 'undefined') {
    const workspaceId = localStorage.getItem('selected-workspace-id');
    if (workspaceId) config.headers['X-Workspace-Id'] = workspaceId;
  }
  if (config.baseURL?.includes('.ngrok-free.app')) {
    config.headers['ngrok-skip-browser-warning'] = 'true';
  }
  return config;
});

api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (
      axios.isAxiosError(error) &&
      error.response?.status === 401 &&
      typeof window !== 'undefined'
    ) {
      clearAccessToken();
      if (!['/login', '/register'].includes(window.location.pathname)) window.location.href = '/login';
    }
    return Promise.reject(error);
  },
);

export type WorkspaceRole = 'owner' | 'admin' | 'member';
export type CurrencyDisplayMode = 'code' | 'symbol';
export type IconType = 'emoji' | 'image';
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
export type WorkspaceInfo = { id: string; name: string; role: WorkspaceRole; primaryCurrency?: Currency; secondaryCurrency?: Currency; currencyDisplayMode?: CurrencyDisplayMode; avatarIcon?: Icon | null };
export type User = { id: string; email: string; name: string; createdAt?: string };
export type AuthResponse = { accessToken: string; user: User; workspace: WorkspaceInfo };
export type MeResponse = { user: User; workspace: WorkspaceInfo };
export type AccountMe = { id: string; email: string; name: string; createdAt: string; workspace: WorkspaceInfo };
export type WorkspaceMember = {
  id: string;
  role: WorkspaceRole;
  createdAt: string;
  user: User;
  isCurrentUser: boolean;
  investmentSummary?: {
    isInvestor: boolean;
    totalInvestedPrimary: number;
    investmentSharePercent: number;
    investmentsCount: number;
  };
  temporaryPassword?: string;
};
export type Currency = string;
export type TransactionType = 'income' | 'expense';
export type Account = { id: string; name: string; currency: Currency; initialBalance: number; balance?: number; calculatedBalance?: number; convertedBalance?: number | null; convertedCurrency?: Currency; isActive: boolean; iconId?: string | null; icon?: Icon | null };
export type TransactionCategory = { id: string; name: string; type: TransactionType; isSystem: boolean; key?: string | null; iconId?: string | null; icon?: Icon | null };
export type Transaction = { id: string; accountId: string; type: TransactionType; amount: number; currency: Currency; exchangeRateToPrimary: number; amountInPrimaryCurrency: number; category: string; categoryId?: string | null; memberId?: string | null; description?: string; date: string; iconId?: string | null; icon?: Icon | null; account?: Account; categoryRef?: TransactionCategory; member?: WorkspaceMember; adCampaign?: { id: string; title: string } | null; investment?: { id: string; notes?: string | null } | null };
export type Transfer = { id: string; fromAccountId: string; toAccountId: string; fromAmount: number; toAmount: number; fromCurrency: Currency; toCurrency: Currency; exchangeRate?: number; transferLossAmount?: number; date: string; description?: string; fromAccount?: Account; toAccount?: Account };
export type TelegramChannelAdminLink = { id: string; telegramUserAccountIntegrationId: string; telegramUserAccountIntegration?: { id: string; username?: string; firstName?: string; lastName?: string; photoUrl?: string } };
export type TelegramChannel = { id: string; title: string; username?: string; telegramChatId?: string; inviteLink?: string; description?: string; language?: string; niche?: string; currentSubscribersCount?: number; seedSubscribersCount?: number; activeSubscribersWindow?: number; knownFakeSubscribersCount?: number; ownViewsPerPost?: number; ownReactionsPerPost?: number; subscriberBaseQuality?: string | null; dataQualityNotes?: string | null; targetCpa?: number | string | null; acceptableCpa?: number | string | null; stopCpa?: number | string | null; kpiCurrency?: string | null; photoUrl?: string; sourceType?: string; lastPublicSyncedAt?: string; adminLinks?: TelegramChannelAdminLink[]; isActive: boolean };
export type TelegramPost = {
  id: string;
  telegramChannelId: string;
  telegramMessageId: string;
  postDate: string;
  text?: string | null;
  viewsCount?: number | null;
  forwardsCount?: number | null;
  reactionsCount?: number | null;
  commentsCount?: number | null;
  manualOwnViews: number;
  manualOwnReactions: number;
  excludeFromAnalytics: boolean;
  reactions?: Array<{ reaction: string; count: number }> | null;
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
  totalAdSpend: number;
  campaignsCount: number;
  totalJoinedSubscribers: number;
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
  kpiStatus: 'good' | 'acceptable' | 'bad' | 'unknown';
  kpiLabel: string;
  kpiCurrency?: string | null;
};
export type TelegramChannelNetworkKpiStatus = 'good' | 'acceptable' | 'bad' | 'unknown';
export type TelegramChannelNetworkSummary = {
  channelsCount: number;
  totalSubscribers: number;
  activeSubscribersEstimate: number;
  paidActiveSubscribersEstimate: number;
  viewRate: number | null;
  totalAdSpend: number;
  campaignsCount: number;
  totalJoinedSubscribers: number;
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
};
export type TelegramUserAccount = { id: string; label: string; apiId: string; phoneMasked?: string; telegramUserId?: string; username?: string; firstName?: string; lastName?: string; photoUrl?: string; nameColor?: number; status: 'pending' | 'needs_code' | 'needs_password' | 'connected' | 'error' | 'disabled'; lastErrorMessage?: string; lastCheckedAt?: string; lastSyncedAt?: string; isActive: boolean };
export type TelegramBot = { id: string; label: string; botTokenMasked: string; botId?: string; username?: string; firstName?: string; lastErrorMessage?: string; lastCheckedAt?: string; isActive: boolean };
export type TelegramSourceType = 'BOT' | 'MTPROTO';
export type TelegramChannelSourceRole = 'OWNER' | 'ADMIN' | 'MEMBER' | 'UNKNOWN';
export type TelegramChannelDataType = 'CHANNEL_INFO' | 'POSTS' | 'INVITE_LINKS' | 'STATS' | 'MEMBERS' | 'REACTIONS' | 'VIEWS' | 'OTHER';
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
  role: TelegramChannelSourceRole;
  permissions: TelegramSourcePermissions;
  rawPermissions?: unknown;
  lastCheckedAt?: string | null;
  canBeUsedForAnalytics: boolean;
};
export type TelegramAnalyticsSources = {
  channel: { id: string; telegramChatId?: string | null; title: string; username?: string | null } | null;
  sources: Array<TelegramChannelSourceAccess & { usedFor: TelegramChannelDataType[] }>;
  dataAttribution: Array<{
    dataType: TelegramChannelDataType;
    label: string;
    status: 'SUCCESS' | 'PARTIAL' | 'FAILED' | 'SKIPPED';
    sources: Array<{ sourceId: string; sourceType: TelegramSourceType; displayName?: string | null }>;
    syncedAt?: string | null;
    errorMessage?: string | null;
  }>;
};
export type TelegramInviteLink = { id: string; telegramChannelId: string; adCampaignId?: string; name: string; url: string; joinedCount: number; isRevoked: boolean; expireDate?: string; memberLimit?: number; createsJoinRequest?: boolean; adCampaign?: AdCampaign };
export type Promo = { id: string; telegramChannelId: string; title: string; text?: string; imageData?: string; status: 'draft' | 'active' | 'archived'; telegramChannel?: TelegramChannel };
export type AdvertisingChannel = { id: string; selectionId?: string; kind?: 'person' | 'legacy_channel'; title: string; telegramUrl?: string; username?: string; contactInfo?: string; notes?: string; imageUrl?: string; subscribersCount?: number; channelTags?: string[]; createdAt?: string; updatedAt?: string };
export type ImportedTelegramSource = TelegramChannel | AdvertisingChannel;
export type AdCampaignHypothesisLink = { id: string; hypothesis: { id: string; name: string; status: AdHypothesisStatus } };
export type AdCampaignKpiStatus = 'good' | 'acceptable' | 'bad' | 'unknown';
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
export type AdCampaign = AdCampaignAnalyticsFields & { id: string; title: string; telegramChannelId: string; ownTelegramChannelId?: string; promoId: string; telegramInviteLinkId?: string; accountId?: string; telegramChannel?: TelegramChannel; advertisingChannels: Array<TelegramChannel | AdvertisingChannel>; price: number; costAmount?: number; exchangeRateToPrimary: number; priceInPrimaryCurrency: number; currency: Currency; placementDate?: string; startedAt?: string; endedAt?: string; joinedCount: number; leftCount?: number; netGrowthCount?: number; sourcePostViews?: number | null; sourcePostUrl?: string | null; notes?: string; isMixedAttribution?: boolean; hypothesisLinks?: AdCampaignHypothesisLink[]; analytics?: { joinedCount: number; leftCount: number; netGrowth: number; costPerJoinedSubscriber?: number | null; costPerNetSubscriber?: number | null } };
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
export type AdHypothesisStatus = 'testing' | 'winner' | 'loser' | 'paused' | 'archived';
export type AdHypothesisKpiStatus = 'good' | 'acceptable' | 'bad' | 'unknown';
export type AdHypothesisCampaignSummary = {
  id: string;
  campaignId: string;
  title: string;
  status: string;
  currency: Currency;
  spend: number;
  joinedSubscribers: number;
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
  targetChannel?: { id: string; title: string; username?: string | null; photoUrl?: string | null } | null;
  source?: string | null;
  sourcePostUrl?: string | null;
  kpiStatus: AdHypothesisKpiStatus;
};
export type AdHypothesisSummary = {
  campaignsCount: number;
  totalSpend: number;
  totalJoinedSubscribers: number;
  avgCpa?: number | null;
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
export type AdHypothesis = { id: string; name: string; description?: string | null; status: AdHypothesisStatus; conclusion?: string | null; createdAt: string; updatedAt: string; campaignsCount: number; summary: AdHypothesisSummary };
export type AdHypothesisCampaign = { id: string; adCampaignId: string; adCampaign: AdCampaign };
export type AdHypothesisDetail = AdHypothesis & { campaigns: AdCampaign[]; campaignSummaries: AdHypothesisCampaignSummary[] };
export type CreateAdHypothesisPayload = { name: string; description?: string | null; status?: AdHypothesisStatus; conclusion?: string | null; adCampaignIds: string[] };
export type UpdateAdHypothesisPayload = { name?: string; description?: string | null; status?: AdHypothesisStatus; conclusion?: string | null; adCampaignIds?: string[] };
export type DashboardSummary = {
  totalBalancePrimary: number;
  totalBalanceSecondary: number;
  primaryCurrency?: Currency;
  secondaryCurrency?: Currency;
  incomeForPeriod: number;
  expensesForPeriod: number;
  profitForPeriod: number;
  adSpendForPeriod: number;
  totalJoinedFromAds: number;
  averageCPA: number | null;
  bestCampaigns: AdCampaign[];
  worstCampaigns: AdCampaign[];
};

export const authApi = {
  login: async (email: string, password: string) => (await api.post<AuthResponse>('/auth/login', { email, password })).data,
  register: async (payload: { email: string; password: string; name: string; workspaceName?: string }) => (await api.post<AuthResponse>('/auth/register', payload)).data,
  me: async () => (await api.get<MeResponse>('/auth/me')).data,
};

export const accountApi = {
  me: async () => (await api.get<AccountMe>('/account/me')).data,
  updateMe: async (payload: { name?: string; email?: string }) => (await api.patch<AccountMe>('/account/me', payload)).data,
  updatePassword: async (payload: { currentPassword: string; newPassword: string }) => (await api.patch<{ success: boolean }>('/account/password', payload)).data,
  updateWorkspace: async (payload: { name: string; avatarIconId?: string | null }) => (await api.patch<AccountMe>('/account/workspace', payload)).data,
};

export const workspacesApi = {
  list: async () => (await api.get<WorkspaceInfo[]>('/workspaces')).data,
  selected: async () => (await api.get<WorkspaceInfo>('/workspaces/selected')).data,
  create: async (payload: { name: string; avatarIconId?: string | null }) => (await api.post<WorkspaceInfo>('/workspaces', payload)).data,
  update: async (id: string, payload: { name?: string; avatarIconId?: string | null }) => (await api.patch<WorkspaceInfo>(`/workspaces/${id}`, payload)).data,
  remove: async (id: string) => (await api.delete<{ success: boolean }>(`/workspaces/${id}`)).data,
};

export const iconsApi = {
  list: async (search?: string) => (await api.get<Icon[]>('/icons', { params: search ? { search } : undefined })).data,
  get: async (id: string) => (await api.get<Icon>(`/icons/${id}`)).data,
  upload: async (file: File) => {
    const formData = new FormData();
    formData.append('file', file);
    return (await api.post<{ imageUrl: string }>('/icons/upload', formData, { headers: { 'Content-Type': 'multipart/form-data' } })).data;
  },
  createCustom: async (payload: { name: string; imageUrl: string }) => (await api.post<Icon>('/icons/custom', payload)).data,
  createEmoji: async (payload: { name: string; emoji: string }) => (await api.post<Icon>('/icons/emoji', payload)).data,
  remove: async (id: string) => (await api.delete<{ success: boolean }>(`/icons/${id}`)).data,
};

const crud = <T>(path: string) => ({
  list: async () => (await api.get<T[]>(path)).data,
  get: async (id: string) => (await api.get<T>(`${path}/${id}`)).data,
  create: async (payload: Record<string, unknown>) => (await api.post<T>(path, payload)).data,
  update: async (id: string, payload: Record<string, unknown>) => (await api.patch<T>(`${path}/${id}`, payload)).data,
  remove: async (id: string) => (await api.delete<T>(`${path}/${id}`)).data,
});

export const workspaceMembersApi = {
  ...crud<WorkspaceMember>('/workspace-members'),
  investments: async (memberId: string) => (await api.get<Transaction[]>(`/workspace-members/${memberId}/investments`)).data,
  investmentsSummary: async () => (await api.get('/workspace-members/investments/summary')).data,
};
export const accountsApi = crud<Account>('/accounts');
export type TransactionQuery = {
  dateFrom?: string;
  dateTo?: string;
  categoryId?: string;
  type?: TransactionType | 'all';
  accountId?: string;
  sort?: 'date_desc' | 'date_asc';
  search?: string;
};
export const transactionsApi = {
  ...crud<Transaction>('/transactions'),
  list: async (params?: TransactionQuery) => (await api.get<Transaction[]>('/transactions', { params })).data,
};
export const transactionCategoriesApi = {
  list: async (type: TransactionType) => (await api.get<TransactionCategory[]>('/finance/categories', { params: { type } })).data,
  create: async (payload: { name: string; type: TransactionType; iconId?: string | null }) => (await api.post<TransactionCategory>('/finance/categories', payload)).data,
  update: async (id: string, payload: { name?: string; iconId?: string | null }) => (await api.patch<TransactionCategory>(`/finance/categories/${id}`, payload)).data,
  remove: async (id: string) => (await api.delete(`/finance/categories/${id}`)).data,
};
export type TransferQuery = {
  dateFrom?: string;
  dateTo?: string;
  accountId?: string;
  sort?: 'date_desc' | 'date_asc';
};
export const transfersApi = {
  ...crud<Transfer>('/transfers'),
  list: async (params?: TransferQuery) => (await api.get<Transfer[]>('/transfers', { params })).data,
};
export const telegramChannelsApi = {
  ...crud<TelegramChannel>('/telegram-channels'),
  import: async (input: string) => (await api.post<ImportedTelegramSource>('/telegram-channels/import', { input })).data,
  sources: async (id: string) => (await api.get<TelegramChannelSourceAccess[]>(`/telegram-channels/${id}/sources`)).data,
  analyticsSources: async (id: string) => (await api.get<TelegramAnalyticsSources>(`/telegram-channels/${id}/analytics-sources`)).data,
  audience: async (id: string) => (await api.get<TelegramChannelAudience>(`/telegram-channels/${id}/audience`)).data,
  createAudienceSnapshot: async (id: string) => (await api.post<TelegramChannelAudienceSnapshot>(`/telegram-channels/${id}/audience-snapshot`)).data,
  audienceSnapshots: async (id: string, limit?: number) => (await api.get<TelegramChannelAudienceSnapshot[]>(`/telegram-channels/${id}/audience-snapshots`, { params: limit ? { limit } : undefined })).data,
  financialSummary: async (id: string) => (await api.get<TelegramChannelFinancialSummary>(`/telegram-channels/${id}/financial-summary`)).data,
  updatePostManualMetrics: async (channelId: string, postId: string, payload: { manualOwnViews?: number; manualOwnReactions?: number; excludeFromAnalytics?: boolean }) => (await api.patch<TelegramPost>(`/telegram-channels/${channelId}/posts/${postId}/manual-metrics`, payload)).data,
};
export const telegramChannelNetworksApi = {
  list: async () => (await api.get<TelegramChannelNetwork[]>('/telegram-channel-networks')).data,
  get: async (id: string) => (await api.get<TelegramChannelNetworkDetail>(`/telegram-channel-networks/${id}`)).data,
  create: async (payload: CreateTelegramChannelNetworkPayload) => (await api.post<TelegramChannelNetworkDetail>('/telegram-channel-networks', payload)).data,
  update: async (id: string, payload: UpdateTelegramChannelNetworkPayload) => (await api.patch<TelegramChannelNetworkDetail>(`/telegram-channel-networks/${id}`, payload)).data,
  remove: async (id: string) => (await api.delete<{ success: boolean }>(`/telegram-channel-networks/${id}`)).data,
  summary: async (id: string) => (await api.get<TelegramChannelNetworkSummary>(`/telegram-channel-networks/${id}/summary`)).data,
};
export const telegramUserAccountsApi = {
  ...crud<TelegramUserAccount>('/telegram-user-accounts'),
  startLogin: async (id: string, phone?: string) => (await api.post(`/telegram-user-accounts/${id}/login/start`, { phone })).data,
  confirmCode: async (id: string, code: string) => (await api.post(`/telegram-user-accounts/${id}/login/code`, { code })).data,
  confirmPassword: async (id: string, password: string) => (await api.post(`/telegram-user-accounts/${id}/login/password`, { password })).data,
  check: async (id: string) => (await api.post(`/telegram-user-accounts/${id}/check`)).data,
  syncDialogs: async (id: string) => (await api.post<TelegramUserAccountSyncDialogsResponse>(`/telegram-user-accounts/${id}/sync-dialogs`)).data,
  importChannels: async (id: string, channelIds: string[]) => (await api.post<TelegramUserAccountSyncDialogsResponse>(`/telegram-user-accounts/${id}/channels/import`, { channelIds })).data,
  channels: async (id: string) => (await api.get<TelegramSourceChannelAccess[]>(`/telegram-user-accounts/${id}/channels`)).data,
};
export const telegramBotsApi = {
  ...crud<TelegramBot>('/telegram-bots'),
  check: async (id: string) => (await api.post<TelegramBot>(`/telegram-bots/${id}/check`)).data,
  channels: async (id: string) => (await api.get<TelegramSourceChannelAccess[]>(`/telegram-bots/${id}/channels`)).data,
};
export const promosApi = {
  ...crud<Promo>('/promos'),
  list: async (params?: { telegramChannelId?: string }) => (await api.get<Promo[]>('/promos', { params })).data,
  uploadImage: async (file: File) => {
    const formData = new FormData();
    formData.append('file', file);
    return (
      await api.post<{ imageUrl: string }>('/promos/upload-image', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      })
    ).data;
  },
};
export const advertisingChannelsApi = crud<AdvertisingChannel>('/advertising-channels');
export const adCampaignsApi = {
  ...crud<AdCampaign>('/ad-campaigns'),
  list: async (params?: { telegramChannelId?: string }) => (await api.get<AdCampaign[]>('/ad-campaigns', { params })).data,
  updateAnalyticsInput: async (id: string, payload: AdCampaignAnalyticsInput) => (await api.patch<AdCampaign>(`/ad-campaigns/${id}/analytics-input`, payload)).data,
  recalculateAnalytics: async (id: string) => (await api.post<AdCampaign>(`/ad-campaigns/${id}/recalculate-analytics`)).data,
  analyticsSummary: async (id: string) => (await api.get<AdCampaignAnalyticsSummary>(`/ad-campaigns/${id}/analytics-summary`)).data,
  performanceSummary: async (params?: { channelId?: string; hypothesisId?: string; dateFrom?: string; dateTo?: string }) => (await api.get<AdCampaignPerformanceSummary>('/ad-campaigns/performance-summary', { params })).data,
};
export const telegramSyncApi = {
  runDailyAnalytics: async () => (await api.post<DailyAnalyticsSyncRun>('/telegram-sync/daily-analytics/run')).data,
  lastDailyAnalyticsRun: async () => (await api.get<DailyAnalyticsSyncRun | null>('/telegram-sync/daily-analytics/last-run')).data,
  dailyAnalyticsRuns: async (limit = 20) => (await api.get<DailyAnalyticsSyncRun[]>('/telegram-sync/daily-analytics/runs', { params: { limit } })).data,
};
export const adHypothesesApi = {
  list: async () => (await api.get<AdHypothesis[]>('/ad-hypotheses')).data,
  get: async (id: string) => (await api.get<AdHypothesisDetail>(`/ad-hypotheses/${id}`)).data,
  create: async (payload: CreateAdHypothesisPayload) => (await api.post<AdHypothesisDetail>('/ad-hypotheses', payload)).data,
  update: async (id: string, payload: UpdateAdHypothesisPayload) => (await api.patch<AdHypothesisDetail>(`/ad-hypotheses/${id}`, payload)).data,
  remove: async (id: string) => (await api.delete<{ success: boolean }>(`/ad-hypotheses/${id}`)).data,
  summary: async (id: string) => (await api.get<AdHypothesisSummary>(`/ad-hypotheses/${id}/summary`)).data,
};
export const exchangeRatesApi = crud('/exchange-rates');

export async function syncTelegramChannelNow(channelId: string) {
  return (await api.post(`/telegram-channels/${channelId}/sync-now`)).data;
}

export async function syncTelegramChannelHistorical(channelId: string, payload: Record<string, unknown>) {
  return (await api.post(`/telegram-channels/${channelId}/sync/historical`, payload)).data;
}

export async function syncTelegramChannelDeep(channelId: string, payload: Record<string, unknown>) {
  return (await api.post(`/telegram-channels/${channelId}/sync/deep`, payload)).data;
}

export async function syncTelegramChannelPostMetrics(channelId: string, payload: { telegramUserAccountId?: string; postLimit?: number }) {
  return (await api.post(`/telegram-channels/${channelId}/sync-posts-metrics`, payload)).data;
}

export async function getTelegramChannelAnalytics(channelId: string, from?: string, to?: string) {
  return (await api.get(`/telegram-channels/${channelId}/analytics`, { params: { from, to } })).data;
}

export async function getTelegramChannelPosts(channelId: string, limit = 50, offset = 0) {
  return (await api.get<{ items: TelegramPostAnalyticsItem[]; total: number; limit: number; offset: number }>(`/telegram-channels/${channelId}/posts`, { params: { limit, offset } })).data;
}

export async function getTelegramChannelInviteLinks(channelId: string) {
  return (await api.get<TelegramInviteLink[]>(`/telegram-channels/${channelId}/invite-links`)).data;
}

export async function getTelegramChannelPromos(channelId: string) {
  return (await api.get<Promo[]>(`/telegram-channels/${channelId}/promos`)).data;
}

export type CurrencySettings = { primaryCurrency: Currency; secondaryCurrency: Currency; currencyDisplayMode: CurrencyDisplayMode; supportedCurrencies: Currency[] };
export type ExchangeRate = { id: string; baseCurrency: Currency; targetCurrency: Currency; rate: number; date: string; source?: string };

export const currenciesApi = {
  getSettings: async () => (await api.get<CurrencySettings>('/currencies/settings')).data,
  updateSettings: async (payload: { primaryCurrency: Currency; secondaryCurrency: Currency; currencyDisplayMode?: CurrencyDisplayMode }) => (await api.patch<CurrencySettings>('/currencies/settings', payload)).data,
  listRates: async () => (await api.get<ExchangeRate[]>('/currencies/rates')).data,
  createRate: async (payload: Record<string, unknown>) => (await api.post<ExchangeRate>('/currencies/rates', payload)).data,
  updateRate: async (id: string, payload: Record<string, unknown>) => (await api.patch<ExchangeRate>(`/currencies/rates/${id}`, payload)).data,
  removeRate: async (id: string) => (await api.delete(`/currencies/rates/${id}`)).data,
  syncRates: async () => (await api.post<{ success: boolean; updated: number }>('/currencies/sync-rates')).data,
};

export async function getDashboardSummary() {
  return (await api.get<DashboardSummary>('/dashboard/summary')).data;
}
