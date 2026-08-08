import type { AxiosInstance, AxiosRequestConfig } from "axios";
import type {
  TelegramAdAvailabilityResponse,
  TelegramAdPriceQuote,
  TelegramAdPriceSnapshot,
  TelegramAdPricingSeriesResponse,
  TelegramAdProduct,
  TelegramAdSale,
  TelegramAdAnalyticsAlertsResponse,
  TelegramAdAnalyticsSummaryResponse,
  TelegramAdChannelBaseline,
  TelegramAdChannelPricingSettings,
  TelegramAdCrmAdvertiserListItem,
  TelegramAdvertiser,
  TelegramAdvertiserActivity,
  TelegramAdvertiserContact,
  TelegramAdvertiserTask,
  TelegramAdCrmMemberSettings,
  TelegramAdCrmWorkspaceSettings,
  TelegramAdChannelAnalyticsResponse,
  TelegramAdInventoryAnalyticsResponse,
  TelegramAdNetworkAnalyticsResponse,
  TelegramAdRevenueSeriesResponse,
  TelegramAdSaleMetricsResponse,
  TelegramAdSalePayment,
  TelegramAdSchedulePolicy,
  TelegramAdSalesMemberPreferences,
  TelegramAdSalesWorkspaceSettings,
  TelegramAdSalesBulkCreateRequest,
  TelegramAdSalesBulkCreateResponse,
} from "@telegram-system/shared";
import type { PaginatedResponse, PaginationParams } from "./api-types";

type TelegramAdSalesApiDeps = {
  api: AxiosInstance;
  getPaginated: <T>(
    path: string,
    params?: Record<string, unknown>,
  ) => Promise<PaginatedResponse<T>>;
  silentFeedbackConfig: AxiosRequestConfig;
};

export function createTelegramAdSalesApi({
  api,
  getPaginated,
  silentFeedbackConfig,
}: TelegramAdSalesApiDeps) {
  return {
    listCrmAdvertisers: async (
      params?: PaginationParams & {
        search?: string;
        status?: string;
        lifecycleStage?: string;
        ownerMemberId?: string;
        archived?: boolean;
      },
    ) =>
      getPaginated<TelegramAdCrmAdvertiserListItem>(
        "/telegram-ad-sales/crm/advertisers",
        params,
      ),
    listAdvertisers: async (
      params?: PaginationParams & {
        search?: string;
        status?: string;
        lifecycleStage?: string;
        ownerMemberId?: string;
        archived?: boolean;
      },
    ) =>
      getPaginated<TelegramAdvertiser>(
        "/telegram-ad-sales/advertisers",
        params,
      ),
    searchAdvertisers: async (params: { q: string; limit?: number }) =>
      (
        await api.get<TelegramAdvertiser[]>(
          "/telegram-ad-sales/advertisers/search",
          { params },
        )
      ).data,
    getAdvertiser: async (id: string) =>
      (
        await api.get<TelegramAdvertiser>(
          `/telegram-ad-sales/advertisers/${id}`,
        )
      ).data,
    createAdvertiser: async (payload: Record<string, unknown>) =>
      (
        await api.post<TelegramAdvertiser>(
          "/telegram-ad-sales/advertisers",
          payload,
        )
      ).data,
    updateAdvertiser: async (id: string, payload: Record<string, unknown>) =>
      (
        await api.patch<TelegramAdvertiser>(
          `/telegram-ad-sales/advertisers/${id}`,
          payload,
        )
      ).data,
    archiveAdvertiser: async (id: string) =>
      (
        await api.post<TelegramAdvertiser>(
          `/telegram-ad-sales/advertisers/${id}/archive`,
        )
      ).data,
    restoreAdvertiser: async (id: string) =>
      (
        await api.post<TelegramAdvertiser>(
          `/telegram-ad-sales/advertisers/${id}/restore`,
        )
      ).data,
    addAdvertiserContact: async (
      id: string,
      payload: Record<string, unknown>,
    ) =>
      (
        await api.post<TelegramAdvertiserContact>(
          `/telegram-ad-sales/advertisers/${id}/contacts`,
          payload,
        )
      ).data,
    listAdvertiserActivities: async (id: string, params?: PaginationParams) =>
      getPaginated<TelegramAdvertiserActivity>(
        `/telegram-ad-sales/advertisers/${id}/activities`,
        params,
      ),
    createAdvertiserActivity: async (
      id: string,
      payload: Record<string, unknown>,
    ) =>
      (
        await api.post<TelegramAdvertiserActivity>(
          `/telegram-ad-sales/advertisers/${id}/activities`,
          payload,
        )
      ).data,
    listCrmTasks: async (
      params?: PaginationParams & {
        advertiserId?: string;
        assignedMemberId?: string;
        status?: string;
        type?: string;
      },
    ) =>
      getPaginated<TelegramAdvertiserTask>(
        "/telegram-ad-sales/crm/tasks",
        params,
      ),
    createAdvertiserTask: async (
      id: string,
      payload: Record<string, unknown>,
    ) =>
      (
        await api.post<TelegramAdvertiserTask>(
          `/telegram-ad-sales/advertisers/${id}/tasks`,
          payload,
        )
      ).data,
    updateCrmTask: async (taskId: string, payload: Record<string, unknown>) =>
      (
        await api.patch<TelegramAdvertiserTask>(
          `/telegram-ad-sales/crm/tasks/${taskId}`,
          payload,
        )
      ).data,
    completeCrmTask: async (
      taskId: string,
      payload?: Record<string, unknown>,
    ) =>
      (
        await api.post<TelegramAdvertiserTask>(
          `/telegram-ad-sales/crm/tasks/${taskId}/complete`,
          payload ?? {},
        )
      ).data,
    getCrmWorkspaceSettings: async () =>
      (
        await api.get<TelegramAdCrmWorkspaceSettings>(
          "/telegram-ad-sales/crm/settings/workspace",
        )
      ).data,
    updateCrmWorkspaceSettings: async (payload: Record<string, unknown>) =>
      (
        await api.put<TelegramAdCrmWorkspaceSettings>(
          "/telegram-ad-sales/crm/settings/workspace",
          payload,
        )
      ).data,
    getCrmMemberSettings: async () =>
      (
        await api.get<TelegramAdCrmMemberSettings>(
          "/telegram-ad-sales/crm/settings/member",
        )
      ).data,
    updateCrmMemberSettings: async (payload: Record<string, unknown>) =>
      (
        await api.put<TelegramAdCrmMemberSettings>(
          "/telegram-ad-sales/crm/settings/member",
          payload,
        )
      ).data,
    getWorkspaceSettings: async () =>
      (
        await api.get<TelegramAdSalesWorkspaceSettings>(
          "/telegram-ad-sales/settings/workspace",
        )
      ).data,
    updateWorkspaceSettings: async (payload: Record<string, unknown>) =>
      (
        await api.put<TelegramAdSalesWorkspaceSettings>(
          "/telegram-ad-sales/settings/workspace",
          payload,
        )
      ).data,
    getPreferences: async () =>
      (
        await api.get<TelegramAdSalesMemberPreferences>(
          "/telegram-ad-sales/preferences",
        )
      ).data,
    updatePreferences: async (payload: Record<string, unknown>) =>
      (
        await api.put<TelegramAdSalesMemberPreferences>(
          "/telegram-ad-sales/preferences",
          payload,
          silentFeedbackConfig,
        )
      ).data,
    listSalesPage: async (params?: PaginationParams & { status?: string }) =>
      getPaginated<TelegramAdSale>("/telegram-ad-sales", params),
    getSale: async (id: string) =>
      (await api.get<TelegramAdSale>(`/telegram-ad-sales/${id}`)).data,
    createSale: async (payload: Record<string, unknown>, silent = false) =>
      (
        await api.post<TelegramAdSale>(
          "/telegram-ad-sales",
          payload,
          silent ? silentFeedbackConfig : undefined,
        )
      ).data,
    bulkCreate: async (
      payload: TelegramAdSalesBulkCreateRequest,
      silent = false,
    ) =>
      (
        await api.post<TelegramAdSalesBulkCreateResponse>(
          "/telegram-ad-sales/bulk",
          payload,
          silent ? silentFeedbackConfig : undefined,
        )
      ).data,
    updateSale: async (id: string, payload: Record<string, unknown>) =>
      (await api.patch<TelegramAdSale>(`/telegram-ad-sales/${id}`, payload))
        .data,
    listProductsPage: async (
      params?: PaginationParams & {
        telegramChannelId?: string;
        isActive?: boolean;
      },
    ) => getPaginated<TelegramAdProduct>("/telegram-ad-sales/products", params),
    listChannelProducts: async (channelId: string) =>
      (
        await api.get<TelegramAdProduct[]>(
          `/telegram-ad-sales/channels/${channelId}/products`,
        )
      ).data,
    createProduct: async (
      channelId: string,
      payload: Record<string, unknown>,
    ) =>
      (
        await api.post<TelegramAdProduct>(
          `/telegram-ad-sales/channels/${channelId}/products`,
          payload,
        )
      ).data,
    updateProduct: async (id: string, payload: Record<string, unknown>) =>
      (
        await api.patch<TelegramAdProduct>(
          `/telegram-ad-sales/products/${id}`,
          payload,
        )
      ).data,
    deactivateProduct: async (id: string) =>
      (await api.delete(`/telegram-ad-sales/products/${id}`)).data,
    getPolicy: async (channelId: string) =>
      (
        await api.get<TelegramAdSchedulePolicy>(
          `/telegram-ad-sales/channels/${channelId}/policy`,
        )
      ).data,
    getChannelBaseline: async (channelId: string) =>
      (
        await api.get<TelegramAdChannelBaseline>(
          `/telegram-ad-sales/channels/${channelId}/baseline`,
        )
      ).data,
    updateChannelPricing: async (
      channelId: string,
      payload: Record<string, unknown>,
    ) =>
      (
        await api.put<TelegramAdChannelPricingSettings>(
          `/telegram-ad-sales/channels/${channelId}/pricing`,
          payload,
        )
      ).data,
    updatePolicy: async (channelId: string, payload: Record<string, unknown>) =>
      (
        await api.put<TelegramAdSchedulePolicy>(
          `/telegram-ad-sales/channels/${channelId}/policy`,
          payload,
        )
      ).data,
    recommendPolicy: async (
      channelId: string,
      payload?: Record<string, unknown>,
    ) =>
      (
        await api.post(
          `/telegram-ad-sales/channels/${channelId}/policy/recommend`,
          payload ?? {},
        )
      ).data,
    createQuote: async (payload: Record<string, unknown>, silent = false) =>
      (
        await api.post<TelegramAdPriceQuote>(
          "/telegram-ad-sales/quotes",
          payload,
          silent ? silentFeedbackConfig : undefined,
        )
      ).data,
    priceHistory: async (
      channelId: string,
      params?: { telegramAdProductId?: string; limit?: number },
    ) =>
      (
        await api.get<TelegramAdPriceSnapshot[]>(
          `/telegram-ad-sales/channels/${channelId}/price-history`,
          { params },
        )
      ).data,
    availability: async (payload: Record<string, unknown>) =>
      (
        await api.post<TelegramAdAvailabilityResponse>(
          "/telegram-ad-sales/availability",
          payload,
          silentFeedbackConfig,
        )
      ).data,
    analyticsSummary: async (params?: Record<string, unknown>) =>
      (
        await api.get<TelegramAdAnalyticsSummaryResponse>(
          "/telegram-ad-sales/analytics/summary",
          { params },
        )
      ).data,
    channelAnalytics: async (
      channelId: string,
      params?: Record<string, unknown>,
    ) =>
      (
        await api.get<TelegramAdChannelAnalyticsResponse>(
          `/telegram-ad-sales/analytics/channels/${channelId}`,
          { params },
        )
      ).data,
    networkAnalytics: async (
      networkId: string,
      params?: Record<string, unknown>,
    ) =>
      (
        await api.get<TelegramAdNetworkAnalyticsResponse>(
          `/telegram-ad-sales/analytics/networks/${networkId}`,
          { params },
        )
      ).data,
    revenueSeries: async (params?: Record<string, unknown>) =>
      (
        await api.get<TelegramAdRevenueSeriesResponse>(
          "/telegram-ad-sales/analytics/revenue-series",
          { params },
        )
      ).data,
    pricingSeries: async (params?: Record<string, unknown>) =>
      (
        await api.get<TelegramAdPricingSeriesResponse>(
          "/telegram-ad-sales/analytics/pricing-series",
          { params },
        )
      ).data,
    inventoryAnalytics: async (params?: Record<string, unknown>) =>
      (
        await api.get<TelegramAdInventoryAnalyticsResponse>(
          "/telegram-ad-sales/analytics/inventory",
          { params },
        )
      ).data,
    analyticsAlerts: async (params?: Record<string, unknown>) =>
      (
        await api.get<TelegramAdAnalyticsAlertsResponse>(
          "/telegram-ad-sales/analytics/alerts",
          { params },
        )
      ).data,
    addPlacement: async (
      saleId: string,
      payload: Record<string, unknown>,
      silent = false,
    ) =>
      (
        await api.post<TelegramAdSale["placements"][number]>(
          `/telegram-ad-sales/${saleId}/placements`,
          payload,
          silent ? silentFeedbackConfig : undefined,
        )
      ).data,
    updatePlacement: async (
      saleId: string,
      placementId: string,
      payload: Record<string, unknown>,
    ) =>
      (
        await api.patch<TelegramAdSale["placements"][number]>(
          `/telegram-ad-sales/${saleId}/placements/${placementId}`,
          payload,
        )
      ).data,
    reserveSale: async (
      saleId: string,
      payload: Record<string, unknown>,
      silent = false,
    ) =>
      (
        await api.post<TelegramAdSale>(
          `/telegram-ad-sales/${saleId}/reserve`,
          payload,
          silent ? silentFeedbackConfig : undefined,
        )
      ).data,
    confirmSale: async (saleId: string) =>
      (await api.post<TelegramAdSale>(`/telegram-ad-sales/${saleId}/confirm`))
        .data,
    cancelSale: async (saleId: string) =>
      (await api.post<TelegramAdSale>(`/telegram-ad-sales/${saleId}/cancel`))
        .data,
    createPayment: async (
      saleId: string,
      payload: Record<string, unknown>,
      silent = false,
    ) =>
      (
        await api.post<TelegramAdSalePayment[] | TelegramAdSalePayment>(
          `/telegram-ad-sales/${saleId}/payments`,
          payload,
          silent ? silentFeedbackConfig : undefined,
        )
      ).data,
    listPayments: async (saleId: string) =>
      (
        await api.get<TelegramAdSalePayment[]>(
          `/telegram-ad-sales/${saleId}/payments`,
        )
      ).data,
    updatePayment: async (
      saleId: string,
      paymentId: string,
      payload: Record<string, unknown>,
    ) =>
      (
        await api.patch<TelegramAdSalePayment>(
          `/telegram-ad-sales/${saleId}/payments/${paymentId}`,
          payload,
        )
      ).data,
    voidPayment: async (
      saleId: string,
      paymentId: string,
      payload: Record<string, unknown>,
    ) =>
      (
        await api.post<TelegramAdSalePayment>(
          `/telegram-ad-sales/${saleId}/payments/${paymentId}/void`,
          payload,
        )
      ).data,
    createManagedPostFromPlacement: async (
      saleId: string,
      placementId: string,
      payload: Record<string, unknown>,
    ) =>
      (
        await api.post(
          `/telegram-ad-sales/${saleId}/placements/${placementId}/managed-post`,
          payload,
        )
      ).data,
    attachManagedPost: async (
      saleId: string,
      placementId: string,
      payload: { managedPostId?: string; telegramPostId?: string },
      silent = false,
    ) =>
      (
        await api.post(
          `/telegram-ad-sales/${saleId}/placements/${placementId}/attach-managed-post`,
          payload,
          silent ? silentFeedbackConfig : undefined,
        )
      ).data,
    detachManagedPost: async (saleId: string, placementId: string) =>
      (
        await api.post(
          `/telegram-ad-sales/${saleId}/placements/${placementId}/detach-managed-post`,
        )
      ).data,
    schedulePlacement: async (
      saleId: string,
      placementId: string,
      payload: Record<string, unknown>,
    ) =>
      (
        await api.post(
          `/telegram-ad-sales/${saleId}/placements/${placementId}/schedule`,
          payload,
        )
      ).data,
    scheduleSale: async (saleId: string, payload: Record<string, unknown>) =>
      (await api.post(`/telegram-ad-sales/${saleId}/schedule`, payload)).data,
    publishPlacement: async (
      saleId: string,
      placementId: string,
      payload: Record<string, unknown>,
    ) =>
      (
        await api.post(
          `/telegram-ad-sales/${saleId}/placements/${placementId}/publish`,
          payload,
        )
      ).data,
    reschedulePlacement: async (
      saleId: string,
      placementId: string,
      payload: Record<string, unknown>,
    ) =>
      (
        await api.post(
          `/telegram-ad-sales/${saleId}/placements/${placementId}/reschedule`,
          payload,
        )
      ).data,
    cancelPlacement: async (
      saleId: string,
      placementId: string,
      payload?: Record<string, unknown>,
    ) =>
      (
        await api.post(
          `/telegram-ad-sales/${saleId}/placements/${placementId}/cancel`,
          payload ?? {},
        )
      ).data,
    completePermanentPlacement: async (
      saleId: string,
      placementId: string,
      payload?: Record<string, unknown>,
    ) =>
      (
        await api.post(
          `/telegram-ad-sales/${saleId}/placements/${placementId}/complete-permanent`,
          payload ?? {},
        )
      ).data,
    retryDeletion: async (
      saleId: string,
      placementId: string,
      payload?: Record<string, unknown>,
    ) =>
      (
        await api.post(
          `/telegram-ad-sales/${saleId}/placements/${placementId}/retry-deletion`,
          payload ?? {},
        )
      ).data,
    reconcileSale: async (saleId: string, silent = false) =>
      (
        await api.post<TelegramAdSale>(
          `/telegram-ad-sales/${saleId}/reconcile`,
          undefined,
          silent ? silentFeedbackConfig : undefined,
        )
      ).data,
    saleMetrics: async (saleId: string) =>
      (
        await api.get<TelegramAdSaleMetricsResponse>(
          `/telegram-ad-sales/${saleId}/metrics`,
        )
      ).data,
  };
}
