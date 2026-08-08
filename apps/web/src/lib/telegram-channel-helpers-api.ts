import type { AxiosInstance } from "axios";
import type {
  BulkActionResultItem,
  PaginatedResponse,
  SyncOperationResult,
  TelegramChannelSyncProgressItem,
} from "@telegram-system/shared";
import type {
  PaginationParams,
  Promo,
  TelegramChannelAnalyticsResponse,
  TelegramChannelSyncNowPayload,
  TelegramInviteLink,
  TelegramInviteLinkHistory,
  TelegramPostAnalyticsItem,
} from "./api-types";

export type StreamProgressHandler<TItem = BulkActionResultItem> = (
  item: TItem,
  current: number,
  total: number,
) => void;

type PaginatedGetter = <T>(
  path: string,
  params?: Record<string, unknown>,
) => Promise<PaginatedResponse<T>>;

type AllPaginatedGetter = <T>(
  path: string,
  params?: Record<string, unknown>,
) => Promise<T[]>;

export function createTelegramChannelHelpers({
  api,
  getPaginated,
  getAllPaginatedItems,
  streamProgressAction,
}: {
  api: AxiosInstance;
  getPaginated: PaginatedGetter;
  getAllPaginatedItems: AllPaginatedGetter;
  streamProgressAction: <TResult, TItem = BulkActionResultItem>(path: string, payload: unknown, onProgress: StreamProgressHandler<TItem>) => Promise<TResult>;
}) {
  return {
    syncTelegramChannelNow: async (channelId: string, payload: TelegramChannelSyncNowPayload = {}) =>
      (await api.post(`/telegram-channels/${channelId}/sync-now`, payload)).data,
    syncTelegramChannelNowWithProgress: (
      channelId: string,
      onProgress: StreamProgressHandler<TelegramChannelSyncProgressItem>,
      payload: TelegramChannelSyncNowPayload = {},
    ) =>
      streamProgressAction<SyncOperationResult & Record<string, unknown>, TelegramChannelSyncProgressItem>(
        `/telegram-channels/${channelId}/sync-now-stream`,
        payload,
        onProgress,
      ),
    syncTelegramChannelHistorical: async (channelId: string, payload: Record<string, unknown>) =>
      (await api.post(`/telegram-channels/${channelId}/sync/historical`, payload)).data,
    syncTelegramChannelDeep: async (channelId: string, payload: Record<string, unknown>) =>
      (await api.post(`/telegram-channels/${channelId}/sync/deep`, payload)).data,
    syncTelegramChannelPostMetrics: async (
      channelId: string,
      payload: { telegramUserAccountId?: string; postLimit?: number },
    ) => (await api.post(`/telegram-channels/${channelId}/sync-posts-metrics`, payload)).data,
    getTelegramChannelAnalytics: async (channelId: string, from?: string, to?: string) =>
      (await api.get<TelegramChannelAnalyticsResponse>(`/telegram-channels/${channelId}/analytics`, { params: { from, to } })).data,
    getTelegramChannelPosts: (channelId: string, params?: PaginationParams & { search?: string; from?: string; to?: string }) =>
      getPaginated<TelegramPostAnalyticsItem>(`/telegram-channels/${channelId}/posts`, params),
    getTelegramChannelInviteLinks: (channelId: string, params?: PaginationParams & { search?: string }) =>
      getPaginated<TelegramInviteLink>(`/telegram-channels/${channelId}/invite-links`, params),
    getTelegramChannelInviteLinksForSelect: async (
      channelId: string,
      params?: { search?: string; availableForCampaignId?: string },
    ) =>
      (await api.get<TelegramInviteLink[]>(`/telegram-channels/${channelId}/invite-links/select`, { params })).data,
    getAllTelegramChannelInviteLinks: (channelId: string, params?: { search?: string }) =>
      getAllPaginatedItems<TelegramInviteLink>(`/telegram-channels/${channelId}/invite-links`, params),
    getTelegramChannelInviteLinkHistory: async (channelId: string, inviteLinkId: string, limit = 120) =>
      (await api.get<TelegramInviteLinkHistory>(`/telegram-channels/${channelId}/invite-links/${inviteLinkId}/history`, { params: { limit } })).data,
    getTelegramChannelPromos: async (channelId: string) =>
      (await api.get<Promo[]>(`/telegram-channels/${channelId}/promos`)).data,
  };
}
