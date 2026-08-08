import type { AxiosInstance, AxiosRequestConfig } from "axios";
import type {
  BulkActionResult,
  BulkActionResultItem,
  ManagedPostsSyncResult,
  PaginatedResponse,
  ScheduleManagedPostsBatchPayload,
  TelegramChannelSyncProgressItem,
  TelegramManagedPostCalendarResult,
  TelegramPostPlannerApplyResult,
  TelegramPostPlannerFormat,
  TelegramPostPlannerPreviewResult,
  TelegramPostPlannerSlot,
  TelegramPublishingCapabilities,
  SyncOperationResult,
} from "@telegram-system/shared";
import type {
  ImportedTelegramSource,
  PaginationParams,
  PostGroup,
  TelegramAnalyticsSources,
  TelegramChannel,
  TelegramChannelAdAnalysis,
  TelegramChannelAdAnalysisPayload,
  TelegramChannelAudience,
  TelegramChannelAudienceSnapshot,
  TelegramChannelFinancialSummary,
  TelegramChannelImportPayload,
  TelegramChannelSelectOption,
  TelegramChannelSourceAccess,
  TelegramInviteLink,
  TelegramInviteLinkHistory,
  TelegramManagedPost,
  TelegramManagedPostLinkTarget,
  TelegramManagedPostsImportPayload,
  TelegramManagedPostsImportProgressItem,
  TelegramManagedPostsImportResult,
  TelegramManagedPostRevision,
  TelegramPost,
  TelegramPostAnalyticsItem,
  Promo,
  TelegramChannelAnalyticsResponse,
  TelegramChannelSyncNowPayload,
} from "./api-types";

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

type PaginatedGetter = <T>(
  path: string,
  params?: Record<string, unknown>,
) => Promise<PaginatedResponse<T>>;
type AllPaginatedGetter = <T>(path: string, params?: Record<string, unknown>) => Promise<T[]>;
type CrudFactory = <T>(path: string) => {
  list: () => Promise<T[]>;
  get: (id: string) => Promise<T>;
  create: (payload: Record<string, unknown>) => Promise<T>;
  update: (id: string, payload: Record<string, unknown>) => Promise<T>;
  remove: (id: string) => Promise<T>;
};

export function createTelegramChannelsApi({
  api,
  crud,
  getPaginated,
  getAllPaginatedItems,
  hasExplicitPagination,
  streamBulkAction,
  streamProgressAction,
  silentFeedbackConfig,
  quietMutationConfig,
}: {
  api: AxiosInstance;
  crud: CrudFactory;
  getPaginated: PaginatedGetter;
  getAllPaginatedItems: AllPaginatedGetter;
  hasExplicitPagination: (params?: Record<string, unknown>) => boolean;
  streamBulkAction: (path: string, payload: unknown, onProgress: BulkProgressHandler) => Promise<BulkActionResult>;
  streamProgressAction: <TResult, TItem = BulkActionResultItem>(path: string, payload: unknown, onProgress: StreamProgressHandler<TItem>) => Promise<TResult>;
  silentFeedbackConfig: AxiosRequestConfig;
  quietMutationConfig: AxiosRequestConfig;
}) {
const telegramChannelsApi = {
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
        silentFeedbackConfig,
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
        silentFeedbackConfig,
      )
    ).data,
  deletePostPlannerFormat: async (channelId: string, formatId: string) =>
    (
      await api.delete<TelegramPostPlannerFormat>(
        `/telegram-channels/${channelId}/managed-posts/calendar-planner/formats/${formatId}`,
        silentFeedbackConfig,
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
        silentFeedbackConfig,
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
        silentFeedbackConfig,
      )
    ).data,
  deletePostPlannerSlot: async (channelId: string, slotId: string) =>
    (
      await api.delete<TelegramPostPlannerSlot>(
        `/telegram-channels/${channelId}/managed-posts/calendar-planner/slots/${slotId}`,
        silentFeedbackConfig,
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
  importManagedPostsWithProgress: async (
    channelId: string,
    payload: TelegramManagedPostsImportPayload,
    onProgress: StreamProgressHandler<TelegramManagedPostsImportProgressItem>,
  ) =>
    streamProgressAction<
      TelegramManagedPostsImportResult,
      TelegramManagedPostsImportProgressItem
    >(
      `/telegram-channels/${channelId}/managed-posts/import-stream`,
      payload,
      onProgress,
    ),
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
  deleteManagedPosts: async (
    channelId: string,
    postIds: string[],
    onProgress?: BulkProgressHandler,
  ) =>
    onProgress
      ? streamBulkAction(
          `/telegram-channels/${channelId}/managed-posts/delete-batch-stream`,
          { postIds },
          onProgress,
        )
      : (
          await api.post<BulkActionResult>(
            `/telegram-channels/${channelId}/managed-posts/delete-batch`,
            { postIds },
            silentFeedbackConfig,
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
  return telegramChannelsApi;
}
