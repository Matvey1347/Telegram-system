"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import {
  AlertTriangle,
  CheckCircle2,
  Clock3,
  FileText,
  ImagePlus,
  LoaderCircle,
  Plus,
  X,
} from "lucide-react";
import { AppShell } from "@/components/layout/app-shell";
import { TelegramTextEditor } from "@/components/telegram/telegram-text-editor";
import { TelegramPostPreview } from "@/components/telegram/telegram-post-preview";
import {
  iconsApi,
  telegramChannelsApi,
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
  PageHeader,
} from "@/components/ui/primitives";

type PublishingMode = "draft" | "publish" | "schedule";
type LongTextMode = "IMAGES_THEN_TEXT" | "CAPTION_THEN_TEXT";
type PostStatusTab = "PUBLISHED" | "SCHEDULED" | "DRAFT";

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
  onPostSelect,
}: {
  channelId: string;
  channelTitle: string;
  channelPhotoUrl?: string | null;
  newPostToken: number;
  initialPostId: string;
  onPostSelect: (postId: string | null) => void;
}) {
  const restoredPostIdRef = useRef("");
  const [editing, setEditing] = useState<TelegramManagedPost | null>(null);
  const [title, setTitle] = useState("");
  const [text, setText] = useState("");
  const [imageUrls, setImageUrls] = useState<string[]>([]);
  const [mode, setMode] = useState<PublishingMode>("draft");
  const [scheduleDate, setScheduleDate] = useState("");
  const [scheduleTime, setScheduleTime] = useState("09:00");
  const [longTextMode, setLongTextMode] =
    useState<LongTextMode>("IMAGES_THEN_TEXT");
  const [statusTab, setStatusTab] = useState<PostStatusTab>("PUBLISHED");
  const [busy, setBusy] = useState(false);
  const [uploadingImages, setUploadingImages] = useState(false);
  const [error, setError] = useState("");
  const [deletingPost, setDeletingPost] =
    useState<TelegramManagedPost | null>(null);
  const posts = useQuery({
    queryKey: ["telegram-managed-posts", channelId],
    queryFn: () => telegramChannelsApi.managedPosts(channelId),
  });
  const isPublished = editing?.status === "PUBLISHED";
  const hasLongImageText = imageUrls.length > 0 && text.length > 1024;
  const visiblePosts = (posts.data || []).filter((post) =>
    statusTab === "DRAFT"
      ? ["DRAFT", "FAILED", "PUBLISHING"].includes(post.status)
      : post.status === statusTab,
  );

  const reset = () => {
    restoredPostIdRef.current = "";
    setEditing(null);
    setTitle("");
    setText("");
    setImageUrls([]);
    setMode("draft");
    setScheduleDate("");
    setScheduleTime("09:00");
    setLongTextMode("IMAGES_THEN_TEXT");
    setError("");
  };

  useEffect(() => {
    if (newPostToken > 0) reset();
    // reset intentionally reacts only to the header action token
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [newPostToken]);

  const selectPost = (post: TelegramManagedPost) => {
    restoredPostIdRef.current = post.id;
    setEditing(post);
    setTitle(post.title);
    setText(post.text || "");
    setImageUrls(post.imageUrls);
    setMode(post.status === "SCHEDULED" ? "schedule" : "draft");
    setScheduleDate(post.scheduledAt?.slice(0, 10) || "");
    setScheduleTime(post.scheduledAt?.slice(11, 16) || "09:00");
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

  useEffect(() => {
    if (!initialPostId || !posts.data?.length) return;
    if (restoredPostIdRef.current === initialPostId) return;
    const post = posts.data.find((item) => item.id === initialPostId);
    if (post) selectPost(post);
    // restore only when the URL or loaded collection changes
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialPostId, posts.data]);

  const persist = async () => {
    const payload = { title: title.trim(), text, imageUrls };
    return editing
      ? telegramChannelsApi.updateManagedPost(channelId, editing.id, payload)
      : telegramChannelsApi.createManagedPost(channelId, payload);
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
      <div className="grid items-start gap-4 xl:grid-cols-[minmax(270px,0.7fr)_minmax(420px,1.25fr)_minmax(280px,0.72fr)]">
        <TelegramPostPreview
          channelTitle={channelTitle}
          channelPhotoUrl={channelPhotoUrl}
          text={text}
          imageUrls={imageUrls}
          longTextMode={longTextMode}
        />
        <Card className="min-w-0 space-y-3">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h2 className="text-lg font-semibold text-white">
                {isPublished
                  ? "Published post"
                  : editing
                    ? "Edit post"
                    : "New post"}
              </h2>
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
          </div>
          <FormField label="Internal title" required>
            <Input
              value={title}
              disabled={busy || isPublished}
              onChange={(event) => setTitle(event.target.value)}
            />
          </FormField>
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
          {!isPublished && hasLongImageText ? (
            <div className="space-y-2 rounded-lg border border-amber-700/60 bg-amber-950/20 p-3">
              <p className="text-sm text-amber-200">
                Text with images must be 1024 characters or fewer to stay in
                one Telegram message. Current length: {text.length}. Choose how
                to publish the remaining text:
              </p>
              <div className="grid gap-2 sm:grid-cols-2">
                <button
                  type="button"
                  onClick={() => setLongTextMode("IMAGES_THEN_TEXT")}
                  className={`flex min-h-16 items-start gap-2 rounded-lg border p-3 text-left transition ${
                    longTextMode === "IMAGES_THEN_TEXT"
                      ? "border-blue-500 bg-blue-950/40 text-white"
                      : "border-neutral-700 bg-neutral-900 text-neutral-300 hover:border-neutral-500"
                  }`}
                >
                  <span className="text-lg">🖼️</span>
                  <span>
                    <span className="block text-sm font-medium">
                      Publish images first, then text as separate message
                    </span>
                    <span className="mt-1 block text-xs text-neutral-400">
                      Images have no caption; the complete text follows.
                    </span>
                  </span>
                </button>
                <button
                  type="button"
                  onClick={() => setLongTextMode("CAPTION_THEN_TEXT")}
                  className={`flex min-h-16 items-start gap-2 rounded-lg border p-3 text-left transition ${
                    longTextMode === "CAPTION_THEN_TEXT"
                      ? "border-blue-500 bg-blue-950/40 text-white"
                      : "border-neutral-700 bg-neutral-900 text-neutral-300 hover:border-neutral-500"
                  }`}
                >
                  <span className="text-lg">✂️</span>
                  <span>
                    <span className="block text-sm font-medium">
                      Publish as image with short caption
                    </span>
                    <span className="mt-1 block text-xs text-neutral-400">
                      Use the maximum caption, then send the remaining text.
                    </span>
                  </span>
                </button>
              </div>
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
              <Button
                onClick={run}
                disabled={
                  busy ||
                  uploadingImages ||
                  !title.trim() ||
                  (mode !== "draft" && !text.trim() && !imageUrls.length) ||
                  (mode === "schedule" && (!scheduleDate || !scheduleTime))
                }
              >
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
                  value: "PUBLISHED",
                  label: "Published",
                  icon: CheckCircle2,
                  count: (posts.data || []).filter(
                    (post) => post.status === "PUBLISHED",
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
                  value: "DRAFT",
                  label: "Drafts",
                  icon: FileText,
                  count: (posts.data || []).filter((post) =>
                    ["DRAFT", "FAILED", "PUBLISHING"].includes(post.status),
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
            <div className="max-h-[calc(100vh-15rem)] space-y-2 overflow-y-auto pr-1">
              {visiblePosts.map((post) => (
                <div
                  key={post.id}
                  className={`flex items-center gap-2 rounded-lg border p-1 ${
                    editing?.id === post.id
                      ? "border-blue-500 bg-blue-950/20"
                      : "border-neutral-800 hover:bg-neutral-900"
                  }`}
                >
                  <button
                    type="button"
                    onClick={() => {
                      selectPost(post);
                      onPostSelect(post.id);
                    }}
                    className="flex min-w-0 flex-1 items-center gap-2 px-2 py-2 text-left"
                  >
                    <PostStatusIcon status={post.status} />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm">{post.title}</span>
                      <span className="block truncate text-[11px] text-neutral-500">
                        {post.status === "SCHEDULED" && post.scheduledAt
                          ? new Date(post.scheduledAt).toLocaleString()
                          : post.status === "PUBLISHED" && post.publishedAt
                            ? new Date(post.publishedAt).toLocaleString()
                            : post.status.toLowerCase()}
                      </span>
                    </span>
                  </button>
                  <IconButton
                    type="button"
                    kind="delete"
                    aria-label={`Delete ${post.title}`}
                    onClick={() => setDeletingPost(post)}
                  />
                </div>
              ))}
            </div>
          ) : !posts.isLoading ? (
            <EmptyState text={`No ${statusTab.toLowerCase()} posts`} />
          ) : null}
        </Card>
      </div>

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
          setBusy(true);
          try {
            await telegramChannelsApi.deleteManagedPost(
              channelId,
              deletingPost.id,
            );
            if (editing?.id === deletingPost.id) {
              reset();
              onPostSelect(null);
            }
            await posts.refetch();
            setDeletingPost(null);
          } finally {
            setBusy(false);
          }
        }}
      />
    </>
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
  return (
    <FormField label="Images">
      {!readOnly ? <label
        className={`flex cursor-pointer items-center justify-center gap-2 rounded-lg border border-dashed border-neutral-700 bg-neutral-950/50 px-4 text-sm text-neutral-300 hover:border-blue-600 hover:text-white ${
          compact ? "h-[38px] py-2" : "py-5"
        } ${
          disabled ? "pointer-events-none opacity-50" : ""
        }`}
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
      </label> : null}
      {value.length || uploadingPreviews.length ? (
        <div className="mt-2 grid grid-cols-3 gap-2 sm:grid-cols-5">
          {value.map((url, index) => (
            <div
              key={`${url}-${index}`}
              className="group relative aspect-square overflow-hidden rounded-lg border border-neutral-700 bg-neutral-950"
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={url} alt="" className="h-full w-full object-cover" />
              {!readOnly ? <button
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
              </button> : null}
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

function PostStatusIcon({
  status,
}: {
  status: TelegramManagedPost["status"];
}) {
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
  if (imageCount && textLength > 1024) {
    return "Published as images, then full text";
  }
  if (imageCount) return "Published as image with caption";
  return "Published as a text message";
}
