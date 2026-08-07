export const authKeys = {
  root: ["auth"] as const,
  me: () => ["auth", "me"] as const,
};

export const workspaceKeys = {
  workspaces: () => ["workspaces"] as const,
  members: () => ["workspace-members"] as const,
  membersSelect: () => ["workspace-members", "select"] as const,
};

export const currencyKeys = {
  settings: () => ["currency-settings"] as const,
  rates: () => ["currency-rates"] as const,
};

export const accountKeys = {
  me: () => ["account-me"] as const,
  accounts: () => ["accounts"] as const,
  transactions: () => ["transactions"] as const,
};

export const dashboardKeys = {
  summary: (
    rangeMode?: string,
    dateFrom?: string | null,
    dateTo?: string | null,
  ) =>
    rangeMode
      ? (["dashboard-summary", rangeMode, dateFrom ?? null, dateTo ?? null] as const)
      : (["dashboard-summary"] as const),
};

export const telegramChannelKeys = {
  root: ["telegram-channels"] as const,
  list: () => ["telegram-channels"] as const,
  select: (params?: { canPostMessagesOnly?: boolean }) =>
    [
      "telegram-channels",
      "select",
      params?.canPostMessagesOnly ?? null,
    ] as const,
  detail: (channelId: string) => ["telegram-channel", channelId] as const,
  analytics: (channelId: string) =>
    ["telegram-channel-analytics", channelId] as const,
  analyticsSources: (channelId?: string) =>
    channelId
      ? (["telegram-channel-analytics-sources", channelId] as const)
      : (["telegram-channel-analytics-sources"] as const),
  audience: (channelId: string) =>
    ["telegram-channel-audience", channelId] as const,
  audienceSnapshots: (channelId: string) =>
    ["telegram-channel-audience-snapshots", channelId] as const,
  financialSummary: (channelId: string) =>
    ["telegram-channel-financial-summary", channelId] as const,
  inviteLinks: (channelId: string) =>
    ["telegram-channel-invite-links", channelId] as const,
  inviteLinksPage: (
    channelId: string,
    page: number,
    pageSize: number,
    search: string,
  ) =>
    ["telegram-channel-invite-links", channelId, page, pageSize, search] as const,
  sources: () => ["telegram-channel-sources"] as const,
  sourceChannels: () => ["telegram-source-channels"] as const,
  publishingCapabilities: () => ["telegram-publishing-capabilities"] as const,
  campaigns: (channelId: string) =>
    ["telegram-channel-campaigns", channelId] as const,
  campaignsPage: (
    channelId: string,
    page: number,
    pageSize: number,
    search: string,
  ) => ["telegram-channel-campaigns", channelId, page, pageSize, search] as const,
};

export const telegramPostKeys = {
  managed: (channelId: string) => ["telegram-managed-posts", channelId] as const,
  managedCalendar: (channelId: string) =>
    ["telegram-managed-posts-calendar", channelId] as const,
  linkTargets: (channelId: string) =>
    ["telegram-managed-post-link-targets", channelId] as const,
  channelPosts: (channelId: string) =>
    ["telegram-channel-posts", channelId] as const,
  channelPostsPage: (
    channelId: string,
    page: number,
    pageSize: number,
    search: string,
  ) => ["telegram-channel-posts", channelId, page, pageSize, search] as const,
  postGroups: (channelId: string) => ["post-groups", channelId] as const,
  media: (channelId: string, postId?: string) =>
    ["telegram-post-media", channelId, postId] as const,
};

export const telegramAccountKeys = {
  accounts: () => ["telegram-user-accounts"] as const,
  bots: () => ["telegram-bots"] as const,
};

export const adCampaignKeys = {
  root: ["ad-campaigns"] as const,
  list: () => ["ad-campaigns"] as const,
  performance: () => ["ad-campaigns-performance"] as const,
  admissionViewAnalytics: (campaignId?: string) =>
    ["ad-campaign-admission-view-analytics", campaignId] as const,
  inviteLinkHistory: (campaignId?: string) =>
    ["campaign-invite-link-history", campaignId] as const,
};

export const networkKeys = {
  list: () => ["telegram-channel-networks"] as const,
  detail: (networkId: string) => ["telegram-channel-network", networkId] as const,
};

export const memberKeys = workspaceKeys;
