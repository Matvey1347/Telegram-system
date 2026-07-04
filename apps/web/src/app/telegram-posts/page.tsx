"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useRouter, useSearchParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import {
  AlertTriangle,
  CheckCircle2,
  Clock3,
  FileText,
  FolderPlus,
  GripVertical,
  ImagePlus,
  Layers3,
  ListPlus,
  LoaderCircle,
  MoveRight,
  Plus,
  Rocket,
  Trash2,
  X,
} from "lucide-react";
import { IconAvatar } from "@/components/icons/icon-avatar";
import { IconPicker } from "@/components/icons/icon-picker";
import { AppShell } from "@/components/layout/app-shell";
import { TelegramTextEditor } from "@/components/telegram/telegram-text-editor";
import { TelegramPostPreview } from "@/components/telegram/telegram-post-preview";
import { MemberBadge } from "@/components/workspace/member-badge";
import { MemberSelect } from "@/components/workspace/member-select";
import {
  iconsApi,
  telegramChannelsApi,
  workspaceMembersApi,
  type BulkActionResult,
  type PostGroup,
  type TelegramChannel,
  type TelegramManagedPost,
} from "@/lib/api";
import {
  Button,
  Card,
  ConfirmDeleteModal,
  CustomSelect,
  DateInput,
  EmptyState,
  FormField,
  IconButton,
  Input,
  LoadingState,
  Modal,
  PageHeader,
  Textarea,
} from "@/components/ui/primitives";
import { useAppToast } from "@/providers/toast-provider";

type PublishingMode = "draft" | "publish" | "schedule";
type LongTextMode = "IMAGES_THEN_TEXT" | "CAPTION_THEN_TEXT";
type PostStatusTab = "PUBLISHED" | "SCHEDULED" | "DRAFT";
const TELEGRAM_TEXT_MESSAGE_LIMIT = 4096;

export default function TelegramPostsPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [newPostToken, setNewPostToken] = useState(0);
  const channelId = searchParams.get("channelId") || "";
  const postId = searchParams.get("postId") || "";
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

  useEffect(() => {
    if (!channelId && channel) {
      router.replace(`/telegram-posts?channelId=${channel.id}`);
    }
  }, [channel, channelId, router]);

  return (
    <AppShell>
      <PageHeader
        title="Telegram posts"
        subtitle="Create drafts, publish now, or schedule directly in Telegram"
        action={
          channel ? (
            <div className="flex w-full flex-col gap-2 sm:min-w-[520px] sm:flex-row">
              <div className="min-w-0 flex-1">
                <CustomSelect
                  value={channel.id}
                  onChange={(value) =>
                    router.replace(`/telegram-posts?channelId=${value}`)
                  }
                  options={availableChannels.map((item) => ({
                    value: item.id,
                    label: item.title,
                    iconUrl: item.photoUrl || undefined,
                    iconFallback: item.title,
                  }))}
                />
              </div>
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
      {!channels.isLoading && !availableChannels.length ? (
        <EmptyState text="No Telegram channels with publishing access" />
      ) : null}
      {channel ? (
        <div>
          <TelegramPostWorkspace
            key={channel.id}
            channelId={channel.id}
            channelTitle={channel.title}
            channelPhotoUrl={channel.photoUrl}
            newPostToken={newPostToken}
            initialPostId={postId}
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
  newPostToken,
  initialPostId,
  channels,
  onPostSelect,
}: {
  channelId: string;
  channelTitle: string;
  channelPhotoUrl?: string | null;
  newPostToken: number;
  initialPostId: string;
  channels: TelegramChannel[];
  onPostSelect: (postId: string | null) => void;
}) {
  const restoredPostIdRef = useRef("");
  const { pushToast } = useAppToast();
  const [workspaceView, setWorkspaceView] = useState<"posts" | "groups">(
    "posts",
  );
  const [editing, setEditing] = useState<TelegramManagedPost | null>(null);
  const [title, setTitle] = useState("");
  const [assignedMemberId, setAssignedMemberId] = useState<string | null>(null);
  const [memberSelectionTouched, setMemberSelectionTouched] = useState(false);
  const [text, setText] = useState("");
  const [imageUrls, setImageUrls] = useState<string[]>([]);
  const [icon, setIcon] = useState<string | null>(null);
  const [postGroupId, setPostGroupId] = useState<string | null>(null);
  const [mode, setMode] = useState<PublishingMode>("draft");
  const [scheduleDate, setScheduleDate] = useState("");
  const [scheduleTime, setScheduleTime] = useState("09:00");
  const [longTextMode, setLongTextMode] =
    useState<LongTextMode>("IMAGES_THEN_TEXT");
  const [statusTab, setStatusTab] = useState<PostStatusTab>("PUBLISHED");
  const [busy, setBusy] = useState(false);
  const [uploadingImages, setUploadingImages] = useState(false);
  const [error, setError] = useState("");
  const [selectedPostIds, setSelectedPostIds] = useState<string[]>([]);
  const [bulkDeleteOpen, setBulkDeleteOpen] = useState(false);
  const [deletingPost, setDeletingPost] = useState<TelegramManagedPost | null>(
    null,
  );
  const [movingPost, setMovingPost] = useState<TelegramManagedPost | null>(
    null,
  );
  const posts = useQuery({
    queryKey: ["telegram-managed-posts", channelId],
    queryFn: () => telegramChannelsApi.managedPosts(channelId),
  });
  const postGroups = useQuery({
    queryKey: ["post-groups", channelId],
    queryFn: () =>
      telegramChannelsApi.postGroups({ telegramChannelId: channelId }),
  });
  const availableIcons = useQuery({
    queryKey: ["icons"],
    queryFn: () => iconsApi.list(),
  });
  const iconsById = useMemo(
    () =>
      new Map((availableIcons.data || []).map((item) => [item.id, item])),
    [availableIcons.data],
  );
  const members = useQuery({
    queryKey: ["workspace-members"],
    queryFn: workspaceMembersApi.list,
  });
  const currentMemberId =
    members.data?.find((member) => member.isCurrentUser)?.id ?? null;
  const effectivePostMember = (post: TelegramManagedPost) =>
    post.assignedMember ?? null;
  const effectivePostMemberId = (post: TelegramManagedPost) =>
    effectivePostMember(post)?.id ?? post.assignedMemberId ?? null;
  const isPublished = editing?.status === "PUBLISHED";
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
    : uploadingImages
      ? "Wait until image upload finishes."
      : !title.trim()
        ? "Internal title is required."
        : mode !== "draft" && !text.trim() && !imageUrls.length
          ? "Add Telegram text or at least one image before publishing."
          : mode === "schedule" && (!scheduleDate || !scheduleTime)
            ? "Publish date and time are required."
            : "";
  const visiblePosts = (posts.data || []).filter((post) =>
    statusTab === "DRAFT"
      ? ["DRAFT", "FAILED", "PUBLISHING"].includes(post.status)
      : post.status === statusTab,
  );
  const visiblePostIds = visiblePosts.map((post) => post.id);
  const selectedPosts = selectedPostIds
    .map((id) => posts.data?.find((post) => post.id === id))
    .filter((post): post is TelegramManagedPost => Boolean(post));
  const allVisibleSelected =
    visiblePostIds.length > 0 &&
    visiblePostIds.every((id) => selectedPostIds.includes(id));

  const reset = () => {
    setWorkspaceView("posts");
    restoredPostIdRef.current = "";
    setEditing(null);
    setTitle("");
    setAssignedMemberId(null);
    setMemberSelectionTouched(false);
    setText("");
    setImageUrls([]);
    setIcon(null);
    setPostGroupId(null);
    setMode("draft");
    setScheduleDate("");
    setScheduleTime("09:00");
    setLongTextMode("IMAGES_THEN_TEXT");
    setUploadingImages(false);
    setSelectedPostIds([]);
    setError("");
  };

  useEffect(() => {
    // Header action intentionally resets the editor state.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (newPostToken > 0) reset();
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
    restoredPostIdRef.current = post.id;
    setEditing(post);
    setTitle(post.title);
    setAssignedMemberId(effectivePostMemberId(post));
    setMemberSelectionTouched(false);
    setText(post.text || "");
    setImageUrls(post.imageUrls);
    setIcon(post.icon ?? null);
    setPostGroupId(post.groupId ?? null);
    setMode(post.status === "SCHEDULED" ? "schedule" : "draft");
    setScheduleDate(post.scheduledAt?.slice(0, 10) || "");
    setScheduleTime(post.scheduledAt?.slice(11, 16) || "09:00");
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
  };

  const toggleSelectedPost = (postId: string) => {
    setSelectedPostIds((current) =>
      current.includes(postId)
        ? current.filter((id) => id !== postId)
        : [...current, postId],
    );
  };

  const toggleAllVisiblePosts = () => {
    setSelectedPostIds((current) => {
      if (allVisibleSelected) {
        return current.filter((id) => !visiblePostIds.includes(id));
      }
      return [...new Set([...current, ...visiblePostIds])];
    });
  };

  const deletePosts = async (targetPosts: TelegramManagedPost[]) => {
    setBusy(true);
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
      await posts.refetch();
      setDeletingPost(null);
      setBulkDeleteOpen(false);
    } finally {
      setBusy(false);
    }
  };

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

  const persist = async () => {
    const payload: {
      title: string;
      text: string;
      imageUrls: string[];
      assignedMemberId?: string;
      icon?: string | null;
    } = {
      title: title.trim(),
      text,
      imageUrls,
      icon,
    };
    const selectedMemberId =
      assignedMemberId ??
      (!editing && !memberSelectionTouched ? currentMemberId : null);
    if (selectedMemberId) payload.assignedMemberId = selectedMemberId;
    const saved = editing
      ? telegramChannelsApi.updateManagedPost(channelId, editing.id, payload)
      : telegramChannelsApi.createManagedPost(channelId, payload);
    const post = await saved;
    if (!editing && postGroupId) {
      await telegramChannelsApi.addPostsToGroup(postGroupId, [post.id]);
      const refreshed = await telegramChannelsApi.managedPosts(channelId);
      return refreshed.find((item) => item.id === post.id) || post;
    }
    return post;
  };

  const changePostGroup = async (nextGroupId: string) => {
    const normalized = nextGroupId || null;
    setPostGroupId(normalized);
    if (!editing || normalized === (editing.groupId ?? null)) return;
    try {
      if (normalized) {
        const group = await telegramChannelsApi.addPostsToGroup(normalized, [
          editing.id,
        ]);
        const updated =
          group.posts?.find((post) => post.id === editing.id) || null;
        if (updated) setEditing(updated);
      } else if (editing.groupId) {
        await telegramChannelsApi.removePostFromGroup(
          editing.groupId,
          editing.id,
        );
        setEditing({ ...editing, groupId: null, group: null, groupPosition: null });
      }
      await Promise.all([posts.refetch(), postGroups.refetch()]);
    } catch (changeError) {
      setPostGroupId(editing.groupId ?? null);
      pushToast(
        apiErrorMessage(changeError, "Could not change post group"),
        "error",
      );
    }
  };

  const run = async () => {
    setBusy(true);
    setError("");
    try {
      const post = await persist();
      if (mode === "publish") {
        await telegramChannelsApi.publishManagedPost(
          channelId,
          post.id,
          longTextMode,
        );
      }
      if (mode === "schedule") {
        await telegramChannelsApi.scheduleManagedPost(
          channelId,
          post.id,
          new Date(`${scheduleDate}T${scheduleTime}`).toISOString(),
          longTextMode,
        );
      }
      await posts.refetch();
      if (mode === "draft") {
        setStatusTab("DRAFT");
        setEditing(post);
        restoredPostIdRef.current = post.id;
        onPostSelect(post.id);
      } else {
        setStatusTab(mode === "schedule" ? "SCHEDULED" : "PUBLISHED");
        reset();
        onPostSelect(null);
      }
    } catch (runError) {
      const apiError = runError as {
        response?: { data?: { message?: string } };
        message?: string;
      };
      setError(
        apiError.response?.data?.message ||
          apiError.message ||
          "Could not save post",
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <div className="mb-4 inline-flex rounded-lg border border-neutral-800 bg-neutral-950 p-1">
        <button
          type="button"
          onClick={() => setWorkspaceView("posts")}
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
          onClick={() => setWorkspaceView("groups")}
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
      {workspaceView === "groups" ? (
        <PostGroupsWorkspace
          channelId={channelId}
          channels={channels}
          onOpenPost={(post) => {
            setWorkspaceView("posts");
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
        <Card className="min-w-0 space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <div className="flex items-center gap-2">
                <IconPicker
                  iconId={icon}
                  onChange={setIcon}
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
              </div>
              {isPublished ? (
                <div className="mt-0.5 space-y-0.5 text-xs">
                  <p className="flex items-center gap-1.5 text-emerald-300">
                    <CheckCircle2 size={13} />
                    Published posts are read-only
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
                disabled={busy || isPublished}
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
                disabled={busy || isPublished}
              />
            </FormField>
          </div>
          <FormField label="Telegram text">
            <TelegramTextEditor
              value={text}
              onChange={setText}
              disabled={busy || isPublished}
              rows={7}
            />
          </FormField>
          <MultiImageUpload
            value={imageUrls}
            onChange={setImageUrls}
            disabled={busy || isPublished}
            readOnly={isPublished}
            onUploadingChange={setUploadingImages}
          />
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
                {Math.ceil(text.length / TELEGRAM_TEXT_MESSAGE_LIMIT)} separate
                messages.
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
            <div className="grid gap-3 sm:grid-cols-2">
              <FormField label="Publish date" required>
                <DateInput
                  value={scheduleDate}
                  onChange={(event) => setScheduleDate(event.target.value)}
                  placeholder="Select date"
                />
              </FormField>
              <FormField label="Publish time" required>
                <Input
                  type="time"
                  value={scheduleTime}
                  onChange={(event) => setScheduleTime(event.target.value)}
                />
              </FormField>
            </div>
          ) : null}
          {error ? <p className="text-sm text-red-300">{error}</p> : null}
          {!isPublished ? (
            <div className="flex justify-end">
              <Button onClick={run} disabled={!!publishDisabledReason}>
                {mode === "draft"
                  ? "Save draft"
                  : mode === "publish"
                    ? "Publish now"
                    : editing?.status === "SCHEDULED"
                      ? "Update scheduled post"
                      : "Schedule post"}
              </Button>
            </div>
          ) : null}
          {!isPublished && publishDisabledReason ? (
            <p className="text-right text-xs text-neutral-500">
              {publishDisabledReason}
            </p>
          ) : null}
        </Card>

        <Card className="min-w-0">
          <div className="mb-3 flex items-center justify-between gap-2">
            <h2 className="text-lg font-semibold text-white">Posts</h2>
            <span className="text-xs text-neutral-500">
              {posts.data?.length || 0} total
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
                onClick={() => setStatusTab(value)}
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
          {visiblePosts.length ? (
            <>
              <div className="max-h-[calc(100vh-15rem)] space-y-2 overflow-y-auto pr-1">
                {visiblePosts.map((post) => {
                  const member = effectivePostMember(post);
                  return (
                    <div
                      key={post.id}
                      className={`flex items-center gap-2 rounded-lg border p-1 ${
                        editing?.id === post.id
                          ? "border-blue-500 bg-blue-950/20"
                          : "border-neutral-800 hover:bg-neutral-900"
                      }`}
                    >
                      <label
                        aria-label={`Select ${post.title}`}
                        className="flex h-10 w-8 shrink-0 items-center justify-center rounded-md hover:bg-neutral-800"
                      >
                        <input
                          type="checkbox"
                          checked={selectedPostIds.includes(post.id)}
                          onChange={() => toggleSelectedPost(post.id)}
                          className="h-4 w-4"
                        />
                      </label>
                      <button
                        type="button"
                        onClick={() => {
                          selectPost(post);
                          onPostSelect(post.id);
                        }}
                        className="flex min-w-0 flex-1 items-center gap-2 px-2 py-2 text-left"
                      >
                        {!post.icon ? (
                          <PostStatusIcon status={post.status} />
                        ) : null}
                        <span className="min-w-0 flex-1">
                          <span className="flex min-w-0 items-center gap-1.5 text-sm">
                            <PostIcon
                              iconId={post.icon}
                              label={post.title}
                              bare
                            />
                            <span className="truncate">{post.title}</span>
                          </span>
                          {post.status !== "DRAFT" ? (
                            <span className="block truncate text-[11px] text-neutral-500">
                              {post.status === "SCHEDULED" && post.scheduledAt
                                ? new Date(post.scheduledAt).toLocaleString()
                                : post.status === "PUBLISHED" &&
                                    post.publishedAt
                                  ? new Date(
                                      post.publishedAt,
                                    ).toLocaleString()
                                  : post.status.toLowerCase()}
                            </span>
                          ) : null}
                          {post.group ? (
                            <span className="mt-1 block truncate text-[11px] text-blue-300">
                              Group: {post.group.title}
                            </span>
                          ) : null}
                          {member ? (
                            <span className="mt-1 flex min-w-0">
                              <MemberBadge member={member} />
                            </span>
                          ) : null}
                        </span>
                      </button>
                      <button
                        type="button"
                        title="Move to another channel"
                        aria-label={`Move ${post.title}`}
                        onClick={() => setMovingPost(post)}
                        className="cursor-pointer rounded-lg border border-neutral-700 p-2 text-neutral-200 hover:bg-neutral-800"
                      >
                        <MoveRight size={15} />
                      </button>
                      <IconButton
                        type="button"
                        kind="delete"
                        aria-label={`Delete ${post.title}`}
                        onClick={() => setDeletingPost(post)}
                      />
                    </div>
                  );
                })}
              </div>
              <div className="mt-3 flex flex-wrap items-center justify-between gap-2 rounded-lg border border-neutral-800 bg-neutral-950/70 px-2 py-2">
                <label className="flex items-center gap-2 rounded-md px-2 py-1 text-xs text-neutral-300 hover:bg-neutral-800 hover:text-white">
                  <input
                    type="checkbox"
                    checked={allVisibleSelected}
                    onChange={toggleAllVisiblePosts}
                    className="h-4 w-4"
                  />
                  {allVisibleSelected ? "Clear visible" : "Select visible"}
                </label>
                <Button
                  type="button"
                  variant="danger"
                  disabled={!selectedPosts.length || busy}
                  onClick={() => setBulkDeleteOpen(true)}
                  className="flex items-center gap-2 px-3 py-1.5"
                >
                  <Trash2 size={15} />
                  Delete selected
                  {selectedPosts.length ? ` (${selectedPosts.length})` : ""}
                </Button>
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
        onConfirm={async () => {
          if (!deletingPost) return;
          await deletePosts([deletingPost]);
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
            await posts.refetch();
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
        onConfirm={async () => {
          await deletePosts(selectedPosts);
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
  onOpenPost,
}: {
  channelId: string;
  channels: TelegramChannel[];
  onOpenPost: (post: TelegramManagedPost) => void;
}) {
  const { pushToast } = useAppToast();
  const [selectedGroupId, setSelectedGroupId] = useState<string | null>(null);
  const [groupForm, setGroupForm] = useState<PostGroup | "new" | null>(null);
  const [addPostsOpen, setAddPostsOpen] = useState(false);
  const [moveOpen, setMoveOpen] = useState(false);
  const [movingGroupPost, setMovingGroupPost] =
    useState<TelegramManagedPost | null>(null);
  const [publishOpen, setPublishOpen] = useState(false);
  const [scheduleOpen, setScheduleOpen] = useState(false);
  const [deletingGroup, setDeletingGroup] = useState<PostGroup | null>(null);
  const [progress, setProgress] = useState<ProgressState | null>(null);
  const [draggedId, setDraggedId] = useState<string | null>(null);
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

  const refresh = async () => {
    await Promise.all([groups.refetch(), detail.refetch(), posts.refetch()]);
  };
  const playResult = async (title: string, result: BulkActionResult) => {
    for (let index = 0; index < result.results.length; index += 1) {
      setProgress({
        title,
        current: index + 1,
        total: result.total,
        item: result.results[index],
      });
      await new Promise((resolve) => window.setTimeout(resolve, 180));
    }
    setProgress({
      title,
      current: result.total,
      total: result.total,
      item: result.results.at(-1),
      result,
    });
    window.setTimeout(() => setProgress(null), 2800);
  };
  const runBulk = async (
    title: string,
    request: () => Promise<BulkActionResult>,
  ) => {
    const total = detail.data?.posts?.length || 0;
    setProgress({ title, current: 0, total });
    try {
      const result = await request();
      await playResult(title, result);
      await refresh();
      pushToast(
        `${title}: ${result.successCount} success, ${result.failedCount} failed, ${result.skippedCount} skipped`,
        result.failedCount ? "error" : "success",
        7000,
      );
      return result;
    } catch (error) {
      setProgress(null);
      pushToast(apiErrorMessage(error, `${title} failed`), "error", 7000);
      throw error;
    }
  };

  if (selectedGroupId) {
    const group = detail.data;
    return (
      <>
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <Button variant="secondary" onClick={() => setSelectedGroupId(null)}>
            ← Groups
          </Button>
          {group ? (
            <div className="flex flex-wrap gap-2">
              <Button variant="secondary" onClick={() => setAddPostsOpen(true)}>
                <span className="inline-flex items-center gap-2">
                  <ListPlus size={15} /> Add posts
                </span>
              </Button>
              <Button variant="secondary" onClick={() => setScheduleOpen(true)}>
                Schedule sequence
              </Button>
              <Button onClick={() => setPublishOpen(true)}>
                <span className="inline-flex items-center gap-2">
                  <Rocket size={15} /> Publish all
                </span>
              </Button>
              <Button variant="secondary" onClick={() => setMoveOpen(true)}>
                Move group
              </Button>
              <Button variant="secondary" onClick={() => setGroupForm(group)}>
                Edit
              </Button>
              <Button variant="danger" onClick={() => setDeletingGroup(group)}>
                Delete
              </Button>
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
                      onDragEnd={async () => {
                        setDraggedId(null);
                        try {
                          await telegramChannelsApi.reorderPostGroup(
                            group.id,
                            orderedPosts.map((item) => item.id),
                          );
                          await detail.refetch();
                          setOrderedPostIds([]);
                        } catch (error) {
                          await detail.refetch();
                          setOrderedPostIds([]);
                          pushToast(
                            apiErrorMessage(error, "Could not reorder posts"),
                            "error",
                          );
                        }
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
                      <PostIcon iconId={post.icon} label={post.title} />
                      <PostStatusIcon status={post.status} />
                      <button
                        type="button"
                        onClick={() => onOpenPost(post)}
                        className="min-w-0 flex-1 text-left"
                      >
                        <span className="block truncate text-sm text-white">
                          {post.title}
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
              await runBulk("Moving group", async () => {
                const response = await telegramChannelsApi.movePostGroup(
                  group!.id,
                  targetId,
                );
                return response;
              });
              setSelectedGroupId(null);
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
            await runBulk("Publishing posts", () =>
              telegramChannelsApi.publishPostGroup(group!.id, options),
            );
          }}
        />
        <ScheduleGroupModal
          open={scheduleOpen}
          group={group}
          onClose={() => setScheduleOpen(false)}
          onSubmit={async (payload) => {
            setScheduleOpen(false);
            await runBulk("Scheduling posts", () =>
              telegramChannelsApi.schedulePostGroupSequence(group!.id, payload),
            );
          }}
        />
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
        <BulkProgressOverlay progress={progress} />
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
      {groups.isLoading ? <LoadingState /> : null}
      {groups.data?.length ? (
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {groups.data.map((group) => (
            <button
              key={group.id}
              type="button"
              onClick={() => setSelectedGroupId(group.id)}
              className="rounded-xl border border-neutral-800 bg-neutral-900 p-4 text-left transition hover:border-blue-700 hover:bg-neutral-900/80"
            >
              <div className="flex items-start gap-3">
                <PostIcon iconId={group.icon} label={group.title} size="sm" />
                <div className="min-w-0 flex-1">
                  <h3 className="truncate font-semibold text-white">
                    {group.title}
                  </h3>
                  <div className="mt-1">
                    <MemberBadge member={group.createdByMember} />
                  </div>
                </div>
                <GroupStatusBadge status={group.statusSummary.computedStatus} />
              </div>
              <div className="mt-4">
                <GroupSummary summary={group.statusSummary} compact />
              </div>
            </button>
          ))}
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
      <BulkProgressOverlay progress={progress} />
    </>
  );
}

function GroupStatusBadge({
  status,
}: {
  status: PostGroup["statusSummary"]["computedStatus"];
}) {
  const labels = {
    EMPTY: "Empty",
    HAS_ERRORS: "Has errors",
    ALL_DRAFT: "All drafts",
    ALL_SCHEDULED: "All scheduled",
    ALL_PUBLISHED: "All published",
    MIXED: "Mixed",
  };
  const colors = {
    EMPTY: "border-neutral-700 text-neutral-400",
    HAS_ERRORS: "border-red-700 text-red-300",
    ALL_DRAFT: "border-blue-700 text-blue-300",
    ALL_SCHEDULED: "border-amber-700 text-amber-300",
    ALL_PUBLISHED: "border-emerald-700 text-emerald-300",
    MIXED: "border-violet-700 text-violet-300",
  };
  return (
    <span className={`rounded-full border px-2 py-1 text-[10px] ${colors[status]}`}>
      {labels[status]}
    </span>
  );
}

function GroupSummary({
  summary,
  compact = false,
}: {
  summary: PostGroup["statusSummary"];
  compact?: boolean;
}) {
  return (
    <div className="space-y-2">
      {!compact ? <GroupStatusBadge status={summary.computedStatus} /> : null}
      <div className="grid grid-cols-4 gap-1 text-center text-[11px]">
        {[
          ["Draft", summary.draftCount],
          ["Scheduled", summary.scheduledCount],
          ["Published", summary.publishedCount],
          ["Failed", summary.failedCount],
        ].map(([label, count]) => (
          <div key={label} className="rounded-md bg-neutral-950 px-1 py-2">
            <span className="block font-semibold text-white">{count}</span>
            <span className="text-neutral-500">{label}</span>
          </div>
        ))}
      </div>
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
          <Input value={title} onChange={(event) => setTitle(event.target.value)} />
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
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
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
              <span className="min-w-0 flex-1 truncate text-sm">{post.title}</span>
              <PostStatusIcon status={post.status} />
            </label>
          ))
        ) : (
          <EmptyState text="No posts available to add." />
        )}
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
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
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button disabled={!targetId} onClick={() => onSubmit(targetId)}>
            Move group
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
          <label key={String(label)} className="flex items-center gap-2 text-sm">
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
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
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
            <Input
              type="time"
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
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
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

function MultiImageUpload({
  value,
  onChange,
  disabled,
  readOnly,
  compact,
  onUploadingChange,
}: {
  value: string[];
  onChange: (urls: string[]) => void;
  disabled?: boolean;
  readOnly?: boolean;
  compact?: boolean;
  onUploadingChange: (uploading: boolean) => void;
}) {
  const [uploadingPreviews, setUploadingPreviews] = useState<string[]>([]);

  useEffect(() => {
    return () => onUploadingChange(false);
  }, [onUploadingChange]);

  return (
    <FormField label="Images">
      {!readOnly ? (
        <label
          className={`flex cursor-pointer items-center justify-center gap-2 rounded-lg border border-dashed border-neutral-700 bg-neutral-950/50 px-4 text-sm text-neutral-300 hover:border-blue-600 hover:text-white ${
            compact ? "h-[38px] py-2" : "py-5"
          } ${disabled ? "pointer-events-none opacity-50" : ""}`}
        >
          <ImagePlus size={18} />
          Upload images
          <input
            className="sr-only"
            type="file"
            accept="image/*"
            multiple
            disabled={disabled || uploadingPreviews.length > 0}
            onChange={async (event) => {
              const files = Array.from(event.target.files || []);
              event.target.value = "";
              if (!files.length) return;
              const previews = files.map((file) => URL.createObjectURL(file));
              setUploadingPreviews(previews);
              onUploadingChange(true);
              try {
                const uploaded = await Promise.all(
                  files.map((file) => iconsApi.upload(file)),
                );
                onChange([...value, ...uploaded.map((item) => item.imageUrl)]);
              } finally {
                previews.forEach((preview) => URL.revokeObjectURL(preview));
                setUploadingPreviews([]);
                onUploadingChange(false);
              }
            }}
          />
        </label>
      ) : null}
      {value.length || uploadingPreviews.length ? (
        <div className="mt-2 grid grid-cols-3 gap-2 sm:grid-cols-5">
          {value.map((url, index) => (
            <div
              key={`${url}-${index}`}
              className="group relative aspect-square overflow-hidden rounded-lg border border-neutral-700 bg-neutral-950"
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={url} alt="" className="h-full w-full object-cover" />
              {!readOnly ? (
                <button
                  type="button"
                  onClick={() =>
                    onChange(
                      value.filter((_, itemIndex) => itemIndex !== index),
                    )
                  }
                  className="absolute right-1 top-1 rounded-md bg-black/75 p-1 text-white opacity-0 transition group-hover:opacity-100"
                  aria-label="Remove image"
                >
                  <X size={14} />
                </button>
              ) : null}
            </div>
          ))}
          {uploadingPreviews.map((url, index) => (
            <div
              key={`uploading-${url}`}
              className="relative aspect-square overflow-hidden rounded-lg border border-blue-700/70 bg-neutral-950"
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={url}
                alt={`Uploading image ${index + 1}`}
                className="h-full w-full object-contain opacity-35 blur-[1px]"
              />
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-1 bg-black/25 text-blue-200">
                <LoaderCircle size={22} className="animate-spin" />
                <span className="text-[10px]">Uploading</span>
              </div>
            </div>
          ))}
        </div>
      ) : null}
    </FormField>
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
