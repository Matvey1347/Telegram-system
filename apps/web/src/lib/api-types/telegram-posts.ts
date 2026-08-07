import type { Icon, WorkspaceMember } from "./core";
import type { TelegramChannel } from "./telegram-channels";

export type TelegramPost = {
  id: string;
  telegramChannelId: string;
  telegramMessageId: string;
  primaryTelegramMessageUrl?: string | null;
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
  origin: "SYSTEM" | "TELEGRAM";
  assignedMemberId: string;
  assignedMember: WorkspaceMember;
  icon?: string | null;
  iconData?: Icon | null;
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
  sourceWasPremium?: boolean | null;
  captionLengthMaxUsed?: number | null;
  messageLengthMaxUsed?: number | null;
  publishMode?: string | null;
  lastError?: string | null;
  createdAt: string;
  updatedAt: string;
};
export type TelegramManagedPostsImportRow = {
  title?: unknown;
  text?: unknown;
  icon?: unknown;
  emoji?: unknown;
  iconText?: unknown;
  imageUrl?: unknown;
  imageUrls?: unknown;
  groupPosition?: unknown;
  order?: unknown;
};
export type TelegramManagedPostsImportPayload = {
  postGroupId?: string | null;
  assignedMemberId?: string;
  rows: TelegramManagedPostsImportRow[];
};
export type TelegramManagedPostsImportResultRow =
  | {
      index: number;
      status: "skipped";
      error: string;
    }
  | {
      index: number;
      status: "created";
      post: TelegramManagedPost;
    };
export type TelegramManagedPostsImportResult = {
  createdCount: number;
  skippedCount: number;
  rows: TelegramManagedPostsImportResultRow[];
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
  sourceWasPremium?: boolean | null;
  captionLengthMaxUsed?: number | null;
  messageLengthMaxUsed?: number | null;
  publishMode?: string | null;
  lastError?: string | null;
  assignedMemberId: string;
  icon?: string | null;
  iconData?: Icon | null;
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
  iconData?: Icon | null;
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
  iconData?: Icon | null;
  isSystem?: boolean;
  systemKey?: string | null;
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
  primaryTelegramMessageUrl?: string | null;
};
