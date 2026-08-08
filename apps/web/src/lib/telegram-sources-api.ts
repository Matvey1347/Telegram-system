import type { AxiosInstance } from "axios";
import type { PaginatedResponse } from "@telegram-system/shared";
import type {
  PaginationParams,
  TelegramAccountChannelImportItem,
  TelegramBot,
  TelegramChannelNetwork,
  TelegramChannelNetworkDetail,
  TelegramChannelNetworkSummary,
  TelegramSourceChannelAccess,
  TelegramUserAccount,
  TelegramUserAccountSyncDialogsResponse,
  CreateTelegramChannelNetworkPayload,
  UpdateTelegramChannelNetworkPayload,
} from "./api-types";
import type { StreamProgressHandler } from "./telegram-channel-helpers-api";

type PaginatedGetter = <T>(path: string, params?: Record<string, unknown>) => Promise<PaginatedResponse<T>>;
type AllPaginatedGetter = <T>(path: string, params?: Record<string, unknown>) => Promise<T[]>;
type CrudFactory = <T>(path: string) => {
  list: () => Promise<T[]>;
  get: (id: string) => Promise<T>;
  create: (payload: Record<string, unknown>) => Promise<T>;
  update: (id: string, payload: Record<string, unknown>) => Promise<T>;
  remove: (id: string) => Promise<T>;
};

export function createTelegramSourcesApi({ api, crud, getPaginated, getAllPaginatedItems, streamProgressAction }: {
  api: AxiosInstance;
  crud: CrudFactory;
  getPaginated: PaginatedGetter;
  getAllPaginatedItems: AllPaginatedGetter;
  streamProgressAction: <TResult, TItem = { message?: string }>(path: string, payload: unknown, onProgress: StreamProgressHandler<TItem>) => Promise<TResult>;
}) {
const telegramChannelNetworksApi = {
  listPage: async (params?: PaginationParams) =>
    getPaginated<TelegramChannelNetwork>("/telegram-channel-networks", params),
  list: async () =>
    getAllPaginatedItems<TelegramChannelNetwork>("/telegram-channel-networks"),
  get: async (id: string) =>
    (
      await api.get<TelegramChannelNetworkDetail>(
        `/telegram-channel-networks/${id}`,
      )
    ).data,
  create: async (payload: CreateTelegramChannelNetworkPayload) =>
    (
      await api.post<TelegramChannelNetworkDetail>(
        "/telegram-channel-networks",
        payload,
      )
    ).data,
  update: async (id: string, payload: UpdateTelegramChannelNetworkPayload) =>
    (
      await api.patch<TelegramChannelNetworkDetail>(
        `/telegram-channel-networks/${id}`,
        payload,
      )
    ).data,
  remove: async (id: string) =>
    (await api.delete<{ success: boolean }>(`/telegram-channel-networks/${id}`))
      .data,
  summary: async (id: string) =>
    (
      await api.get<TelegramChannelNetworkSummary>(
        `/telegram-channel-networks/${id}/summary`,
      )
    ).data,
};
const telegramUserAccountsApi = {
  ...crud<TelegramUserAccount>("/telegram-user-accounts"),
  startLogin: async (id: string, phone?: string) =>
    (await api.post(`/telegram-user-accounts/${id}/login/start`, { phone }))
      .data,
  confirmCode: async (id: string, code: string) =>
    (await api.post(`/telegram-user-accounts/${id}/login/code`, { code })).data,
  confirmPassword: async (id: string, password: string) =>
    (
      await api.post(`/telegram-user-accounts/${id}/login/password`, {
        password,
      })
    ).data,
  check: async (id: string) =>
    (await api.post(`/telegram-user-accounts/${id}/check`)).data,
  syncDialogs: async (id: string) =>
    (
      await api.post<TelegramUserAccountSyncDialogsResponse>(
        `/telegram-user-accounts/${id}/sync-dialogs`,
      )
    ).data,
  syncDialogsWithProgress: async (
    id: string,
    onProgress: StreamProgressHandler<{ message?: string }>,
  ) =>
    streamProgressAction<
      TelegramUserAccountSyncDialogsResponse,
      { message?: string }
    >(`/telegram-user-accounts/${id}/sync-dialogs-stream`, {}, onProgress),
  importChannels: async (
    id: string,
    channels: TelegramAccountChannelImportItem[],
  ) =>
    (
      await api.post<TelegramUserAccountSyncDialogsResponse>(
        `/telegram-user-accounts/${id}/channels/import`,
        { channels },
      )
    ).data,
  importChannelsWithProgress: async (
    id: string,
    channels: TelegramAccountChannelImportItem[],
    onProgress: StreamProgressHandler<{ message?: string }>,
  ) =>
    streamProgressAction<
      TelegramUserAccountSyncDialogsResponse,
      { message?: string }
    >(
      `/telegram-user-accounts/${id}/channels/import-stream`,
      { channels },
      onProgress,
    ),
  channels: async (id: string) =>
    (
      await api.get<TelegramSourceChannelAccess[]>(
        `/telegram-user-accounts/${id}/channels`,
      )
    ).data,
};
const telegramBotsApi = {
  ...crud<TelegramBot>("/telegram-bots"),
  check: async (id: string) =>
    (await api.post<TelegramBot>(`/telegram-bots/${id}/check`)).data,
  channels: async (id: string) =>
    (
      await api.get<TelegramSourceChannelAccess[]>(
        `/telegram-bots/${id}/channels`,
      )
    ).data,
};

  return { telegramChannelNetworksApi, telegramUserAccountsApi, telegramBotsApi };
}
