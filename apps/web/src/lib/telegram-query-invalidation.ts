import type { QueryClient } from "@tanstack/react-query";

export async function invalidateTelegramAccessQueries(queryClient: QueryClient) {
  await Promise.all([
    queryClient.invalidateQueries({ queryKey: ["telegram-user-accounts"] }),
    queryClient.invalidateQueries({ queryKey: ["telegram-bots"] }),
    queryClient.invalidateQueries({ queryKey: ["telegram-source-channels"] }),
    queryClient.invalidateQueries({ queryKey: ["telegram-channel-sources"] }),
    queryClient.invalidateQueries({
      queryKey: ["telegram-channel-analytics-sources"],
    }),
    queryClient.invalidateQueries({ queryKey: ["telegram-channels"] }),
  ]);
}

export async function invalidateTelegramChannelQueries(
  queryClient: QueryClient,
  channelId: string,
) {
  await Promise.all([
    queryClient.invalidateQueries({ queryKey: ["telegram-channels"] }),
    queryClient.invalidateQueries({ queryKey: ["telegram-channel", channelId] }),
    queryClient.invalidateQueries({
      queryKey: ["telegram-channel-analytics", channelId],
    }),
    queryClient.invalidateQueries({
      queryKey: ["telegram-channel-posts", channelId],
    }),
    queryClient.invalidateQueries({
      queryKey: ["telegram-channel-analytics-sources", channelId],
    }),
    queryClient.invalidateQueries({
      queryKey: ["telegram-channel-audience", channelId],
    }),
    queryClient.invalidateQueries({
      queryKey: ["telegram-channel-financial-summary", channelId],
    }),
    queryClient.invalidateQueries({
      queryKey: ["channel-invite-links", channelId],
    }),
    queryClient.invalidateQueries({
      queryKey: ["telegram-channel-audience-snapshots", channelId],
    }),
    queryClient.invalidateQueries({
      queryKey: ["telegram-managed-posts", channelId],
    }),
    queryClient.invalidateQueries({ queryKey: ["post-groups", channelId] }),
    queryClient.invalidateQueries({
      queryKey: ["telegram-managed-post-link-targets", channelId],
    }),
  ]);
}
