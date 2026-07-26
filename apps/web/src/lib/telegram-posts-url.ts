"use client";

export type TelegramPostsRouteView = "editor" | "calendar";

type TelegramPostsUrlInput = {
  channelId?: string | null;
  postId?: string | null;
  groupId?: string | null;
  noteId?: string | null;
  postView?: TelegramPostsRouteView | null;
};

export function buildTelegramPostsUrl({
  channelId,
  postId,
  groupId,
  noteId,
  postView,
}: TelegramPostsUrlInput) {
  const params = new URLSearchParams();

  if (channelId?.trim()) params.set("channelId", channelId.trim());
  if (postId?.trim()) params.set("postId", postId.trim());
  if (groupId?.trim()) params.set("groupId", groupId.trim());
  if (noteId?.trim()) params.set("noteId", noteId.trim());
  if (postView) params.set("postView", postView);

  const query = params.toString();
  return query ? `/telegram-posts?${query}` : "/telegram-posts";
}
