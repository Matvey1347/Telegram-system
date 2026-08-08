import axios, { type AxiosRequestConfig } from "axios";
import type {
  BulkActionResult,
  BulkActionResultItem,
  StreamEvent,
  StructuredApiError,
  SyncOperationResult,
  TelegramChannelSyncProgressItem,
  ManagedPostsSyncResult,
  TelegramManagedPostCalendarResult,
  ScheduleManagedPostsBatchPayload,
  TelegramPostPlannerApplyResult,
  TelegramPostPlannerFormat,
  TelegramPostPlannerPreviewResult,
  TelegramPostPlannerSlot,
  TelegramPublishingCapabilities,
} from "@telegram-system/shared";
import { createApplicationLogsApi } from "./application-logs-api";
import { createFinanceApi } from "./finance-api";
import { createTelegramChannelHelpers } from "./telegram-channel-helpers-api";
import { createTelegramChannelsApi } from "./telegram-channels-api";
import { createMarketingApi } from "./marketing-api";
import { createPromptNotesApi } from "./prompt-notes-api";
import { createTelegramSourcesApi } from "./telegram-sources-api";
import { createTelegramAdSalesApi } from "./telegram-ad-sales-api";
import { createScheduledTasksApi } from "./scheduled-tasks-api";
import { createWorkspaceApi } from "./workspace-api";
import {
  clearAccessToken,
  getAccessToken,
  getAuthRedirectPath,
  rememberAuthReturnTo,
} from "./auth";

export type { TelegramAdCrmAdvertiserListItem } from "@telegram-system/shared";
export type {
  ScheduledTaskListResponse,
  ScheduledTaskRunSummary,
  ScheduledTaskSchedule,
  ScheduledTaskView,
  UpdateScheduledTaskPayload,
} from "@telegram-system/shared";

function resolveApiBaseUrl() {
  const raw = process.env.NEXT_PUBLIC_API_URL?.trim();

  if (!raw && process.env.NODE_ENV === "production") {
    throw new Error("NEXT_PUBLIC_API_URL is not defined");
  }

  const base = raw || "http://localhost:4000/api";

  return base.endsWith("/api") ? base : `${base.replace(/\/+$/, "")}/api`;
}

export const api = axios.create({
  baseURL: resolveApiBaseUrl(),
  withCredentials: true,
});

let lastCorrelationId: string | null = null;
let freshReadRequestsInFlight = 0;

function createCorrelationId() {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

export function getLastCorrelationId() {
  return lastCorrelationId;
}

export async function withFreshApiReads<T>(run: () => Promise<T>): Promise<T> {
  freshReadRequestsInFlight += 1;
  try {
    return await run();
  } finally {
    freshReadRequestsInFlight = Math.max(0, freshReadRequestsInFlight - 1);
  }
}

export const API_MUTATION_EVENT = "telegram-system:api-mutation";

export type ApiFeedbackMode = "automatic" | "managed" | "silent";

export type ApiFeedbackConfig = {
  mode?: ApiFeedbackMode;
  operationId?: string;
  title?: string;
  loadingMessage?: string;
  successMessage?: string;
  errorMessage?: string;
  icon?: {
    emoji?: string | null;
    imageUrl?: string | null;
  };
};

export type StructuredApiErrorPayload = Partial<StructuredApiError> & {
  message?: string;
  code?: string;
  statusCode?: number;
  correlationId?: string;
};

export type ApiMutationEventDetail = {
  id: string;
  phase: "start" | "success" | "error";
  title?: string;
  message?: string;
  details?: string;
  code?: string;
  correlationId?: string;
  icon?: {
    emoji?: string | null;
    imageUrl?: string | null;
  };
  mode?: ApiFeedbackMode;
};

function emitMutationEvent(detail: ApiMutationEventDetail) {
  if (typeof window === "undefined") return;
  window.dispatchEvent(
    new CustomEvent<ApiMutationEventDetail>(API_MUTATION_EVENT, { detail }),
  );
}

function isMutationMethod(method?: string) {
  return ["post", "put", "patch", "delete"].includes(
    String(method || "").toLowerCase(),
  );
}

function successMessage(method?: string) {
  if (String(method).toLowerCase() === "delete") return "Deleted successfully.";
  if (String(method).toLowerCase() === "post") return "Created successfully.";
  return "Saved successfully.";
}

function extractStructuredApiError(
  error: unknown,
): StructuredApiErrorPayload | null {
  if (!axios.isAxiosError(error) || !error.response?.data) {
    return null;
  }
  const payload = error.response.data as Partial<StructuredApiErrorPayload> & {
    message?: string | string[];
  };
  const message = Array.isArray(payload.message)
    ? payload.message.join("\n")
    : typeof payload.message === "string"
      ? payload.message
      : undefined;
  return {
    message: message || "Request failed.",
    details: payload.details ?? undefined,
    ...(typeof payload.code === "string" ? { code: payload.code } : {}),
    statusCode:
      typeof payload.statusCode === "number"
        ? payload.statusCode
        : error.response.status,
    ...(typeof payload.correlationId === "string"
      ? { correlationId: payload.correlationId }
      : {}),
  };
}

function defaultErrorMessage(error: unknown) {
  if (!axios.isAxiosError(error)) {
    return "Something went wrong. Please try again.";
  }
  if (!error.response) {
    return "Could not connect to the server. Check your connection and try again.";
  }
  const raw = error.response.data?.message;
  const message = Array.isArray(raw)
    ? raw.join("\n")
    : String(raw || "").trim();
  if (
    !message ||
    /internal server error/i.test(message) ||
    /^error$/i.test(message)
  ) {
    return "The server could not complete this action. Please try again.";
  }
  return message;
}

function errorFeedback(error: unknown, fallback?: string) {
  const structured = extractStructuredApiError(error);
  const message =
    structured?.message?.trim() || fallback || defaultErrorMessage(error);
  const details =
    typeof structured?.details === "string" ? structured.details : undefined;
  const code =
    typeof structured?.code === "string" ? structured.code : undefined;
  const correlationId =
    typeof structured?.correlationId === "string"
      ? structured.correlationId
      : undefined;
  return { message, details, code, correlationId };
}

type FeedbackAwareConfig = AxiosRequestConfig & {
  feedback?: ApiFeedbackConfig;
};

function withFeedback(config: FeedbackAwareConfig): FeedbackAwareConfig {
  return config;
}

const silentFeedbackConfig = withFeedback({
  feedback: { mode: "silent" },
});

export type BulkProgressHandler = (
  item: BulkActionResultItem,
  current: number,
  total: number,
) => void;

export type StreamProgressHandler<TItem = BulkActionResultItem> = (
  item: TItem,
  current: number,
  total: number,
) => void;

async function streamAction<TResult, TItem = BulkActionResultItem>(
  path: string,
  payload: unknown,
  onProgress: StreamProgressHandler<TItem>,
): Promise<TResult> {
  const correlationId = createCorrelationId();
  lastCorrelationId = correlationId;
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    Accept: "application/x-ndjson",
    "X-Correlation-Id": correlationId,
  };
  const token = getAccessToken();
  if (token) headers.Authorization = `Bearer ${token}`;
  if (typeof window !== "undefined") {
    const workspaceId = localStorage.getItem("selected-workspace-id");
    if (workspaceId) headers["X-Workspace-Id"] = workspaceId;
  }
  const response = await fetch(`${resolveApiBaseUrl()}${path}`, {
    method: "POST",
    headers,
    credentials: "include",
    body: JSON.stringify(payload ?? {}),
  });
  if (!response.ok || !response.body) {
    const body = await response.text();
    try {
      const parsed = JSON.parse(body) as {
        message?: string;
        correlationId?: string;
      };
      const error = new Error(
        parsed.message || `Request failed with status ${response.status}`,
      ) as Error & { correlationId?: string };
      error.correlationId = parsed.correlationId;
      throw error;
    } catch {
      throw new Error(body || `Request failed with status ${response.status}`);
    }
  }
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let completed: TResult | null = null;
  const consumeLine = (line: string) => {
    if (!line.trim()) return;
    const event = JSON.parse(line) as StreamEvent<TResult, TItem>;
    if (event.type === "progress") {
      onProgress(event.item, event.current, event.total);
    } else if (event.type === "complete") {
      completed = event.result;
    } else {
      const error = new Error(event.message) as Error & {
        correlationId?: string;
      };
      error.correlationId = event.correlationId;
      throw error;
    }
  };
  while (true) {
    const { value, done } = await reader.read();
    buffer += decoder.decode(value, { stream: !done });
    const lines = buffer.split("\n");
    buffer = lines.pop() || "";
    lines.forEach(consumeLine);
    if (done) break;
  }
  consumeLine(buffer);
  if (!completed) throw new Error("The bulk action stream ended unexpectedly");
  return completed as TResult;
}

async function streamBulkAction(
  path: string,
  payload: unknown,
  onProgress: BulkProgressHandler,
) {
  return streamAction<BulkActionResult, BulkActionResultItem>(
    path,
    payload,
    onProgress,
  );
}

export async function streamProgressAction<
  TResult,
  TItem = { message?: string },
>(
  path: string,
  payload: unknown,
  onProgress: StreamProgressHandler<TItem>,
): Promise<TResult> {
  return streamAction<TResult, TItem>(path, payload, onProgress);
}

export function isApiNetworkError(error: unknown) {
  return (
    axios.isAxiosError(error) &&
    !error.response &&
    (error.code === "ERR_NETWORK" ||
      error.code === "ERR_FAILED" ||
      error.code == null)
  );
}

api.interceptors.request.use((config) => {
  const correlationId = createCorrelationId();
  lastCorrelationId = correlationId;
  config.headers["X-Correlation-Id"] = correlationId;
  const token = getAccessToken();
  if (token) config.headers.Authorization = `Bearer ${token}`;
  if (typeof window !== "undefined") {
    const workspaceId = localStorage.getItem("selected-workspace-id");
    if (workspaceId) config.headers["X-Workspace-Id"] = workspaceId;
  }
  if (
    String(config.method || "get").toLowerCase() === "get" &&
    freshReadRequestsInFlight > 0
  ) {
    config.headers["X-Bypass-Response-Cache"] = "1";
    config.headers["Cache-Control"] = "no-cache";
    config.headers.Pragma = "no-cache";
  }
  if (config.baseURL?.includes(".ngrok-free.app")) {
    config.headers["ngrok-skip-browser-warning"] = "true";
  }
  if (isMutationMethod(config.method)) {
    const feedback = (config as FeedbackAwareConfig).feedback;
    const mode = feedback?.mode || "automatic";
    if (mode === "managed" || mode === "silent") {
      return config;
    }
    const requestId =
      feedback?.operationId ||
      `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    (
      config as typeof config & {
        mutationRequestId?: string;
        mutationFeedback?: ApiFeedbackConfig;
      }
    ).mutationRequestId = requestId;
    (
      config as typeof config & {
        mutationFeedback?: ApiFeedbackConfig;
      }
    ).mutationFeedback = feedback;
    emitMutationEvent({
      id: requestId,
      phase: "start",
      title: feedback?.title,
      message: feedback?.loadingMessage || "Waiting for the server…",
      icon: feedback?.icon,
      mode,
    });
  }
  return config;
});

api.interceptors.response.use(
  (response) => {
    const requestId = (
      response.config as typeof response.config & {
        mutationRequestId?: string;
      }
    ).mutationRequestId;
    const feedback = (
      response.config as typeof response.config & {
        mutationFeedback?: ApiFeedbackConfig;
      }
    ).mutationFeedback;
    if (requestId) {
      emitMutationEvent({
        id: requestId,
        phase: "success",
        title: feedback?.title,
        message:
          feedback?.successMessage || successMessage(response.config.method),
        icon: feedback?.icon,
        mode: feedback?.mode || "automatic",
      });
    }
    return response;
  },
  (error) => {
    const requestId = (
      error?.config as { mutationRequestId?: string } | undefined
    )?.mutationRequestId;
    const feedback = (
      error?.config as { mutationFeedback?: ApiFeedbackConfig } | undefined
    )?.mutationFeedback;
    if (requestId) {
      const normalizedError = errorFeedback(error, feedback?.errorMessage);
      emitMutationEvent({
        id: requestId,
        phase: "error",
        title: feedback?.title,
        message: normalizedError.message,
        details: normalizedError.details,
        code: normalizedError.code,
        correlationId: normalizedError.correlationId,
        icon: feedback?.icon,
        mode: feedback?.mode || "automatic",
      });
    }
    if (
      axios.isAxiosError(error) &&
      error.response?.status === 401 &&
      typeof window !== "undefined"
    ) {
      clearAccessToken();
      if (!["/login", "/register"].includes(window.location.pathname)) {
        rememberAuthReturnTo();
        window.location.href = getAuthRedirectPath();
      }
    }
    return Promise.reject(error);
  },
);

import type {
  DashboardSummary,
  PaginatedResponse,
  PaginationParams,
} from "./api-types";
export type {
  TelegramChannelAccessMode,
  SyncOperationResult,
  StructuredApiError,
  BulkActionResultItem,
  BulkActionResult,
  AccountMe,
  Account,
  AccountTransactionStats,
  AdCampaign,
  AdCampaignAdmissionAnalyticsHistory,
  AdCampaignAdmissionLatestBatch,
  AdCampaignAdmissionViewAnalytics,
  AdCampaignAdmissionViewPoint,
  AdCampaignAnalyticsFields,
  AdCampaignAnalyticsInput,
  AdCampaignAnalyticsSummary,
  AdCampaignHypothesisLink,
  AdCampaignInviteLinkHistory,
  AdCampaignKpiStatus,
  AdCampaignPerformanceSummary,
  AdHypothesis,
  AdHypothesisCampaign,
  AdHypothesisCampaignSummary,
  AdHypothesisDetail,
  AdHypothesisInviteLinkHistory,
  AdHypothesisKpiStatus,
  AdHypothesisStatus,
  AdHypothesisSummary,
  AdmissionAnalyticsBaselineMethod,
  AdmissionAnalyticsDataQuality,
  AdmissionAnalyticsDetectionMode,
  AdvertisingChannel,
  ApiErrorPayload,
  AssignedMember,
  AuthResponse,
  CreateAdHypothesisPayload,
  CreateTelegramChannelNetworkPayload,
  Currency,
  CurrencyDisplayMode,
  DailyAnalyticsSyncRun,
  DashboardSummary,
  EntityAssignment,
  GlobalSearchResult,
  Icon,
  IconType,
  ImportedTelegramSource,
  InviteLinkHistoryPoint,
  InviteLinkHistorySummary,
  MeResponse,
  PaginatedResponse,
  PaginationMeta,
  PaginationParams,
  PostGroup,
  PostGroupStatusSummary,
  Promo,
  PromptNote,
  ResolvedEmoji,
  TelegramAccountChannelImportItem,
  TelegramAnalyticsSources,
  TelegramBot,
  TelegramChannel,
  TelegramChannelAdAnalysis,
  TelegramChannelAdAnalysisPayload,
  TelegramChannelAdAnalysisStatus,
  TelegramChannelAdminLink,
  TelegramChannelAnalyticsResponse,
  TelegramChannelAnalyticsSummary,
  TelegramChannelAudience,
  TelegramChannelAudienceSnapshot,
  TelegramChannelDataType,
  TelegramChannelFinancialSummary,
  TelegramChannelImportPayload,
  TelegramChannelNetwork,
  TelegramChannelNetworkChannelSummary,
  TelegramChannelNetworkDetail,
  TelegramChannelNetworkKpiStatus,
  TelegramChannelNetworkMember,
  TelegramChannelNetworkSummary,
  TelegramChannelSelectOption,
  TelegramChannelSourceAccess,
  TelegramChannelSourceRole,
  TelegramChannelSyncNowPayload,
  TelegramChannelSyncSelection,
  TelegramChannelTimePost,
  TelegramInviteLink,
  TelegramInviteLinkHistory,
  TelegramManagedPost,
  TelegramManagedPostGroupSummary,
  TelegramManagedPostLinkTarget,
  TelegramManagedPostRemoteStatus,
  TelegramManagedPostsImportRow,
  TelegramManagedPostsImportPayload,
  TelegramManagedPostsImportProgressItem,
  TelegramManagedPostsImportResult,
  TelegramManagedPostsImportResultRow,
  TelegramManagedPostRevision,
  TelegramManagedPostStatus,
  TelegramPost,
  TelegramPostAnalyticsItem,
  TelegramSourceChannelAccess,
  TelegramSourcePermissions,
  TelegramSourceType,
  TelegramSyncResult,
  TelegramSyncedDialogChannel,
  TelegramUserAccount,
  TelegramUserAccountSyncDialogsResponse,
  Transaction,
  TransactionCategory,
  TransactionType,
  Transfer,
  UpdateAdHypothesisPayload,
  UpdateTelegramChannelNetworkPayload,
  User,
  MemberSummary,
  WorkspaceInfo,
  WorkspaceMember,
  WorkspaceMemberSelectOption,
  WorkspaceRole,
} from "./api-types";

export const applicationLogsApi = createApplicationLogsApi(
  api,
  silentFeedbackConfig,
);

async function getPaginated<T>(
  path: string,
  params?: Record<string, unknown>,
): Promise<PaginatedResponse<T>> {
  return (await api.get<PaginatedResponse<T>>(path, { params })).data;
}

function hasExplicitPagination(params?: Record<string, unknown>) {
  return params?.page != null || params?.pageSize != null;
}

async function getAllPaginatedItems<T>(
  path: string,
  params?: Record<string, unknown>,
): Promise<T[]> {
  const firstPage = await getPaginated<T>(path, params);
  if (!firstPage.pagination.hasNextPage) {
    return firstPage.items;
  }

  const items = [...firstPage.items];
  for (
    let page = firstPage.pagination.page + 1;
    page <= firstPage.pagination.totalPages;
    page += 1
  ) {
    const nextPage = await getPaginated<T>(path, {
      ...params,
      page,
      pageSize: firstPage.pagination.pageSize,
    });
    items.push(...nextPage.items);
  }
  return items;
}

const crud = <T>(path: string) => ({
  list: async () => (await api.get<T[]>(path)).data,
  get: async (id: string) => (await api.get<T>(`${path}/${id}`)).data,
  create: async (payload: Record<string, unknown>) =>
    (await api.post<T>(path, payload)).data,
  update: async (id: string, payload: Record<string, unknown>) =>
    (await api.patch<T>(`${path}/${id}`, payload)).data,
  remove: async (id: string) => (await api.delete<T>(`${path}/${id}`)).data,
});

const quietMutationConfig = silentFeedbackConfig;

const quietCrud = <T>(path: string) => ({
  list: async () => (await api.get<T[]>(path)).data,
  get: async (id: string) => (await api.get<T>(`${path}/${id}`)).data,
  create: async (payload: Record<string, unknown>) =>
    (await api.post<T>(path, payload, quietMutationConfig)).data,
  update: async (id: string, payload: Record<string, unknown>) =>
    (await api.patch<T>(`${path}/${id}`, payload, quietMutationConfig)).data,
  remove: async (id: string) =>
    (await api.delete<T>(`${path}/${id}`, quietMutationConfig)).data,
});

const workspaceApi = createWorkspaceApi({
  api,
  crud,
  silentFeedbackConfig,
  withFeedback,
});

export const {
  accountApi,
  authApi,
  globalSearchApi,
  iconsApi,
  workspaceMembersApi,
  workspacesApi,
} = workspaceApi;

export const promptNotesApi = createPromptNotesApi({
  api,
  getPaginated,
  getAllPaginatedItems,
  hasExplicitPagination,
});

const financeApi = createFinanceApi({
  api,
  getPaginated,
  getAllPaginatedItems,
  hasExplicitPagination,
  quietCrud,
  quietMutationConfig,
});

export const {
  accountsApi,
  transactionsApi,
  transactionCategoriesApi,
  transfersApi,
  exchangeRatesApi,
  currenciesApi,
} = financeApi;

export type {
  CurrencySettings,
  ExchangeRate,
  TransactionQuery,
  TransferQuery,
} from "./finance-api";

export const telegramChannelsApi = createTelegramChannelsApi({
  api,
  crud,
  getPaginated,
  getAllPaginatedItems,
  hasExplicitPagination,
  streamBulkAction,
  streamProgressAction,
  silentFeedbackConfig,
  quietMutationConfig,
});

const telegramSourcesApi = createTelegramSourcesApi({
  api,
  crud,
  getPaginated,
  getAllPaginatedItems,
  streamProgressAction,
});

export const {
  telegramChannelNetworksApi,
  telegramUserAccountsApi,
  telegramBotsApi,
} = telegramSourcesApi;

const marketingApi = createMarketingApi({
  api,
  crud,
  quietCrud,
  getPaginated,
  getAllPaginatedItems,
  hasExplicitPagination,
  quietMutationConfig,
});

export const {
  promosApi,
  advertisingChannelsApi,
  adCampaignsApi,
  telegramSyncApi,
  adHypothesesApi,
} = marketingApi;

const telegramChannelHelpers = createTelegramChannelHelpers({
  api,
  getPaginated,
  getAllPaginatedItems,
  streamProgressAction,
});

export const {
  syncTelegramChannelNow,
  syncTelegramChannelNowWithProgress,
  syncTelegramChannelHistorical,
  syncTelegramChannelDeep,
  syncTelegramChannelPostMetrics,
  getTelegramChannelAnalytics,
  getTelegramChannelPosts,
  getTelegramChannelInviteLinks,
  getTelegramChannelInviteLinksForSelect,
  getAllTelegramChannelInviteLinks,
  getTelegramChannelInviteLinkHistory,
  getTelegramChannelPromos,
} = telegramChannelHelpers;

export const telegramAdSalesApi = createTelegramAdSalesApi({
  api,
  getPaginated,
  silentFeedbackConfig,
});

export const scheduledTasksApi = createScheduledTasksApi(api);

export async function getDashboardSummary(params?: {
  dateFrom?: string;
  dateTo?: string;
}) {
  return (await api.get<DashboardSummary>("/dashboard/summary", { params }))
    .data;
}
