"use client";

export type TelegramPostsRouteView = "editor" | "calendar";

type TelegramPostsUrlInput = {
  channelId?: string | null;
  postId?: string | null;
  groupId?: string | null;
  noteId?: string | null;
  postView?: TelegramPostsRouteView | null;
  extraParams?: URLSearchParams | string | null;
};

const ownedTelegramPostsParams = [
  "channelId",
  "postId",
  "groupId",
  "noteId",
  "postView",
];

function trimValue(value?: string | null) {
  return value?.trim() || "";
}

function appendQuery(pathname: string, params: URLSearchParams) {
  const query = params.toString();
  return query ? `${pathname}?${query}` : pathname;
}

export function buildTelegramPostsUrl({
  channelId,
  postId,
  groupId,
  noteId,
  postView,
  extraParams,
}: TelegramPostsUrlInput) {
  const params = new URLSearchParams(extraParams?.toString() ?? "");
  for (const key of ownedTelegramPostsParams) {
    params.delete(key);
  }

  const normalizedChannelId = trimValue(channelId);
  const normalizedPostId = trimValue(postId);
  const normalizedGroupId = trimValue(groupId);
  const normalizedNoteId = trimValue(noteId);

  if (normalizedPostId) params.set("postId", normalizedPostId);
  if (normalizedNoteId) params.set("noteId", normalizedNoteId);

  if (normalizedChannelId && normalizedGroupId) {
    params.set("channelId", normalizedChannelId);
    params.set("groupId", normalizedGroupId);
    return appendQuery("/telegram-posts", params);
  }

  if (normalizedChannelId && postView) {
    return appendQuery(
      `/telegram-posts/${encodeURIComponent(normalizedChannelId)}/${postView}`,
      params,
    );
  }

  if (normalizedChannelId) params.set("channelId", normalizedChannelId);
  if (postView) params.set("postView", postView);
  return appendQuery("/telegram-posts", params);
}

export function buildTelegramPostsLegacyRedirectUrl(
  searchParams: URLSearchParams | Pick<URLSearchParams, "get" | "toString">,
) {
  const channelId = trimValue(searchParams.get("channelId"));
  const groupId = trimValue(searchParams.get("groupId"));
  const postView = searchParams.get("postView");
  if (!channelId || groupId || (postView !== "editor" && postView !== "calendar")) {
    return null;
  }

  return buildTelegramPostsUrl({
    channelId,
    postId: searchParams.get("postId"),
    noteId: searchParams.get("noteId"),
    postView,
    extraParams: searchParams.toString(),
  });
}
