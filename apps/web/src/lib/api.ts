import axios from 'axios';
import { clearAccessToken, getAccessToken } from './auth';

function resolveApiBaseUrl() {
  const raw = process.env.NEXT_PUBLIC_API_URL?.trim();
  const base = raw || 'http://localhost:4000/api';
  return base.endsWith('/api') ? base : `${base.replace(/\/+$/, '')}/api`;
}

export const api = axios.create({ baseURL: resolveApiBaseUrl(), withCredentials: true });

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
    if (error?.response?.status === 401 && typeof window !== 'undefined') {
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
export type TelegramChannel = { id: string; title: string; username?: string; telegramChatId?: string; inviteLink?: string; description?: string; language?: string; niche?: string; currentSubscribersCount?: number; photoUrl?: string; sourceType?: string; lastPublicSyncedAt?: string; adminLinks?: TelegramChannelAdminLink[]; isActive: boolean };
export type TelegramPostAnalyticsItem = {
  id: string;
  telegramMessageId: string;
  postDate: string;
  text?: string | null;
  viewsCount?: number | null;
  forwardsCount?: number | null;
  reactionsCount?: number | null;
  commentsCount?: number | null;
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
export type AdCampaign = { id: string; title: string; telegramChannelId: string; ownTelegramChannelId?: string; promoId: string; telegramInviteLinkId?: string; accountId?: string; advertisingChannels: TelegramChannel[]; price: number; costAmount?: number; exchangeRateToPrimary: number; priceInPrimaryCurrency: number; currency: Currency; placementDate?: string; startedAt?: string; endedAt?: string; joinedCount: number; leftCount?: number; netGrowthCount?: number; notes?: string; isMixedAttribution?: boolean; analytics?: { joinedCount: number; leftCount: number; netGrowth: number; costPerJoinedSubscriber?: number | null; costPerNetSubscriber?: number | null } };
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
