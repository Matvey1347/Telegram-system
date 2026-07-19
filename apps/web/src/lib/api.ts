import axios, { type AxiosRequestConfig } from "axios";
import type {
  ApplicationLog,
  ApplicationLogsDeleteResult,
  ApplicationLogsFilterOptions,
  ApplicationLogsListResult,
  ApplicationLogsQuery,
  ClientApplicationLogPayload,
  BulkActionResult,
  BulkActionResultItem,
  StreamEvent,
  StructuredApiError,
  SyncOperationResult,
  TelegramChannelSyncProgressItem,
  TelegramChannelAccessMode,
} from "@telegram-system/shared";
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

function createCorrelationId() {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

export function getLastCorrelationId() {
  return lastCorrelationId;
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

function extractStructuredApiError(error: unknown): StructuredApiErrorPayload | null {
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
  const code = typeof structured?.code === "string" ? structured.code : undefined;
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

function managedFeedbackConfig(
  feedback?: Omit<ApiFeedbackConfig, "mode">,
): FeedbackAwareConfig {
  return withFeedback({
    feedback: {
      mode: "managed",
      ...feedback,
    },
  });
}

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

export async function streamProgressAction<TResult, TItem = { message?: string }>(
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
      feedback?.operationId || `${Date.now()}-${Math.random().toString(36).slice(2)}`;
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
        message: feedback?.successMessage || successMessage(response.config.method),
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

export type WorkspaceRole = "owner" | "admin" | "MEDIA_BUYER" | "member";
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

export type ApiErrorPayload = StructuredApiError;
export type TelegramPost = {
  id: string;
  telegramChannelId: string;
  telegramMessageId: string;
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
  assignedMemberId: string;
  assignedMember: WorkspaceMember;
  icon?: string | null;
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
  publishMode?: string | null;
  lastError?: string | null;
  assignedMemberId: string;
  icon?: string | null;
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
export type { BulkActionResult, BulkActionResultItem };
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
};
export type Promo = {
  id: string;
  telegramChannelId: string;
  iconId?: string | null;
  icon?: Icon | null;
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
  isMixedAttribution?: boolean;
  assignedMemberId?: string | null;
  assignedMember?: WorkspaceMember | null;
  hypothesisLinks?: AdCampaignHypothesisLink[];
  analytics?: {
    joinedCount: number;
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
export type AdHypothesis = {
  id: string;
  name: string;
  description?: string | null;
  status: AdHypothesisStatus;
  conclusion?: string | null;
  createdAt: string;
  updatedAt: string;
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
export type CreateAdHypothesisPayload = {
  name: string;
  description?: string | null;
  status?: AdHypothesisStatus;
  conclusion?: string | null;
  adCampaignIds: string[];
};
export type UpdateAdHypothesisPayload = {
  name?: string;
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
    spend: number;
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

export const applicationLogsApi = {
  list: async (query: ApplicationLogsQuery = {}) =>
    (
      await api.get<ApplicationLogsListResult>("/application-logs", {
        params: query,
        paramsSerializer: {
          serialize: (params) => {
            const search = new URLSearchParams();
            for (const [key, rawValue] of Object.entries(params)) {
              if (rawValue == null || rawValue === "") continue;
              if (Array.isArray(rawValue)) {
                if (!rawValue.length) continue;
                search.set(key, rawValue.join(","));
                continue;
              }
              search.set(key, String(rawValue));
            }
            return search.toString();
          },
        },
      })
    ).data,
  detail: async (id: string) =>
    (await api.get<ApplicationLog>(`/application-logs/${id}`)).data,
  filterOptions: async () =>
    (await api.get<ApplicationLogsFilterOptions>("/application-logs/filter-options"))
      .data,
  clear: async () =>
    (await api.delete<ApplicationLogsDeleteResult>("/application-logs")).data,
  createClientLog: async (payload: ClientApplicationLogPayload) =>
    (await api.post("/application-logs/client", payload, silentFeedbackConfig)).data,
};

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
    payload: { name?: string; avatarIconId?: string | null },
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
    (
      await api.post<Icon>("/icons/custom", payload, silentFeedbackConfig)
    ).data,
  createTemporaryImage: async (payload: {
    imageUrl: string;
    fileName?: string;
  }) =>
    (
      await api.post<Icon>("/icons/temporary-image", payload, silentFeedbackConfig)
    ).data,
  createEmoji: async (payload: { name: string; emoji: string }) =>
    (
      await api.post<Icon>("/icons/emoji", payload, silentFeedbackConfig)
    ).data,
  remove: async (id: string) =>
    (
      await api.delete<{ success: boolean }>(`/icons/${id}`, silentFeedbackConfig)
    ).data,
};

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
  investments: async (memberId: string) =>
    (await api.get<Transaction[]>(`/workspace-members/${memberId}/investments`))
      .data,
  investmentsSummary: async () =>
    (await api.get("/workspace-members/investments/summary")).data,
};

export const promptNotesApi = {
  list: async (params?: {
    search?: string;
    telegramChannelId?: string;
    postGroupId?: string;
  }) =>
    (
      await api.get<PromptNote[]>("/prompt-notes", {
        params,
      })
    ).data,
  create: async (payload: {
    title: string;
    content: string;
    emoji?: string | null;
    iconId?: string | null;
    assignedMemberId?: string | null;
    telegramChannelId?: string | null;
    telegramChannelIds?: string[];
    postGroupId?: string | null;
  }) =>
    (await api.post<PromptNote>("/prompt-notes", payload)).data,
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
export const accountsApi = quietCrud<Account>("/accounts");
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
  list: async (params?: TransactionQuery) =>
    (await api.get<Transaction[]>("/transactions", { params })).data,
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
  list: async (params?: TransferQuery) =>
    (await api.get<Transfer[]>("/transfers", { params })).data,
};
export const telegramChannelsApi = {
  ...crud<TelegramChannel>("/telegram-channels"),
  updateQuiet: async (id: string, payload: Record<string, unknown>) =>
    (
      await api.patch<TelegramChannel>(
        `/telegram-channels/${id}`,
        payload,
        silentFeedbackConfig,
      )
    ).data,
  import: async (input: string) =>
    (
      await api.post<ImportedTelegramSource>(
        "/telegram-channels/import",
        { input },
        quietMutationConfig,
      )
    ).data,
  importWithProgress: async (
    input: string,
    onProgress: StreamProgressHandler<{ message?: string }>,
  ) =>
    streamProgressAction<ImportedTelegramSource, { message?: string }>(
      "/telegram-channels/import-stream",
      { input },
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
  syncManagedPosts: async (channelId: string) =>
    (
      await api.post<{
        checked: number;
        updated: number;
        publishedEarly: number;
        movedToDraft: number;
        broken: number;
        missing: number;
      }>(
        `/telegram-channels/${channelId}/managed-posts/sync`,
      )
    ).data,
  syncManagedPostsWithProgress: async (
    channelId: string,
    onProgress: BulkProgressHandler,
  ) =>
    streamProgressAction<
      {
        checked: number;
        updated: number;
        publishedEarly: number;
        movedToDraft: number;
        broken: number;
        missing: number;
      },
      BulkActionResultItem
    >(`/telegram-channels/${channelId}/managed-posts/sync-stream`, {}, onProgress),
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
        background
          ? silentFeedbackConfig
          : undefined,
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
        background
          ? silentFeedbackConfig
          : undefined,
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
  postGroups: async (params?: {
    telegramChannelId?: string;
    search?: string;
  }) =>
    (await api.get<PostGroup[]>("/telegram-channels/post-groups", { params }))
      .data,
  postGroup: async (groupId: string) =>
    (await api.get<PostGroup>(`/telegram-channels/post-groups/${groupId}`))
      .data,
  createPostGroup: async (payload: {
    telegramChannelId: string;
    title: string;
    description?: string | null;
    icon?: string | null;
    postIds?: string[];
  }) =>
    (await api.post<PostGroup>("/telegram-channels/post-groups", payload)).data,
  updatePostGroup: async (
    groupId: string,
    payload: {
      title?: string;
      description?: string | null;
      icon?: string | null;
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
        background
          ? silentFeedbackConfig
          : undefined,
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
        background
          ? silentFeedbackConfig
          : undefined,
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
        background
          ? silentFeedbackConfig
          : undefined,
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
            background
              ? silentFeedbackConfig
              : undefined,
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
        background
          ? silentFeedbackConfig
          : undefined,
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
        background
          ? silentFeedbackConfig
          : undefined,
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
  list: async () =>
    (await api.get<TelegramChannelNetwork[]>("/telegram-channel-networks"))
      .data,
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
  importChannels: async (id: string, channelIds: string[]) =>
    (
      await api.post<TelegramUserAccountSyncDialogsResponse>(
        `/telegram-user-accounts/${id}/channels/import`,
        { channelIds },
      )
    ).data,
  importChannelsWithProgress: async (
    id: string,
    channelIds: string[],
    onProgress: StreamProgressHandler<{ message?: string }>,
  ) =>
    streamProgressAction<
      TelegramUserAccountSyncDialogsResponse,
      { message?: string }
    >(`/telegram-user-accounts/${id}/channels/import-stream`, { channelIds }, onProgress),
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
  ...crud<Promo>("/promos"),
  list: async (params?: { telegramChannelId?: string }) =>
    (await api.get<Promo[]>("/promos", { params })).data,
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
  list: async (params?: { telegramChannelId?: string }) =>
    (await api.get<AdCampaign[]>("/ad-campaigns", { params })).data,
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
  list: async () => (await api.get<AdHypothesis[]>("/ad-hypotheses")).data,
  get: async (id: string) =>
    (await api.get<AdHypothesisDetail>(`/ad-hypotheses/${id}`)).data,
  create: async (payload: CreateAdHypothesisPayload) =>
    (await api.post<AdHypothesisDetail>("/ad-hypotheses", payload)).data,
  update: async (id: string, payload: UpdateAdHypothesisPayload) =>
    (await api.patch<AdHypothesisDetail>(`/ad-hypotheses/${id}`, payload)).data,
  remove: async (id: string) =>
    (await api.delete<{ success: boolean }>(`/ad-hypotheses/${id}`)).data,
  summary: async (id: string) =>
    (await api.get<AdHypothesisSummary>(`/ad-hypotheses/${id}/summary`)).data,
};
export const exchangeRatesApi = crud("/exchange-rates");

export async function syncTelegramChannelNow(
  channelId: string,
  payload: TelegramChannelSyncNowPayload = {},
) {
  return (await api.post(`/telegram-channels/${channelId}/sync-now`, payload)).data;
}

export async function syncTelegramChannelNowWithProgress(
  channelId: string,
  onProgress: StreamProgressHandler<TelegramChannelSyncProgressItem>,
  payload: TelegramChannelSyncNowPayload = {},
) {
  return streamProgressAction<
    SyncOperationResult & Record<string, unknown>,
    TelegramChannelSyncProgressItem
  >(
    `/telegram-channels/${channelId}/sync-now-stream`,
    payload,
    onProgress,
  );
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
    await api.get(`/telegram-channels/${channelId}/analytics`, {
      params: { from, to },
    })
  ).data;
}

export async function getTelegramChannelPosts(
  channelId: string,
  limit = 50,
  offset = 0,
) {
  return (
    await api.get<{
      items: TelegramPostAnalyticsItem[];
      total: number;
      limit: number;
      offset: number;
    }>(`/telegram-channels/${channelId}/posts`, { params: { limit, offset } })
  ).data;
}

export async function getTelegramChannelInviteLinks(channelId: string) {
  return (
    await api.get<TelegramInviteLink[]>(
      `/telegram-channels/${channelId}/invite-links`,
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

export async function getDashboardSummary(params?: {
  dateFrom?: string;
  dateTo?: string;
}) {
  return (await api.get<DashboardSummary>("/dashboard/summary", { params }))
    .data;
}
