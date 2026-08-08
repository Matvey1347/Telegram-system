import type { AxiosInstance, AxiosRequestConfig } from "axios";
import type { PaginatedResponse } from "@telegram-system/shared";
import type {
  AdCampaign,
  AdCampaignAdmissionAnalyticsHistory,
  AdCampaignAnalyticsInput,
  AdCampaignAnalyticsSummary,
  AdCampaignInviteLinkHistory,
  AdCampaignPerformanceSummary,
  AdHypothesis,
  AdHypothesisDetail,
  AdHypothesisInviteLinkHistory,
  AdHypothesisSummary,
  AdvertisingChannel,
  CreateAdHypothesisPayload,
  DailyAnalyticsSyncRun,
  PaginationParams,
  Promo,
  UpdateAdHypothesisPayload,
} from "./api-types";

type PaginatedGetter = <T>(path: string, params?: Record<string, unknown>) => Promise<PaginatedResponse<T>>;
type AllPaginatedGetter = <T>(path: string, params?: Record<string, unknown>) => Promise<T[]>;
type CrudFactory = <T>(path: string) => {
  list: () => Promise<T[]>;
  get: (id: string) => Promise<T>;
  create: (payload: Record<string, unknown>) => Promise<T>;
  update: (id: string, payload: Record<string, unknown>) => Promise<T>;
  remove: (id: string) => Promise<T>;
};

export function createMarketingApi({ api, crud, quietCrud, getPaginated, getAllPaginatedItems, hasExplicitPagination, quietMutationConfig }: {
  api: AxiosInstance;
  crud: CrudFactory;
  quietCrud: CrudFactory;
  getPaginated: PaginatedGetter;
  getAllPaginatedItems: AllPaginatedGetter;
  hasExplicitPagination: (params?: Record<string, unknown>) => boolean;
  quietMutationConfig: AxiosRequestConfig;
}) {
const promosApi = {
  ...quietCrud<Promo>("/promos"),
  listPage: async (
    params?: PaginationParams & { telegramChannelId?: string },
  ) => getPaginated<Promo>("/promos", params),
  list: async (params?: PaginationParams & { telegramChannelId?: string }) =>
    hasExplicitPagination(params)
      ? (await getPaginated<Promo>("/promos", params)).items
      : getAllPaginatedItems<Promo>("/promos", params),
  uploadImage: async (file: File) => {
    const formData = new FormData();
    formData.append("file", file);
    return (
      await api.post<{ imageUrl: string }>("/promos/upload-image", formData, {
        headers: { "Content-Type": "multipart/form-data" },
      })
    ).data;
  },
};
const advertisingChannelsApi = crud<AdvertisingChannel>(
  "/advertising-channels",
);
const adCampaignsApi = {
  ...quietCrud<AdCampaign>("/ad-campaigns"),
  listPage: async (
    params?: PaginationParams & {
      telegramChannelId?: string;
      search?: string;
    },
  ) => getPaginated<AdCampaign>("/ad-campaigns", params),
  list: async (
    params?: PaginationParams & {
      telegramChannelId?: string;
      search?: string;
    },
  ) =>
    hasExplicitPagination(params)
      ? (await getPaginated<AdCampaign>("/ad-campaigns", params)).items
      : getAllPaginatedItems<AdCampaign>("/ad-campaigns", params),
  updateAnalyticsInput: async (id: string, payload: AdCampaignAnalyticsInput) =>
    (
      await api.patch<AdCampaign>(
        `/ad-campaigns/${id}/analytics-input`,
        payload,
      )
    ).data,
  recalculateAnalytics: async (id: string) =>
    (await api.post<AdCampaign>(`/ad-campaigns/${id}/recalculate-analytics`))
      .data,
  analyticsSummary: async (id: string) =>
    (
      await api.get<AdCampaignAnalyticsSummary>(
        `/ad-campaigns/${id}/analytics-summary`,
      )
    ).data,
  performanceSummary: async (params?: {
    channelId?: string;
    hypothesisId?: string;
    dateFrom?: string;
    dateTo?: string;
  }) =>
    (
      await api.get<AdCampaignPerformanceSummary>(
        "/ad-campaigns/performance-summary",
        { params },
      )
    ).data,
  inviteLinkHistory: async (id: string, limit = 120) =>
    (
      await api.get<AdCampaignInviteLinkHistory>(
        `/ad-campaigns/${id}/invite-link-history`,
        { params: { limit } },
      )
    ).data,
  admissionViewAnalytics: async (id: string) =>
    (
      await api.get<AdCampaignAdmissionAnalyticsHistory>(
        `/ad-campaigns/${id}/admission-view-analytics`,
      )
    ).data,
};
const telegramSyncApi = {
  runDailyAnalytics: async () =>
    (
      await api.post<DailyAnalyticsSyncRun>(
        "/telegram-sync/daily-analytics/run",
      )
    ).data,
  lastDailyAnalyticsRun: async () =>
    (
      await api.get<DailyAnalyticsSyncRun | null>(
        "/telegram-sync/daily-analytics/last-run",
      )
    ).data,
  dailyAnalyticsRuns: async (limit = 20) =>
    (
      await api.get<DailyAnalyticsSyncRun[]>(
        "/telegram-sync/daily-analytics/runs",
        { params: { limit } },
      )
    ).data,
};
const adHypothesesApi = {
  listPage: async (params?: PaginationParams) =>
    getPaginated<AdHypothesis>("/ad-hypotheses", params),
  list: async () => getAllPaginatedItems<AdHypothesis>("/ad-hypotheses"),
  get: async (id: string) =>
    (await api.get<AdHypothesisDetail>(`/ad-hypotheses/${id}`)).data,
  inviteLinkHistory: async (id: string) =>
    (
      await api.get<AdHypothesisInviteLinkHistory>(
        `/ad-hypotheses/${id}/invite-link-history`,
      )
    ).data,
  create: async (payload: CreateAdHypothesisPayload) =>
    (
      await api.post<AdHypothesisDetail>(
        "/ad-hypotheses",
        payload,
        quietMutationConfig,
      )
    ).data,
  update: async (id: string, payload: UpdateAdHypothesisPayload) =>
    (
      await api.patch<AdHypothesisDetail>(
        `/ad-hypotheses/${id}`,
        payload,
        quietMutationConfig,
      )
    ).data,
  remove: async (id: string) =>
    (
      await api.delete<{ success: boolean }>(
        `/ad-hypotheses/${id}`,
        quietMutationConfig,
      )
    ).data,
  summary: async (id: string) =>
    (await api.get<AdHypothesisSummary>(`/ad-hypotheses/${id}/summary`)).data,
};


  return { promosApi, advertisingChannelsApi, adCampaignsApi, telegramSyncApi, adHypothesesApi };
}
