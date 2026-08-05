import type { QueryClient } from "@tanstack/react-query";
import {
  adCampaignKeys,
  telegramAccountKeys,
  telegramChannelKeys,
  telegramPostKeys,
} from "./query-keys";

export async function invalidateTelegramAccessQueries(queryClient: QueryClient) {
  await Promise.all([
    queryClient.invalidateQueries({ queryKey: telegramAccountKeys.accounts() }),
    queryClient.invalidateQueries({ queryKey: telegramAccountKeys.bots() }),
    queryClient.invalidateQueries({ queryKey: telegramChannelKeys.sourceChannels() }),
    queryClient.invalidateQueries({ queryKey: telegramChannelKeys.sources() }),
    queryClient.invalidateQueries({
      queryKey: telegramChannelKeys.publishingCapabilities(),
    }),
    queryClient.invalidateQueries({
      queryKey: telegramChannelKeys.analyticsSources(),
    }),
    queryClient.invalidateQueries({ queryKey: telegramChannelKeys.list() }),
  ]);
}

export async function invalidateTelegramChannelQueries(
  queryClient: QueryClient,
  channelId: string,
) {
  await Promise.all([
    queryClient.invalidateQueries({ queryKey: telegramChannelKeys.list() }),
    queryClient.invalidateQueries({ queryKey: telegramChannelKeys.detail(channelId) }),
    queryClient.invalidateQueries({
      queryKey: telegramChannelKeys.analytics(channelId),
    }),
    queryClient.invalidateQueries({
      queryKey: telegramPostKeys.channelPosts(channelId),
    }),
    queryClient.invalidateQueries({
      queryKey: telegramChannelKeys.analyticsSources(channelId),
    }),
    queryClient.invalidateQueries({
      queryKey: telegramChannelKeys.audience(channelId),
    }),
    queryClient.invalidateQueries({
      queryKey: telegramChannelKeys.financialSummary(channelId),
    }),
    queryClient.invalidateQueries({
      queryKey: telegramChannelKeys.inviteLinks(channelId),
    }),
    queryClient.invalidateQueries({
      queryKey: telegramChannelKeys.audienceSnapshots(channelId),
    }),
    queryClient.invalidateQueries({
      queryKey: telegramPostKeys.managed(channelId),
    }),
    queryClient.invalidateQueries({ queryKey: telegramPostKeys.postGroups(channelId) }),
    queryClient.invalidateQueries({
      queryKey: telegramPostKeys.linkTargets(channelId),
    }),
    queryClient.invalidateQueries({ queryKey: adCampaignKeys.list() }),
    queryClient.invalidateQueries({ queryKey: adCampaignKeys.performance() }),
    queryClient.invalidateQueries({
      queryKey: telegramChannelKeys.campaigns(channelId),
    }),
  ]);
}
