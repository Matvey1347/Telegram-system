"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import {
  useMutation,
  useQueries,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import {
  AlertTriangle,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Copy,
  Clock3,
  Download,
  ExternalLink,
  FileText,
  FolderPlus,
  GripVertical,
  Layers3,
  ListPlus,
  LoaderCircle,
  MoveRight,
  Pencil,
  Plus,
  RefreshCw,
  RotateCcw,
  Rocket,
  Trash2,
  X,
} from "lucide-react";
import { IconAvatar } from "@/components/icons/icon-avatar";
import { IconPicker } from "@/components/icons/icon-picker";
import { AppShell } from "@/components/layout/app-shell";
import { TelegramImageUpload } from "@/components/telegram/telegram-image-upload";
import { TelegramTextEditor } from "@/components/telegram/telegram-text-editor";
import { TelegramPostPreview } from "@/components/telegram/telegram-post-preview";
import { MemberBadge } from "@/components/workspace/member-badge";
import { MemberSelect } from "@/components/workspace/member-select";
import {
  iconsApi,
  promptNotesApi,
  telegramChannelsApi,
  workspaceMembersApi,
  type BulkActionResult,
  type BulkActionResultItem,
  type PostGroup,
  type PromptNote,
  type TelegramChannel,
  type TelegramManagedPost,
  type TelegramManagedPostRevision,
  type TelegramChannelTimePost,
} from "@/lib/api";
import {
  Button,
  Card,
  ConfirmDeleteModal,
  CustomSelect,
  DateInput,
  EmptyState,
  FormField,
  Input,
  LoadingState,
  Modal,
  PageHeader,
  Textarea,
  TimeInput,
  TooltipBubble,
  isValidTimeInputValue,
} from "@/components/ui/primitives";
import { useAppToast } from "@/providers/toast-provider";

type PublishingMode = "draft" | "publish" | "schedule";
type LongTextMode = "IMAGES_THEN_TEXT" | "CAPTION_THEN_TEXT";
type PostStatusTab = "PUBLISHED" | "SCHEDULED" | "DRAFT";
type PendingPostSave = {
  id: string;
  title: string;
  icon?: string | null;
  groupId?: string | null;
  mode: PublishingMode;
};
type PostSidebarSection = {
  key: string;
  group: PostGroup | null;
  posts: TelegramManagedPost[];
  pendingPosts: PendingPostSave[];
};
const TELEGRAM_TEXT_MESSAGE_LIMIT = 4096;
const POST_OPEN_CLICK_DELAY_MS = 180;
const lastSelectedTelegramPostsChannelKey =
  "telegram-posts:last-selected-channel";

const postGroupPreferenceKey = (channelId: string) =>
  `telegram-posts-new-post-group:${channelId}`;
const workspaceViewPreferenceKey = (channelId: string) =>
  `telegram-posts-workspace-view:${channelId}`;

function localNowParts() {
  const now = new Date();
  return localDateTimeParts(now);
}

function localDateTimeParts(value: string | Date) {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) {
    return {
      date: "",
      time: "",
    };
  }
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  const hours = String(date.getHours()).padStart(2, "0");
  const minutes = String(date.getMinutes()).padStart(2, "0");
  return {
    date: `${year}-${month}-${day}`,
    time: `${hours}:${minutes}`,
  };
}

function formatManagedPostRevisionReason(reason: string) {
  switch (reason) {
    case "before_update":
      return "Before edit";
    case "before_publish":
      return "Before publish";
    case "before_schedule":
      return "Before schedule";
    case "before_manual_link":
      return "Before manual link";
    case "before_sync_missing":
      return "Before sync: missing in Telegram";
    case "before_sync_broken":
      return "Before sync: broken Telegram post";
    case "before_sync_publish_transition":
      return "Before sync: published early";
    case "before_sync_update":
      return "Before sync update";
    case "before_restore":
      return "Before restore";
    case "before_delete":
      return "Before delete";
    default:
      return reason.replaceAll("_", " ");
  }
}

function scheduleDateForPreset(time: string) {
  const now = new Date();
  const [hours, minutes] = time.split(":").map((value) => Number(value));
  const candidate = new Date(now);
  candidate.setHours(hours, minutes, 0, 0);
  if (candidate.getTime() < now.getTime()) {
    candidate.setDate(candidate.getDate() + 1);
  }
  return localDateTimeParts(candidate).date;
}

export default function TelegramPostsPage() {
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  const queryClient = useQueryClient();
  const { pushToast, setProgress, clearProgress } = useAppToast();
  const [newPostToken, setNewPostToken] = useState(0);
  const channelId = searchParams.get("channelId") || "";
  const postId = searchParams.get("postId") || "";
  const groupId = searchParams.get("groupId") || "";
  const noteId = searchParams.get("noteId") || "";
  const channels = useQuery({
    queryKey: ["telegram-channels"],
    queryFn: () => telegramChannelsApi.list(),
  });
  const availableChannels = (channels.data || []).filter(
    (channel) => channel.preview?.canPostMessages,
  );
  const channel =
    availableChannels.find((item) => item.id === channelId) ||
    availableChannels[0];
  const syncManagedPosts = useMutation<{
    checked: number;
    updated: number;
    publishedEarly: number;
    movedToDraft: number;
    broken: number;
    missing: number;
  }>({
    mutationFn: async (): Promise<{
      checked: number;
      updated: number;
      publishedEarly: number;
      movedToDraft: number;
      broken: number;
      missing: number;
    }> => {
      const currentChannel = channel!;
      const progressId = `managed-posts-sync:${currentChannel.id}`;
      setProgress({
        id: progressId,
        title: "Sync posts from Telegram",
        current: 0,
        total: 0,
        message: "Starting post sync…",
        iconUrl: currentChannel.photoUrl || undefined,
      });
      try {
        const result = await telegramChannelsApi.syncManagedPostsWithProgress(
          currentChannel.id,
          (item, current, total) => {
            setProgress({
              id: progressId,
              title: "Sync posts from Telegram",
              current,
              total,
              message: item.message || "Syncing posts from Telegram…",
              iconUrl: currentChannel.photoUrl || undefined,
            });
          },
        );
        const failedCount =
          (result.broken || 0) +
          (result.movedToDraft || 0) +
          (result.missing || 0);
        const successCount = Math.max(0, (result.checked || 0) - failedCount);
        setProgress({
          id: progressId,
          title: "Sync posts from Telegram",
          current: result.checked || 0,
          total: result.checked || 0,
          message: "Post sync completed",
          completed: true,
          successCount,
          failedCount,
          skippedCount: 0,
          iconUrl: currentChannel.photoUrl || undefined,
        });
        window.setTimeout(() => clearProgress(progressId), 2800);
        return result;
      } catch (error) {
        clearProgress(progressId);
        throw error;
      }
    },
    onSuccess: async (result) => {
      await Promise.all([
        queryClient.invalidateQueries({
          queryKey: ["telegram-managed-posts", channel?.id],
        }),
        queryClient.invalidateQueries({
          queryKey: ["post-groups", channel?.id],
        }),
        queryClient.invalidateQueries({
          queryKey: ["telegram-managed-post-link-targets", channel?.id],
        }),
      ]);
    },
  });
  useEffect(() => {
    if (typeof window === "undefined" || !availableChannels.length) return;
    const params = new URLSearchParams(searchParams.toString());
    const savedChannelId = window.localStorage.getItem(
      lastSelectedTelegramPostsChannelKey,
    );
    const savedChannelStillAvailable = savedChannelId
      ? availableChannels.some((item) => item.id === savedChannelId)
      : false;

    if (channelId) {
      const requestedChannelStillAvailable = availableChannels.some(
        (item) => item.id === channelId,
      );
      if (requestedChannelStillAvailable) {
        window.localStorage.setItem(
          lastSelectedTelegramPostsChannelKey,
          channelId,
        );
        return;
      }

      const fallbackChannelId = savedChannelStillAvailable
        ? savedChannelId
        : availableChannels[0]?.id;
      if (!fallbackChannelId) return;
      params.set("channelId", fallbackChannelId);
      params.delete("postId");
      router.replace(`${pathname}?${params.toString()}`);
      return;
    }

    const fallbackChannelId = savedChannelStillAvailable
      ? savedChannelId
      : availableChannels[0]?.id;
    if (!fallbackChannelId) return;
    params.set("channelId", fallbackChannelId);
    router.replace(`${pathname}?${params.toString()}`);
  }, [availableChannels, channelId, pathname, router, searchParams]);

  const navigateToChannel = (nextChannelId: string) => {
    if (typeof window !== "undefined") {
      window.localStorage.setItem(
        lastSelectedTelegramPostsChannelKey,
        nextChannelId,
      );
    }
    const params = new URLSearchParams(searchParams.toString());
    params.set("channelId", nextChannelId);
    params.delete("postId");
    router.push(`${pathname}?${params.toString()}`);
  };

  return (
    <AppShell>
      <PageHeader
        title="Telegram posts"
        subtitle="Create drafts, publish now, or schedule directly in Telegram"
        action={
          channel ? (
            <div className="flex w-full flex-col gap-2 sm:min-w-[620px] sm:flex-row">
              <div className="min-w-0 flex-1">
                <CustomSelect
                  value={channel.id}
                  onChange={navigateToChannel}
                  options={availableChannels.map((item) => ({
                    value: item.id,
                    label: item.title,
                    iconUrl: item.photoUrl || undefined,
                    iconFallback: item.title,
                  }))}
                />
              </div>
              <Button
                variant="secondary"
                className="shrink-0"
                disabled={syncManagedPosts.isPending}
                onClick={() => syncManagedPosts.mutate()}
                title="Sync posts from Telegram"
              >
                <span className="inline-flex items-center gap-2">
                  <RefreshCw
                    size={15}
                    className={syncManagedPosts.isPending ? "animate-spin" : ""}
                  />
                  Sync posts from Telegram
                </span>
              </Button>
              <Button
                className="shrink-0"
                onClick={() => {
                  router.replace(`/telegram-posts?channelId=${channel.id}`);
                  setNewPostToken((value) => value + 1);
                }}
              >
                <span className="inline-flex items-center gap-2">
                  <Plus size={15} />
                  New post
                </span>
              </Button>
            </div>
          ) : undefined
        }
      />
      {channels.isLoading ? <LoadingState /> : null}
      {!channels.isLoading && !channels.error && !availableChannels.length ? (
        <EmptyState text="No Telegram channels with publishing access" />
      ) : null}
      {channel ? (
        <div>
          <TelegramPostWorkspace
            key={channel.id}
            channelId={channel.id}
            channelTitle={channel.title}
            channelPhotoUrl={channel.photoUrl}
            channelUsername={channel.username}
            channelTelegramChatId={channel.telegramChatId}
            channelTimePosts={channel.timePosts || []}
            newPostToken={newPostToken}
            initialPostId={postId}
            initialGroupId={groupId}
            initialNoteId={noteId}
            channels={availableChannels}
            onPostSelect={(selectedPostId) => {
              router.replace(
                selectedPostId
                  ? `/telegram-posts?channelId=${channel.id}&postId=${selectedPostId}`
                  : `/telegram-posts?channelId=${channel.id}`,
              );
            }}
          />
        </div>
      ) : null}
    </AppShell>
  );
}

function TelegramPostWorkspace({
  channelId,
  channelTitle,
  channelPhotoUrl,
  channelUsername,
  channelTelegramChatId,
  channelTimePosts,
  newPostToken,
  initialPostId,
  initialGroupId,
  initialNoteId,
  channels,
  onPostSelect,
}: {
  channelId: string;
  channelTitle: string;
  channelPhotoUrl?: string | null;
  channelUsername?: string | null;
  channelTelegramChatId?: string | null;
  channelTimePosts: TelegramChannelTimePost[];
  newPostToken: number;
  initialPostId: string;
  initialGroupId: string;
  initialNoteId: string;
  channels: TelegramChannel[];
  onPostSelect: (postId: string | null) => void;
}) {
  const restoredPostIdRef = useRef("");
  const queryClient = useQueryClient();
  const { pushToast } = useAppToast();
  const [workspaceView, setWorkspaceView] = useState<"posts" | "groups">(
    () => {
      if (typeof window === "undefined") return "posts";
      if (initialGroupId) return "groups";
      return window.localStorage.getItem(workspaceViewPreferenceKey(channelId)) ===
        "groups"
        ? "groups"
        : "posts";
    },
  );
  const [editing, setEditing] = useState<TelegramManagedPost | null>(null);
  const [title, setTitle] = useState("");
  const [assignedMemberId, setAssignedMemberId] = useState<string | null>(null);
  const [memberSelectionTouched, setMemberSelectionTouched] = useState(false);
  const [text, setText] = useState("");
  const [imageUrls, setImageUrls] = useState<string[]>([]);
  const [icon, setIcon] = useState<string | null>(null);
  const iconRef = useRef<string | null>(null);
  const [iconPickerGeneration, setIconPickerGeneration] = useState(0);
  const [iconPending, setIconPending] = useState(false);
  const [rememberedPostGroupId, setRememberedPostGroupId] = useState<
    string | null
  >(() => {
    if (typeof window === "undefined") return null;
    return window.localStorage.getItem(postGroupPreferenceKey(channelId));
  });
  const [postGroupId, setPostGroupId] = useState<string | null>(null);
  const [mode, setMode] = useState<PublishingMode>("draft");
  const [scheduleDate, setScheduleDate] = useState(() => localNowParts().date);
  const [scheduleTime, setScheduleTime] = useState(() => localNowParts().time);
  const [longTextMode, setLongTextMode] =
    useState<LongTextMode>("IMAGES_THEN_TEXT");
  const [statusTab, setStatusTab] = useState<PostStatusTab>("DRAFT");
  const [busy, setBusy] = useState(false);
  const [uploadingImages, setUploadingImages] = useState(false);
  const [error, setError] = useState("");
  const [manualTelegramUrl, setManualTelegramUrl] = useState("");
  const [savingTelegramUrl, setSavingTelegramUrl] = useState(false);
  const [telegramLinkModalOpen, setTelegramLinkModalOpen] = useState(false);
  const [selectedPostIds, setSelectedPostIds] = useState<string[]>([]);
  const [usageModalOpen, setUsageModalOpen] = useState(false);
  const [historyExpanded, setHistoryExpanded] = useState(false);
  const [highlightedInternalLinkTargetId, setHighlightedInternalLinkTargetId] =
    useState<string | null>(null);
  const [highlightRequestKey, setHighlightRequestKey] = useState(0);
  const [collapsedGroupIdsPreference, setCollapsedGroupIdsPreference] =
    useState<string[] | null>(null);
  const [draggedSidebarKey, setDraggedSidebarKey] = useState<string | null>(
    null,
  );
  const [sidebarOrderKeys, setSidebarOrderKeys] = useState<string[]>([]);
  const sidebarReorderTimerRef = useRef<number | null>(null);
  const sidebarReorderVersionRef = useRef(0);
  const sidebarReorderQueueRef = useRef<Promise<void>>(Promise.resolve());
  const postOpenTimerRef = useRef<number | null>(null);
  const telegramLinkClickTimerRef = useRef<number | null>(null);
  const [bulkDeleteOpen, setBulkDeleteOpen] = useState(false);
  const [deletingPost, setDeletingPost] = useState<TelegramManagedPost | null>(
    null,
  );
  const [movingPost, setMovingPost] = useState<TelegramManagedPost | null>(
    null,
  );
  const [restorePreviewRevision, setRestorePreviewRevision] =
    useState<TelegramManagedPostRevision | null>(null);
  const [restoreConfirmationValue, setRestoreConfirmationValue] = useState("");
  const [pendingPostSaves, setPendingPostSaves] = useState<PendingPostSave[]>(
    [],
  );
  const [creatingPostId, setCreatingPostId] = useState<string | null>(null);
  const creatingPostIdRef = useRef<string | null>(null);
  const [savingPostIds, setSavingPostIds] = useState<string[]>([]);
  const posts = useQuery({
    queryKey: ["telegram-managed-posts", channelId],
    queryFn: () => telegramChannelsApi.managedPosts(channelId),
  });
  const postHistory = useQuery({
    queryKey: ["telegram-managed-post-history", channelId, editing?.id],
    queryFn: () =>
      telegramChannelsApi.managedPostHistory(channelId, editing?.id as string),
    enabled: Boolean(editing?.id),
  });
  const postGroups = useQuery({
    queryKey: ["post-groups", channelId],
    queryFn: () =>
      telegramChannelsApi.postGroups({ telegramChannelId: channelId }),
  });
  const promptNotes = useQuery({
    queryKey: ["prompt-notes", { telegramChannelId: channelId }],
    queryFn: () => promptNotesApi.list({ telegramChannelId: channelId }),
  });
  const groupIconIds = useMemo(
    () => [
      ...new Set(
        (postGroups.data || [])
          .map((group) => group.icon)
          .filter((iconId): iconId is string => Boolean(iconId)),
      ),
    ],
    [postGroups.data],
  );
  const groupIconQueries = useQueries({
    queries: groupIconIds.map((iconId) => ({
      queryKey: ["icon", iconId],
      queryFn: () => iconsApi.get(iconId),
    })),
  });
  const iconsById = useMemo(
    () =>
      new Map(
        groupIconQueries
          .map((query) => query.data)
          .filter((item) => Boolean(item))
          .map((item) => [item!.id, item!]),
      ),
    [groupIconQueries],
  );
  const members = useQuery({
    queryKey: ["workspace-members"],
    queryFn: workspaceMembersApi.list,
  });

  useEffect(() => {
    void queryClient.invalidateQueries({
      queryKey: ["telegram-managed-post-link-targets", channelId],
    });
  }, [channelId, postGroups.data, posts.data, queryClient]);

  useEffect(
    () => () => {
      if (postOpenTimerRef.current) {
        window.clearTimeout(postOpenTimerRef.current);
      }
    },
    [],
  );

  const rememberPostGroup = (nextGroupId: string | null) => {
    setRememberedPostGroupId(nextGroupId);
    if (nextGroupId) {
      window.localStorage.setItem(
        postGroupPreferenceKey(channelId),
        nextGroupId,
      );
    } else {
      window.localStorage.removeItem(postGroupPreferenceKey(channelId));
    }
  };

  const currentMemberId =
    members.data?.find((member) => member.isCurrentUser)?.id ?? null;
  const effectivePostMember = (post: TelegramManagedPost) =>
    post.assignedMember ?? null;
  const effectivePostMemberId = (post: TelegramManagedPost) =>
    effectivePostMember(post)?.id ?? post.assignedMemberId ?? null;
  const isPublished = editing?.status === "PUBLISHED";
  const hasLockedTelegramMedia =
    editing?.status === "PUBLISHED" || editing?.status === "SCHEDULED";
  const telegramPostUrl = (() => {
    if (!editing || !["PUBLISHED", "SCHEDULED"].includes(editing.status)) {
      return null;
    }
    const primaryMessageIndex =
      editing.imageUrls.length > 1
        ? Math.min(editing.imageUrls.length - 1, editing.telegramMessageIds.length - 1)
        : 0;
    const messageId = editing.telegramMessageIds[primaryMessageIndex];
    if (!messageId) return null;
    const chatId = channelTelegramChatId
      ?.trim()
      .replace(/^-100/, "")
      .replace(/^-/, "");
    return chatId ? `https://t.me/c/${chatId}/${messageId}` : null;
  })();
  const displayedError = error || editing?.lastError || "";
  const canManageTelegramLink = Boolean(
    editing &&
      (editing.status === "SCHEDULED" ||
        editing.status === "PUBLISHED" ||
        editing.status === "FAILED" ||
        ["BROKEN", "MISSING"].includes(editing.telegramRemoteStatus) ||
        /link is broken|Telegram link manually/i.test(displayedError)),
  );
  const telegramLinkBroken = Boolean(
    editing && ["BROKEN", "MISSING"].includes(editing.telegramRemoteStatus),
  );
  const outgoingInternalLinks = useMemo(() => {
    const grouped = new Map<
      string,
      {
        targetId: string;
        labels: string[];
        target?: TelegramManagedPost;
      }
    >();
    for (const match of text.matchAll(
      /\[([^\]\n]+)\]\(tg-post:([a-zA-Z0-9_-]+)\)/g,
    )) {
      const label = match[1]?.trim() || match[2];
      const targetId = match[2];
      const existing = grouped.get(targetId);
      if (existing) {
        if (!existing.labels.includes(label)) existing.labels.push(label);
        continue;
      }
      grouped.set(targetId, {
        targetId,
        labels: [label],
        target: posts.data?.find((post) => post.id === targetId),
      });
    }
    return [...grouped.values()];
  }, [posts.data, text]);
  const internalLinkTargetIds = useMemo(
    () => outgoingInternalLinks.map((link) => link.targetId),
    [outgoingInternalLinks],
  );
  const incomingInternalLinkPosts = useMemo(() => {
    if (!editing) return [];
    return (posts.data || []).filter((post) => {
      if (post.id === editing.id) return false;
      const linkedIds = [
        ...new Set(
          [...(post.text || "").matchAll(/\[[^\]\n]+\]\(tg-post:([a-zA-Z0-9_-]+)\)/g)].map(
            (match) => match[1],
          ),
        ),
      ];
      return linkedIds.includes(editing.id);
    });
  }, [editing, posts.data]);
  const unresolvedInternalLinkTargets = internalLinkTargetIds.map(
    (targetId) => {
      const target = posts.data?.find((post) => post.id === targetId);
      const ready =
        target?.status === "PUBLISHED" &&
        target.telegramRemoteStatus === "PUBLISHED" &&
        target.telegramMessageIds.length > 0 &&
        Boolean(channelTelegramChatId) &&
        !target.lastError;
      return ready ? null : { id: targetId, post: target };
    },
  ).filter(
    (
      target,
    ): target is {
      id: string;
      post: TelegramManagedPost | undefined;
    } => Boolean(target),
  );
  const resolvedInternalLinkTargets = outgoingInternalLinks.filter((link) => {
    const target = link.target;
    return Boolean(
      target &&
        target.status === "PUBLISHED" &&
        target.telegramRemoteStatus === "PUBLISHED" &&
        target.telegramMessageIds.length > 0 &&
        channelTelegramChatId &&
        !target.lastError,
    );
  });
  const dependencyAlertTitle = unresolvedInternalLinkTargets.length
    ? `To publish this post, publish or attach links for these linked posts first: ${unresolvedInternalLinkTargets
        .map((target) => target.post?.title || target.id)
        .join(", ")}.`
    : "";
  const dependencyPublishBlocked =
    mode !== "draft" && unresolvedInternalLinkTargets.length > 0;
  const hasValidScheduleTime = isValidTimeInputValue(scheduleTime);
  const selectedTimePostId =
    channelTimePosts.find((timePost) => timePost.time === scheduleTime)?.id ||
    null;
  const internalLinkScheduledAt =
    mode === "schedule" && scheduleDate && hasValidScheduleTime
      ? new Date(`${scheduleDate}T${scheduleTime}`).toISOString()
      : undefined;
  const editingIsSaving = Boolean(
    editing && savingPostIds.includes(editing.id),
  );
  const editorIsSaving = editingIsSaving || Boolean(creatingPostId);
  const hasLongImageText = imageUrls.length > 0 && text.length > 1024;
  const publishedLongImageTextMode =
    isPublished && hasLongImageText
      ? editing?.publishMode === "CAPTION_THEN_TEXT"
        ? "CAPTION_THEN_TEXT"
        : "IMAGES_THEN_TEXT"
      : null;
  const hasLongTextOnly =
    imageUrls.length === 0 && text.length > TELEGRAM_TEXT_MESSAGE_LIMIT;
  const publishDisabledReason = busy
    ? "Saving or publishing is already in progress."
    : creatingPostId
      ? "This post is being saved."
      : iconPending
        ? "Wait until the selected icon is ready."
        : uploadingImages
          ? "Wait until image upload finishes."
          : !title.trim()
            ? "Internal title is required."
            : mode !== "draft" && !text.trim() && !imageUrls.length
              ? "Add Telegram text or at least one image before publishing."
              : mode === "schedule" && (!scheduleDate || !scheduleTime)
                ? "Publish date and time are required."
                : mode === "schedule" && !hasValidScheduleTime
                  ? "Enter publish time in HH:MM format."
                : "";
  const visiblePosts = (posts.data || []).filter(
    (post) =>
      savingPostIds.includes(post.id) ||
      (statusTab === "DRAFT"
        ? ["DRAFT", "FAILED", "PUBLISHING"].includes(post.status)
        : post.status === statusTab),
  );
  const groupedVisiblePosts = useMemo(() => {
    const grouped = new Map<
      string,
      { group: PostGroup; posts: TelegramManagedPost[] }
    >();
    const ungrouped: TelegramManagedPost[] = [];

    visiblePosts.forEach((post) => {
      if (!post.groupId || !post.group) {
        ungrouped.push(post);
        return;
      }
      const section = grouped.get(post.groupId);
      if (section) section.posts.push(post);
      else grouped.set(post.groupId, { group: post.group, posts: [post] });
    });

    return {
      groups: [...grouped.values()].map((section) => ({
        ...section,
        posts: [...section.posts].sort((left, right) => {
          const leftPosition = left.groupPosition ?? Number.MAX_SAFE_INTEGER;
          const rightPosition = right.groupPosition ?? Number.MAX_SAFE_INTEGER;
          if (leftPosition !== rightPosition) {
            return leftPosition - rightPosition;
          }
          return (
            new Date(left.createdAt).getTime() -
            new Date(right.createdAt).getTime()
          );
        }),
      })),
      ungrouped,
    };
  }, [visiblePosts]);
  const groupedPendingPostSaves = useMemo(() => {
    const grouped = new Map<string, PendingPostSave[]>();
    const ungrouped: PendingPostSave[] = [];

    pendingPostSaves.forEach((post) => {
      if (!post.groupId) {
        ungrouped.push(post);
        return;
      }
      grouped.set(post.groupId, [...(grouped.get(post.groupId) ?? []), post]);
    });

    return { grouped, ungrouped };
  }, [pendingPostSaves]);
  const canonicalSidebarKeys = useMemo(
    () =>
      [
        ...(postGroups.data || []).map((group, index) => ({
          key: `group:${group.id}`,
          position: group.sidebarPosition,
          fallback: index,
        })),
        ...(posts.data || [])
          .filter((post) => !post.groupId)
          .map((post, index) => ({
            key: `post:${post.id}`,
            position: post.sidebarPosition,
            fallback: (postGroups.data?.length || 0) + index,
          })),
      ]
        .sort(
          (left, right) =>
            (left.position ?? Number.MAX_SAFE_INTEGER) -
              (right.position ?? Number.MAX_SAFE_INTEGER) ||
            left.fallback - right.fallback,
        )
        .map((item) => item.key),
    [postGroups.data, posts.data],
  );
  const sidebarSections = useMemo<PostSidebarSection[]>(() => {
    const groupsById = new Map(
      (postGroups.data || []).map((group) => [group.id, group]),
    );
    const visibleGroupsById = new Map(
      groupedVisiblePosts.groups.map((section) => [section.group.id, section]),
    );
    const groupIds = [
      ...new Set([
        ...groupedVisiblePosts.groups.map((section) => section.group.id),
        ...groupedPendingPostSaves.grouped.keys(),
      ]),
    ];
    const groupSections: PostSidebarSection[] = groupIds.flatMap((groupId) => {
      const visibleGroup = visibleGroupsById.get(groupId);
      const group = visibleGroup?.group ?? groupsById.get(groupId);
      if (!group) return [];
      return [
        {
          key: `group:${group.id}`,
          group,
          posts: visibleGroup?.posts ?? [],
          pendingPosts: groupedPendingPostSaves.grouped.get(group.id) ?? [],
        },
      ];
    });
    const sections: PostSidebarSection[] = [
      ...groupSections,
      ...groupedVisiblePosts.ungrouped.map((post) => ({
        key: `post:${post.id}`,
        group: null,
        posts: [post],
        pendingPosts: [],
      })),
    ];
    const canonicalIndex = new Map(
      canonicalSidebarKeys.map((key, index) => [key, index]),
    );
    return sections.sort(
      (left, right) =>
        (canonicalIndex.get(left.key) ?? Number.MAX_SAFE_INTEGER) -
        (canonicalIndex.get(right.key) ?? Number.MAX_SAFE_INTEGER),
    );
  }, [
    canonicalSidebarKeys,
    groupedPendingPostSaves.grouped,
    groupedVisiblePosts,
    postGroups.data,
  ]);
  const orderedSidebarSections = useMemo(() => {
    if (
      sidebarOrderKeys.length !== sidebarSections.length ||
      sidebarOrderKeys.some(
        (key) => !sidebarSections.some((section) => section.key === key),
      )
    ) {
      return sidebarSections;
    }
    const byKey = new Map(
      sidebarSections.map((section) => [section.key, section]),
    );
    return sidebarOrderKeys
      .map((key) => byKey.get(key))
      .filter((section): section is PostSidebarSection => Boolean(section));
  }, [sidebarOrderKeys, sidebarSections]);
  const channelPostIds = (posts.data || []).map((post) => post.id);
  const selectedPosts = selectedPostIds
    .map((id) => posts.data?.find((post) => post.id === id))
    .filter((post): post is TelegramManagedPost => Boolean(post));
  const allChannelPostsSelected =
    channelPostIds.length > 0 &&
    channelPostIds.every((id) => selectedPostIds.includes(id));
  const allGroupIds = (postGroups.data || []).map((group) => group.id);
  const collapsedGroupIds = collapsedGroupIdsPreference ?? allGroupIds;

  const changeStatusTab = (next: PostStatusTab) => {
    setStatusTab(next);
    window.localStorage.setItem(`telegram-posts-status:${channelId}`, next);
  };

  const changeWorkspaceView = (next: "posts" | "groups") => {
    setWorkspaceView(next);
    window.localStorage.setItem(workspaceViewPreferenceKey(channelId), next);
  };

  const toggleGroupCollapsed = (groupId: string) => {
    setCollapsedGroupIdsPreference((current) => {
      const base = current ?? allGroupIds;
      const next = base.includes(groupId)
        ? base.filter((id) => id !== groupId)
        : [...base, groupId];
      window.localStorage.setItem(
        `telegram-posts-collapsed-groups:${channelId}`,
        JSON.stringify(next),
      );
      return next;
    });
  };

  const scheduleSidebarOrderSave = (visibleOrder: string[]) => {
    const visibleKeys = new Set(visibleOrder);
    let visibleIndex = 0;
    const completeOrder = canonicalSidebarKeys.map((key) =>
      visibleKeys.has(key) ? visibleOrder[visibleIndex++] : key,
    );
    sidebarReorderVersionRef.current += 1;
    const version = sidebarReorderVersionRef.current;
    if (sidebarReorderTimerRef.current) {
      window.clearTimeout(sidebarReorderTimerRef.current);
    }
    sidebarReorderTimerRef.current = window.setTimeout(() => {
      sidebarReorderQueueRef.current = sidebarReorderQueueRef.current
        .catch(() => undefined)
        .then(async () => {
          const previousPosts = queryClient.getQueryData<TelegramManagedPost[]>(
            ["telegram-managed-posts", channelId],
          );
          const previousGroups = queryClient.getQueryData<PostGroup[]>([
            "post-groups",
            channelId,
          ]);
          const orderIndex = new Map(
            completeOrder.map((key, index) => [key, index]),
          );
          queryClient.setQueryData<TelegramManagedPost[]>(
            ["telegram-managed-posts", channelId],
            (current) =>
              current?.map((post) =>
                post.groupId
                  ? post
                  : {
                      ...post,
                      sidebarPosition:
                        orderIndex.get(`post:${post.id}`) ??
                        post.sidebarPosition,
                    },
              ),
          );
          queryClient.setQueryData<PostGroup[]>(
            ["post-groups", channelId],
            (current) =>
              current?.map((group) => ({
                ...group,
                sidebarPosition:
                  orderIndex.get(`group:${group.id}`) ?? group.sidebarPosition,
              })),
          );
          try {
            await telegramChannelsApi.reorderManagedPostSidebar(
              channelId,
              completeOrder,
              true,
            );
            if (version !== sidebarReorderVersionRef.current) return;
            await Promise.all([
              queryClient.invalidateQueries({
                queryKey: ["telegram-managed-posts", channelId],
              }),
              queryClient.invalidateQueries({
                queryKey: ["post-groups", channelId],
              }),
            ]);
            setSidebarOrderKeys([]);
            pushToast("New sidebar order saved.", "success", 3000);
          } catch (reorderError) {
            if (version !== sidebarReorderVersionRef.current) return;
            queryClient.setQueryData(
              ["telegram-managed-posts", channelId],
              previousPosts,
            );
            queryClient.setQueryData(
              ["post-groups", channelId],
              previousGroups,
            );
            setSidebarOrderKeys([]);
            pushToast(
              apiErrorMessage(reorderError, "Could not save the sidebar order"),
              "error",
            );
          }
        });
    }, 700);
  };

  useEffect(() => {
    const saved = window.localStorage.getItem(
      `telegram-posts-status:${channelId}`,
    );
    if (saved === "DRAFT" || saved === "SCHEDULED" || saved === "PUBLISHED") {
      // Restore the last tab independently for every Telegram channel.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setStatusTab(saved);
    } else {
      setStatusTab("DRAFT");
    }
  }, [channelId]);

  useEffect(() => {
    const saved = window.localStorage.getItem(
      workspaceViewPreferenceKey(channelId),
    );
    setWorkspaceView(saved === "groups" ? "groups" : "posts");
  }, [channelId]);

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(
        `telegram-posts-collapsed-groups:${channelId}`,
      );
      if (!raw) {
        setCollapsedGroupIdsPreference(null);
        return;
      }
      const saved = JSON.parse(raw);
      // Restore the collapsed groups independently for every channel.
      // Null means "no manual preference yet", so groups stay collapsed by default.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setCollapsedGroupIdsPreference(
        Array.isArray(saved)
          ? saved.filter((id): id is string => typeof id === "string")
          : null,
      );
    } catch {
      setCollapsedGroupIdsPreference(null);
    }
  }, [channelId]);

  useEffect(() => {
    return () => {
      if (telegramLinkClickTimerRef.current) {
        window.clearTimeout(telegramLinkClickTimerRef.current);
      }
    };
  }, []);

  useEffect(() => {
    const saved = window.localStorage.getItem(
      postGroupPreferenceKey(channelId),
    );
    // Restore the preferred new-post group independently for every channel.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setRememberedPostGroupId(saved);
    setPostGroupId((current) => current ?? saved);
  }, [channelId]);

  useEffect(() => {
    if (!rememberedPostGroupId || !postGroups.data) return;
    if (postGroups.data.some((group) => group.id === rememberedPostGroupId)) {
      return;
    }
    // Drop stale preferred group ids when a group was deleted or moved away.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    rememberPostGroup(null);
    setPostGroupId((current) =>
      current === rememberedPostGroupId ? null : current,
    );
    // rememberPostGroup intentionally updates local state and localStorage.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rememberedPostGroupId, postGroups.data]);

  const reset = () => {
    const now = localNowParts();
    changeWorkspaceView("posts");
    restoredPostIdRef.current = "";
    setEditing(null);
    setTitle("");
    setAssignedMemberId(null);
    setMemberSelectionTouched(false);
    setText("");
    setImageUrls([]);
    setIcon(null);
    iconRef.current = null;
    setIconPending(false);
    setIconPickerGeneration((current) => current + 1);
    setPostGroupId(rememberedPostGroupId);
    setMode("draft");
    setScheduleDate(now.date);
    setScheduleTime(now.time);
    setLongTextMode("IMAGES_THEN_TEXT");
    setUploadingImages(false);
    setSelectedPostIds([]);
    setCreatingPostId(null);
    creatingPostIdRef.current = null;
    setError("");
    setManualTelegramUrl("");
  };

  useEffect(() => {
    // Header action intentionally resets the editor state.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (newPostToken > 0) reset();
    // reset intentionally captures the latest remembered group only when the action fires.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [newPostToken]);

  useEffect(() => {
    if (
      editing ||
      memberSelectionTouched ||
      assignedMemberId ||
      !currentMemberId
    ) {
      return;
    }
    // Async member data supplies the initial form default.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setAssignedMemberId(currentMemberId);
  }, [assignedMemberId, currentMemberId, editing, memberSelectionTouched]);

  const selectPost = (post: TelegramManagedPost) => {
    // A newly created post may still be saving in the background. Once the
    // user opens another post, its editor must not inherit that save overlay.
    setCreatingPostId(null);
    creatingPostIdRef.current = null;
    restoredPostIdRef.current = post.id;
    setEditing(post);
    setTitle(post.title);
    setAssignedMemberId(effectivePostMemberId(post));
    setMemberSelectionTouched(false);
    setText(post.text || "");
    setImageUrls(post.imageUrls);
    setIcon(post.icon ?? null);
    iconRef.current = post.icon ?? null;
    setIconPending(false);
    setPostGroupId(post.groupId ?? null);
    rememberPostGroup(post.groupId ?? null);
    setMode(post.status === "SCHEDULED" ? "schedule" : "draft");
    const scheduledLocalParts = post.scheduledAt
      ? localDateTimeParts(post.scheduledAt)
      : null;
    setScheduleDate(scheduledLocalParts?.date || localNowParts().date);
    const postScheduleTime = scheduledLocalParts?.time || localNowParts().time;
    setScheduleTime(postScheduleTime);
    setUploadingImages(false);
    if (
      post.publishMode === "IMAGES_THEN_TEXT" ||
      post.publishMode === "CAPTION_THEN_TEXT"
    ) {
      setLongTextMode(post.publishMode);
    } else {
      setLongTextMode("IMAGES_THEN_TEXT");
    }
    setError("");
    setManualTelegramUrl(post.telegramMessageUrls[0] || "");
    setTelegramLinkModalOpen(false);
  };

  const restorePostRevision = useMutation({
    mutationFn: async (revision: TelegramManagedPostRevision) => {
      if (!editing) throw new Error("No post selected");
      return telegramChannelsApi.restoreManagedPostHistory(
        channelId,
        editing.id,
        revision.id,
      );
    },
    onSuccess: async (post) => {
      await Promise.all([
        queryClient.invalidateQueries({
          queryKey: ["telegram-managed-posts", channelId],
        }),
        queryClient.invalidateQueries({
          queryKey: ["telegram-managed-post-history", channelId, post.id],
        }),
        queryClient.invalidateQueries({
          queryKey: ["telegram-managed-post-link-targets", channelId],
        }),
      ]);
      selectPost(post);
      setRestorePreviewRevision(null);
      setRestoreConfirmationValue("");
      pushToast(`"${post.title}" restored from backup and moved to draft.`, "success");
    },
    onError: (mutationError) => {
      pushToast(
        apiErrorMessage(mutationError, "Could not restore post backup"),
        "error",
        7000,
      );
    },
  });
  const restoreConfirmationValid = useMemo(
    () =>
      Boolean(
        editing &&
          restorePreviewRevision &&
          restoreConfirmationValue.trim() === editing.title,
      ),
    [editing, restoreConfirmationValue, restorePreviewRevision],
  );

  const saveManualTelegramUrl = async () => {
    if (!editing || !manualTelegramUrl.trim()) return;
    setSavingTelegramUrl(true);
    setError("");
    try {
      const post = await telegramChannelsApi.setManagedPostTelegramUrl(
        channelId,
        editing.id,
        manualTelegramUrl.trim(),
      );
      setEditing(post);
      setManualTelegramUrl(post.telegramMessageUrls[0] || "");
      setTelegramLinkModalOpen(false);
      await Promise.all([
        queryClient.invalidateQueries({
          queryKey: ["telegram-managed-posts", channelId],
        }),
        queryClient.invalidateQueries({
          queryKey: ["telegram-managed-post-link-targets", channelId],
        }),
        queryClient.invalidateQueries({
          queryKey: ["post-groups", channelId],
        }),
      ]);
      pushToast("Telegram post link saved.", "success");
    } catch (saveError) {
      setError(apiErrorMessage(saveError, "Could not save Telegram post link"));
    } finally {
      setSavingTelegramUrl(false);
    }
  };

  const openTelegramLinkModal = () => {
    if (!editing || !canManageTelegramLink) return;
    setManualTelegramUrl(editing.telegramMessageUrls[0] || telegramPostUrl || "");
    setTelegramLinkModalOpen(true);
  };

  const handleTelegramLinkClick = () => {
    if (telegramLinkClickTimerRef.current) {
      window.clearTimeout(telegramLinkClickTimerRef.current);
      telegramLinkClickTimerRef.current = null;
    }
    telegramLinkClickTimerRef.current = window.setTimeout(() => {
      telegramLinkClickTimerRef.current = null;
      if (telegramPostUrl) {
        window.open(telegramPostUrl, "_blank", "noopener,noreferrer");
        return;
      }
      if (canManageTelegramLink) openTelegramLinkModal();
    }, POST_OPEN_CLICK_DELAY_MS);
  };

  const handleTelegramLinkDoubleClick = () => {
    if (telegramLinkClickTimerRef.current) {
      window.clearTimeout(telegramLinkClickTimerRef.current);
      telegramLinkClickTimerRef.current = null;
    }
    openTelegramLinkModal();
  };

  const toggleAllChannelPosts = () => {
    setSelectedPostIds((current) => {
      if (allChannelPostsSelected) {
        return current.filter((id) => !channelPostIds.includes(id));
      }
      return [...new Set([...current, ...channelPostIds])];
    });
  };

  const downloadSelectedPostsText = () => {
    if (!selectedPosts.length) return;
    const instructions = [
      "ИНСТРУКЦИЯ ПО ВНУТРЕННИМ ССЫЛКАМ",
      "",
      "Каждый пост ниже начинается со стабильного идентификатора tg-post:<id>.",
      "Этот идентификатор нужен, чтобы связать один managed post с другим.",
      "",
      "Формат ссылки внутри текста:",
      "[видимый текст](tg-post:<id>)",
      "",
      "Пример:",
      "[перейти к первому посту](tg-post:cmr6qalme00tol4rii5pj5v3e)",
      "",
      "Не заменяйте tg-post:<id> заголовком: заголовок может измениться, а id остаётся стабильным.",
      "",
      "============================================================",
    ].join("\n");
    const postsContent = selectedPosts
      .map((post) =>
        [
          `tg-post:${post.id} — ${post.title}`,
          "",
          post.text || "[Пост без текста]",
        ].join("\n"),
      )
      .join("\n\n------------------------------------------------------------\n\n");
    const content = `${instructions}\n\n${postsContent}\n`;
    const blob = new Blob([content], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    const stamp = new Date().toISOString().slice(0, 10);
    link.href = url;
    link.download = `telegram-posts-${stamp}.txt`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  };

  const togglePostSelected = (postId: string) => {
    setSelectedPostIds((current) =>
      current.includes(postId)
        ? current.filter((id) => id !== postId)
        : [...current, postId],
    );
  };

  const openPost = (post: TelegramManagedPost) => {
    selectPost(post);
    onPostSelect(post.id);
  };

  const highlightInternalLinkTarget = (targetId: string) => {
    setHighlightedInternalLinkTargetId(targetId);
    setHighlightRequestKey((current) => current + 1);
  };

  const applyChannelTimePost = (timePost: TelegramChannelTimePost) => {
    setScheduleDate((current) => current || scheduleDateForPreset(timePost.time));
    setScheduleTime(timePost.time);
  };

  const cancelScheduledPostOpen = () => {
    if (postOpenTimerRef.current) {
      window.clearTimeout(postOpenTimerRef.current);
      postOpenTimerRef.current = null;
    }
  };

  const schedulePostOpen = (post: TelegramManagedPost) => {
    cancelScheduledPostOpen();
    postOpenTimerRef.current = window.setTimeout(() => {
      postOpenTimerRef.current = null;
      openPost(post);
    }, POST_OPEN_CLICK_DELAY_MS);
  };

  const changePostIcon = (nextIcon: string | null) => {
    iconRef.current = nextIcon;
    setIcon(nextIcon);
    setIconPending(false);
  };

  const deletePosts = async (targetPosts: TelegramManagedPost[]) => {
    try {
      for (const post of targetPosts) {
        await telegramChannelsApi.deleteManagedPost(channelId, post.id);
      }
      if (targetPosts.some((post) => post.id === editing?.id)) {
        reset();
        onPostSelect(null);
      }
      setSelectedPostIds((current) =>
        current.filter((id) => !targetPosts.some((post) => post.id === id)),
      );
      await Promise.all([
        queryClient.invalidateQueries({
          queryKey: ["telegram-managed-posts", channelId],
        }),
        queryClient.invalidateQueries({ queryKey: ["post-groups", channelId] }),
      ]);
      pushToast(
        targetPosts.length === 1
          ? `"${targetPosts[0].title}" deleted.`
          : `${targetPosts.length} posts deleted.`,
        "success",
      );
    } catch (error) {
      pushToast(apiErrorMessage(error, "Could not delete posts"), "error", 7000);
    }
  };

  useEffect(() => {
    if (!initialPostId) return;
    changeWorkspaceView("posts");
  }, [initialPostId]);

  useEffect(() => {
    if (!initialGroupId) return;
    changeWorkspaceView("groups");
  }, [initialGroupId]);

  useEffect(() => {
    if (!initialPostId || !posts.data?.length) return;
    if (restoredPostIdRef.current === initialPostId) return;
    const post = posts.data.find((item) => item.id === initialPostId);
    // URL restoration intentionally hydrates the local editor state.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (post) selectPost(post);
    // selectPost is intentionally excluded to avoid rehydrating on every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialPostId, posts.data]);

  const run = () => {
    const editingPost = editing;
    const saveMode = mode;
    const saveTitle = title.trim();
    const saveGroupId = postGroupId;
    const saveIcon = iconRef.current;
    const saveLongTextMode = longTextMode;
    if (saveMode === "schedule" && !isValidTimeInputValue(scheduleTime)) {
      setError("Publish time must be in HH:MM format.");
      return;
    }
    const saveScheduledAt =
      saveMode === "schedule" && isValidTimeInputValue(scheduleTime)
        ? new Date(`${scheduleDate}T${scheduleTime}`).toISOString()
        : null;
    const payload: {
      title: string;
      text: string;
      imageUrls: string[];
      assignedMemberId?: string;
      icon?: string | null;
    } = {
      title: saveTitle,
      text,
      imageUrls: [...imageUrls],
      icon: saveIcon,
    };
    const selectedMemberId =
      assignedMemberId ??
      (!editingPost && !memberSelectionTouched ? currentMemberId : null);
    if (selectedMemberId) payload.assignedMemberId = selectedMemberId;
    const pendingId =
      editingPost?.id ||
      `pending-${Date.now()}-${Math.random().toString(36).slice(2)}`;

    if (editingPost) {
      setSavingPostIds((current) => [...new Set([...current, pendingId])]);
    } else {
      setCreatingPostId(pendingId);
      creatingPostIdRef.current = pendingId;
      setPendingPostSaves((current) => [
        {
          id: pendingId,
          title: saveTitle,
          icon: saveIcon,
          groupId: saveGroupId,
          mode: saveMode,
        },
        ...current,
      ]);
    }
    changeStatusTab(
      saveMode === "schedule"
        ? "SCHEDULED"
        : saveMode === "publish"
          ? "PUBLISHED"
          : "DRAFT",
    );
    void (async () => {
      let savedPostId: string | null = null;
      try {
        const post = editingPost
          ? await telegramChannelsApi.updateManagedPost(
              channelId,
              editingPost.id,
              payload,
              true,
            )
          : await telegramChannelsApi.createManagedPost(
              channelId,
              payload,
              true,
            );
        savedPostId = post.id;
        if (saveGroupId && saveGroupId !== (editingPost?.groupId ?? null)) {
          await telegramChannelsApi.addPostsToGroup(
            saveGroupId,
            [post.id],
            true,
          );
        } else if (editingPost?.groupId && !saveGroupId) {
          await telegramChannelsApi.removePostFromGroup(
            editingPost.groupId,
            post.id,
            true,
          );
        }
        if (saveMode === "publish") {
          await telegramChannelsApi.publishManagedPost(
            channelId,
            post.id,
            saveLongTextMode,
            true,
          );
        } else if (saveMode === "schedule" && saveScheduledAt) {
          await telegramChannelsApi.scheduleManagedPost(
            channelId,
            post.id,
            saveScheduledAt,
            saveLongTextMode,
            true,
          );
        }
        const savedIcon = payload.icon
          ? await iconsApi.get(payload.icon).catch(() => null)
          : null;
        pushToast(
          editingPost?.status === "PUBLISHED"
            ? `"${saveTitle}" updated in Telegram.`
            : saveMode === "publish"
            ? `"${saveTitle}" published.`
            : saveMode === "schedule"
              ? `"${saveTitle}" scheduled.`
              : `"${saveTitle}" saved.`,
          "success",
          3500,
          savedIcon ?? undefined,
        );
      } catch (runError) {
        pushToast(
          apiErrorMessage(runError, `Could not save "${saveTitle}"`),
          "error",
          7000,
        );
      } finally {
        const [postsResult] = await Promise.allSettled([
          queryClient.invalidateQueries({
            queryKey: ["telegram-managed-posts", channelId],
          }),
          queryClient.invalidateQueries({
            queryKey: ["post-groups", channelId],
          }),
        ]);
        const refreshedPosts = queryClient.getQueryData<TelegramManagedPost[]>([
          "telegram-managed-posts",
          channelId,
        ]);
        if (editingPost && postsResult.status === "fulfilled") {
          const refreshedPost = refreshedPosts?.find(
            (item) => item.id === editingPost.id,
          );
          if (refreshedPost) {
            setEditing((current) =>
              current?.id === editingPost.id ? refreshedPost : current,
            );
          }
        }
        if (
          !editingPost &&
          savedPostId &&
          postsResult.status === "fulfilled" &&
          creatingPostIdRef.current === pendingId
        ) {
          const refreshedPost = refreshedPosts?.find(
            (item) => item.id === savedPostId,
          );
          if (refreshedPost) {
            selectPost(refreshedPost);
            onPostSelect(refreshedPost.id);
          }
        }
        setPendingPostSaves((current) =>
          current.filter((item) => item.id !== pendingId),
        );
        setCreatingPostId((current) =>
          current === pendingId ? null : current,
        );
        if (creatingPostIdRef.current === pendingId) {
          creatingPostIdRef.current = null;
        }
        setSavingPostIds((current) => current.filter((id) => id !== pendingId));
      }
    })();
  };

  const changePostGroup = (nextGroupId: string) => {
    const normalized = nextGroupId || null;
    setPostGroupId(normalized);
    rememberPostGroup(normalized);
  };

  return (
    <>
      <div className="mb-4 flex min-w-0 flex-wrap items-center gap-3">
        <div className="inline-flex shrink-0 rounded-lg border border-neutral-800 bg-neutral-950 p-1">
          <button
            type="button"
            onClick={() => changeWorkspaceView("posts")}
            className={`flex items-center gap-2 rounded-md px-4 py-2 text-sm ${
              workspaceView === "posts"
                ? "bg-blue-600 text-white"
                : "text-neutral-400 hover:text-white"
            }`}
          >
            <FileText size={15} />
            Posts
          </button>
          <button
            type="button"
            onClick={() => changeWorkspaceView("groups")}
            className={`flex items-center gap-2 rounded-md px-4 py-2 text-sm ${
              workspaceView === "groups"
                ? "bg-blue-600 text-white"
                : "text-neutral-400 hover:text-white"
            }`}
          >
            <Layers3 size={15} />
            Groups
          </button>
        </div>
        <PromptNotesStrip
          channelId={channelId}
          notes={promptNotes.data || []}
          isLoading={promptNotes.isLoading}
          channels={channels}
          currentMemberId={currentMemberId}
          initialNoteId={initialNoteId}
        />
      </div>
      {workspaceView === "groups" ? (
        <PostGroupsWorkspace
          channelId={channelId}
          channels={channels}
          initialGroupId={initialGroupId}
          onOpenPost={(post) => {
            changeWorkspaceView("posts");
            selectPost(post);
            onPostSelect(post.id);
          }}
        />
      ) : (
        <div className="grid items-start gap-4 xl:grid-cols-[minmax(270px,0.7fr)_minmax(420px,1.25fr)_minmax(280px,0.72fr)]">
          <TelegramPostPreview
            channelTitle={channelTitle}
            channelPhotoUrl={channelPhotoUrl}
            text={text}
            imageUrls={imageUrls}
            longTextMode={longTextMode}
          />
          <Card className="relative min-w-0 space-y-3 overflow-visible">
            {editorIsSaving ? (
              <div className="absolute inset-0 z-40 flex items-center justify-center rounded-lg bg-black/55 backdrop-blur-[2px]">
                <div className="flex items-center gap-3 rounded-xl border border-neutral-700 bg-neutral-900 px-5 py-4 text-sm font-medium text-white shadow-2xl">
                  <LoaderCircle
                    size={21}
                    className="animate-spin text-blue-400"
                  />
                  Saving “{editing?.title || title}”…
                </div>
              </div>
            ) : null}
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <div className="flex items-center gap-2">
                  <IconPicker
                    key={iconPickerGeneration}
                    iconId={icon}
                    onChange={changePostIcon}
                    onPendingChange={setIconPending}
                    buttonLabel="Add icon"
                    compact
                    className="!h-8 !w-8"
                  />
                  <h2 className="text-lg font-semibold text-white">
                    {isPublished
                      ? "Published post"
                      : editing
                        ? "Edit post"
                        : "New post"}
                  </h2>
                  {editing && incomingInternalLinkPosts.length > 0 ? (
                    <button
                      type="button"
                      onClick={() => setUsageModalOpen(true)}
                      className="inline-flex h-8 items-center gap-1.5 rounded-md border border-neutral-700 px-2.5 text-xs font-medium text-neutral-300 transition hover:border-blue-600 hover:bg-blue-950/30 hover:text-white"
                      title="Show posts that link to this post"
                    >
                      <Layers3 size={13} />
                      Used in
                      <span className="rounded bg-neutral-800 px-1.5 py-0.5 text-[11px] text-neutral-200">
                        {incomingInternalLinkPosts.length}
                      </span>
                    </button>
                  ) : null}
                  {editing && canManageTelegramLink ? (
                    <span className="relative inline-flex group">
                      <button
                        type="button"
                        onClick={handleTelegramLinkClick}
                        onDoubleClick={handleTelegramLinkDoubleClick}
                        className={`inline-flex h-8 items-center gap-1.5 rounded-md border px-2.5 text-xs font-medium transition ${
                          telegramLinkBroken
                            ? "border-red-700 bg-red-950/20 text-red-200 hover:border-red-600 hover:bg-red-950/35"
                            : "border-neutral-700 text-blue-300 hover:border-blue-600 hover:bg-blue-950/30 hover:text-blue-200"
                        }`}
                      >
                        {telegramLinkBroken ? (
                          <AlertTriangle size={13} className="text-red-300" />
                        ) : (
                          <ExternalLink size={13} />
                        )}
                        Open in TG
                      </button>
                      <TooltipBubble
                        side="top"
                        align="center"
                        className="max-w-64 px-2.5 py-1.5 text-neutral-200 opacity-0 transition-opacity group-hover:opacity-100"
                      >
                        {telegramPostUrl
                          ? "Click to open in Telegram. Double-click to set or replace the link."
                          : "Double-click to set the Telegram link."}
                      </TooltipBubble>
                    </span>
                  ) : null}
                </div>
                {isPublished ? (
                  <div className="mt-0.5 space-y-0.5 text-xs">
                    <p className="flex items-center gap-1.5 text-emerald-300">
                      <CheckCircle2 size={13} />
                      Telegram text can still be updated after publishing
                    </p>
                    <p className="text-neutral-400">
                      {publishModeLabel(
                        editing?.publishMode,
                        editing?.imageUrls.length || 0,
                        editing?.text?.length || 0,
                      )}
                    </p>
                  </div>
                ) : null}
              </div>
              <div className="w-full sm:w-56">
                <CustomSelect
                  value={postGroupId || ""}
                  onChange={changePostGroup}
                  placeholder="No group"
                  options={[
                    { value: "", label: "No group", iconEmoji: "📂" },
                    ...(postGroups.data || []).map((group) => {
                      const groupIcon = group.icon
                        ? iconsById.get(group.icon)
                        : null;
                      return {
                        value: group.id,
                        label: group.title,
                        iconEmoji: groupIcon?.emoji || undefined,
                        iconUrl: groupIcon?.imageUrl || undefined,
                        iconFallback: group.title,
                      };
                    }),
                  ]}
                />
              </div>
            </div>
            <div className="grid gap-3 md:grid-cols-[minmax(0,1.25fr)_minmax(220px,0.75fr)]">
              <FormField label="Internal title" required>
                <Input
                  value={title}
                  disabled={busy}
                  onChange={(event) => setTitle(event.target.value)}
                />
              </FormField>
              <FormField label="Member">
                <MemberSelect
                  value={assignedMemberId}
                  onChange={(value) => {
                    setMemberSelectionTouched(true);
                    setAssignedMemberId(value || null);
                  }}
                  defaultToCurrent={!editing}
                  disabled={busy}
                />
              </FormField>
            </div>
            <FormField label="Telegram text">
              <TelegramTextEditor
                value={text}
                onChange={setText}
                disabled={busy}
                rows={7}
                channelId={channelId}
                currentPostId={editing?.id}
                enableInternalPostLinks
                internalLinkUsage="edit"
                internalLinkScheduledAt={internalLinkScheduledAt}
                highlightInternalLinkTargetId={highlightedInternalLinkTargetId}
                highlightRequestKey={highlightRequestKey}
                availableInternalPosts={posts.data || []}
              />
            </FormField>
            {outgoingInternalLinks.length ? (
              <div
                className="rounded-lg border border-amber-700/70 bg-amber-950/20 px-3 py-2.5 text-amber-200"
                title={dependencyAlertTitle}
              >
                <div className="flex items-start gap-2">
                  <AlertTriangle size={16} className="mt-0.5 shrink-0" />
                  <div className="min-w-0">
                    <p className="text-sm font-medium">
                      {unresolvedInternalLinkTargets.length
                        ? "Publishing is blocked by linked posts"
                        : "Internal linked posts are ready"}
                    </p>
                    <p className="mt-0.5 text-xs text-amber-300/80">
                      {unresolvedInternalLinkTargets.length
                        ? "Publish these posts or attach their Telegram links first:"
                        : "All linked posts are already ready for publishing."}
                    </p>
                    {unresolvedInternalLinkTargets.length ? (
                      <div className="mt-3">
                        <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-amber-300/75">
                          Blocking
                        </p>
                        <div className="flex flex-wrap gap-1.5">
                          {unresolvedInternalLinkTargets.map((target) => (
                            <span key={target.id} className="relative inline-flex group">
                              <button
                                type="button"
                                onClick={() => highlightInternalLinkTarget(target.id)}
                                onDoubleClick={() => {
                                  if (target.post) openPost(target.post);
                                }}
                                className="inline-flex items-center gap-1.5 rounded-md border border-amber-800/70 bg-amber-950/50 px-2 py-1 text-xs transition hover:border-amber-600 hover:bg-amber-900/40"
                              >
                                {target.post?.icon ? (
                                  <PostIcon
                                    iconId={target.post.icon}
                                    label={target.post.title}
                                    bare
                                    size="xs"
                                  />
                                ) : (
                                  <span aria-hidden="true">📝</span>
                                )}
                                <span>
                                  {target.post?.title || `Missing post ${target.id}`}
                                </span>
                                {target.post ? (
                                  <span className="text-amber-400/70">
                                    {target.post.status === "PUBLISHED" &&
                                    (target.post.telegramRemoteStatus === "BROKEN" ||
                                      target.post.telegramRemoteStatus === "MISSING" ||
                                      target.post.lastError)
                                      ? "link broken"
                                      : target.post.status.toLowerCase()}
                                  </span>
                                ) : null}
                              </button>
                              <TooltipBubble
                                side="top"
                                align="center"
                                className="max-w-64 px-2.5 py-1.5 text-neutral-200 opacity-0 transition-opacity group-hover:opacity-100"
                              >
                                Click to jump to this link in the text. Double-click to open the linked post.
                              </TooltipBubble>
                            </span>
                          ))}
                        </div>
                      </div>
                    ) : null}
                    {resolvedInternalLinkTargets.length ? (
                      <div className="mt-3">
                        <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-emerald-300/75">
                          Ready
                        </p>
                        <div className="flex flex-wrap gap-1.5">
                          {resolvedInternalLinkTargets.map((target) => (
                            <span
                              key={target.targetId}
                              className="relative inline-flex group"
                            >
                              <button
                                type="button"
                                onClick={() =>
                                  highlightInternalLinkTarget(target.targetId)
                                }
                                onDoubleClick={() => {
                                  if (target.target) openPost(target.target);
                                }}
                                className="inline-flex items-center gap-1.5 rounded-md border border-emerald-800/70 bg-emerald-950/30 px-2 py-1 text-xs text-emerald-100 transition hover:border-emerald-600 hover:bg-emerald-900/30"
                              >
                                {target.target?.icon ? (
                                  <PostIcon
                                    iconId={target.target.icon}
                                    label={target.target.title}
                                    bare
                                    size="xs"
                                  />
                                ) : (
                                  <span aria-hidden="true">📝</span>
                                )}
                                <span>
                                  {target.target?.title || target.targetId}
                                </span>
                                <span className="text-emerald-300/80">
                                  published
                                </span>
                              </button>
                              <TooltipBubble
                                side="top"
                                align="center"
                                className="max-w-64 px-2.5 py-1.5 text-neutral-200 opacity-0 transition-opacity group-hover:opacity-100"
                              >
                                Click to jump to this link in the text. Double-click to open the linked post.
                              </TooltipBubble>
                            </span>
                          ))}
                        </div>
                      </div>
                    ) : null}
                  </div>
                </div>
              </div>
            ) : null}
            {!isPublished || imageUrls.length ? (
              <div className="space-y-2">
                <TelegramImageUpload
                  value={imageUrls}
                  onChange={setImageUrls}
                  disabled={busy || hasLockedTelegramMedia}
                  readOnly={hasLockedTelegramMedia}
                  onUploadingChange={setUploadingImages}
                />
                {hasLockedTelegramMedia ? (
                  <p className="text-xs text-amber-300">
                    Images cannot be changed after a post is sent or scheduled.
                    You can still update the Telegram text.
                  </p>
                ) : null}
              </div>
            ) : null}
            {publishedLongImageTextMode ? (
              <LongImageTextModePanel
                mode={publishedLongImageTextMode}
                readOnly
                textLength={text.length}
              />
            ) : null}
            {!isPublished && hasLongImageText ? (
              <LongImageTextModePanel
                mode={longTextMode}
                onChange={setLongTextMode}
                textLength={text.length}
              />
            ) : null}
            {!isPublished && hasLongTextOnly ? (
              <div className="rounded-lg border border-blue-700/60 bg-blue-950/20 p-3">
                <p className="text-sm text-blue-200">
                  Telegram text messages are limited to 4096 characters after
                  formatting. Current length: {text.length}. This post will be
                  published as{" "}
                  {Math.ceil(text.length / TELEGRAM_TEXT_MESSAGE_LIMIT)}{" "}
                  separate messages.
                </p>
              </div>
            ) : null}
            {!isPublished ? (
              <FormField label="Publishing mode">
                <CustomSelect
                  value={mode}
                  dropdownDirection="up"
                  searchable={false}
                  onChange={(value) => setMode(value as PublishingMode)}
                  options={[
                    { value: "draft", label: "Save as draft", iconEmoji: "📝" },
                    { value: "publish", label: "Publish now", iconEmoji: "🚀" },
                    {
                      value: "schedule",
                      label: "Schedule in Telegram",
                      iconEmoji: "🕒",
                    },
                  ]}
                />
              </FormField>
            ) : null}
            {!isPublished && mode === "schedule" ? (
              <div className="space-y-3">
                <div className="grid gap-3 sm:grid-cols-2">
                  <FormField label="Publish date" required>
                    <DateInput
                      value={scheduleDate}
                      onChange={(event) => setScheduleDate(event.target.value)}
                      placeholder="Select date"
                    />
                  </FormField>
                  <FormField label="Publish time" required>
                    <TimeInput
                      value={scheduleTime}
                      onChange={(event) => setScheduleTime(event.target.value)}
                    />
                  </FormField>
                </div>
                {channelTimePosts.length ? (
                  <div>
                    <p className="mb-2 text-xs font-medium uppercase tracking-wide text-neutral-500">
                      Time posts
                    </p>
                    <div className="flex flex-wrap gap-2">
                      {channelTimePosts.map((timePost) => (
                        <button
                          key={timePost.id}
                          type="button"
                          onClick={() => applyChannelTimePost(timePost)}
                          className={`inline-flex items-center gap-2 rounded-lg border px-3 py-2 text-left text-sm text-white transition ${
                            selectedTimePostId === timePost.id
                              ? "border-blue-500 bg-blue-950/25 ring-1 ring-blue-400"
                              : "border-neutral-700 bg-neutral-950 hover:border-blue-600 hover:bg-blue-950/20"
                          }`}
                        >
                          <IconAvatar
                            icon={timePost.icon}
                            label={timePost.title}
                            size="xs"
                            bordered
                          />
                          <span className="min-w-0">
                            {timePost.title ? (
                              <span className="block truncate text-xs text-neutral-300">
                                {timePost.title}
                              </span>
                            ) : null}
                            <span className="block text-sm font-medium text-white">
                              {timePost.time}
                            </span>
                          </span>
                        </button>
                      ))}
                    </div>
                  </div>
                ) : null}
              </div>
            ) : null}
            {editing ? (
              <div className="rounded-lg border border-neutral-800 bg-neutral-950/60 p-3">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-sm font-medium text-white">History</p>
                    <p className="text-xs text-neutral-400">
                      Automatic backups are kept for 7 days before risky changes.
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    {postHistory.isFetching ? (
                      <LoaderCircle
                        size={14}
                        className="animate-spin text-neutral-500"
                      />
                    ) : null}
                    <Button
                      type="button"
                      variant="secondary"
                      onClick={() => setHistoryExpanded((current) => !current)}
                    >
                      {historyExpanded ? "Hide" : "Show"}
                    </Button>
                  </div>
                </div>
                {historyExpanded ? (
                  <div className="mt-3 space-y-2">
                    {(postHistory.data || []).length ? (
                      (postHistory.data || []).slice(0, 6).map((revision) => (
                        <div
                          key={revision.id}
                          className="flex items-center justify-between gap-3 rounded-md border border-neutral-800 bg-neutral-900/80 px-3 py-2"
                        >
                          <div className="min-w-0">
                            <p className="truncate text-sm text-white">
                              {formatManagedPostRevisionReason(revision.reason)}
                            </p>
                            <p className="text-xs text-neutral-400">
                              {new Date(revision.createdAt).toLocaleString()}
                            </p>
                          </div>
                          <Button
                            type="button"
                            variant="secondary"
                            disabled={restorePostRevision.isPending}
                            onClick={() => {
                              setRestorePreviewRevision(revision);
                              setRestoreConfirmationValue("");
                            }}
                          >
                            Restore
                          </Button>
                        </div>
                      ))
                    ) : postHistory.isLoading ? (
                      <p className="text-xs text-neutral-500">
                        Loading history…
                      </p>
                    ) : (
                      <p className="text-xs text-neutral-500">
                        No backups yet. A backup is created before publish,
                        schedule, sync changes, restore, delete, and manual
                        edits.
                      </p>
                    )}
                  </div>
                ) : null}
              </div>
            ) : null}
            {pendingPostSaves.length + savingPostIds.length > 0 ? (
              <div className="flex items-center gap-2 rounded-lg border border-blue-800/70 bg-blue-950/20 px-3 py-2 text-xs text-blue-200">
                <LoaderCircle size={14} className="animate-spin" />
                {pendingPostSaves.length + savingPostIds.length} post
                {pendingPostSaves.length + savingPostIds.length === 1
                  ? ""
                  : "s"}{" "}
                saving in background. You can continue working.
              </div>
            ) : null}
            <div className="flex justify-end">
              <Button
                onClick={run}
                disabled={!!publishDisabledReason || dependencyPublishBlocked}
              >
                {isPublished
                  ? "Update Telegram text"
                  : mode === "draft"
                    ? "Save draft"
                    : mode === "publish"
                      ? "Publish now"
                      : editing?.status === "SCHEDULED"
                        ? "Update scheduled post"
                        : "Schedule post"}
              </Button>
            </div>
            {publishDisabledReason ? (
              <p className="text-right text-xs text-neutral-500">
                {publishDisabledReason}
              </p>
            ) : null}
            {dependencyPublishBlocked && !publishDisabledReason ? (
              <p className="text-right text-xs text-amber-400">
                Publish the linked posts and sync them with Telegram first.
              </p>
            ) : null}
            {editing && usageModalOpen ? (
              <PostUsageModal
                post={editing}
                usages={incomingInternalLinkPosts}
                onClose={() => setUsageModalOpen(false)}
                onOpenPost={(post) => {
                  setUsageModalOpen(false);
                  openPost(post);
                }}
              />
            ) : null}
          </Card>

          <Card className="min-w-0">
            <div className="mb-3 flex items-center justify-between gap-2">
              <h2 className="text-lg font-semibold text-white">Posts</h2>
              <span className="text-xs text-neutral-500">
                {(posts.data?.length || 0) + pendingPostSaves.length} total
              </span>
            </div>
            <div className="mb-3 grid grid-cols-3 gap-1 rounded-lg border border-neutral-800 bg-neutral-950 p-1">
              {(
                [
                  {
                    value: "DRAFT",
                    label: "Drafts",
                    icon: FileText,
                    count: (posts.data || []).filter((post) =>
                      ["DRAFT", "FAILED", "PUBLISHING"].includes(post.status),
                    ).length,
                  },
                  {
                    value: "SCHEDULED",
                    label: "Scheduled",
                    icon: Clock3,
                    count: (posts.data || []).filter(
                      (post) => post.status === "SCHEDULED",
                    ).length,
                  },
                  {
                    value: "PUBLISHED",
                    label: "Published",
                    icon: CheckCircle2,
                    count: (posts.data || []).filter(
                      (post) => post.status === "PUBLISHED",
                    ).length,
                  },
                ] as const
              ).map(({ value, label, icon: StatusIcon, count }) => (
                <button
                  key={value}
                  type="button"
                  title={label}
                  aria-label={label}
                  onClick={() => changeStatusTab(value)}
                  className={`relative flex h-9 items-center justify-center rounded-md transition ${
                    statusTab === value
                      ? "bg-blue-600 text-white"
                      : "text-neutral-400 hover:bg-neutral-800 hover:text-white"
                  }`}
                >
                  <StatusIcon size={17} />
                  {count ? (
                    <span className="absolute right-1.5 top-1 rounded-full bg-neutral-950/70 px-1 text-[9px] leading-4">
                      {count}
                    </span>
                  ) : null}
                </button>
              ))}
            </div>
            {posts.isLoading ? <LoadingState /> : null}
            {visiblePosts.length || pendingPostSaves.length ? (
              <>
                <div className="max-h-[calc(100vh-15rem)] space-y-2 overflow-y-auto pr-1">
                  {groupedPendingPostSaves.ungrouped.map((pending) => (
                    <PendingPostRow key={pending.id} pending={pending} />
                  ))}
                  {orderedSidebarSections.map((section) => {
                    const collapsed =
                      section.group &&
                      collapsedGroupIds.includes(section.group.id);
                    const sectionPostIds = section.posts.map((post) => post.id);
                    const allSectionSelected = sectionPostIds.every((id) =>
                      selectedPostIds.includes(id),
                    );
                    return (
                      <div
                        key={section.key}
                        draggable
                        onDragStart={() => setDraggedSidebarKey(section.key)}
                        onDragOver={(event) => {
                          event.preventDefault();
                          if (
                            !draggedSidebarKey ||
                            draggedSidebarKey === section.key
                          ) {
                            return;
                          }
                          setSidebarOrderKeys((currentKeys) => {
                            const current = currentKeys.length
                              ? currentKeys
                              : orderedSidebarSections.map((item) => item.key);
                            const from = current.indexOf(draggedSidebarKey);
                            const to = current.indexOf(section.key);
                            if (from < 0 || to < 0) return current;
                            const next = [...current];
                            const [moved] = next.splice(from, 1);
                            next.splice(to, 0, moved);
                            return next;
                          });
                        }}
                        onDragEnd={() => {
                          setDraggedSidebarKey(null);
                          scheduleSidebarOrderSave(
                            orderedSidebarSections.map((item) => item.key),
                          );
                        }}
                        className={`${
                          section.group
                            ? "overflow-hidden rounded-lg border border-neutral-800 bg-neutral-950/40"
                            : "space-y-2"
                        } ${
                          draggedSidebarKey === section.key
                            ? "border-blue-500 opacity-60"
                            : ""
                        }`}
                      >
                        {section.group ? (
                          <div className="flex items-center gap-2 border-b border-neutral-800 px-2 py-2">
                            <GripVertical
                              size={15}
                              className="shrink-0 cursor-grab text-neutral-500"
                            />
                            <button
                              type="button"
                              onClick={() =>
                                toggleGroupCollapsed(section.group!.id)
                              }
                              className="flex min-w-0 flex-1 items-center gap-2 text-left"
                            >
                              {collapsed ? (
                                <ChevronRight
                                  size={15}
                                  className="shrink-0 text-neutral-400"
                                />
                              ) : (
                                <ChevronDown
                                  size={15}
                                  className="shrink-0 text-neutral-400"
                                />
                              )}
                              <PostIcon
                                iconId={section.group.icon}
                                label={section.group.title}
                                bare
                              />
                              <span className="truncate text-sm font-medium text-white">
                                {section.group.title}
                              </span>
                              <span className="text-xs text-neutral-500">
                                {section.posts.length +
                                  section.pendingPosts.length}
                              </span>
                            </button>
                            <button
                              type="button"
                              onClick={() =>
                                setSelectedPostIds((current) =>
                                  allSectionSelected
                                    ? current.filter(
                                        (id) => !sectionPostIds.includes(id),
                                      )
                                    : [
                                        ...new Set([
                                          ...current,
                                          ...sectionPostIds,
                                        ]),
                                      ],
                                )
                              }
                              className="shrink-0 rounded-md px-2 py-1 text-[11px] text-blue-300 hover:bg-blue-950/60"
                            >
                              {allSectionSelected ? "Clear" : "Select all"}
                            </button>
                          </div>
                        ) : null}
                        {!collapsed ? (
                          <div
                            className={
                              section.group ? "space-y-2 p-2" : "space-y-2"
                            }
                          >
                            {section.posts.map((post) => {
                              const isSaving = savingPostIds.includes(post.id);
                              const isSelected = selectedPostIds.includes(
                                post.id,
                              );
                              const isOpen = editing?.id === post.id;
                              return (
                                <div
                                  key={post.id}
                                  role="button"
                                  tabIndex={0}
                                  onClick={(event) => {
                                    if (event.shiftKey || event.detail > 1) {
                                      cancelScheduledPostOpen();
                                      togglePostSelected(post.id);
                                      return;
                                    }
                                    schedulePostOpen(post);
                                  }}
                                  onKeyDown={(event) => {
                                    if (event.key === "Enter") {
                                      cancelScheduledPostOpen();
                                      openPost(post);
                                    } else if (event.key === " ") {
                                      event.preventDefault();
                                      cancelScheduledPostOpen();
                                      togglePostSelected(post.id);
                                    }
                                  }}
                                  className={`flex cursor-pointer items-center gap-2 rounded-lg border px-3 py-2 outline-none transition ${
                                    isOpen && isSelected
                                      ? "border-blue-400 bg-blue-950/30 ring-1 ring-amber-300/50"
                                      : isOpen
                                        ? "border-blue-400 bg-blue-950/25"
                                        : isSelected
                                          ? "border-amber-400 bg-amber-950/20"
                                          : "border-neutral-800 hover:bg-neutral-900"
                                  }`}
                                >
                                  {!section.group ? (
                                    <GripVertical
                                      size={15}
                                      className="shrink-0 cursor-grab text-neutral-500"
                                    />
                                  ) : null}
                                  <div className="flex min-w-0 flex-1 items-center gap-2 text-left">
                                    {isSaving ? (
                                      <LoaderCircle
                                        size={16}
                                        className="shrink-0 animate-spin text-blue-400"
                                      />
                                    ) : !post.icon ? (
                                      <PostStatusIcon status={post.status} />
                                    ) : null}
                                    <span className="min-w-0 flex-1">
                                      <span className="flex min-w-0 items-center gap-1.5 text-sm">
                                        <PostIcon
                                          iconId={post.icon}
                                          label={post.title}
                                          bare
                                        />
                                        <span className="truncate">
                                          {post.title}
                                        </span>
                                        {["BROKEN", "MISSING"].includes(
                                          post.telegramRemoteStatus,
                                        ) ? (
                                          <AlertTriangle
                                            size={13}
                                            className="shrink-0 text-red-400"
                                            aria-label={`Telegram ${post.telegramRemoteStatus.toLowerCase()}`}
                                          />
                                        ) : null}
                                      </span>
                                      {post.status !== "DRAFT" ? (
                                        <span className="block truncate text-[11px] text-neutral-500">
                                          {post.status === "SCHEDULED" &&
                                          post.scheduledAt
                                            ? new Date(
                                                post.scheduledAt,
                                              ).toLocaleString()
                                            : post.status === "PUBLISHED" &&
                                                post.publishedAt
                                              ? new Date(
                                                  post.publishedAt,
                                                ).toLocaleString()
                                              : post.status.toLowerCase()}
                                        </span>
                                      ) : null}
                                    </span>
                                  </div>
                                  <button
                                    type="button"
                                    title="Move to another channel"
                                    aria-label={`Move ${post.title}`}
                                    onClick={(event) => {
                                      event.stopPropagation();
                                      cancelScheduledPostOpen();
                                      setMovingPost(post);
                                    }}
                                    className="cursor-pointer rounded-md border border-neutral-700 p-1.5 text-neutral-300 hover:bg-neutral-800"
                                  >
                                    <MoveRight size={14} />
                                  </button>
                                  <button
                                    type="button"
                                    aria-label={`Delete ${post.title}`}
                                    onClick={(event) => {
                                      event.stopPropagation();
                                      cancelScheduledPostOpen();
                                      setDeletingPost(post);
                                    }}
                                    className="cursor-pointer rounded-md border border-red-800 p-1.5 text-red-300 hover:bg-red-950"
                                  >
                                    <Trash2 size={14} />
                                  </button>
                                </div>
                              );
                            })}
                            {section.pendingPosts.map((pending) => (
                              <PendingPostRow
                                key={pending.id}
                                pending={pending}
                              />
                            ))}
                          </div>
                        ) : null}
                      </div>
                    );
                  })}
                </div>
                <div className="mt-3 grid grid-cols-[minmax(0,1fr)_auto] items-center gap-2 rounded-lg border border-neutral-800 bg-neutral-950/70 px-2 py-2">
                  <div className="flex min-w-0 items-center gap-2">
                    <button
                      type="button"
                      onClick={toggleAllChannelPosts}
                      className="rounded-md px-2 py-1 text-xs text-neutral-300 hover:bg-neutral-800 hover:text-white"
                      title="Select every post in this channel"
                    >
                      {allChannelPostsSelected ? "Clear all" : "All"}
                    </button>
                    <span
                      className={`min-w-9 rounded-md border px-2 py-1 text-center text-xs ${
                        selectedPosts.length
                          ? "border-amber-500/40 bg-amber-950/20 text-amber-200"
                          : "border-transparent text-transparent"
                      }`}
                    >
                      {selectedPosts.length || 0}
                    </span>
                  </div>
                  <div className="flex items-center justify-end gap-2">
                    <Button
                      type="button"
                      variant="secondary"
                      disabled={!selectedPosts.length}
                      onClick={downloadSelectedPostsText}
                      title="Download selected as TXT"
                      aria-label="Download selected posts as TXT"
                      className="flex h-9 items-center gap-1.5 px-3"
                    >
                      <Download size={15} />
                      TXT
                    </Button>
                    <Button
                      type="button"
                      variant="danger"
                      disabled={!selectedPosts.length || busy}
                      onClick={() => setBulkDeleteOpen(true)}
                      title="Delete selected"
                      aria-label="Delete selected posts"
                      className="flex h-9 min-w-12 items-center justify-center px-3"
                    >
                      <Trash2 size={15} />
                    </Button>
                  </div>
                </div>
              </>
            ) : !posts.isLoading ? (
              <EmptyState text={`No ${statusTab.toLowerCase()} posts`} />
            ) : null}
          </Card>
        </div>
      )}

      <ConfirmDeleteModal
        open={!!deletingPost}
        onClose={() => setDeletingPost(null)}
        entityName={deletingPost?.title || ""}
        label="Delete post"
        description={
          deletingPost?.status === "SCHEDULED"
            ? "This will cancel the scheduled message in Telegram and delete it from this system."
            : "This deletes the record only from this system. Published Telegram messages remain untouched."
        }
        onConfirm={() => {
          if (!deletingPost) return;
          const postToDelete = deletingPost;
          setDeletingPost(null);
          void deletePosts([postToDelete]);
        }}
      />
      {movingPost ? (
        <MovePostModal
          post={movingPost}
          channels={channels}
          sourceChannelId={channelId}
          onClose={() => setMovingPost(null)}
          onMoved={async (result) => {
            setMovingPost(null);
            await Promise.all([
              queryClient.invalidateQueries({
                queryKey: ["telegram-managed-posts", channelId],
              }),
              queryClient.invalidateQueries({
                queryKey: ["post-groups", channelId],
              }),
            ]);
            pushToast(
              result.results
                .map((item) => item.message)
                .filter(Boolean)
                .join("\n"),
              result.failedCount ? "error" : "success",
              7000,
            );
            if (editing?.id === movingPost.id) reset();
          }}
        />
      ) : null}
      <Modal
        open={telegramLinkModalOpen}
        onClose={() => setTelegramLinkModalOpen(false)}
        title={telegramPostUrl ? "Replace Telegram link" : "Set Telegram link"}
      >
        <div className="space-y-3">
          <p className="text-sm text-neutral-300">
            Paste the Telegram post URL. Saving it attaches or replaces the local Telegram link for this managed post.
          </p>
          <Input
            type="url"
            value={manualTelegramUrl}
            onChange={(event) => setManualTelegramUrl(event.target.value)}
            placeholder="https://t.me/c/123456/789"
            autoFocus
          />
          <div className="flex justify-end gap-2">
            <Button
              variant="secondary"
              type="button"
              onClick={() => setTelegramLinkModalOpen(false)}
            >
              Cancel
            </Button>
            <Button
              type="button"
              disabled={savingTelegramUrl || !manualTelegramUrl.trim()}
              onClick={saveManualTelegramUrl}
            >
              {savingTelegramUrl ? "Saving…" : "Save link"}
            </Button>
          </div>
        </div>
      </Modal>
      {editing && restorePreviewRevision ? (
        <Modal
          open
          onClose={() => {
            if (restorePostRevision.isPending) return;
            setRestorePreviewRevision(null);
            setRestoreConfirmationValue("");
          }}
          title="Restore backup"
          size="xl"
        >
          <div className="grid gap-5 xl:grid-cols-[minmax(0,1.05fr)_360px]">
            <TelegramPostPreview
              channelTitle={channelTitle}
              channelPhotoUrl={channelPhotoUrl}
              text={restorePreviewRevision.text || ""}
              imageUrls={restorePreviewRevision.imageUrls}
              longTextMode={
                restorePreviewRevision.publishMode === "CAPTION_THEN_TEXT"
                  ? "CAPTION_THEN_TEXT"
                  : "IMAGES_THEN_TEXT"
              }
            />
            <div className="space-y-4">
              <div className="rounded-lg border border-neutral-800 bg-neutral-950/60 p-4">
                <p className="text-sm font-medium text-white">
                  {formatManagedPostRevisionReason(
                    restorePreviewRevision.reason,
                  )}
                </p>
                <p className="mt-1 text-xs text-neutral-400">
                  Backup created{" "}
                  {new Date(
                    restorePreviewRevision.createdAt,
                  ).toLocaleString()}
                </p>
              </div>
              <div className="space-y-2 rounded-lg border border-amber-800/70 bg-amber-950/20 p-4 text-sm text-amber-100">
                <p>
                  Restoring will immediately replace the current editor content
                  of this post with the backup version and move the post to
                  draft.
                </p>
                <p className="text-xs text-amber-300/80">
                  To confirm, type the current post title exactly:
                </p>
                <p className="rounded-md border border-amber-900/70 bg-black/20 px-3 py-2 font-medium text-white">
                  {editing.title}
                </p>
                <Input
                  value={restoreConfirmationValue}
                  onChange={(event) =>
                    setRestoreConfirmationValue(event.target.value)
                  }
                  placeholder={editing.title}
                  disabled={restorePostRevision.isPending}
                />
              </div>
              <div className="flex justify-end gap-2">
                <Button
                  variant="secondary"
                  onClick={() => {
                    setRestorePreviewRevision(null);
                    setRestoreConfirmationValue("");
                  }}
                  disabled={restorePostRevision.isPending}
                >
                  Cancel
                </Button>
                <Button
                  disabled={
                    restorePostRevision.isPending || !restoreConfirmationValid
                  }
                  onClick={() =>
                    restorePostRevision.mutate(restorePreviewRevision)
                  }
                >
                  {restorePostRevision.isPending
                    ? "Restoring…"
                    : "Restore this version"}
                </Button>
              </div>
            </div>
          </div>
        </Modal>
      ) : null}
      <ConfirmDeleteModal
        open={bulkDeleteOpen}
        onClose={() => setBulkDeleteOpen(false)}
        entityName={`${selectedPosts.length} selected posts`}
        label="Delete selected posts"
        description={
          selectedPosts.some((post) => post.status === "SCHEDULED")
            ? "This will cancel selected scheduled messages in Telegram and delete the selected records from this system. Published Telegram messages remain untouched."
            : "This deletes the selected records only from this system. Published Telegram messages remain untouched."
        }
        onConfirm={() => {
          const postsToDelete = [...selectedPosts];
          setBulkDeleteOpen(false);
          void deletePosts(postsToDelete);
        }}
      />
    </>
  );
}

type ProgressState = {
  title: string;
  current: number;
  total: number;
  item?: BulkActionResult["results"][number];
  result?: BulkActionResult;
};

function BulkProgressOverlay({ progress }: { progress: ProgressState | null }) {
  if (!progress || typeof document === "undefined") return null;
  return createPortal(
    <div className="fixed inset-x-0 top-4 z-[150] flex justify-center px-4">
      <div className="w-full max-w-xl rounded-xl border border-blue-600/70 bg-neutral-950 p-4 shadow-2xl">
        <div className="flex items-center gap-3">
          {!progress.result ? (
            <LoaderCircle className="animate-spin text-blue-400" size={20} />
          ) : progress.result.failedCount ? (
            <AlertTriangle className="text-amber-400" size={20} />
          ) : (
            <CheckCircle2 className="text-emerald-400" size={20} />
          )}
          <div className="min-w-0 flex-1">
            <div className="flex items-center justify-between gap-3">
              <p className="font-medium text-white">{progress.title}</p>
              <span className="text-sm text-neutral-300">
                {progress.current}/{progress.total}
              </span>
            </div>
            <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-neutral-800">
              <div
                className="h-full bg-blue-500 transition-all"
                style={{
                  width: `${progress.total ? (progress.current / progress.total) * 100 : 0}%`,
                }}
              />
            </div>
            {progress.item?.message ? (
              <p className="mt-2 text-sm text-neutral-300">
                {progress.item.message}
              </p>
            ) : (
              <p className="mt-2 text-sm text-neutral-400">
                Waiting for the server…
              </p>
            )}
            {progress.result ? (
              <p className="mt-1 text-xs text-neutral-400">
                Completed: {progress.result.successCount} success,{" "}
                {progress.result.failedCount} failed,{" "}
                {progress.result.skippedCount} skipped
              </p>
            ) : null}
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}

function promptNoteTitle(note: PromptNote) {
  return note.title.trim() || "Untitled prompt";
}

function promptNoteDisplayTitle(note: PromptNote) {
  return note.title.trim();
}

function PromptNotesStrip({
  channelId,
  notes,
  isLoading,
  channels,
  currentMemberId,
  initialNoteId,
}: {
  channelId: string;
  notes: PromptNote[];
  isLoading: boolean;
  channels: TelegramChannel[];
  currentMemberId: string | null;
  initialNoteId: string;
}) {
  const queryClient = useQueryClient();
  const { pushToast } = useAppToast();
  const clickTimerRef = useRef<number | null>(null);
  const openedFromSearchRef = useRef("");
  const [editing, setEditing] = useState<PromptNote | null>(null);
  const [creating, setCreating] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  useEffect(
    () => () => {
      if (clickTimerRef.current) window.clearTimeout(clickTimerRef.current);
    },
    [],
  );

  useEffect(() => {
    if (!initialNoteId) {
      openedFromSearchRef.current = "";
      return;
    }
    if (openedFromSearchRef.current === initialNoteId) return;
    const note = notes.find((item) => item.id === initialNoteId);
    if (!note) return;
    setCreating(false);
    setEditing(note);
    openedFromSearchRef.current = initialNoteId;
  }, [initialNoteId, notes]);

  const invalidate = () =>
    queryClient.invalidateQueries({
      queryKey: ["prompt-notes", { telegramChannelId: channelId }],
    });

  const copyNote = async (note: PromptNote) => {
    await navigator.clipboard.writeText(note.content);
    setCopiedId(note.id);
    pushToast(`Prompt “${promptNoteTitle(note)}” copied.`, "success", 1800);
    window.setTimeout(
      () => setCopiedId((current) => (current === note.id ? null : current)),
      1400,
    );
  };

  const openWithDelay = (note: PromptNote) => {
    if (clickTimerRef.current) window.clearTimeout(clickTimerRef.current);
    clickTimerRef.current = window.setTimeout(() => {
      setEditing(note);
      clickTimerRef.current = null;
    }, POST_OPEN_CLICK_DELAY_MS);
  };

  const copyOnDoubleClick = (note: PromptNote) => {
    if (clickTimerRef.current) {
      window.clearTimeout(clickTimerRef.current);
      clickTimerRef.current = null;
    }
    void copyNote(note);
  };

  const removeNote = useMutation({
    mutationFn: promptNotesApi.remove,
    onSuccess: async () => {
      await invalidate();
      pushToast("Prompt note deleted.", "success");
      setEditing(null);
    },
  });

  return (
    <div className="flex min-w-0 flex-1 items-center gap-2 rounded-lg border border-neutral-800 bg-neutral-950/70 p-1.5">
      <div className="hidden shrink-0 px-2 text-xs font-medium text-neutral-400 xl:block">
        Prompts
      </div>
      {isLoading ? (
        <div className="flex items-center gap-2 px-2 text-xs text-neutral-400">
          <LoaderCircle size={14} className="animate-spin" />
          Loading…
        </div>
      ) : notes.length ? (
        <div className="flex min-w-0 flex-1 flex-wrap gap-1.5 overflow-visible pb-0.5">
          {notes.map((note) => {
            const displayTitle = promptNoteDisplayTitle(note);
            return (
            <button
              key={note.id}
              type="button"
              onClick={() => openWithDelay(note)}
              onDoubleClick={() => copyOnDoubleClick(note)}
              className={`group relative flex h-10 shrink-0 items-center gap-2 rounded-md border border-neutral-800 bg-neutral-950 px-2 text-left transition hover:border-blue-700 hover:bg-blue-950/20 ${
                displayTitle ? "min-w-36 max-w-56" : "w-10 justify-center"
              }`}
            >
              {copiedId === note.id ? (
                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-blue-950/70 text-blue-200">
                  <Check size={14} />
                </span>
              ) : note.icon ? (
                <IconAvatar
                  icon={note.icon}
                  label={displayTitle || "Prompt"}
                  size="xs"
                  className="!h-6 !w-6"
                />
              ) : (
                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-blue-950/70 text-sm">
                  {note.emoji || "📝"}
                </span>
              )}
              {displayTitle ? (
                <>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-xs font-medium text-white">
                      {displayTitle}
                    </span>
                  </span>
                  <Copy
                    size={12}
                    className="shrink-0 text-neutral-600 opacity-0 transition group-hover:opacity-100"
                  />
                </>
              ) : null}
              <TooltipBubble
                side="bottom"
                align="center"
                className="max-w-64 px-2.5 py-1.5 text-neutral-200 opacity-0 transition-opacity group-hover:opacity-100"
              >
                Double-click to copy
              </TooltipBubble>
            </button>
            );
          })}
        </div>
      ) : (
        <div className="min-w-0 flex-1 truncate px-2 text-xs text-neutral-500">
          No prompts for this channel
        </div>
      )}
      <Button className="h-10 shrink-0 px-3 py-1.5" onClick={() => setCreating(true)}>
        <span className="inline-flex items-center gap-1.5">
          <Plus size={14} />
          Add note
        </span>
      </Button>
      <PromptNoteEditorModal
        key={editing?.id || (creating ? "new" : "closed")}
        open={creating || Boolean(editing)}
        note={editing}
        channelId={channelId}
        channels={channels}
        currentMemberId={currentMemberId}
        onClose={() => {
          setCreating(false);
          setEditing(null);
        }}
        onSaved={invalidate}
        onDelete={(note) => removeNote.mutate(note.id)}
      />
    </div>
  );
}

function PromptNoteEditorModal({
  open,
  note,
  channelId,
  channels,
  currentMemberId,
  onClose,
  onSaved,
  onDelete,
}: {
  open: boolean;
  note: PromptNote | null;
  channelId: string;
  channels: TelegramChannel[];
  currentMemberId: string | null;
  onClose: () => void;
  onSaved: () => Promise<unknown>;
  onDelete: (note: PromptNote) => void;
}) {
  const { pushToast } = useAppToast();
  const [iconId, setIconId] = useState<string | null>(note?.iconId || null);
  const [title, setTitle] = useState(note?.title || "");
  const [content, setContent] = useState(note?.content || "");
  const [assignedMemberId, setAssignedMemberId] = useState<string | null>(
    note?.assignedMemberId || currentMemberId,
  );
  const [selectedChannelIds, setSelectedChannelIds] = useState<string[]>(
    note
      ? note.telegramChannelIds?.length
        ? note.telegramChannelIds
        : note.telegramChannelId
          ? [note.telegramChannelId]
          : []
      : [],
  );
  const save = useMutation({
    mutationFn: () =>
      note
        ? promptNotesApi.update(note.id, {
            iconId,
            title: title.trim(),
            content,
            assignedMemberId,
            telegramChannelIds: selectedChannelIds,
            postGroupId: null,
          })
        : promptNotesApi.create({
            iconId,
            title: title.trim(),
            content,
            assignedMemberId,
            telegramChannelIds: selectedChannelIds,
            postGroupId: null,
          }),
    onSuccess: async () => {
      await onSaved();
      pushToast(note ? "Prompt note updated." : "Prompt note created.", "success");
    },
  });

  const close = () => {
    onClose();
  };

  const submitSave = () => {
    onClose();
    void save.mutateAsync().catch(() => undefined);
  };

  return (
    <Modal
      open={open}
      onClose={close}
      title={note ? "Edit prompt note" : "Add prompt note"}
      size="xl"
    >
      <div className="space-y-4">
        <div className="grid gap-3 md:grid-cols-[auto_minmax(0,1fr)]">
          <FormField label="Emoji">
            <IconPicker
              compact
              iconId={iconId}
              onChange={setIconId}
              buttonLabel="Add emoji"
            />
          </FormField>
          <FormField label="Title">
            <Input
              autoFocus
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              placeholder="Researcher prompt"
            />
          </FormField>
        </div>
        <div className="grid gap-3 md:grid-cols-2">
          <FormField label="Member">
            <MemberSelect
              value={assignedMemberId}
              onChange={(value) => setAssignedMemberId(value || null)}
              defaultToCurrent
            />
          </FormField>
          <FormField label="Show for">
            <ChannelMultiSelect
              channels={channels}
              selectedIds={selectedChannelIds}
              onChange={setSelectedChannelIds}
            />
          </FormField>
        </div>
        <FormField label="Prompt text">
          <Textarea
            rows={10}
            value={content}
            onChange={(event) => setContent(event.target.value)}
            placeholder="Paste any amount of prompt text…"
            className="min-h-[14rem] max-h-[calc(100dvh-28rem)] overflow-y-auto font-mono leading-6"
          />
        </FormField>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <span className="text-xs text-neutral-500">
            {content.length.toLocaleString()} characters
          </span>
          <div className="flex flex-wrap gap-2">
            {note ? (
              <Button variant="danger" onClick={() => onDelete(note)}>
                <span className="inline-flex items-center gap-1.5">
                  <Trash2 size={14} />
                  Delete
                </span>
              </Button>
            ) : null}
            <Button
              disabled={!title.trim() || !content.trim()}
              onClick={submitSave}
            >
              {note ? "Save note" : "Create note"}
            </Button>
          </div>
        </div>
      </div>
    </Modal>
  );
}

function ChannelMultiSelect({
  channels,
  selectedIds,
  onChange,
}: {
  channels: TelegramChannel[];
  selectedIds: string[];
  onChange: (ids: string[]) => void;
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const selected = new Set(selectedIds);

  useEffect(() => {
    const onDocClick = (event: MouseEvent) => {
      if (!rootRef.current) return;
      if (!rootRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, []);

  const toggle = (channelId: string) => {
    onChange(
      selected.has(channelId)
        ? selectedIds.filter((id) => id !== channelId)
        : [...selectedIds, channelId],
    );
  };
  const label = selectedIds.length
    ? `${selectedIds.length} selected`
    : "All channels";

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        className="flex w-full items-center justify-between rounded-lg border border-neutral-700 bg-neutral-900 px-3 py-2 text-left text-sm text-white outline-none ring-blue-500 focus:ring"
      >
        <span className="min-w-0 truncate">{label}</span>
        <ChevronDown
          size={16}
          className={`shrink-0 text-neutral-400 transition-transform ${
            open ? "rotate-180" : ""
          }`}
        />
      </button>
      {open ? (
        <div className="absolute z-50 mt-1 w-full overflow-hidden rounded-lg border border-neutral-700 bg-neutral-900 shadow-xl">
          <div className="flex items-center justify-between gap-2 border-b border-neutral-800 px-2 py-2">
            <span className="truncate px-1 text-xs text-neutral-500">
              Empty = visible in every channel
            </span>
            <div className="flex shrink-0 gap-1 text-xs">
              <button
                type="button"
                onClick={() => onChange(channels.map((channel) => channel.id))}
                className="rounded-md px-2 py-1 text-blue-300 hover:bg-blue-950/50"
              >
                Select all
              </button>
              <button
                type="button"
                onClick={() => onChange([])}
                className="rounded-md px-2 py-1 text-neutral-400 hover:bg-neutral-800 hover:text-white"
              >
                All channels
              </button>
            </div>
          </div>
          <div className="max-h-60 overflow-y-auto p-1.5">
            {channels.map((channel) => (
              <button
                key={channel.id}
                type="button"
                onClick={() => toggle(channel.id)}
                className="flex w-full items-center gap-2 rounded-md px-2 py-2 text-left hover:bg-neutral-800"
              >
                <span
                  className={`flex h-4 w-4 shrink-0 items-center justify-center rounded border ${
                    selected.has(channel.id)
                      ? "border-blue-500 bg-blue-600 text-white"
                      : "border-neutral-600"
                  }`}
                >
                  {selected.has(channel.id) ? <Check size={11} /> : null}
                </span>
                {channel.photoUrl ? (
                  <span
                    className="h-6 w-6 shrink-0 rounded-md bg-cover bg-center"
                    style={{ backgroundImage: `url(${channel.photoUrl})` }}
                    aria-hidden="true"
                  />
                ) : (
                  <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-neutral-800 text-xs">
                    {channel.title.trim()[0]?.toUpperCase() || "T"}
                  </span>
                )}
                <span className="min-w-0 flex-1 truncate text-sm text-white">
                  {channel.title}
                </span>
              </button>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}

function PostIcon({
  iconId,
  label,
  size = "xs",
  bare = false,
}: {
  iconId?: string | null;
  label: string;
  size?: "xs" | "sm" | "md";
  bare?: boolean;
}) {
  const icon = useQuery({
    queryKey: ["icon", iconId],
    queryFn: () => iconsApi.get(iconId as string),
    enabled: Boolean(iconId),
  });
  if (!iconId) return null;
  return (
    <IconAvatar
      icon={icon.data}
      label={label}
      size={size}
      bordered={!bare}
      className={bare ? "!border-0 !bg-transparent" : ""}
    />
  );
}

function PendingPostRow({ pending }: { pending: PendingPostSave }) {
  return (
    <div className="flex items-center gap-2 rounded-lg border border-blue-700/70 bg-blue-950/15 px-3 py-2">
      <LoaderCircle size={16} className="shrink-0 animate-spin text-blue-400" />
      <PostIcon iconId={pending.icon} label={pending.title} bare />
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm text-white">
          {pending.title}
        </span>
      </span>
      <span className="text-[11px] text-blue-300">Saving…</span>
    </div>
  );
}

function MovePostModal({
  post,
  channels,
  sourceChannelId,
  onClose,
  onMoved,
}: {
  post: TelegramManagedPost;
  channels: TelegramChannel[];
  sourceChannelId: string;
  onClose: () => void;
  onMoved: (result: BulkActionResult) => Promise<void>;
}) {
  const [targetId, setTargetId] = useState("");
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<ProgressState | null>(null);
  return (
    <>
      <Modal
        open
        onClose={onClose}
        title="Move post"
        loading={busy}
        allowOverflow
      >
        <div className="space-y-4">
          <p className="text-sm text-amber-200">
            Drafts remain drafts. Scheduled posts are recreated at the same
            time. Published posts become drafts; old Telegram messages remain.
          </p>
          <FormField label="Target channel" required>
            <CustomSelect
              value={targetId}
              onChange={setTargetId}
              options={channels
                .filter((channel) => channel.id !== sourceChannelId)
                .map((channel) => ({
                  value: channel.id,
                  label: channel.title,
                  iconUrl: channel.photoUrl || undefined,
                }))}
            />
          </FormField>
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={onClose}>
              Cancel
            </Button>
            <Button
              disabled={!targetId || busy}
              onClick={async () => {
                if (!targetId) return;
                setBusy(true);
                setProgress({
                  title: "Moving post…",
                  current: 0,
                  total: 1,
                });
                try {
                  const response = await telegramChannelsApi.moveManagedPost(
                    sourceChannelId,
                    post.id,
                    targetId,
                  );
                  setProgress({
                    title: "Moving post",
                    current: 1,
                    total: 1,
                    item: response.results[0],
                    result: response,
                  });
                  await onMoved(response);
                  window.setTimeout(() => setProgress(null), 2200);
                } finally {
                  setBusy(false);
                }
              }}
            >
              Move post
            </Button>
          </div>
        </div>
      </Modal>
      <BulkProgressOverlay progress={progress} />
    </>
  );
}

function PostGroupsWorkspace({
  channelId,
  channels,
  initialGroupId,
  onOpenPost,
}: {
  channelId: string;
  channels: TelegramChannel[];
  initialGroupId: string;
  onOpenPost: (post: TelegramManagedPost) => void;
}) {
  const queryClient = useQueryClient();
  const { pushToast, setProgress, clearProgress } = useAppToast();
  const openedFromSearchRef = useRef("");
  const [selectedGroupId, setSelectedGroupId] = useState<string | null>(null);
  const [selectedGroupIds, setSelectedGroupIds] = useState<string[]>([]);
  const [groupForm, setGroupForm] = useState<PostGroup | "new" | null>(null);
  const [addPostsOpen, setAddPostsOpen] = useState(false);
  const [moveOpen, setMoveOpen] = useState(false);
  const [movingListGroup, setMovingListGroup] = useState<PostGroup | null>(null);
  const [bulkMoveOpen, setBulkMoveOpen] = useState(false);
  const [movingGroupPost, setMovingGroupPost] =
    useState<TelegramManagedPost | null>(null);
  const [publishOpen, setPublishOpen] = useState(false);
  const [scheduleOpen, setScheduleOpen] = useState(false);
  const [resetDraftsOpen, setResetDraftsOpen] = useState(false);
  const [deletingGroup, setDeletingGroup] = useState<PostGroup | null>(null);
  const [draggedId, setDraggedId] = useState<string | null>(null);
  const reorderTimerRef = useRef<number | null>(null);
  const reorderVersionRef = useRef(0);
  const reorderQueueRef = useRef<Promise<void>>(Promise.resolve());
  const groups = useQuery({
    queryKey: ["post-groups", channelId],
    queryFn: () =>
      telegramChannelsApi.postGroups({ telegramChannelId: channelId }),
  });
  const detail = useQuery({
    queryKey: ["post-group", selectedGroupId],
    queryFn: () => telegramChannelsApi.postGroup(selectedGroupId as string),
    enabled: Boolean(selectedGroupId),
  });
  const posts = useQuery({
    queryKey: ["telegram-managed-posts", channelId],
    queryFn: () => telegramChannelsApi.managedPosts(channelId),
  });
  const [orderedPostIds, setOrderedPostIds] = useState<string[]>([]);
  const orderedPosts = useMemo(() => {
    const source = detail.data?.posts || [];
    if (
      orderedPostIds.length !== source.length ||
      orderedPostIds.some((id) => !source.some((post) => post.id === id))
    ) {
      return source;
    }
    const byId = new Map(source.map((post) => [post.id, post]));
    return orderedPostIds
      .map((id) => byId.get(id))
      .filter((post): post is TelegramManagedPost => Boolean(post));
  }, [detail.data?.posts, orderedPostIds]);

  const groupsList = useMemo(() => groups.data || [], [groups.data]);
  useEffect(() => {
    if (!initialGroupId) {
      openedFromSearchRef.current = "";
      return;
    }
    if (openedFromSearchRef.current === initialGroupId) return;
    if (!groupsList.some((group) => group.id === initialGroupId)) return;
    setSelectedGroupId(initialGroupId);
    openedFromSearchRef.current = initialGroupId;
  }, [groupsList, initialGroupId]);
  const groupIconIds = useMemo(
    () =>
      [...new Set(groupsList.map((group) => group.icon).filter(Boolean))] as string[],
    [groupsList],
  );
  const groupIconQueries = useQueries({
    queries: groupIconIds.map((iconId) => ({
      queryKey: ["icon", iconId],
      queryFn: () => iconsApi.get(iconId),
    })),
  });
  const groupIconsById = useMemo(() => {
    const map = new Map<string, Awaited<ReturnType<typeof iconsApi.get>>>();
    groupIconQueries.forEach((query, index) => {
      if (query.data) map.set(groupIconIds[index], query.data);
    });
    return map;
  }, [groupIconIds, groupIconQueries]);
  const allGroupIds = useMemo(
    () => groupsList.map((group) => group.id),
    [groupsList],
  );
  const visibleSelectedGroupIds = useMemo(
    () => selectedGroupIds.filter((id) => allGroupIds.includes(id)),
    [allGroupIds, selectedGroupIds],
  );
  const allGroupsSelected =
    groupsList.length > 0 && visibleSelectedGroupIds.length === groupsList.length;
  const selectedGroups = groupsList.filter((group) =>
    visibleSelectedGroupIds.includes(group.id),
  );

  const refresh = async (channelIds: string[] = [channelId]) => {
    const uniqueChannelIds = [...new Set(channelIds.filter(Boolean))];
    await Promise.all([
      ...uniqueChannelIds.flatMap((id) => [
        queryClient.invalidateQueries({ queryKey: ["post-groups", id] }),
        queryClient.invalidateQueries({
          queryKey: ["telegram-managed-posts", id],
        }),
      ]),
      selectedGroupId
        ? queryClient.invalidateQueries({
            queryKey: ["post-group", selectedGroupId],
          })
        : Promise.resolve(),
    ]);
  };

  const forceReloadGroupData = async (channelIds: string[]) => {
    const uniqueChannelIds = [...new Set(channelIds.filter(Boolean))];
    uniqueChannelIds.forEach((id) => {
      queryClient.removeQueries({ queryKey: ["post-groups", id], exact: true });
      queryClient.removeQueries({
        queryKey: ["telegram-managed-posts", id],
        exact: true,
      });
    });
    if (selectedGroupId) {
      queryClient.removeQueries({
        queryKey: ["post-group", selectedGroupId],
        exact: true,
      });
    }
    await Promise.all([
      ...uniqueChannelIds.flatMap((id) => [
        queryClient.refetchQueries({
          queryKey: ["post-groups", id],
          exact: true,
          type: "active",
        }),
        queryClient.refetchQueries({
          queryKey: ["telegram-managed-posts", id],
          exact: true,
          type: "active",
        }),
      ]),
    ]);
  };

  const toggleGroupSelected = (groupId: string) => {
    setSelectedGroupIds((current) =>
      current.includes(groupId)
        ? current.filter((id) => id !== groupId)
        : [...current, groupId],
    );
  };

  const toggleAllGroupsSelected = () => {
    setSelectedGroupIds(allGroupsSelected ? [] : allGroupIds);
  };
  const scheduleProgressDismiss = (progressId: string, delayMs = 2800) => {
    window.setTimeout(() => clearProgress(progressId), delayMs);
  };
  const progressMetaForGroup = (group: PostGroup) => {
    const icon = group.icon ? groupIconsById.get(group.icon) : undefined;
    return {
      id: `move-group:${group.id}`,
      title: `Move ${group.title}`,
      iconEmoji: icon?.emoji || undefined,
      iconUrl: icon?.imageUrl || undefined,
    };
  };
  const scheduleReorderSave = (
    groupId: string,
    orderedPostIdsToSave: string[],
  ) => {
    reorderVersionRef.current += 1;
    const version = reorderVersionRef.current;
    if (reorderTimerRef.current) {
      window.clearTimeout(reorderTimerRef.current);
    }
    reorderTimerRef.current = window.setTimeout(() => {
      reorderQueueRef.current = reorderQueueRef.current
        .catch(() => undefined)
        .then(async () => {
          const previousDetail = queryClient.getQueryData<PostGroup>([
            "post-group",
            groupId,
          ]);
          const previousPosts = queryClient.getQueryData<TelegramManagedPost[]>(
            ["telegram-managed-posts", channelId],
          );
          const orderIndex = new Map(
            orderedPostIdsToSave.map((id, index) => [id, index]),
          );
          queryClient.setQueryData<PostGroup>(
            ["post-group", groupId],
            (current) =>
              current
                ? {
                    ...current,
                    posts: [...(current.posts ?? [])]
                      .map((post) => ({
                        ...post,
                        groupPosition:
                          orderIndex.get(post.id) ?? post.groupPosition,
                      }))
                      .sort(
                        (left, right) =>
                          (left.groupPosition ?? Number.MAX_SAFE_INTEGER) -
                          (right.groupPosition ?? Number.MAX_SAFE_INTEGER),
                      ),
                  }
                : current,
          );
          queryClient.setQueryData<TelegramManagedPost[]>(
            ["telegram-managed-posts", channelId],
            (current) =>
              current?.map((post) =>
                orderIndex.has(post.id)
                  ? {
                      ...post,
                      groupPosition:
                        orderIndex.get(post.id) ?? post.groupPosition,
                    }
                  : post,
              ),
          );
          try {
            await telegramChannelsApi.reorderPostGroup(
              groupId,
              orderedPostIdsToSave,
              true,
            );
            if (version !== reorderVersionRef.current) return;
            await Promise.all([
              queryClient.invalidateQueries({
                queryKey: ["post-group", groupId],
              }),
              queryClient.invalidateQueries({
                queryKey: ["telegram-managed-posts", channelId],
              }),
            ]);
            setOrderedPostIds([]);
            pushToast("New post order saved.", "success", 3000);
          } catch (error) {
            if (version !== reorderVersionRef.current) return;
            queryClient.setQueryData(["post-group", groupId], previousDetail);
            queryClient.setQueryData(
              ["telegram-managed-posts", channelId],
              previousPosts,
            );
            setOrderedPostIds([]);
            pushToast(
              apiErrorMessage(error, "Could not reorder posts"),
              "error",
            );
          }
        });
    }, 700);
  };

  const runBulk = async (
    title: string,
    request: (
      onProgress: (
        item: BulkActionResultItem,
        current: number,
        total: number,
      ) => void,
    ) => Promise<BulkActionResult>,
    progressMeta?: {
      id?: string;
      title?: string;
      iconEmoji?: string;
      iconUrl?: string;
      initialMessage?: string;
    },
  ) => {
    const total = detail.data?.posts?.length || 0;
    const progressId = progressMeta?.id;
    setProgress({
      id: progressId,
      title: progressMeta?.title || title,
      current: 0,
      total,
      message: progressMeta?.initialMessage || "Loading…",
      iconEmoji: progressMeta?.iconEmoji,
      iconUrl: progressMeta?.iconUrl,
    });
    try {
      const result = await request((item, current, progressTotal) => {
        setProgress({
          id: progressId,
          title: progressMeta?.title || title,
          current,
          total: progressTotal,
          message: item.message,
          iconEmoji: progressMeta?.iconEmoji,
          iconUrl: progressMeta?.iconUrl,
        });
      });
      setProgress({
        id: progressId,
        title: progressMeta?.title || title,
        current: result.total,
        total: result.total,
        message: result.results.at(-1)?.message,
        completed: true,
        successCount: result.successCount,
        failedCount: result.failedCount,
        skippedCount: result.skippedCount,
        iconEmoji: progressMeta?.iconEmoji,
        iconUrl: progressMeta?.iconUrl,
      });
      if (progressId) scheduleProgressDismiss(progressId);
      else window.setTimeout(() => setProgress(null), 2800);
      await refresh();
      return result;
    } catch (error) {
      if (progressId) clearProgress(progressId);
      else setProgress(null);
      pushToast(apiErrorMessage(error, `${title} failed`), "error", 7000);
      throw error;
    }
  };

  const groupActionButtonClass =
    "inline-flex h-9 items-center gap-2 rounded-md border border-neutral-700 px-3 text-sm font-medium text-neutral-200 transition hover:bg-neutral-800";
  const groupIconActionButtonClass =
    "inline-flex h-9 w-9 items-center justify-center rounded-md border border-neutral-700 text-neutral-300 transition hover:bg-neutral-800";
  const groupDangerActionButtonClass =
    "inline-flex h-9 w-9 items-center justify-center rounded-md border border-rose-700 text-rose-300 transition hover:bg-rose-950/40";

  if (selectedGroupId) {
    const group = detail.data;
    return (
      <>
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <button
            type="button"
            onClick={() => setSelectedGroupId(null)}
            className={groupActionButtonClass}
          >
            ← Groups
          </button>
          {group ? (
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => setAddPostsOpen(true)}
                className={groupActionButtonClass}
              >
                <ListPlus size={14} />
                Add posts
              </button>
              <button
                type="button"
                onClick={() => setScheduleOpen(true)}
                className={groupActionButtonClass}
              >
                <Clock3 size={14} />
                Schedule sequence
              </button>
              <button
                type="button"
                onClick={() => setPublishOpen(true)}
                className="inline-flex h-9 items-center gap-2 rounded-md bg-blue-600 px-3 text-sm font-medium text-white transition hover:bg-blue-500"
              >
                <Rocket size={14} />
                Publish all
              </button>
              <button
                type="button"
                onClick={() => setResetDraftsOpen(true)}
                className={groupActionButtonClass}
              >
                <RotateCcw size={14} />
                Make drafts
              </button>
              <button
                type="button"
                onClick={() => setMoveOpen(true)}
                className={groupIconActionButtonClass}
                title="Move group"
                aria-label="Move group"
              >
                <MoveRight size={14} />
              </button>
              <button
                type="button"
                onClick={() => setGroupForm(group)}
                className={groupIconActionButtonClass}
                title="Edit group"
                aria-label="Edit group"
              >
                <Pencil size={14} />
              </button>
              <button
                type="button"
                onClick={() => setDeletingGroup(group)}
                className={groupDangerActionButtonClass}
                title="Delete group"
                aria-label="Delete group"
              >
                <Trash2 size={14} />
              </button>
            </div>
          ) : null}
        </div>
        {detail.isLoading ? <LoadingState /> : null}
        {group ? (
          <div className="grid gap-4 xl:grid-cols-[minmax(280px,0.7fr)_minmax(0,1.3fr)]">
            <Card className="space-y-4">
              <div className="flex items-start gap-3">
                <PostIcon iconId={group.icon} label={group.title} size="md" />
                <div className="min-w-0">
                  <h2 className="text-xl font-semibold text-white">
                    {group.title}
                  </h2>
                  <p className="mt-1 text-sm text-neutral-400">
                    {group.description || "No description"}
                  </p>
                </div>
              </div>
              <div>
                <p className="mb-1 text-xs uppercase text-neutral-500">
                  Created by
                </p>
                <MemberBadge member={group.createdByMember} />
              </div>
              <div>
                <p className="mb-1 text-xs uppercase text-neutral-500">
                  Telegram channel
                </p>
                <p className="text-sm text-neutral-200">
                  {group.telegramChannel?.title ||
                    channels.find((item) => item.id === group.telegramChannelId)
                      ?.title}
                </p>
              </div>
              <GroupSummary summary={group.statusSummary} />
            </Card>
            <Card>
              <div className="mb-3 flex items-center justify-between">
                <h3 className="font-semibold text-white">Posts in group</h3>
                <span className="text-xs text-neutral-500">
                  Drag cards to reorder
                </span>
              </div>
              {orderedPosts.length ? (
                <div className="space-y-2">
                  {orderedPosts.map((post) => (
                    <div
                      key={post.id}
                      draggable
                      onDragStart={() => setDraggedId(post.id)}
                      onDragOver={(event) => {
                        event.preventDefault();
                        if (!draggedId || draggedId === post.id) return;
                        setOrderedPostIds((currentIds) => {
                          const current = currentIds.length
                            ? currentIds
                            : orderedPosts.map((item) => item.id);
                          const from = current.indexOf(draggedId);
                          const to = current.indexOf(post.id);
                          if (from < 0 || to < 0) return current;
                          const next = [...current];
                          const [moved] = next.splice(from, 1);
                          next.splice(to, 0, moved);
                          return next;
                        });
                      }}
                      onDragEnd={() => {
                        setDraggedId(null);
                        scheduleReorderSave(
                          group.id,
                          orderedPosts.map((item) => item.id),
                        );
                      }}
                      className={`flex items-center gap-3 rounded-lg border p-3 ${
                        draggedId === post.id
                          ? "border-blue-500 bg-blue-950/30 opacity-70"
                          : "border-neutral-800 bg-neutral-950"
                      }`}
                    >
                      <GripVertical
                        size={18}
                        className="cursor-grab text-neutral-500"
                      />
                      <button
                        type="button"
                        onClick={() => onOpenPost(post)}
                        className="min-w-0 flex-1 text-left"
                      >
                        <span className="flex min-w-0 items-center gap-1.5 text-sm text-white">
                          {post.icon ? (
                            <PostIcon
                              iconId={post.icon}
                              label={post.title}
                              bare
                            />
                          ) : (
                            <PostStatusIcon status={post.status} />
                          )}
                          <span className="truncate">{post.title}</span>
                        </span>
                        <span className="block text-xs text-neutral-500">
                          {post.scheduledAt
                            ? new Date(post.scheduledAt).toLocaleString()
                            : post.status.toLowerCase()}
                        </span>
                      </button>
                      <MemberBadge member={post.assignedMember} compact />
                      <button
                        className="rounded-md border border-neutral-700 p-1.5 text-neutral-300 hover:bg-neutral-800"
                        title="Move to another channel"
                        onClick={() => setMovingGroupPost(post)}
                      >
                        <MoveRight size={14} />
                      </button>
                      <button
                        className="rounded-md border border-neutral-700 px-2 py-1 text-xs text-neutral-300 hover:bg-neutral-800"
                        onClick={async () => {
                          await telegramChannelsApi.removePostFromGroup(
                            group.id,
                            post.id,
                          );
                          await refresh();
                        }}
                      >
                        Remove
                      </button>
                    </div>
                  ))}
                </div>
              ) : (
                <EmptyState text="This group has no posts yet." />
              )}
            </Card>
          </div>
        ) : null}
        {groupForm ? (
          <GroupFormModal
            key={groupForm === "new" ? "new" : groupForm.id}
            value={groupForm}
            channelId={channelId}
            posts={groupForm === "new" ? posts.data || [] : undefined}
            onClose={() => setGroupForm(null)}
            onSaved={async (saved) => {
              setGroupForm(null);
              setSelectedGroupId(saved.id);
              await refresh();
            }}
          />
        ) : null}
        {addPostsOpen ? (
          <AddPostsModal
            group={group}
            posts={posts.data || []}
            onClose={() => setAddPostsOpen(false)}
            onAdded={async () => {
              setAddPostsOpen(false);
              await refresh();
            }}
          />
        ) : null}
        {moveOpen ? (
          <MoveGroupModal
            group={group}
            channels={channels}
            onClose={() => setMoveOpen(false)}
            onSubmit={async (targetId) => {
              setMoveOpen(false);
              await runBulk("Moving group", async (onProgress) => {
                const response = await telegramChannelsApi.movePostGroup(
                  group!.id,
                  targetId,
                  true,
                  onProgress,
                );
                return response;
              }, {
                ...progressMetaForGroup(group!),
                initialMessage: "Loading…",
              });
              setSelectedGroupId(null);
              await refresh([channelId, targetId]);
              await forceReloadGroupData([channelId, targetId]);
            }}
          />
        ) : null}
        {movingGroupPost ? (
          <MovePostModal
            post={movingGroupPost}
            channels={channels}
            sourceChannelId={group?.telegramChannelId || channelId}
            onClose={() => setMovingGroupPost(null)}
            onMoved={async (result) => {
              setMovingGroupPost(null);
              await refresh();
              pushToast(
                result.results
                  .map((item) => item.message)
                  .filter(Boolean)
                  .join("\n"),
                result.failedCount ? "error" : "success",
                7000,
              );
            }}
          />
        ) : null}
        <PublishGroupModal
          open={publishOpen}
          onClose={() => setPublishOpen(false)}
          onSubmit={async (options) => {
            setPublishOpen(false);
            await runBulk("Publishing posts", (onProgress) =>
              telegramChannelsApi.publishPostGroup(
                group!.id,
                options,
                true,
                onProgress,
              ),
            );
          }}
        />
        <ScheduleGroupModal
          open={scheduleOpen}
          group={group}
          onClose={() => setScheduleOpen(false)}
          onSubmit={async (payload) => {
            setScheduleOpen(false);
            await runBulk("Scheduling posts", (onProgress) =>
              telegramChannelsApi.schedulePostGroupSequence(
                group!.id,
                payload,
                true,
                onProgress,
              ),
            );
          }}
        />
        <Modal
          open={resetDraftsOpen}
          onClose={() => setResetDraftsOpen(false)}
          title="Make all posts drafts?"
        >
          <p className="text-sm text-neutral-300">
            Scheduled Telegram posts will be cancelled. Already published
            Telegram messages will remain in the channel.
          </p>
          <div className="mt-5 flex justify-end gap-2">
            <Button
              variant="secondary"
              onClick={() => setResetDraftsOpen(false)}
            >
              Cancel
            </Button>
            <Button
              onClick={() => {
                setResetDraftsOpen(false);
                void runBulk("Converting posts to drafts", (onProgress) =>
                  telegramChannelsApi.resetPostGroupToDrafts(
                    group!.id,
                    true,
                    onProgress,
                  ),
                ).catch(() => undefined);
              }}
            >
              Make all drafts
            </Button>
          </div>
        </Modal>
        <ConfirmDeleteModal
          open={!!deletingGroup}
          onClose={() => setDeletingGroup(null)}
          entityName={deletingGroup?.title || ""}
          label="Delete group"
          description="Delete group? Posts will not be deleted. They will become ungrouped."
          onConfirm={async () => {
            if (!deletingGroup) return;
            await telegramChannelsApi.deletePostGroup(deletingGroup.id);
            setDeletingGroup(null);
            setSelectedGroupId(null);
            await groups.refetch();
          }}
        />
      </>
    );
  }

  return (
    <>
      <div className="mb-4 flex items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-semibold text-white">Post groups</h2>
          <p className="text-sm text-neutral-400">
            Named series scoped to this Telegram channel
          </p>
        </div>
        <Button onClick={() => setGroupForm("new")}>
          <span className="inline-flex items-center gap-2">
            <FolderPlus size={16} /> New group
          </span>
        </Button>
      </div>
      {groupsList.length ? (
        <Card className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-2">
            <Button variant="secondary" onClick={toggleAllGroupsSelected}>
              {allGroupsSelected ? "Clear all" : "Select all"}
            </Button>
            <span className="text-sm text-neutral-400">
              {visibleSelectedGroupIds.length
                ? `${visibleSelectedGroupIds.length} selected`
                : "No groups selected"}
            </span>
          </div>
          <Button
            disabled={!visibleSelectedGroupIds.length}
            onClick={() => setBulkMoveOpen(true)}
          >
            Move selected
          </Button>
        </Card>
      ) : null}
      {groups.isLoading ? <LoadingState /> : null}
      {groupsList.length ? (
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {groupsList.map((group) => {
            const isSelected = visibleSelectedGroupIds.includes(group.id);
            return (
            <div
              key={group.id}
              className={`rounded-xl border bg-neutral-900 p-4 text-left transition hover:bg-neutral-900/80 ${
                isSelected
                  ? "border-blue-600 shadow-[0_0_0_1px_rgba(37,99,235,0.45)]"
                  : "border-neutral-800 hover:border-blue-700"
              }`}
            >
              <div className="flex items-start gap-3">
                <button
                  type="button"
                  aria-label={
                    isSelected ? "Deselect group" : "Select group for bulk move"
                  }
                  onClick={() => toggleGroupSelected(group.id)}
                  className={`mt-1 inline-flex h-5 w-5 shrink-0 items-center justify-center rounded border ${
                    isSelected
                      ? "border-blue-500 bg-blue-600 text-white"
                      : "border-neutral-600 bg-neutral-950 text-transparent"
                  }`}
                >
                  <Check size={12} />
                </button>
                <div className="flex min-w-0 flex-1 items-start justify-between gap-3">
                  <button
                    type="button"
                    onClick={() => setSelectedGroupId(group.id)}
                    className="flex min-w-0 flex-1 items-start gap-3 text-left"
                  >
                    <PostIcon iconId={group.icon} label={group.title} size="sm" />
                    <div className="min-w-0 flex-1">
                      <h3 className="truncate font-semibold text-white">
                        {group.title}
                      </h3>
                      <div className="mt-1">
                        <MemberBadge member={group.createdByMember} />
                      </div>
                    </div>
                  </button>
                  <div className="flex shrink-0 items-center gap-2">
                    <button
                      type="button"
                      onClick={() => setMovingListGroup(group)}
                      className={groupIconActionButtonClass}
                      title="Move group"
                      aria-label={`Move ${group.title}`}
                    >
                      <MoveRight size={14} />
                    </button>
                    <button
                      type="button"
                      onClick={() => setDeletingGroup(group)}
                      className={groupDangerActionButtonClass}
                      title="Delete group"
                      aria-label={`Delete ${group.title}`}
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setSelectedGroupId(group.id)}
                className="mt-4 block w-full text-left"
              >
                <GroupSummary summary={group.statusSummary} />
              </button>
            </div>
            );
          })}
        </div>
      ) : !groups.isLoading ? (
        <EmptyState text="No groups yet. Create the first named post series." />
      ) : null}
      {groupForm ? (
        <GroupFormModal
          key={groupForm === "new" ? "new" : groupForm.id}
          value={groupForm}
          channelId={channelId}
          posts={posts.data || []}
          onClose={() => setGroupForm(null)}
          onSaved={async (saved) => {
            setGroupForm(null);
            await groups.refetch();
            setSelectedGroupId(saved.id);
          }}
        />
      ) : null}
      {bulkMoveOpen ? (
        <BulkMoveGroupsModal
          groups={selectedGroups}
          channels={channels}
          sourceChannelId={channelId}
          onClose={() => setBulkMoveOpen(false)}
          onSubmit={async (targetId) => {
            const groupsToMove = selectedGroups;
            setBulkMoveOpen(false);
            if (!groupsToMove.length) return;
            const results = await Promise.all(
              groupsToMove.map(async (group) => {
                const progressMeta = progressMetaForGroup(group);
                setProgress({
                  ...progressMeta,
                  current: 0,
                  total: group.statusSummary.totalPosts || 0,
                  message: "Loading…",
                });
                try {
                  const response = await telegramChannelsApi.movePostGroup(
                    group.id,
                    targetId,
                    true,
                    (item, current, total) => {
                      setProgress({
                        ...progressMeta,
                        current,
                        total,
                        message: item.message,
                      });
                    },
                  );
                  setProgress({
                    ...progressMeta,
                    current: response.total,
                    total: response.total,
                    message: response.results.at(-1)?.message || "Completed",
                    completed: true,
                    successCount: response.successCount,
                    failedCount: response.failedCount,
                    skippedCount: response.skippedCount,
                  });
                  scheduleProgressDismiss(progressMeta.id);
                  return {
                    ok: true as const,
                    message: `${group.title}: moved`,
                  };
                } catch (error) {
                  clearProgress(progressMeta.id);
                  return {
                    ok: false as const,
                    message: `${group.title}: ${apiErrorMessage(error, "Move failed")}`,
                  };
                }
              }),
            );
            const movedCount = results.filter((item) => item.ok).length;
            const failedCount = results.length - movedCount;
            const messages = results.map((item) => item.message);
            setSelectedGroupIds([]);
            await refresh([channelId, targetId]);
            await forceReloadGroupData([channelId, targetId]);
            pushToast(
              messages.join("\n"),
              failedCount ? "error" : "success",
              7000,
            );
          }}
        />
      ) : null}
      {movingListGroup ? (
        <MoveGroupModal
          group={movingListGroup}
          channels={channels}
          onClose={() => setMovingListGroup(null)}
          onSubmit={async (targetId) => {
            const group = movingListGroup;
            setMovingListGroup(null);
            if (!group) return;
            await runBulk(
              "Moving group",
              async (onProgress) =>
                telegramChannelsApi.movePostGroup(
                  group.id,
                  targetId,
                  true,
                  onProgress,
                ),
              {
                ...progressMetaForGroup(group),
                initialMessage: "Loading…",
              },
            );
            setSelectedGroupIds((current) =>
              current.filter((id) => id !== group.id),
            );
            await refresh([channelId, targetId]);
            await forceReloadGroupData([channelId, targetId]);
          }}
        />
      ) : null}
      <ConfirmDeleteModal
        open={!!deletingGroup}
        onClose={() => setDeletingGroup(null)}
        entityName={deletingGroup?.title || ""}
        label="Delete group"
        description="Delete group? Posts will not be deleted. They will become ungrouped."
        onConfirm={async () => {
          if (!deletingGroup) return;
          await telegramChannelsApi.deletePostGroup(deletingGroup.id);
          setSelectedGroupIds((current) =>
            current.filter((id) => id !== deletingGroup.id),
          );
          setDeletingGroup(null);
          await groups.refetch();
        }}
      />
    </>
  );
}

function GroupSummary({ summary }: { summary: PostGroup["statusSummary"] }) {
  const visibleStatuses = [
    {
      label: "Draft",
      count: summary.draftCount,
      emoji: "📝",
      className: "border-blue-800/70 bg-blue-950/30 text-blue-200",
    },
    {
      label: "Scheduled",
      count: summary.scheduledCount,
      emoji: "🕒",
      className: "border-amber-800/70 bg-amber-950/30 text-amber-200",
    },
    {
      label: "Published",
      count: summary.publishedCount,
      emoji: "✅",
      className: "border-emerald-800/70 bg-emerald-950/30 text-emerald-200",
    },
    {
      label: "Failed",
      count: summary.failedCount,
      emoji: "⚠️",
      className: "border-red-800/70 bg-red-950/30 text-red-200",
    },
  ].filter((item) => item.count > 0);
  return (
    <div className="space-y-2">
      {visibleStatuses.length ? (
        <div className="flex flex-wrap gap-1.5 text-[11px]">
          {visibleStatuses.map((item) => (
            <div
              key={item.label}
              className={`flex min-w-[92px] flex-1 items-center justify-center gap-2 rounded-md border px-2 py-2 ${item.className}`}
            >
              <span className="text-sm">{item.emoji}</span>
              <span>
                <span className="mr-1 font-semibold text-white">
                  {item.count}
                </span>
                {item.label}
              </span>
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function GroupFormModal({
  value,
  channelId,
  posts,
  onClose,
  onSaved,
}: {
  value: PostGroup | "new";
  channelId: string;
  posts?: TelegramManagedPost[];
  onClose: () => void;
  onSaved: (group: PostGroup) => Promise<void>;
}) {
  const editing = value && value !== "new" ? value : null;
  const [title, setTitle] = useState(editing?.title || "");
  const [description, setDescription] = useState(editing?.description || "");
  const [icon, setIcon] = useState<string | null>(editing?.icon || null);
  const [busy, setBusy] = useState(false);
  const [selectedPostIds, setSelectedPostIds] = useState<string[]>([]);
  return (
    <Modal
      open={Boolean(value)}
      onClose={onClose}
      title={editing ? "Edit group" : "Create group"}
      loading={busy}
      allowOverflow
    >
      <div className="space-y-3">
        <FormField label="Title" required>
          <Input
            value={title}
            onChange={(event) => setTitle(event.target.value)}
          />
        </FormField>
        <FormField label="Icon">
          <IconPicker iconId={icon} onChange={setIcon} buttonLabel="Add icon" />
        </FormField>
        <FormField label="Description">
          <Textarea
            rows={3}
            value={description}
            onChange={(event) => setDescription(event.target.value)}
          />
        </FormField>
        {!editing ? (
          <FormField label="Posts">
            {posts?.length ? (
              <div className="max-h-56 space-y-1 overflow-y-auto rounded-lg border border-neutral-800 p-2">
                {posts.map((post) => (
                  <label
                    key={post.id}
                    className="flex items-center gap-3 rounded-md px-2 py-2 hover:bg-neutral-800"
                  >
                    <input
                      type="checkbox"
                      checked={selectedPostIds.includes(post.id)}
                      onChange={() =>
                        setSelectedPostIds((current) =>
                          current.includes(post.id)
                            ? current.filter((id) => id !== post.id)
                            : [...current, post.id],
                        )
                      }
                    />
                    <PostIcon iconId={post.icon} label={post.title} />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm text-white">
                        {post.title}
                      </span>
                      <span className="block truncate text-[11px] text-neutral-500">
                        {post.group
                          ? `Currently in ${post.group.title} — will be moved`
                          : post.status.toLowerCase()}
                      </span>
                    </span>
                  </label>
                ))}
              </div>
            ) : (
              <EmptyState text="No posts available in this channel." />
            )}
          </FormField>
        ) : null}
        {editing ? (
          <div>
            <p className="mb-1 text-xs text-neutral-500">Created by</p>
            <MemberBadge member={editing.createdByMember} />
          </div>
        ) : null}
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button
            disabled={!title.trim() || busy}
            onClick={async () => {
              setBusy(true);
              try {
                const group = editing
                  ? await telegramChannelsApi.updatePostGroup(editing.id, {
                      title: title.trim(),
                      description: description.trim() || null,
                      icon,
                    })
                  : await telegramChannelsApi.createPostGroup({
                      telegramChannelId: channelId,
                      title: title.trim(),
                      description: description.trim() || null,
                      icon,
                      postIds: selectedPostIds,
                    });
                await onSaved(group);
              } finally {
                setBusy(false);
              }
            }}
          >
            Save group
          </Button>
        </div>
      </div>
    </Modal>
  );
}

function AddPostsModal({
  group,
  posts,
  onClose,
  onAdded,
}: {
  group?: PostGroup;
  posts: TelegramManagedPost[];
  onClose: () => void;
  onAdded: () => Promise<void>;
}) {
  const [selected, setSelected] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const available = posts.filter((post) => post.groupId !== group?.id);
  return (
    <Modal open onClose={onClose} title="Add posts" loading={busy}>
      <div className="space-y-3">
        {available.length ? (
          available.map((post) => (
            <label
              key={post.id}
              className="flex items-center gap-3 rounded-lg border border-neutral-800 p-3"
            >
              <input
                type="checkbox"
                checked={selected.includes(post.id)}
                onChange={() =>
                  setSelected((current) =>
                    current.includes(post.id)
                      ? current.filter((id) => id !== post.id)
                      : [...current, post.id],
                  )
                }
              />
              <PostIcon iconId={post.icon} label={post.title} />
              <span className="min-w-0 flex-1 truncate text-sm">
                {post.title}
              </span>
              <PostStatusIcon status={post.status} />
            </label>
          ))
        ) : (
          <EmptyState text="No posts available to add." />
        )}
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button
            disabled={!group || !selected.length || busy}
            onClick={async () => {
              if (!group) return;
              setBusy(true);
              try {
                await telegramChannelsApi.addPostsToGroup(group.id, selected);
                await onAdded();
              } finally {
                setBusy(false);
              }
            }}
          >
            Add selected
          </Button>
        </div>
      </div>
    </Modal>
  );
}

function MoveGroupModal({
  group,
  channels,
  onClose,
  onSubmit,
}: {
  group?: PostGroup;
  channels: TelegramChannel[];
  onClose: () => void;
  onSubmit: (targetId: string) => Promise<void>;
}) {
  const [targetId, setTargetId] = useState("");
  return (
    <Modal open onClose={onClose} title="Move group" allowOverflow>
      <div className="space-y-4">
        <p className="text-sm text-amber-200">
          Drafts remain drafts. Scheduled posts are recreated at the same time.
          Published posts become drafts; old Telegram messages remain.
        </p>
        <FormField label="Target channel" required>
          <CustomSelect
            value={targetId}
            onChange={setTargetId}
            options={channels
              .filter((channel) => channel.id !== group?.telegramChannelId)
              .map((channel) => ({
                value: channel.id,
                label: channel.title,
                iconUrl: channel.photoUrl || undefined,
              }))}
          />
        </FormField>
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button disabled={!targetId} onClick={() => onSubmit(targetId)}>
            Move group
          </Button>
        </div>
      </div>
    </Modal>
  );
}

function BulkMoveGroupsModal({
  groups,
  channels,
  sourceChannelId,
  onClose,
  onSubmit,
}: {
  groups: PostGroup[];
  channels: TelegramChannel[];
  sourceChannelId: string;
  onClose: () => void;
  onSubmit: (targetId: string) => Promise<void>;
}) {
  const [targetId, setTargetId] = useState("");
  return (
    <Modal open onClose={onClose} title="Move selected groups" allowOverflow>
      <div className="space-y-4">
        <p className="text-sm text-amber-200">
          Drafts remain drafts. Scheduled posts are recreated at the same time.
          Published posts become drafts; old Telegram messages remain.
        </p>
        <div className="rounded-lg border border-neutral-800 bg-neutral-950 p-3">
          <p className="text-xs uppercase text-neutral-500">Selected groups</p>
          <p className="mt-2 text-sm text-neutral-200">
            {groups.map((group) => group.title).join(", ")}
          </p>
        </div>
        <FormField label="Target channel" required>
          <CustomSelect
            value={targetId}
            onChange={setTargetId}
            options={channels
              .filter((channel) => channel.id !== sourceChannelId)
              .map((channel) => ({
                value: channel.id,
                label: channel.title,
                iconUrl: channel.photoUrl || undefined,
              }))}
          />
        </FormField>
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button disabled={!targetId || !groups.length} onClick={() => onSubmit(targetId)}>
            Move {groups.length} group{groups.length === 1 ? "" : "s"}
          </Button>
        </div>
      </div>
    </Modal>
  );
}

function PostUsageModal({
  post,
  usages,
  onClose,
  onOpenPost,
}: {
  post: TelegramManagedPost;
  usages: TelegramManagedPost[];
  onClose: () => void;
  onOpenPost: (post: TelegramManagedPost) => void;
}) {
  return (
    <Modal open onClose={onClose} title={`Used in posts`} allowOverflow>
      <div className="space-y-3">
        <div className="rounded-lg border border-neutral-800 bg-neutral-950 px-3 py-2">
          <div className="flex items-center gap-2">
            {post.icon ? <PostIcon iconId={post.icon} label={post.title} /> : null}
            <div className="min-w-0">
              <p className="truncate text-sm font-medium text-white">
                {post.title}
              </p>
              <p className="text-xs text-neutral-400">
                {usages.length
                  ? `Used in ${usages.length} post${usages.length === 1 ? "" : "s"}`
                  : "This post is not used in other posts yet"}
              </p>
            </div>
          </div>
        </div>
        {usages.length ? (
          <div className="space-y-1.5">
            {usages.map((usagePost) => (
              <button
                key={usagePost.id}
                type="button"
                onClick={() => onOpenPost(usagePost)}
                className="flex w-full items-center gap-3 rounded-lg border border-neutral-800 bg-neutral-950 px-3 py-2 text-left transition hover:border-blue-700 hover:bg-blue-950/20"
              >
                {usagePost.icon ? (
                  <PostIcon iconId={usagePost.icon} label={usagePost.title} />
                ) : (
                  <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-neutral-700 bg-neutral-900 text-sm">
                    📝
                  </span>
                )}
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-white">
                    {usagePost.title}
                  </p>
                  <p className="text-xs text-neutral-400">
                    {usagePost.status.toLowerCase()}
                  </p>
                </div>
                <span className="shrink-0 text-xs text-blue-300">Open</span>
              </button>
            ))}
          </div>
        ) : (
          <EmptyState text="This post is not linked from other posts in this channel." />
        )}
        <div className="flex justify-end">
          <Button variant="secondary" onClick={onClose}>
            Close
          </Button>
        </div>
      </div>
    </Modal>
  );
}

function PublishGroupModal({
  open,
  onClose,
  onSubmit,
}: {
  open: boolean;
  onClose: () => void;
  onSubmit: (options: {
    includeScheduled: boolean;
    includeFailed: boolean;
    republishPublished: boolean;
  }) => Promise<void>;
}) {
  const [includeScheduled, setIncludeScheduled] = useState(true);
  const [includeFailed, setIncludeFailed] = useState(true);
  const [republishPublished, setRepublishPublished] = useState(false);
  return (
    <Modal open={open} onClose={onClose} title="Publish all posts">
      <div className="space-y-4">
        <p className="text-sm text-neutral-300">
          Drafts publish now. Scheduled posts can be cancelled and published
          now. Published posts are skipped unless explicitly enabled.
        </p>
        {[
          ["Include scheduled posts", includeScheduled, setIncludeScheduled],
          ["Retry failed posts", includeFailed, setIncludeFailed],
          [
            "Republish already published posts",
            republishPublished,
            setRepublishPublished,
          ],
        ].map(([label, checked, setter]) => (
          <label
            key={String(label)}
            className="flex items-center gap-2 text-sm"
          >
            <input
              type="checkbox"
              checked={checked as boolean}
              onChange={(event) =>
                (setter as (value: boolean) => void)(event.target.checked)
              }
            />
            {label as string}
          </label>
        ))}
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button
            onClick={() =>
              onSubmit({
                includeScheduled,
                includeFailed,
                republishPublished,
              })
            }
          >
            Publish all
          </Button>
        </div>
      </div>
    </Modal>
  );
}

function ScheduleGroupModal({
  open,
  group,
  onClose,
  onSubmit,
}: {
  open: boolean;
  group?: PostGroup;
  onClose: () => void;
  onSubmit: (payload: {
    startDate: string;
    time: string;
    intervalDays: number;
    timezone?: string;
    includeDraftsOnly?: boolean;
    overwriteExistingScheduled?: boolean;
    includeFailed?: boolean;
  }) => Promise<void>;
}) {
  const localDate = new Date();
  localDate.setDate(localDate.getDate() + 1);
  const [startDate, setStartDate] = useState(
    localDate.toISOString().slice(0, 10),
  );
  const [time, setTime] = useState("10:00");
  const [intervalDays, setIntervalDays] = useState(1);
  const [timezone, setTimezone] = useState(
    Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC",
  );
  const [overwrite, setOverwrite] = useState(false);
  const [includeDraftsOnly, setIncludeDraftsOnly] = useState(false);
  const [includeFailed, setIncludeFailed] = useState(true);
  const preview = useMemo(
    () =>
      (group?.posts || [])
        .filter((post) => {
          if (post.status === "DRAFT") return true;
          if (includeDraftsOnly) return false;
          if (post.status === "FAILED") return includeFailed;
          if (post.status === "SCHEDULED") return overwrite;
          return false;
        })
        .map((post, index) => {
          const date = new Date(`${startDate}T${time}:00`);
          date.setDate(date.getDate() + index * intervalDays);
          return { post, date };
        }),
    [
      group?.posts,
      startDate,
      time,
      intervalDays,
      includeDraftsOnly,
      includeFailed,
      overwrite,
    ],
  );
  return (
    <Modal open={open} onClose={onClose} title="Schedule sequence">
      <div className="space-y-3">
        <div className="grid gap-3 sm:grid-cols-3">
          <FormField label="Start date" required>
            <DateInput
              value={startDate}
              onChange={(event) => setStartDate(event.target.value)}
            />
          </FormField>
          <FormField label="Time" required>
            <TimeInput
              value={time}
              onChange={(event) => setTime(event.target.value)}
            />
          </FormField>
          <FormField label="Interval days" required>
            <Input
              type="number"
              min={1}
              value={intervalDays}
              onChange={(event) =>
                setIntervalDays(Math.max(1, Number(event.target.value)))
              }
            />
          </FormField>
        </div>
        <FormField label="Timezone">
          <Input
            value={timezone}
            onChange={(event) => setTimezone(event.target.value)}
          />
        </FormField>
        <div className="grid gap-2 text-sm sm:grid-cols-3">
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={overwrite}
              onChange={(event) => setOverwrite(event.target.checked)}
            />
            Overwrite scheduled
          </label>
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={includeDraftsOnly}
              onChange={(event) => setIncludeDraftsOnly(event.target.checked)}
            />
            Drafts only
          </label>
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={includeFailed}
              onChange={(event) => setIncludeFailed(event.target.checked)}
            />
            Include failed
          </label>
        </div>
        {preview.length ? (
          <div className="max-h-44 space-y-1 overflow-auto rounded-lg border border-neutral-800 p-2">
            {preview.map(({ post, date }) => (
              <div
                key={post.id}
                className="flex justify-between gap-3 text-xs text-neutral-300"
              >
                <span className="truncate">{post.title}</span>
                <span className="shrink-0">{date.toLocaleString()}</span>
              </div>
            ))}
          </div>
        ) : null}
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button
            disabled={!startDate || !time || intervalDays < 1}
            onClick={() =>
              onSubmit({
                startDate,
                time,
                intervalDays,
                timezone,
                overwriteExistingScheduled: overwrite,
                includeDraftsOnly,
                includeFailed,
              })
            }
          >
            Schedule sequence
          </Button>
        </div>
      </div>
    </Modal>
  );
}

function apiErrorMessage(error: unknown, fallback: string) {
  const apiError = error as {
    response?: { data?: { message?: string | string[] } };
    message?: string;
  };
  const message = apiError.response?.data?.message;
  return Array.isArray(message)
    ? message.join(", ")
    : message || apiError.message || fallback;
}

function LongImageTextModePanel({
  mode,
  onChange,
  readOnly = false,
  textLength,
}: {
  mode: LongTextMode;
  onChange?: (mode: LongTextMode) => void;
  readOnly?: boolean;
  textLength: number;
}) {
  return (
    <div
      className={`space-y-2 rounded-lg border p-3 ${
        readOnly
          ? "border-blue-700/60 bg-blue-950/20"
          : "border-amber-700/60 bg-amber-950/20"
      }`}
    >
      <p className={`text-sm ${readOnly ? "text-blue-200" : "text-amber-200"}`}>
        {readOnly
          ? `Publishing choice used for this post. Text length: ${textLength}.`
          : `Text with images must be 1024 characters or fewer to stay in one Telegram message. Current length: ${textLength}. Choose how to publish the remaining text:`}
      </p>
      <div className="grid gap-2 sm:grid-cols-2">
        {(
          [
            {
              value: "IMAGES_THEN_TEXT",
              icon: "🖼️",
              label: "Publish images first, then text as separate message",
              description: "Images have no caption; the complete text follows.",
            },
            {
              value: "CAPTION_THEN_TEXT",
              icon: "✂️",
              label: "Publish as image with short caption",
              description:
                "Use the maximum caption, then send the remaining text.",
            },
          ] as const
        ).map((option) => {
          const selected = mode === option.value;
          return (
            <button
              key={option.value}
              type="button"
              onClick={() => {
                if (!readOnly) onChange?.(option.value);
              }}
              aria-pressed={selected}
              aria-disabled={readOnly}
              className={`flex min-h-16 items-start gap-2 rounded-lg border p-3 text-left transition ${
                selected
                  ? "border-blue-500 bg-blue-950/40 text-white"
                  : "border-neutral-700 bg-neutral-900 text-neutral-300"
              } ${readOnly ? "" : "hover:border-neutral-500"}`}
            >
              <span className="text-lg">{option.icon}</span>
              <span>
                <span className="block text-sm font-medium">
                  {option.label}
                </span>
                <span className="mt-1 block text-xs text-neutral-400">
                  {option.description}
                </span>
                {readOnly && selected ? (
                  <span className="mt-2 block text-xs font-medium text-blue-300">
                    Selected when published
                  </span>
                ) : null}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

function PostStatusIcon({ status }: { status: TelegramManagedPost["status"] }) {
  if (status === "PUBLISHED") {
    return (
      <CheckCircle2
        size={18}
        className="shrink-0 text-emerald-400"
        aria-label="Published"
      />
    );
  }
  if (status === "SCHEDULED") {
    return (
      <Clock3
        size={18}
        className="shrink-0 text-blue-400"
        aria-label="Scheduled"
      />
    );
  }
  if (status === "FAILED") {
    return (
      <AlertTriangle
        size={18}
        className="shrink-0 text-red-400"
        aria-label="Failed"
      />
    );
  }
  if (status === "PUBLISHING") {
    return (
      <LoaderCircle
        size={18}
        className="shrink-0 animate-spin text-amber-300"
        aria-label="Publishing"
      />
    );
  }
  return (
    <FileText
      size={18}
      className="shrink-0 text-neutral-400"
      aria-label="Draft"
    />
  );
}

function publishModeLabel(
  mode?: string | null,
  imageCount = 0,
  textLength = 0,
) {
  if (mode === "IMAGES_THEN_TEXT") {
    return "Published as images, then full text";
  }
  if (mode === "CAPTION_THEN_TEXT") {
    return "Published with a short caption, then remaining text";
  }
  if (mode === "IMAGE_WITH_CAPTION") {
    return "Published as image with caption";
  }
  if (mode === "TEXT_PARTS") {
    return "Published as multiple text messages";
  }
  if (imageCount && textLength > 1024) {
    return "Published as images, then full text";
  }
  if (imageCount) return "Published as image with caption";
  return "Published as a text message";
}
