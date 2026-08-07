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
  ScheduleManagedPostsBatchPayload,
  TelegramPostPlannerApplyResult,
  TelegramPostPlannerFormat,
  TelegramPostPlannerPreviewResult,
  TelegramPostPlannerSlot,
  TelegramPublishingCapabilities,
} from "@telegram-system/shared";
import { createApplicationLogsApi } from "./application-logs-api";
import {
  clearAccessToken,
  getAccessToken,
  getAuthRedirectPath,
  rememberAuthReturnTo,
} from "./auth";

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
  AccountMe,
  Account,
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
  AuthResponse,
  CreateAdHypothesisPayload,
  CreateTelegramChannelNetworkPayload,
  Currency,
  CurrencyDisplayMode,
  DailyAnalyticsSyncRun,
  DashboardSummary,
  GlobalSearchResult,
  Icon,
  ImportedTelegramSource,
  MeResponse,
  PaginatedResponse,
  PaginationParams,
  PostGroup,
  Promo,
  PromptNote,
  TelegramAccountChannelImportItem,
  TelegramAnalyticsSources,
  TelegramBot,
  TelegramChannel,
  TelegramChannelAdAnalysis,
  TelegramChannelAdAnalysisPayload,
  TelegramChannelAnalyticsResponse,
  TelegramChannelAudience,
  TelegramChannelAudienceSnapshot,
  TelegramChannelFinancialSummary,
  TelegramChannelImportPayload,
  TelegramChannelSelectOption,
  TelegramChannelNetwork,
  TelegramChannelNetworkDetail,
  TelegramChannelNetworkSummary,
  TelegramChannelSourceAccess,
  TelegramChannelSyncNowPayload,
  TelegramInviteLink,
  TelegramInviteLinkHistory,
  TelegramManagedPost,
  TelegramManagedPostGroupSummary,
  TelegramManagedPostLinkTarget,
  TelegramManagedPostsImportRow,
  TelegramManagedPostsImportPayload,
  TelegramManagedPostsImportResult,
  TelegramManagedPostRevision,
  TelegramPost,
  TelegramPostAnalyticsItem,
  TelegramSourceChannelAccess,
  TelegramUserAccount,
  TelegramUserAccountSyncDialogsResponse,
  Transaction,
  TransactionCategory,
  TransactionType,
  Transfer,
  UpdateAdHypothesisPayload,
  UpdateTelegramChannelNetworkPayload,
  MemberSummary,
  WorkspaceInfo,
  WorkspaceMember,
  WorkspaceMemberSelectOption,
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

export const authApi = {
  login: async (email: string, password: string) =>
    (await api.post<AuthResponse>("/auth/login", { email, password })).data,
  register: async (payload: {
    email: string;
    password: string;
    name: string;
    workspaceName?: string;
  }) => (await api.post<AuthResponse>("/auth/register", payload)).data,
  me: async () => (await api.get<MeResponse>("/auth/me")).data,
};

export const applicationLogsApi = createApplicationLogsApi(
  api,
  silentFeedbackConfig,
);

export const accountApi = {
  me: async () => (await api.get<AccountMe>("/account/me")).data,
  updateMe: async (payload: {
    name?: string;
    email?: string;
    avatarIconId?: string | null;
    telegramUsername?: string | null;
    telegramUserAccountIds?: string[];
  }) => (await api.patch<AccountMe>("/account/me", payload)).data,
  updatePassword: async (payload: {
    currentPassword: string;
    newPassword: string;
  }) =>
    (await api.patch<{ success: boolean }>("/account/password", payload)).data,
  updateWorkspace: async (payload: {
    name: string;
    timezone?: string;
    avatarIconId?: string | null;
  }) => (await api.patch<AccountMe>("/account/workspace", payload)).data,
};

export const workspacesApi = {
  list: async () => (await api.get<WorkspaceInfo[]>("/workspaces")).data,
  selected: async () =>
    (await api.get<WorkspaceInfo>("/workspaces/selected")).data,
  create: async (payload: { name: string; avatarIconId?: string | null }) =>
    (await api.post<WorkspaceInfo>("/workspaces", payload)).data,
  update: async (
    id: string,
    payload: { name?: string; timezone?: string; avatarIconId?: string | null },
  ) => (await api.patch<WorkspaceInfo>(`/workspaces/${id}`, payload)).data,
  remove: async (id: string) =>
    (await api.delete<{ success: boolean }>(`/workspaces/${id}`)).data,
};

export const globalSearchApi = {
  search: async (query: string) =>
    (
      await api.get<GlobalSearchResult[]>("/global-search", {
        params: { q: query },
      })
    ).data,
};

export const iconsApi = {
  list: async (search?: string) =>
    (
      await api.get<Icon[]>("/icons", {
        params: search ? { search } : undefined,
      })
    ).data,
  get: async (id: string) => (await api.get<Icon>(`/icons/${id}`)).data,
  upload: async (file: File): Promise<{ imageUrl: string }> => {
    const formData = new FormData();
    formData.append("file", file);
    return (
      await api.post<{ imageUrl: string }>(
        "/icons/upload",
        formData,
        withFeedback({
          headers: { "Content-Type": "multipart/form-data" },
          feedback: { mode: "managed" },
        }),
      )
    ).data;
  },
  createCustom: async (payload: { name: string; imageUrl: string }) =>
    (await api.post<Icon>("/icons/custom", payload, silentFeedbackConfig)).data,
  createTemporaryImage: async (payload: {
    imageUrl: string;
    fileName?: string;
  }) =>
    (
      await api.post<Icon>(
        "/icons/temporary-image",
        payload,
        silentFeedbackConfig,
      )
    ).data,
  createEmoji: async (payload: { name: string; emoji: string }) =>
    (await api.post<Icon>("/icons/emoji", payload, silentFeedbackConfig)).data,
  remove: async (id: string) =>
    (
      await api.delete<{ success: boolean }>(
        `/icons/${id}`,
        silentFeedbackConfig,
      )
    ).data,
};

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

export const workspaceMembersApi = {
  ...crud<WorkspaceMember>("/workspace-members"),
  select: async () =>
    (await api.get<WorkspaceMemberSelectOption[]>("/workspace-members/select"))
      .data,
  investments: async (memberId: string) =>
    (await api.get<Transaction[]>(`/workspace-members/${memberId}/investments`))
      .data,
  investmentsSummary: async () =>
    (await api.get("/workspace-members/investments/summary")).data,
};

export const promptNotesApi = {
  listPage: async (
    params?: PaginationParams & {
      search?: string;
      telegramChannelId?: string;
      postGroupId?: string;
    },
  ) => getPaginated<PromptNote>("/prompt-notes", params),
  list: async (
    params?: PaginationParams & {
      search?: string;
      telegramChannelId?: string;
      postGroupId?: string;
    },
  ) =>
    hasExplicitPagination(params)
      ? (await getPaginated<PromptNote>("/prompt-notes", params)).items
      : getAllPaginatedItems<PromptNote>("/prompt-notes", params),
  create: async (payload: {
    title: string;
    content: string;
    emoji?: string | null;
    iconId?: string | null;
    assignedMemberId?: string | null;
    telegramChannelId?: string | null;
    telegramChannelIds?: string[];
    postGroupId?: string | null;
  }) => (await api.post<PromptNote>("/prompt-notes", payload)).data,
  update: async (
    id: string,
    payload: {
      title?: string;
      content?: string;
      emoji?: string | null;
      iconId?: string | null;
      assignedMemberId?: string | null;
      telegramChannelId?: string | null;
      telegramChannelIds?: string[];
      postGroupId?: string | null;
    },
  ) => (await api.patch<PromptNote>(`/prompt-notes/${id}`, payload)).data,
  remove: async (id: string) => (await api.delete(`/prompt-notes/${id}`)).data,
};
export const accountsApi = {
  ...quietCrud<Account>("/accounts"),
  listPage: async (params?: PaginationParams & { assignedMemberId?: string }) =>
    getPaginated<Account>("/accounts", params),
  list: async () => getAllPaginatedItems<Account>("/accounts"),
};
export type TransactionQuery = {
  assignedMemberId?: string;
  dateFrom?: string;
  dateTo?: string;
  categoryId?: string;
  type?: TransactionType | "all";
  accountId?: string;
  sort?: "date_desc" | "date_asc";
  search?: string;
};
export const transactionsApi = {
  ...quietCrud<Transaction>("/transactions"),
  listPage: async (params?: TransactionQuery & PaginationParams) =>
    getPaginated<Transaction>("/transactions", params),
  list: async (params?: TransactionQuery & PaginationParams) =>
    hasExplicitPagination(params)
      ? (await getPaginated<Transaction>("/transactions", params)).items
      : getAllPaginatedItems<Transaction>("/transactions", params),
  create: async (payload: {
    assignedMemberId?: string | null;
    accountId: string;
    type: TransactionType;
    amount: number;
    exchangeRateToPrimary?: number;
    categoryId: string;
    memberId?: string;
    iconId?: string | null;
    telegramChannelId?: string | null;
    description?: string;
    date: string;
  }) =>
    (await api.post<Transaction>("/transactions", payload, quietMutationConfig))
      .data,
  update: async (
    id: string,
    payload: {
      assignedMemberId?: string | null;
      accountId?: string;
      type?: TransactionType;
      amount?: number;
      exchangeRateToPrimary?: number;
      categoryId?: string;
      memberId?: string | null;
      iconId?: string | null;
      telegramChannelId?: string | null;
      description?: string;
      date?: string;
    },
  ) =>
    (
      await api.patch<Transaction>(
        `/transactions/${id}`,
        payload,
        quietMutationConfig,
      )
    ).data,
};
export const transactionCategoriesApi = {
  list: async (type: TransactionType) =>
    (
      await api.get<TransactionCategory[]>("/finance/categories", {
        params: { type },
      })
    ).data,
  create: async (payload: {
    name: string;
    type: TransactionType;
    iconId?: string | null;
  }) =>
    (
      await api.post<TransactionCategory>(
        "/finance/categories",
        payload,
        quietMutationConfig,
      )
    ).data,
  update: async (
    id: string,
    payload: { name?: string; iconId?: string | null },
  ) =>
    (
      await api.patch<TransactionCategory>(
        `/finance/categories/${id}`,
        payload,
        quietMutationConfig,
      )
    ).data,
  remove: async (id: string) =>
    (await api.delete(`/finance/categories/${id}`, quietMutationConfig)).data,
};
export type TransferQuery = {
  assignedMemberId?: string;
  dateFrom?: string;
  dateTo?: string;
  accountId?: string;
  sort?: "date_desc" | "date_asc";
};
export const transfersApi = {
  ...quietCrud<Transfer>("/transfers"),
  listPage: async (params?: TransferQuery & PaginationParams) =>
    getPaginated<Transfer>("/transfers", params),
  list: async (params?: TransferQuery & PaginationParams) =>
    hasExplicitPagination(params)
      ? (await getPaginated<Transfer>("/transfers", params)).items
      : getAllPaginatedItems<Transfer>("/transfers", params),
};
export const telegramChannelsApi = {
  ...crud<TelegramChannel>("/telegram-channels"),
  select: async (params?: { canPostMessagesOnly?: boolean }) =>
    (
      await api.get<TelegramChannelSelectOption[]>(
        "/telegram-channels/select",
        { params },
      )
    ).data,
  listPage: async (params?: PaginationParams) =>
    getPaginated<TelegramChannel>("/telegram-channels", params),
  list: async () => getAllPaginatedItems<TelegramChannel>("/telegram-channels"),
  updateQuiet: async (id: string, payload: Record<string, unknown>) =>
    (
      await api.patch<TelegramChannel>(
        `/telegram-channels/${id}`,
        payload,
        silentFeedbackConfig,
      )
    ).data,
  import: async (payload: TelegramChannelImportPayload) =>
    (
      await api.post<ImportedTelegramSource>(
        "/telegram-channels/import",
        payload,
        quietMutationConfig,
      )
    ).data,
  importWithProgress: async (
    payload: TelegramChannelImportPayload,
    onProgress: StreamProgressHandler<{ message?: string }>,
  ) =>
    streamProgressAction<ImportedTelegramSource, { message?: string }>(
      "/telegram-channels/import-stream",
      payload,
      onProgress,
    ),
  export: async (id: string) =>
    (
      await api.get<Blob>(`/telegram-channels/${id}/export`, {
        responseType: "blob",
      })
    ).data,
  sources: async (id: string) =>
    (
      await api.get<TelegramChannelSourceAccess[]>(
        `/telegram-channels/${id}/sources`,
      )
    ).data,
  analyticsSources: async (id: string) =>
    (
      await api.get<TelegramAnalyticsSources>(
        `/telegram-channels/${id}/analytics-sources`,
      )
    ).data,
  audience: async (id: string) =>
    (
      await api.get<TelegramChannelAudience>(
        `/telegram-channels/${id}/audience`,
      )
    ).data,
  createAudienceSnapshot: async (id: string) =>
    (
      await api.post<TelegramChannelAudienceSnapshot>(
        `/telegram-channels/${id}/audience-snapshot`,
      )
    ).data,
  audienceSnapshots: async (id: string, limit?: number) =>
    (
      await api.get<TelegramChannelAudienceSnapshot[]>(
        `/telegram-channels/${id}/audience-snapshots`,
        { params: limit ? { limit } : undefined },
      )
    ).data,
  financialSummary: async (id: string) =>
    (
      await api.get<TelegramChannelFinancialSummary>(
        `/telegram-channels/${id}/financial-summary`,
      )
    ).data,
  managedPosts: async (channelId: string) =>
    (
      await api.get<TelegramManagedPost[]>(
        `/telegram-channels/${channelId}/managed-posts`,
      )
    ).data,
  publishingCapabilities: async (channelId: string) =>
    (
      await api.get<TelegramPublishingCapabilities>(
        `/telegram-channels/${channelId}/publishing-capabilities`,
      )
    ).data,
  managedPostsCalendar: async (
    channelId: string,
    params: { from: string; to: string },
  ) =>
    (
      await api.get<TelegramManagedPostCalendarResult>(
        `/telegram-channels/${channelId}/managed-posts/calendar`,
        { params },
      )
    ).data,
  postPlannerFormats: async (channelId: string) =>
    (
      await api.get<TelegramPostPlannerFormat[]>(
        `/telegram-channels/${channelId}/managed-posts/calendar-planner/formats`,
      )
    ).data,
  createPostPlannerFormat: async (
    channelId: string,
    payload: {
      name: string;
      description?: string | null;
      icon?: string | null;
      position?: number;
      isActive?: boolean;
    },
  ) =>
    (
      await api.post<TelegramPostPlannerFormat>(
        `/telegram-channels/${channelId}/managed-posts/calendar-planner/formats`,
        payload,
      )
    ).data,
  updatePostPlannerFormat: async (
    channelId: string,
    formatId: string,
    payload: {
      name?: string;
      description?: string | null;
      icon?: string | null;
      position?: number;
      isActive?: boolean;
    },
  ) =>
    (
      await api.patch<TelegramPostPlannerFormat>(
        `/telegram-channels/${channelId}/managed-posts/calendar-planner/formats/${formatId}`,
        payload,
      )
    ).data,
  deletePostPlannerFormat: async (channelId: string, formatId: string) =>
    (
      await api.delete<TelegramPostPlannerFormat>(
        `/telegram-channels/${channelId}/managed-posts/calendar-planner/formats/${formatId}`,
      )
    ).data,
  postPlannerSlots: async (channelId: string) =>
    (
      await api.get<TelegramPostPlannerSlot[]>(
        `/telegram-channels/${channelId}/managed-posts/calendar-planner/slots`,
      )
    ).data,
  createPostPlannerSlot: async (
    channelId: string,
    payload: {
      formatId?: string | null;
      postGroupIds?: string[];
      weekday: number;
      time: string;
      timezone?: string;
      position?: number;
      isActive?: boolean;
    },
  ) =>
    (
      await api.post<TelegramPostPlannerSlot>(
        `/telegram-channels/${channelId}/managed-posts/calendar-planner/slots`,
        payload,
      )
    ).data,
  updatePostPlannerSlot: async (
    channelId: string,
    slotId: string,
    payload: {
      formatId?: string | null;
      postGroupIds?: string[];
      weekday?: number;
      time?: string;
      timezone?: string;
      position?: number;
      isActive?: boolean;
    },
  ) =>
    (
      await api.patch<TelegramPostPlannerSlot>(
        `/telegram-channels/${channelId}/managed-posts/calendar-planner/slots/${slotId}`,
        payload,
      )
    ).data,
  deletePostPlannerSlot: async (channelId: string, slotId: string) =>
    (
      await api.delete<TelegramPostPlannerSlot>(
        `/telegram-channels/${channelId}/managed-posts/calendar-planner/slots/${slotId}`,
      )
    ).data,
  previewPostPlanner: async (
    channelId: string,
    payload: {
      from: string;
      to: string;
      timezone?: string;
      postGroupIds?: string[];
      formatIds?: string[];
      formatWeights?: Record<string, number>;
      limit?: number;
      rerollOffset?: number;
    },
  ) =>
    (
      await api.post<TelegramPostPlannerPreviewResult>(
        `/telegram-channels/${channelId}/managed-posts/calendar-planner/preview`,
        payload,
      )
    ).data,
  applyPostPlanner: async (
    channelId: string,
    payload: {
      from: string;
      to: string;
      timezone?: string;
      postGroupIds?: string[];
      formatIds?: string[];
      formatWeights?: Record<string, number>;
      limit?: number;
      rerollOffset?: number;
    },
  ) =>
    (
      await api.post<TelegramPostPlannerApplyResult>(
        `/telegram-channels/${channelId}/managed-posts/calendar-planner/apply`,
        payload,
      )
    ).data,
  rerollPostPlannerDay: async (
    channelId: string,
    payload: {
      date: string;
      timezone?: string;
      postGroupIds?: string[];
      formatIds?: string[];
      formatWeights?: Record<string, number>;
      limit?: number;
      rerollOffset?: number;
    },
  ) =>
    (
      await api.post<TelegramPostPlannerApplyResult>(
        `/telegram-channels/${channelId}/managed-posts/calendar-planner/reroll-day`,
        payload,
      )
    ).data,
  syncManagedPosts: async (channelId: string) =>
    (
      await api.post<ManagedPostsSyncResult>(
        `/telegram-channels/${channelId}/managed-posts/sync`,
      )
    ).data,
  syncManagedPostsWithProgress: async (
    channelId: string,
    onProgress: BulkProgressHandler,
  ) =>
    streamProgressAction<ManagedPostsSyncResult, BulkActionResultItem>(
      `/telegram-channels/${channelId}/managed-posts/sync-stream`,
      {},
      onProgress,
    ),
  setManagedPostTelegramUrl: async (
    channelId: string,
    postId: string,
    telegramUrl: string,
  ) =>
    (
      await api.patch<TelegramManagedPost>(
        `/telegram-channels/${channelId}/managed-posts/${postId}/telegram-url`,
        { telegramUrl },
      )
    ).data,
  managedPostHistory: async (channelId: string, postId: string) =>
    (
      await api.get<TelegramManagedPostRevision[]>(
        `/telegram-channels/${channelId}/managed-posts/${postId}/history`,
      )
    ).data,
  restoreManagedPostHistory: async (
    channelId: string,
    postId: string,
    revisionId: string,
  ) =>
    (
      await api.post<TelegramManagedPost>(
        `/telegram-channels/${channelId}/managed-posts/${postId}/history/${revisionId}/restore`,
      )
    ).data,
  managedPostLinkTargets: async (
    channelId: string,
    params?: {
      search?: string;
      groupId?: string;
      excludePostId?: string;
      usage?: "edit" | "publishNow" | "schedule";
      scheduledAt?: string;
      limit?: number;
    },
  ) =>
    (
      await api.get<TelegramManagedPostLinkTarget[]>(
        `/telegram-channels/${channelId}/managed-posts/link-targets`,
        { params },
      )
    ).data,
  reorderManagedPostSidebar: async (
    channelId: string,
    orderedItems: string[],
    background = false,
  ) =>
    (
      await api.post<{ success: true }>(
        `/telegram-channels/${channelId}/managed-posts/reorder-sidebar`,
        { orderedItems },
        background ? silentFeedbackConfig : undefined,
      )
    ).data,
  createManagedPost: async (
    channelId: string,
    payload: {
      title: string;
      text?: string;
      imageUrls?: string[];
      assignedMemberId?: string;
      icon?: string | null;
    },
    background = false,
  ) =>
    (
      await api.post<TelegramManagedPost>(
        `/telegram-channels/${channelId}/managed-posts`,
        payload,
        background ? silentFeedbackConfig : undefined,
      )
    ).data,
  importManagedPosts: async (
    channelId: string,
    payload: TelegramManagedPostsImportPayload,
  ) =>
    (
      await api.post<TelegramManagedPostsImportResult>(
        `/telegram-channels/${channelId}/managed-posts/import`,
        payload,
      )
    ).data,
  updateManagedPost: async (
    channelId: string,
    postId: string,
    payload: {
      title?: string;
      text?: string | null;
      imageUrls?: string[];
      assignedMemberId?: string;
      icon?: string | null;
    },
    background = false,
  ) =>
    (
      await api.patch<TelegramManagedPost>(
        `/telegram-channels/${channelId}/managed-posts/${postId}`,
        payload,
        background ? silentFeedbackConfig : undefined,
      )
    ).data,
  moveManagedPost: async (
    channelId: string,
    postId: string,
    targetTelegramChannelId: string,
  ) =>
    (
      await api.post<BulkActionResult & { post: TelegramManagedPost }>(
        `/telegram-channels/${channelId}/managed-posts/${postId}/move-channel`,
        { targetTelegramChannelId },
      )
    ).data,
  postGroupsPage: async (
    params?: PaginationParams & {
      telegramChannelId?: string;
      search?: string;
    },
  ) => getPaginated<PostGroup>("/telegram-channels/post-groups", params),
  postGroups: async (
    params?: PaginationParams & {
      telegramChannelId?: string;
      search?: string;
    },
  ) =>
    hasExplicitPagination(params)
      ? (
          await getPaginated<PostGroup>(
            "/telegram-channels/post-groups",
            params,
          )
        ).items
      : getAllPaginatedItems<PostGroup>(
          "/telegram-channels/post-groups",
          params,
        ),
  postGroup: async (groupId: string) =>
    (await api.get<PostGroup>(`/telegram-channels/post-groups/${groupId}`))
      .data,
  createPostGroup: async (payload: {
    telegramChannelId: string;
    title: string;
    description?: string | null;
    icon?: string | null;
    statusNumberingEnabled?: boolean;
    postIds?: string[];
  }) =>
    (await api.post<PostGroup>("/telegram-channels/post-groups", payload)).data,
  updatePostGroup: async (
    groupId: string,
    payload: {
      title?: string;
      description?: string | null;
      icon?: string | null;
      statusNumberingEnabled?: boolean;
    },
  ) =>
    (
      await api.patch<PostGroup>(
        `/telegram-channels/post-groups/${groupId}`,
        payload,
      )
    ).data,
  deletePostGroup: async (groupId: string) =>
    (await api.delete<PostGroup>(`/telegram-channels/post-groups/${groupId}`))
      .data,
  addPostsToGroup: async (
    groupId: string,
    postIds: string[],
    background = false,
  ) =>
    (
      await api.post<PostGroup>(
        `/telegram-channels/post-groups/${groupId}/posts`,
        { postIds },
        background ? silentFeedbackConfig : undefined,
      )
    ).data,
  removePostFromGroup: async (
    groupId: string,
    postId: string,
    background = false,
  ) =>
    (
      await api.delete<PostGroup>(
        `/telegram-channels/post-groups/${groupId}/posts/${postId}`,
        background ? silentFeedbackConfig : undefined,
      )
    ).data,
  reorderPostGroup: async (
    groupId: string,
    orderedPostIds: string[],
    background = false,
  ) =>
    (
      await api.post<PostGroup>(
        `/telegram-channels/post-groups/${groupId}/reorder`,
        { orderedPostIds },
        background ? silentFeedbackConfig : undefined,
      )
    ).data,
  movePostGroup: async (
    groupId: string,
    targetTelegramChannelId: string,
    background = false,
    onProgress?: BulkProgressHandler,
  ) =>
    onProgress
      ? streamBulkAction(
          `/telegram-channels/post-groups/${groupId}/move-channel-stream`,
          { targetTelegramChannelId },
          onProgress,
        )
      : (
          await api.post<BulkActionResult & { group: PostGroup }>(
            `/telegram-channels/post-groups/${groupId}/move-channel`,
            { targetTelegramChannelId },
            background ? silentFeedbackConfig : undefined,
          )
        ).data,
  publishPostGroup: async (
    groupId: string,
    payload: {
      includeScheduled?: boolean;
      includeFailed?: boolean;
      republishPublished?: boolean;
    } = {},
    background = false,
    onProgress?: BulkProgressHandler,
  ) =>
    onProgress
      ? streamBulkAction(
          `/telegram-channels/post-groups/${groupId}/publish-all-stream`,
          payload,
          onProgress,
        )
      : (
          await api.post<BulkActionResult>(
            `/telegram-channels/post-groups/${groupId}/publish-all`,
            payload,
            background ? silentFeedbackConfig : undefined,
          )
        ).data,
  resetPostGroupToDrafts: async (
    groupId: string,
    background = false,
    onProgress?: BulkProgressHandler,
  ) =>
    onProgress
      ? streamBulkAction(
          `/telegram-channels/post-groups/${groupId}/reset-drafts-stream`,
          {},
          onProgress,
        )
      : (
          await api.post<BulkActionResult>(
            `/telegram-channels/post-groups/${groupId}/reset-drafts`,
            {},
            background ? silentFeedbackConfig : undefined,
          )
        ).data,
  schedulePostGroupSequence: async (
    groupId: string,
    payload: {
      startDate: string;
      time: string;
      intervalDays: number;
      timezone?: string;
      includeDraftsOnly?: boolean;
      overwriteExistingScheduled?: boolean;
      includeFailed?: boolean;
    },
    background = false,
    onProgress?: BulkProgressHandler,
  ) =>
    onProgress
      ? streamBulkAction(
          `/telegram-channels/post-groups/${groupId}/schedule-sequence-stream`,
          payload,
          onProgress,
        )
      : (
          await api.post<BulkActionResult>(
            `/telegram-channels/post-groups/${groupId}/schedule-sequence`,
            payload,
            background ? silentFeedbackConfig : undefined,
          )
        ).data,
  publishManagedPost: async (
    channelId: string,
    postId: string,
    longTextMode?: "IMAGES_THEN_TEXT" | "CAPTION_THEN_TEXT",
    background = false,
  ) =>
    (
      await api.post<TelegramManagedPost>(
        `/telegram-channels/${channelId}/managed-posts/${postId}/publish`,
        { longTextMode },
        background ? silentFeedbackConfig : undefined,
      )
    ).data,
  scheduleManagedPost: async (
    channelId: string,
    postId: string,
    scheduledAt: string,
    longTextMode?: "IMAGES_THEN_TEXT" | "CAPTION_THEN_TEXT",
    background = false,
  ) =>
    (
      await api.post<TelegramManagedPost>(
        `/telegram-channels/${channelId}/managed-posts/${postId}/schedule`,
        { scheduledAt, longTextMode },
        background ? silentFeedbackConfig : undefined,
      )
    ).data,
  returnManagedPostToDraft: async (channelId: string, postId: string) =>
    (
      await api.post<TelegramManagedPost>(
        `/telegram-channels/${channelId}/managed-posts/${postId}/return-to-draft`,
      )
    ).data,
  scheduleManagedPostsBatch: async (
    channelId: string,
    payload: ScheduleManagedPostsBatchPayload,
    onProgress?: BulkProgressHandler,
  ) =>
    onProgress
      ? streamBulkAction(
          `/telegram-channels/${channelId}/managed-posts/schedule-batch-stream`,
          payload,
          onProgress,
        )
      : (
          await api.post<BulkActionResult>(
            `/telegram-channels/${channelId}/managed-posts/schedule-batch`,
            payload,
          )
        ).data,
  deleteManagedPost: async (channelId: string, postId: string) =>
    (
      await api.delete<TelegramManagedPost>(
        `/telegram-channels/${channelId}/managed-posts/${postId}`,
      )
    ).data,
  adAnalyses: async (channelId: string) =>
    (
      await api.get<TelegramChannelAdAnalysis[]>(
        `/telegram-channels/${channelId}/ad-analyses`,
      )
    ).data,
  createAdAnalysis: async (
    channelId: string,
    payload: TelegramChannelAdAnalysisPayload,
  ) =>
    (
      await api.post<TelegramChannelAdAnalysis>(
        `/telegram-channels/${channelId}/ad-analyses`,
        payload,
      )
    ).data,
  updateAdAnalysis: async (
    channelId: string,
    analysisId: string,
    payload: Partial<TelegramChannelAdAnalysisPayload>,
  ) =>
    (
      await api.patch<TelegramChannelAdAnalysis>(
        `/telegram-channels/${channelId}/ad-analyses/${analysisId}`,
        payload,
      )
    ).data,
  deleteAdAnalysis: async (channelId: string, analysisId: string) =>
    (
      await api.delete<TelegramChannelAdAnalysis>(
        `/telegram-channels/${channelId}/ad-analyses/${analysisId}`,
      )
    ).data,
  postMedia: async (channelId: string, postId: string) =>
    (
      await api.get<Blob>(
        `/telegram-channels/${channelId}/posts/${postId}/media`,
        { responseType: "blob" },
      )
    ).data,
  updatePostManualMetrics: async (
    channelId: string,
    postId: string,
    payload: {
      manualOwnViews?: number;
      manualOwnReactions?: number;
      excludeFromAnalytics?: boolean;
    },
  ) =>
    (
      await api.patch<TelegramPost>(
        `/telegram-channels/${channelId}/posts/${postId}/manual-metrics`,
        payload,
      )
    ).data,
};
export const telegramChannelNetworksApi = {
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
export const telegramUserAccountsApi = {
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
export const telegramBotsApi = {
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
export const promosApi = {
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
export const advertisingChannelsApi = crud<AdvertisingChannel>(
  "/advertising-channels",
);
export const adCampaignsApi = {
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
export const telegramSyncApi = {
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
export const adHypothesesApi = {
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
export const exchangeRatesApi = crud("/exchange-rates");

export async function syncTelegramChannelNow(
  channelId: string,
  payload: TelegramChannelSyncNowPayload = {},
) {
  return (await api.post(`/telegram-channels/${channelId}/sync-now`, payload))
    .data;
}

export async function syncTelegramChannelNowWithProgress(
  channelId: string,
  onProgress: StreamProgressHandler<TelegramChannelSyncProgressItem>,
  payload: TelegramChannelSyncNowPayload = {},
) {
  return streamProgressAction<
    SyncOperationResult & Record<string, unknown>,
    TelegramChannelSyncProgressItem
  >(`/telegram-channels/${channelId}/sync-now-stream`, payload, onProgress);
}

export async function syncTelegramChannelHistorical(
  channelId: string,
  payload: Record<string, unknown>,
) {
  return (
    await api.post(`/telegram-channels/${channelId}/sync/historical`, payload)
  ).data;
}

export async function syncTelegramChannelDeep(
  channelId: string,
  payload: Record<string, unknown>,
) {
  return (await api.post(`/telegram-channels/${channelId}/sync/deep`, payload))
    .data;
}

export async function syncTelegramChannelPostMetrics(
  channelId: string,
  payload: { telegramUserAccountId?: string; postLimit?: number },
) {
  return (
    await api.post(
      `/telegram-channels/${channelId}/sync-posts-metrics`,
      payload,
    )
  ).data;
}

export async function getTelegramChannelAnalytics(
  channelId: string,
  from?: string,
  to?: string,
) {
  return (
    await api.get<TelegramChannelAnalyticsResponse>(
      `/telegram-channels/${channelId}/analytics`,
      {
        params: { from, to },
      },
    )
  ).data;
}

export async function getTelegramChannelPosts(
  channelId: string,
  params?: PaginationParams & { search?: string; from?: string; to?: string },
) {
  return getPaginated<TelegramPostAnalyticsItem>(
    `/telegram-channels/${channelId}/posts`,
    params,
  );
}

export async function getTelegramChannelInviteLinks(
  channelId: string,
  params?: PaginationParams & { search?: string },
) {
  return getPaginated<TelegramInviteLink>(
    `/telegram-channels/${channelId}/invite-links`,
    params,
  );
}

export async function getTelegramChannelInviteLinksForSelect(
  channelId: string,
  params?: { search?: string; availableForCampaignId?: string },
) {
  return (
    await api.get<TelegramInviteLink[]>(
      `/telegram-channels/${channelId}/invite-links/select`,
      { params },
    )
  ).data;
}

export async function getAllTelegramChannelInviteLinks(
  channelId: string,
  params?: { search?: string },
) {
  return getAllPaginatedItems<TelegramInviteLink>(
    `/telegram-channels/${channelId}/invite-links`,
    params,
  );
}

export async function getTelegramChannelInviteLinkHistory(
  channelId: string,
  inviteLinkId: string,
  limit = 120,
) {
  return (
    await api.get<TelegramInviteLinkHistory>(
      `/telegram-channels/${channelId}/invite-links/${inviteLinkId}/history`,
      { params: { limit } },
    )
  ).data;
}

export async function getTelegramChannelPromos(channelId: string) {
  return (await api.get<Promo[]>(`/telegram-channels/${channelId}/promos`))
    .data;
}

export type CurrencySettings = {
  primaryCurrency: Currency;
  secondaryCurrency: Currency;
  currencyDisplayMode: CurrencyDisplayMode;
  supportedCurrencies: Currency[];
};
export type ExchangeRate = {
  id: string;
  baseCurrency: Currency;
  targetCurrency: Currency;
  rate: number;
  date: string;
  source?: string;
};

export const currenciesApi = {
  getSettings: async () =>
    (await api.get<CurrencySettings>("/currencies/settings")).data,
  updateSettings: async (payload: {
    primaryCurrency: Currency;
    secondaryCurrency: Currency;
    currencyDisplayMode?: CurrencyDisplayMode;
  }) =>
    (await api.patch<CurrencySettings>("/currencies/settings", payload)).data,
  listRates: async () =>
    (await api.get<ExchangeRate[]>("/currencies/rates")).data,
  createRate: async (payload: Record<string, unknown>) =>
    (await api.post<ExchangeRate>("/currencies/rates", payload)).data,
  updateRate: async (id: string, payload: Record<string, unknown>) =>
    (await api.patch<ExchangeRate>(`/currencies/rates/${id}`, payload)).data,
  removeRate: async (id: string) =>
    (await api.delete(`/currencies/rates/${id}`)).data,
  syncRates: async () =>
    (
      await api.post<{ success: boolean; updated: number }>(
        "/currencies/sync-rates",
      )
    ).data,
};

export const telegramAdSalesApi = {
  listAdvertisers: async (
    params?: PaginationParams & {
      search?: string;
      status?: string;
      lifecycleStage?: string;
      ownerMemberId?: string;
      archived?: boolean;
    },
  ) =>
    getPaginated<TelegramAdvertiser>("/telegram-ad-sales/advertisers", params),
  searchAdvertisers: async (params: { q: string; limit?: number }) =>
    (
      await api.get<TelegramAdvertiser[]>(
        "/telegram-ad-sales/advertisers/search",
        { params },
      )
    ).data,
  getAdvertiser: async (id: string) =>
    (await api.get<TelegramAdvertiser>(`/telegram-ad-sales/advertisers/${id}`))
      .data,
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
  addAdvertiserContact: async (id: string, payload: Record<string, unknown>) =>
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
  createAdvertiserTask: async (id: string, payload: Record<string, unknown>) =>
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
  completeCrmTask: async (taskId: string, payload?: Record<string, unknown>) =>
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
  updateSale: async (id: string, payload: Record<string, unknown>) =>
    (await api.patch<TelegramAdSale>(`/telegram-ad-sales/${id}`, payload)).data,
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
  createProduct: async (channelId: string, payload: Record<string, unknown>) =>
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

export async function getDashboardSummary(params?: {
  dateFrom?: string;
  dateTo?: string;
}) {
  return (await api.get<DashboardSummary>("/dashboard/summary", { params }))
    .data;
}
