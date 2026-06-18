"use client";

import { type ReactNode, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ChevronDown, ChevronRight, CircleHelp, Database } from "lucide-react";
import {
  Bar,
  CartesianGrid,
  ComposedChart,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { AppShell } from "@/components/layout/app-shell";
import { ChannelPreview } from "@/components/telegram/channel-preview";
import { TelegramSourceAvatar } from "@/components/telegram/telegram-source-avatar";
import {
  Button,
  DateInput,
  EntityCard,
  FormField,
  LoadingState,
  Modal,
  PageHeader,
  ToastStack,
  type ToastItem,
} from "@/components/ui/primitives";
import {
  getTelegramChannelAnalytics,
  getTelegramChannelPosts,
  syncTelegramChannelNow,
  telegramChannelsApi,
  type TelegramChannelSourceAccess,
} from "@/lib/api";

function formatLocalDate(value?: string | Date | null) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function toNumber(value: unknown) {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function formatNumber(value: unknown, decimals = 0) {
  return toNumber(value).toLocaleString(undefined, {
    maximumFractionDigits: decimals,
    minimumFractionDigits: decimals,
  });
}

function formatNullableNumber(value: unknown, decimals = 0) {
  if (value == null) return "-";
  return formatNumber(value, decimals);
}

function formatPercent(value: unknown, decimals = 1) {
  if (value == null || !Number.isFinite(Number(value))) return "-";
  return `${formatNumber(value, decimals)}%`;
}

export default function TelegramChannelAnalyticsPage() {
  const params = useParams<{ id: string }>();
  const id = params.id;
  const queryClient = useQueryClient();
  const [todayIso] = useState(() => formatLocalDate(new Date()));
  const [thirtyDaysAgoIso] = useState(() =>
    formatLocalDate(new Date(Date.now() - 30 * 24 * 3600 * 1000)),
  );
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const [syncScopeOpen, setSyncScopeOpen] = useState(false);
  const [rangeMode, setRangeMode] = useState<"30d" | "all" | "custom">("all");
  const [customFrom, setCustomFrom] = useState(thirtyDaysAgoIso);
  const [customTo, setCustomTo] = useState(todayIso);
  const [lastSyncResult, setLastSyncResult] = useState<any>(null);
  const [selectedSourceAccess, setSelectedSourceAccess] =
    useState<TelegramChannelSourceAccess | null>(null);
  const [openSections, setOpenSections] = useState({
    posts: true,
    inviteLinks: true,
    campaigns: true,
  });

  const pushToast = (
    message: string,
    tone: ToastItem["tone"] = "info",
    durationMs = 3500,
  ) => {
    const toastId = Date.now() + Math.floor(Math.random() * 1000);
    setToasts((prev) => [...prev, { id: toastId, message, tone }]);
    setTimeout(
      () => setToasts((prev) => prev.filter((toast) => toast.id !== toastId)),
      durationMs,
    );
  };

  const rangeParams = useMemo(() => {
    if (rangeMode === "all") return { from: "2000-01-01", to: todayIso };
    if (rangeMode === "custom")
      return { from: customFrom || undefined, to: customTo || undefined };
    return { from: thirtyDaysAgoIso, to: todayIso };
  }, [customFrom, customTo, rangeMode, thirtyDaysAgoIso, todayIso]);

  const { data, isLoading } = useQuery({
    queryKey: [
      "telegram-channel-analytics",
      id,
      rangeParams.from,
      rangeParams.to,
    ],
    queryFn: () =>
      getTelegramChannelAnalytics(id, rangeParams.from, rangeParams.to),
  });
  const {
    data: postsData,
    isLoading: isPostsLoading,
    error: postsError,
  } = useQuery({
    queryKey: ["telegram-channel-posts", id],
    queryFn: () => getTelegramChannelPosts(id, 100, 0),
  });
  const { data: analyticsSources } = useQuery({
    queryKey: ["telegram-channel-analytics-sources", id],
    queryFn: () => telegramChannelsApi.analyticsSources(id),
  });

  const syncMutation = useMutation({
    mutationFn: () => syncTelegramChannelNow(id),
    onMutate: () => pushToast("Syncing data...", "info"),
    onSuccess: (result) => {
      queryClient.invalidateQueries({
        queryKey: ["telegram-channel-analytics", id],
      });
      queryClient.invalidateQueries({
        queryKey: ["telegram-channel-posts", id],
      });
      queryClient.invalidateQueries({
        queryKey: ["telegram-channel-analytics-sources", id],
      });
      setLastSyncResult(result);
      pushToast(summarizeSync(result), "success", 8000);
    },
    onError: (error: any) =>
      pushToast(error?.response?.data?.message || "Sync failed.", "error"),
  });

  const posts = useMemo(
    () =>
      postsData?.items?.length ? postsData.items : data?.recentPosts || [],
    [data?.recentPosts, postsData?.items],
  );
  const visiblePosts = useMemo(
    () =>
      posts.filter((post: any) => String(post?.text || "").trim().length > 0),
    [posts],
  );
  const inviteLinks = useMemo(
    () => data?.inviteLinks || [],
    [data?.inviteLinks],
  );
  const campaigns = useMemo(() => data?.campaigns || [], [data?.campaigns]);
  const latestSnapshot = data?.channelStatsSnapshot;
  const mtprotoStats = latestSnapshot?.normalizedStats;
  const mtprotoGraphs = useMemo(
    () =>
      mtprotoGraphConfigs.map((config) => ({
        ...config,
        graph: mtprotoStats?.graphs?.[config.key],
        chart:
          normalizeStoredTelegramGraph(data?.channelStatsPoints, config.key) ||
          normalizeTelegramGraph(mtprotoStats?.graphs?.[config.key]),
      })),
    [data?.channelStatsPoints, mtprotoStats],
  );

  const computed = useMemo(() => {
    const viewsTotal = posts.reduce(
      (sum: number, post: any) => sum + toNumber(post.viewsCount),
      0,
    );
    const forwardsTotal = posts.reduce(
      (sum: number, post: any) => sum + toNumber(post.forwardsCount),
      0,
    );
    const reactionsTotal = posts.reduce(
      (sum: number, post: any) => sum + toNumber(post.reactionsCount),
      0,
    );
    const commentsTotal = posts.reduce(
      (sum: number, post: any) => sum + toNumber(post.commentsCount),
      0,
    );
    const viewedPosts = posts.filter(
      (post: any) => toNumber(post.viewsCount) > 0,
    );
    const eligiblePosts = posts.filter((post: any) => {
      const ageMs = Date.now() - new Date(post.postDate).getTime();
      return (
        ageMs >= 24 * 3600 * 1000 &&
        ageMs <= 30 * 24 * 3600 * 1000 &&
        toNumber(post.viewsCount) > 0
      );
    });
    const subscribers =
      toNumber(data?.channel?.currentSubscribersCount) ||
      toNumber(mtprotoStats?.followers?.current) ||
      toNumber(data?.summary?.subscribersCurrent);
    const averagePostViews = viewedPosts.length
      ? viewsTotal / viewedPosts.length
      : null;
    const averageEligibleViews = eligiblePosts.length
      ? eligiblePosts.reduce(
          (sum: number, post: any) => sum + toNumber(post.viewsCount),
          0,
        ) / eligiblePosts.length
      : null;
    const err =
      subscribers > 0 && averageEligibleViews != null
        ? (averageEligibleViews / subscribers) * 100
        : null;
    const reactionRate =
      viewsTotal > 0 ? (reactionsTotal / viewsTotal) * 100 : null;
    const forwardRate =
      viewsTotal > 0 ? (forwardsTotal / viewsTotal) * 100 : null;
    const joinedFromLinks = inviteLinks.reduce(
      (sum: number, link: any) => sum + toNumber(link.joinedCount),
      0,
    );
    const adSpend = campaigns.reduce(
      (sum: number, campaign: any) =>
        sum + toNumber(campaign.costAmount ?? campaign.price),
      0,
    );
    const cpa = joinedFromLinks > 0 ? adSpend / joinedFromLinks : null;

    return {
      subscribers,
      postsCount: posts.length,
      visiblePostsCount: visiblePosts.length,
      viewsTotal,
      forwardsTotal,
      reactionsTotal,
      commentsTotal,
      averagePostViews,
      averageEligibleViews,
      err,
      reactionRate,
      forwardRate,
      joinedFromLinks,
      adSpend,
      cpa,
      eligiblePostsCount: eligiblePosts.length,
    };
  }, [
    campaigns,
    data?.channel?.currentSubscribersCount,
    data?.summary?.subscribersCurrent,
    inviteLinks,
    mtprotoStats?.followers?.current,
    posts,
    visiblePosts.length,
  ]);

  const topPosts = useMemo(
    () =>
      [...visiblePosts]
        .sort(
          (a: any, b: any) => toNumber(b.viewsCount) - toNumber(a.viewsCount),
        )
        .slice(0, 10),
    [visiblePosts],
  );
  const topInviteLinks = useMemo(
    () =>
      [...inviteLinks].sort(
        (a: any, b: any) => toNumber(b.joinedCount) - toNumber(a.joinedCount),
      ),
    [inviteLinks],
  );
  const campaignRows = useMemo(
    () =>
      campaigns.map((campaign: any) => {
        const joined = toNumber(campaign.joinedCount);
        const cost = toNumber(campaign.costAmount ?? campaign.price);
        return {
          ...campaign,
          joined,
          cost,
          cpa: joined > 0 ? cost / joined : null,
        };
      }),
    [campaigns],
  );

  return (
    <AppShell>
      <PageHeader
        title={data?.channel?.title || "Channel Analytics"}
        subtitle={data?.channel?.username || "Analytics"}
        action={
          <div className="flex gap-2">
            <Button
              variant="secondary"
              disabled={syncMutation.isPending}
              onClick={() => syncMutation.mutate()}
            >
              {syncMutation.isPending ? "Syncing..." : "Sync"}
            </Button>
            <InfoTooltip tip="Sync uses the best connected source available for each data type and records attribution.">
              <button
                type="button"
                onClick={() => setSyncScopeOpen(true)}
                className="flex h-10 w-10 items-center justify-center rounded-lg border border-slate-600 bg-slate-800 text-slate-200 hover:bg-slate-700"
              >
                <CircleHelp size={18} />
              </button>
            </InfoTooltip>
          </div>
        }
      />
      {isLoading ? <LoadingState /> : null}
      {data?.channel ? (
        <ChannelPreview
          channel={{
            ...data.channel,
            currentSubscribersCount: computed.subscribers,
          }}
        />
      ) : null}

      <RangePicker
        rangeMode={rangeMode}
        setRangeMode={setRangeMode}
        customFrom={customFrom}
        customTo={customTo}
        setCustomFrom={setCustomFrom}
        setCustomTo={setCustomTo}
      />

      <DataSourcesPanel
        sources={analyticsSources?.sources || []}
        dataAttribution={analyticsSources?.dataAttribution || []}
        onSelectSource={setSelectedSourceAccess}
      />

      <section className="mt-5 grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
        <MetricCard
          title="Subscribers"
          value={formatNumber(computed.subscribers)}
          hint="Latest channel value"
        />
        <MetricCard
          title="Posts Synced"
          value={formatNumber(computed.postsCount)}
          hint={`${computed.visiblePostsCount} with text`}
        />
        <MetricCard
          title="Total Views"
          value={formatNumber(computed.viewsTotal)}
          hint="Sum from post metrics"
        />
        <MetricCard
          title="Average Views"
          value={formatNullableNumber(computed.averagePostViews)}
          hint="Posts with views > 0"
        />
        <MetricCard
          title="ERR"
          value={formatPercent(computed.err, 2)}
          hint={`Eligible posts: ${computed.eligiblePostsCount}`}
        />
        <MetricCard
          title="Reactions"
          value={formatNumber(computed.reactionsTotal)}
          hint={`Rate: ${formatPercent(computed.reactionRate, 2)}`}
        />
        <MetricCard
          title="Forwards"
          value={formatNumber(computed.forwardsTotal)}
          hint={`Rate: ${formatPercent(computed.forwardRate, 2)}`}
        />
        <MetricCard
          title="Joined From Links"
          value={formatNumber(computed.joinedFromLinks)}
          hint="Invite-link usage"
        />
        <MetricCard
          title="Campaign CPA"
          value={computed.cpa == null ? "-" : formatNumber(computed.cpa, 2)}
          hint="Spend / joined from links"
        />
        <MetricCard
          title="Comments"
          value={formatNumber(computed.commentsTotal)}
          hint="Post comments"
        />
        <MetricCard
          title="Invite Links"
          value={formatNumber(inviteLinks.length)}
          hint="Imported invite links"
        />
        <MetricCard
          title="Campaigns"
          value={formatNumber(campaigns.length)}
          hint="Attribution source: invite links"
        />
      </section>

      <section className="mt-6">
        <SimplePanel title="Snapshot">
          {latestSnapshot ? (
            <div className="grid grid-cols-1 gap-3 text-sm md:grid-cols-2 xl:grid-cols-4">
              <SnapshotItem
                label="Latest snapshot"
                value={new Date(latestSnapshot.syncedAt).toLocaleString()}
              />
              <SnapshotItem
                label="Status"
                value={mtprotoStats?.status || "unknown"}
              />
              <SnapshotItem
                label="Followers"
                value={formatNullableNumber(mtprotoStats?.followers?.current)}
              />
              <SnapshotItem
                label="Views / Post"
                value={formatNullableNumber(
                  mtprotoStats?.views_per_post?.current,
                  1,
                )}
              />
              <SnapshotItem
                label="Shares / Post"
                value={formatNullableNumber(
                  mtprotoStats?.shares_per_post?.current,
                  1,
                )}
              />
              <SnapshotItem
                label="Reactions / Post"
                value={formatNullableNumber(
                  mtprotoStats?.reactions_per_post?.current,
                  1,
                )}
              />
              <SnapshotItem
                label="Notifications enabled"
                value={formatTelegramPercent(
                  mtprotoStats?.enabled_notifications,
                )}
              />
              <SnapshotItem
                label="Telegram window"
                value={formatStatsPeriod(
                  mtprotoStats?.period,
                  mtprotoStats?.graphs,
                )}
              />
            </div>
          ) : (
            <EmptyState text="No channel snapshot yet." />
          )}
        </SimplePanel>
      </section>

      <section className="mt-6">
        <h3 className="mb-3 text-lg font-semibold">Charts</h3>
        <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
          {mtprotoGraphs.map(({ key, title, graph, chart }) => (
            <SimplePanel key={key} title={title}>
              {chart ? (
                <MtprotoGraphChart chart={chart} />
              ) : (
                <TelegramGraphPlaceholder graph={graph} />
              )}
            </SimplePanel>
          ))}
        </div>
      </section>

      <section className="mt-6">
        <SectionToggle
          title="Campaign Attribution"
          open={openSections.campaigns}
          onToggle={() =>
            setOpenSections((prev) => ({ ...prev, campaigns: !prev.campaigns }))
          }
        />
        {openSections.campaigns ? (
          campaignRows.length ? (
            <CampaignsTable campaigns={campaignRows} />
          ) : (
            <EmptyState text="No campaigns for this channel." />
          )
        ) : null}
      </section>

      <section className="mt-6">
        <SectionToggle
          title="All Posts Metrics"
          open={openSections.posts}
          onToggle={() =>
            setOpenSections((prev) => ({ ...prev, posts: !prev.posts }))
          }
        />
        {openSections.posts ? (
          <>
            {isPostsLoading ? <LoadingState /> : null}
            {postsError ? (
              <div className="rounded-lg border border-rose-700 p-3 text-sm text-rose-200">
                Failed to load posts.
              </div>
            ) : null}
            {!isPostsLoading && !postsError ? (
              <PostsTable
                posts={visiblePosts}
                subscribers={computed.subscribers}
              />
            ) : null}
          </>
        ) : null}
      </section>

      <section className="mt-6">
        <SectionToggle
          title="Raw Invite Links"
          open={openSections.inviteLinks}
          onToggle={() =>
            setOpenSections((prev) => ({
              ...prev,
              inviteLinks: !prev.inviteLinks,
            }))
          }
        />
        {openSections.inviteLinks ? (
          <InviteLinksTable links={topInviteLinks} />
        ) : null}
      </section>

      <SyncScopeModal
        open={syncScopeOpen}
        onClose={() => setSyncScopeOpen(false)}
        sources={analyticsSources?.sources || []}
        dataAttribution={analyticsSources?.dataAttribution || []}
        isSyncing={syncMutation.isPending}
        lastSyncResult={lastSyncResult}
        onSelectSource={setSelectedSourceAccess}
      />
      <ToastStack
        items={toasts}
        onClose={(toastId) =>
          setToasts((prev) => prev.filter((toast) => toast.id !== toastId))
        }
      />
      <SourceAccessModal
        access={selectedSourceAccess}
        onClose={() => setSelectedSourceAccess(null)}
      />
    </AppShell>
  );
}

function RangePicker({
  rangeMode,
  setRangeMode,
  customFrom,
  customTo,
  setCustomFrom,
  setCustomTo,
}: {
  rangeMode: "30d" | "all" | "custom";
  setRangeMode: (value: "30d" | "all" | "custom") => void;
  customFrom: string;
  customTo: string;
  setCustomFrom: (value: string) => void;
  setCustomTo: (value: string) => void;
}) {
  return (
    <section className="mt-5 flex flex-wrap items-end gap-2 rounded-lg border border-slate-700 p-3">
      <Button
        variant={rangeMode === "30d" ? "primary" : "secondary"}
        type="button"
        onClick={() => setRangeMode("30d")}
      >
        30d
      </Button>
      <Button
        variant={rangeMode === "all" ? "primary" : "secondary"}
        type="button"
        onClick={() => setRangeMode("all")}
      >
        All
      </Button>
      <Button
        variant={rangeMode === "custom" ? "primary" : "secondary"}
        type="button"
        onClick={() => setRangeMode("custom")}
      >
        Custom
      </Button>
      {rangeMode === "custom" ? (
        <>
          <div className="w-44">
            <FormField label="From">
              <DateInput
                value={customFrom}
                onChange={(event) =>
                  setCustomFrom(String(event.target.value || ""))
                }
              />
            </FormField>
          </div>
          <div className="w-44">
            <FormField label="To">
              <DateInput
                value={customTo}
                onChange={(event) =>
                  setCustomTo(String(event.target.value || ""))
                }
              />
            </FormField>
          </div>
        </>
      ) : null}
    </section>
  );
}

function MetricCard({
  title,
  value,
  hint,
}: {
  title: string;
  value: string;
  hint?: string;
}) {
  return (
    <EntityCard title={title} actions={null}>
      <p className="text-2xl font-semibold">{value}</p>
      {hint ? <p className="mt-1 text-xs text-slate-400">{hint}</p> : null}
    </EntityCard>
  );
}

function SimplePanel({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <div className="rounded-lg border border-slate-700 bg-slate-950/20 p-3">
      <h3 className="mb-3 text-base font-semibold">{title}</h3>
      {children}
    </div>
  );
}

function DataSourcesPanel({
  sources,
  dataAttribution,
  onSelectSource,
}: {
  sources: Array<TelegramChannelSourceAccess & { usedFor?: string[] }>;
  dataAttribution: Array<{
    dataType: string;
    label: string;
    status: string;
    sources: Array<{
      sourceId: string;
      sourceType: string;
      displayName?: string | null;
    }>;
    syncedAt?: string | null;
    errorMessage?: string | null;
  }>;
  onSelectSource: (source: TelegramChannelSourceAccess) => void;
}) {
  const sourceByKey = new Map(
    sources.map((source) => [
      `${source.sourceType}:${source.sourceId}`,
      source,
    ]),
  );
  return (
    <section className="mt-6">
      <SimplePanel title="Data sources">
        <div className="rounded-lg border border-slate-800">
          {dataAttribution.map((item) => (
            <div
              key={item.dataType}
              className="flex flex-col gap-1 border-t border-slate-800 px-3 py-2 first:border-t-0 md:flex-row md:items-center md:justify-between"
            >
              <div className="flex items-center gap-2">
                <Database size={15} className="text-slate-400" />
                <span className="text-sm font-medium">{item.label}</span>
                <span
                  className={`text-xs ${item.status === "SUCCESS" ? "text-emerald-300" : item.status === "FAILED" ? "text-rose-300" : "text-slate-400"}`}
                >
                  {item.status}
                </span>
              </div>
              {item.sources.length ? (
                <div className="flex flex-wrap justify-start gap-1 text-sm text-slate-400 md:justify-end">
                  <span>Loaded from</span>
                  {item.sources.map((source, index) => {
                    const access = sourceByKey.get(
                      `${source.sourceType}:${source.sourceId}`,
                    );
                    const label = source.displayName || source.sourceType;
                    return (
                      <span key={`${source.sourceType}:${source.sourceId}`}>
                        {index > 0 ? " / " : ""}
                        {access ? (
                          <button
                            type="button"
                            onClick={() => onSelectSource(access)}
                            className="text-blue-300 hover:underline"
                          >
                            {label}
                          </button>
                        ) : (
                          label
                        )}
                      </span>
                    );
                  })}
                </div>
              ) : (
                <p className="text-sm text-slate-400">
                  Not available
                  {item.errorMessage ? `: ${item.errorMessage}` : ""}
                </p>
              )}
            </div>
          ))}
        </div>
      </SimplePanel>
    </section>
  );
}

function SyncScopeModal({
  open,
  onClose,
  sources,
  dataAttribution,
  isSyncing,
  lastSyncResult,
  onSelectSource,
}: {
  open: boolean;
  onClose: () => void;
  sources: Array<TelegramChannelSourceAccess & { usedFor?: string[] }>;
  dataAttribution: Array<{
    dataType: string;
    label: string;
    status: string;
    sources: Array<{
      sourceId: string;
      sourceType: string;
      displayName?: string | null;
    }>;
    syncedAt?: string | null;
    errorMessage?: string | null;
  }>;
  isSyncing: boolean;
  lastSyncResult: unknown;
  onSelectSource: (source: TelegramChannelSourceAccess) => void;
}) {
  return (
    <Modal open={open} onClose={onClose} title="Sync sources and scope">
      <div className="space-y-4">
        <div>
          <p className="mb-2 text-sm font-medium text-slate-200">
            Connected sources
          </p>
          {!sources.length ? (
            <EmptyState text="No synced source access for this channel yet." />
          ) : null}
          <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
            {sources.map((source) => (
              <button
                key={`${source.sourceType}:${source.sourceId}`}
                type="button"
                onClick={() => onSelectSource(source)}
                className="flex min-h-36 flex-col rounded-md border border-slate-800 bg-slate-900/40 p-3 text-left hover:border-slate-600"
              >
                <div className="flex items-center gap-3">
                  <TelegramSourceAvatar
                    avatarUrl={source.avatarUrl}
                    sourceType={source.sourceType}
                    alt={source.displayName}
                    size="md"
                  />
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-white">
                      {source.displayName}
                    </p>
                    <p className="flex items-center gap-1 text-xs text-slate-400">
                      <span>{source.sourceType}</span>
                      <span>·</span>
                      <AccessBadge
                        label={formatRole(source.role)}
                        tip={roleTooltip(source.role, source.sourceType)}
                      />
                    </p>
                  </div>
                </div>
                <div
                  className={`mt-2 flex min-h-11 flex-wrap items-center gap-1 text-xs ${source.canBeUsedForAnalytics ? "text-emerald-300" : "text-amber-300"}`}
                >
                  <span>
                    {source.canBeUsedForAnalytics
                      ? "Can be used for analytics"
                      : "Not enough access for analytics"}
                  </span>
                  <PermissionSummaryBadges
                    permissions={source.permissions}
                    role={source.role}
                    sourceType={source.sourceType}
                  />
                </div>
                <p className="mt-auto pt-2 text-xs text-slate-400">
                  Used for:{" "}
                  {source.usedFor?.length
                    ? source.usedFor.map(formatDataType).join(", ")
                    : "-"}
                </p>
              </button>
            ))}
          </div>
        </div>
        <div>
          <p className="mb-2 text-sm font-medium text-slate-200">
            Data attribution
          </p>
          <div className="rounded-lg border border-slate-800">
            {dataAttribution.map((item) => (
              <div
                key={item.dataType}
                className="flex flex-col gap-1 border-t border-slate-800 px-3 py-2 first:border-t-0 md:flex-row md:items-center md:justify-between"
              >
                <div className="flex items-center gap-2">
                  <Database size={15} className="text-slate-400" />
                  <span className="text-sm font-medium">{item.label}</span>
                  <span
                    className={`text-xs ${item.status === "SUCCESS" ? "text-emerald-300" : item.status === "FAILED" ? "text-rose-300" : "text-slate-400"}`}
                  >
                    {item.status}
                  </span>
                </div>
                <p className="text-sm text-slate-400">
                  {item.sources.length
                    ? `Loaded from ${item.sources.map((source) => source.displayName || source.sourceType).join(" / ")}`
                    : `Not available${item.errorMessage ? `: ${item.errorMessage}` : ""}`}
                </p>
              </div>
            ))}
          </div>
        </div>
        <div className="rounded-md border border-slate-800 bg-slate-900/40 p-3 text-sm text-slate-300">
          <p>
            Now syncing:{" "}
            {isSyncing ? "data from available connected sources" : "idle"}
          </p>
          <p>
            Last sync payload:{" "}
            {lastSyncResult
              ? summarizeSync(lastSyncResult)
              : "Run sync to capture detailed result in UI"}
          </p>
          <p className="mt-1 text-xs text-slate-500">
            Source choice is recorded per data type; unavailable rows explain
            which permission is missing.
          </p>
        </div>
      </div>
    </Modal>
  );
}

function SourceAccessModal({
  access,
  onClose,
}: {
  access: TelegramChannelSourceAccess | null;
  onClose: () => void;
}) {
  if (!access) return null;
  const permissions = [
    ["Can create/publish posts", access.permissions.canPostMessages],
    ["Can edit posts", access.permissions.canEditMessages],
    ["Can delete posts", access.permissions.canDeleteMessages],
    ["Can invite users", access.permissions.canInviteUsers],
    ["Can manage invite links", access.permissions.canManageInviteLinks],
    ["Can view/export analytics", access.permissions.canViewStats],
  ] as const;
  return (
    <Modal open={!!access} onClose={onClose} title="Source access">
      <div className="space-y-4 text-sm">
        <div className="flex items-center gap-3">
          <TelegramSourceAvatar
            avatarUrl={access.avatarUrl}
            sourceType={access.sourceType}
            alt={access.displayName}
            size="md"
          />
          <div>
            <p className="font-semibold text-white">{access.displayName}</p>
            <p className="flex items-center gap-1 text-xs text-slate-400">
              <span>{access.sourceType}</span>
              <span>·</span>
              <AccessBadge
                label={formatRole(access.role)}
                tip={roleTooltip(access.role, access.sourceType)}
              />
            </p>
          </div>
        </div>
        <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
          <div className="rounded-lg border border-slate-800 bg-slate-900/30 p-3">
            <p className="text-xs text-slate-400">Role in channel</p>
            <div className="mt-1">
              <AccessBadge
                label={formatRole(access.role)}
                tip={roleTooltip(access.role, access.sourceType)}
              />
            </div>
          </div>
          <SnapshotItem
            label="Analytics"
            value={
              access.canBeUsedForAnalytics
                ? "Can be used for analytics"
                : "Not enough access for analytics"
            }
          />
        </div>
        <div className="rounded-md border border-slate-800 bg-slate-900/40 p-3">
          <p className="mb-2 font-medium text-slate-200">Permissions</p>
          <p className="mb-3 text-xs text-slate-400">
            {inviteLinksVisibility(access.role, access.sourceType)}
          </p>
          <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
            {permissions.map(([label, enabled]) => (
              <p
                key={label}
                className={enabled ? "text-emerald-300" : "text-slate-500"}
              >
                {enabled ? "Yes" : "No"} · {label}
              </p>
            ))}
          </div>
        </div>
      </div>
    </Modal>
  );
}

function formatRole(role: string) {
  return role.charAt(0) + role.slice(1).toLowerCase();
}

function formatDataType(value: string) {
  return value
    .toLowerCase()
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function PermissionSummaryBadges({
  permissions,
  role,
  sourceType,
}: {
  permissions: TelegramChannelSourceAccess["permissions"];
  role: string;
  sourceType: string;
}) {
  if (hasFullAccess(permissions, role)) {
    return (
      <>
        <span className="text-slate-500">·</span>
        <AccessBadge
          label="Full access"
          tip={fullAccessTooltip(role, sourceType)}
          tone="success"
        />
        <AccessBadge
          label={inviteLinksBadgeLabel(role, sourceType)}
          tip={inviteLinksVisibility(role, sourceType)}
          tone="info"
        />
      </>
    );
  }
  const labels = [
    permissions.canPostMessages ? "post" : null,
    permissions.canEditMessages ? "edit" : null,
    permissions.canDeleteMessages ? "delete" : null,
    permissions.canManageInviteLinks
      ? inviteLinksBadgeLabel(role, sourceType)
      : null,
    permissions.canViewStats ? "stats" : null,
  ].filter(Boolean);
  return (
    <span>
      {labels.length ? `· ${labels.join(", ")}` : "· unknown permissions"}
    </span>
  );
}

function AccessBadge({
  label,
  tip,
  tone = "default",
}: {
  label: string;
  tip: string;
  tone?: "default" | "success" | "info";
}) {
  const toneClass =
    tone === "success"
      ? "border-emerald-700 text-emerald-200"
      : tone === "info"
        ? "border-blue-700 text-blue-200"
        : "border-slate-700 text-slate-200";
  return (
    <span
      className={`group relative inline-flex rounded border px-2 py-0.5 text-xs ${toneClass}`}
    >
      {label}
      <span className="pointer-events-none absolute bottom-full left-0 z-30 mb-2 hidden w-64 rounded-md border border-slate-700 bg-slate-950 px-2 py-1.5 text-xs leading-relaxed text-slate-100 shadow-xl group-hover:block">
        {tip}
      </span>
    </span>
  );
}

function hasFullAccess(
  permissions: TelegramChannelSourceAccess["permissions"],
  role: string,
) {
  return (
    role === "OWNER" ||
    (role === "ADMIN" &&
      permissions.canPostMessages &&
      permissions.canEditMessages &&
      permissions.canDeleteMessages &&
      permissions.canManageInviteLinks &&
      permissions.canViewStats)
  );
}

function roleTooltip(role: string, sourceType: string) {
  if (role === "OWNER")
    return "Owner has the highest channel access: can manage posts, admins, stats, and all invite links when Telegram returns these permissions.";
  if (role === "ADMIN")
    return `Admin access depends on granted Telegram rights. This ${sourceType === "BOT" ? "bot" : "account"} may publish, edit, delete, invite, or view stats only if those rights are enabled.`;
  if (role === "MEMBER")
    return "Member access is not enough for analytics unless Telegram grants specific admin-level rights.";
  return "Unknown means Telegram did not return a clear channel role for this source.";
}

function fullAccessTooltip(role: string, sourceType: string) {
  return `Full access means this source has all meaningful analytics permissions currently tracked: publish, edit, delete, invite links, and stats. ${inviteLinksVisibility(role, sourceType)}`;
}

function inviteLinksBadgeLabel(role: string, sourceType: string) {
  if (role === "OWNER") return "All invite links";
  if (sourceType === "BOT") return "Own bot links only";
  return "Own admin links only";
}

function inviteLinksVisibility(role: string, sourceType: string) {
  if (role === "OWNER")
    return "Invite links: owner access can see all channel invite links.";
  if (sourceType === "BOT")
    return "Invite links: bots can see only invite links created by this bot.";
  return "Invite links: admins can see only invite links created by this admin account.";
}

function EmptyState({ text }: { text: string }) {
  return (
    <div className="rounded-lg border border-slate-800 bg-slate-900/30 p-3 text-sm text-slate-400">
      {text}
    </div>
  );
}

function TopPostsTable({
  posts,
  subscribers,
}: {
  posts: any[];
  subscribers: number;
}) {
  return (
    <div className="overflow-x-auto">
      <table className="min-w-full text-sm">
        <thead className="text-slate-400">
          <tr>
            <th className="px-2 py-1 text-left">Date</th>
            <th className="px-2 py-1 text-left">Post</th>
            <th className="px-2 py-1 text-right">Views</th>
            <th className="px-2 py-1 text-right">ERR</th>
          </tr>
        </thead>
        <tbody>
          {posts.map((post) => (
            <tr key={post.id} className="border-t border-slate-800">
              <td className="px-2 py-2">{formatLocalDate(post.postDate)}</td>
              <td className="max-w-sm truncate px-2 py-2">
                {post.text || "-"}
              </td>
              <td className="px-2 py-2 text-right">
                {formatNumber(post.viewsCount)}
              </td>
              <td className="px-2 py-2 text-right">
                {subscribers > 0
                  ? formatPercent(
                      (toNumber(post.viewsCount) / subscribers) * 100,
                      2,
                    )
                  : "-"}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function PostsTable({
  posts,
  subscribers,
}: {
  posts: any[];
  subscribers: number;
}) {
  if (!posts.length)
    return <EmptyState text="No post metrics with text yet." />;
  return (
    <div className="overflow-x-auto rounded-lg border border-slate-700">
      <table className="min-w-full text-sm">
        <thead className="bg-slate-900/60 text-slate-300">
          <tr>
            <th className="px-3 py-2 text-left">Date</th>
            <th className="px-3 py-2 text-left">Text</th>
            <th className="px-3 py-2 text-right">Views</th>
            <th className="px-3 py-2 text-right">Forwards</th>
            <th className="px-3 py-2 text-right">Reactions</th>
            <th className="px-3 py-2 text-right">Comments</th>
            <th className="px-3 py-2 text-right">ERR</th>
            <th className="px-3 py-2 text-right">Reaction Rate</th>
          </tr>
        </thead>
        <tbody>
          {posts.map((post) => {
            const views = toNumber(post.viewsCount);
            const reactions = toNumber(post.reactionsCount);
            return (
              <tr key={post.id} className="border-t border-slate-800">
                <td className="px-3 py-2">{formatLocalDate(post.postDate)}</td>
                <td className="max-w-md truncate px-3 py-2">
                  {post.text || "-"}
                </td>
                <td className="px-3 py-2 text-right">{formatNumber(views)}</td>
                <td className="px-3 py-2 text-right">
                  {formatNumber(post.forwardsCount)}
                </td>
                <td className="px-3 py-2 text-right">
                  {formatNumber(reactions)}
                </td>
                <td className="px-3 py-2 text-right">
                  {formatNumber(post.commentsCount)}
                </td>
                <td className="px-3 py-2 text-right">
                  {subscribers > 0
                    ? formatPercent((views / subscribers) * 100, 2)
                    : "-"}
                </td>
                <td className="px-3 py-2 text-right">
                  {views > 0
                    ? formatPercent((reactions / views) * 100, 2)
                    : "-"}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function InviteLinksTable({ links }: { links: any[] }) {
  if (!links.length) return <EmptyState text="No invite links yet." />;
  return (
    <div className="space-y-2">
      {links.map((link) => (
        <div
          key={link.id}
          className="rounded-lg border border-slate-800 bg-slate-900/30 p-3 text-sm"
        >
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="font-medium">{link.name || "Invite link"}</p>
              <p className="break-all text-slate-400">{link.url || "-"}</p>
              {link.adCampaign?.title ? (
                <p className="mt-1 text-xs text-slate-400">
                  Campaign: {link.adCampaign.title}
                </p>
              ) : null}
            </div>
            <div className="shrink-0 text-right">
              <p className="text-lg font-semibold">
                {formatNumber(link.joinedCount)}
              </p>
              <p className="text-xs text-slate-400">joined</p>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

function CampaignsTable({ campaigns }: { campaigns: any[] }) {
  return (
    <div className="overflow-x-auto rounded-lg border border-slate-700">
      <table className="min-w-full text-sm">
        <thead className="bg-slate-900/60 text-slate-300">
          <tr>
            <th className="px-3 py-2 text-left">Campaign</th>
            <th className="px-3 py-2 text-left">Date</th>
            <th className="px-3 py-2 text-right">Joined</th>
            <th className="px-3 py-2 text-right">Cost</th>
            <th className="px-3 py-2 text-right">CPA</th>
            <th className="px-3 py-2 text-left">Source</th>
          </tr>
        </thead>
        <tbody>
          {campaigns.map((campaign) => (
            <tr key={campaign.id} className="border-t border-slate-800">
              <td className="max-w-md truncate px-3 py-2">
                {campaign.title || "-"}
              </td>
              <td className="px-3 py-2">
                {formatLocalDate(
                  campaign.placementDate ||
                    campaign.startedAt ||
                    campaign.createdAt,
                )}
              </td>
              <td className="px-3 py-2 text-right">
                {formatNumber(campaign.joined)}
              </td>
              <td className="px-3 py-2 text-right">
                {formatNumber(campaign.cost, 2)} {campaign.currency || ""}
              </td>
              <td className="px-3 py-2 text-right">
                {campaign.cpa == null
                  ? "-"
                  : `${formatNumber(campaign.cpa, 2)} ${campaign.currency || ""}`}
              </td>
              <td className="px-3 py-2 text-slate-400">
                {campaign.attributionSource || "invite_link_usage"}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function SnapshotItem({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-slate-800 bg-slate-900/30 p-3">
      <p className="text-xs text-slate-400">{label}</p>
      <p className="mt-1 font-semibold">{value || "-"}</p>
    </div>
  );
}

function summarizeSync(result: any) {
  const historical = result?.historical || {};
  const publicInfo = result?.publicInfo || {};
  const posts = result?.postsMetricsSync || {};
  const olderPosts = result?.olderPostsBackfill || {};
  const stats = result?.channelStatsSync || {};
  const importedLinks = toNumber(historical.imported);
  const updatedLinks = toNumber(historical.updated);
  const dailyRows = toNumber(historical.postsUpdated);
  const syncedPosts = toNumber(posts.syncedPosts);
  const olderSyncedPosts = toNumber(olderPosts.syncedPosts);
  const points = toNumber(stats.pointsUpserted);
  const period = formatStatsPeriod(
    stats.snapshot?.normalizedStats?.period,
    stats.snapshot?.normalizedStats?.graphs,
  );
  const linkText =
    importedLinks || updatedLinks
      ? `Invite links: added ${importedLinks}, updated ${updatedLinks}.`
      : "Invite links: no new or changed links.";
  const postText =
    dailyRows || syncedPosts || olderSyncedPosts
      ? `Posts: refreshed ${syncedPosts} post metrics, backfilled ${olderSyncedPosts} older posts, and ${dailyRows} daily rows.`
      : "Posts: no post updates returned.";
  const statsText = stats.success
    ? `Analytics: loaded ${points} chart points${period !== "-" ? ` for ${period}` : ""}.`
    : `Analytics: not updated${stats.snapshot?.normalizedStats?.status ? ` (${stats.snapshot.normalizedStats.status})` : ""}.`;
  const publicText = publicInfo.updated
    ? `Channel info: refreshed${publicInfo.subscribersCount != null ? `, ${formatNumber(publicInfo.subscribersCount)} subscribers` : ""}.`
    : publicInfo.reason
      ? `Channel info: not updated (${publicInfo.reason}).`
      : "Channel info: refreshed.";
  return `Sync completed.\n${publicText}\n${linkText}\n${postText}\n${statsText}`;
}

function InfoTooltip({ tip, children }: { tip: string; children?: ReactNode }) {
  return (
    <span className="group relative inline-flex">
      {children || (
        <span className="inline-flex h-5 w-5 cursor-help items-center justify-center rounded-full border border-slate-600 text-slate-300">
          <CircleHelp size={13} />
        </span>
      )}
      <span className="pointer-events-none absolute right-0 top-full z-20 mt-2 w-64 rounded-md border border-slate-700 bg-slate-950 px-2 py-1.5 text-xs text-slate-100 opacity-0 shadow-lg transition-opacity group-hover:opacity-100 group-focus-within:opacity-100">
        {tip}
      </span>
    </span>
  );
}

function SectionToggle({
  title,
  open,
  onToggle,
}: {
  title: string;
  open: boolean;
  onToggle: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onToggle}
      className="mb-3 flex w-full items-center justify-between rounded-lg border border-slate-700 bg-slate-900/30 px-3 py-2 text-left"
    >
      <span className="text-lg font-semibold">{title}</span>
      {open ? (
        <ChevronDown size={18} className="text-slate-300" />
      ) : (
        <ChevronRight size={18} className="text-slate-300" />
      )}
    </button>
  );
}

function formatTelegramPercent(metric: any) {
  const part = Number(metric?.part);
  const total = Number(metric?.total);
  if (!Number.isFinite(part) || !Number.isFinite(total) || total === 0)
    return "-";
  return formatPercent((part / total) * 100, 1);
}

function formatStatsPeriod(period: any, graphs?: Record<string, any>) {
  if (!period) return "-";
  const graphDates = extractGraphDateValues(graphs);
  const minDate = earliestTelegramDateValue([
    period.minDate || period.min_date,
    ...graphDates,
  ]);
  const maxDate = latestTelegramDateValue([
    period.maxDate || period.max_date,
    ...graphDates,
  ]);
  return `${formatTelegramDate(minDate)} - ${formatTelegramDate(maxDate)}`;
}

function formatTelegramDate(value: unknown) {
  const numericValue = Number(value);
  if (!Number.isFinite(numericValue))
    return formatLocalDate(value as string | Date | null);
  return formatLocalDate(
    new Date(numericValue < 100000000000 ? numericValue * 1000 : numericValue),
  );
}

function latestTelegramDateValue(values: unknown[]) {
  let latest: unknown = null;
  let latestTime = Number.NEGATIVE_INFINITY;
  for (const value of values) {
    const time = toTelegramDateTime(value);
    if (time > latestTime) {
      latest = value;
      latestTime = time;
    }
  }
  return latest;
}

function earliestTelegramDateValue(values: unknown[]) {
  let earliest: unknown = null;
  let earliestTime = Number.POSITIVE_INFINITY;
  for (const value of values) {
    const time = toTelegramDateTime(value);
    if (time === Number.NEGATIVE_INFINITY) continue;
    if (time < earliestTime) {
      earliest = value;
      earliestTime = time;
    }
  }
  return earliest;
}

function extractGraphDateValues(graphs?: Record<string, any>) {
  const values: unknown[] = [];
  for (const graph of Object.values(graphs || {})) {
    const columns = graph?.data?.columns;
    if (!Array.isArray(columns)) continue;
    const dates = columns.find(
      (column: unknown) => Array.isArray(column) && column[0] === "x",
    );
    if (!Array.isArray(dates)) continue;
    values.push(...dates.slice(1));
  }
  return values;
}

function toTelegramDateTime(value: unknown) {
  if (value == null) return Number.NEGATIVE_INFINITY;
  const numericValue = Number(value);
  if (Number.isFinite(numericValue)) {
    return numericValue < 100000000000 ? numericValue * 1000 : numericValue;
  }
  const date = new Date(value as string | Date);
  return Number.isNaN(date.getTime())
    ? Number.NEGATIVE_INFINITY
    : date.getTime();
}

type TelegramGraphChartData = {
  rows: Array<Record<string, string | number>>;
  series: Array<{ color: string; key: string; name: string; type: string }>;
};

const mtprotoGraphConfigs = [
  { key: "followers_graph", title: "Followers" },
  { key: "growth_graph", title: "Growth" },
  { key: "views_graph", title: "Views" },
  { key: "languages_graph", title: "Audience Languages" },
  { key: "mute_graph", title: "Notifications Muted" },
  { key: "views_by_source_graph", title: "Views by Source" },
  { key: "new_followers_by_source_graph", title: "New Followers by Source" },
  { key: "reactions_by_emotion_graph", title: "Reactions by Emotion" },
] as const;

const telegramGraphColors = [
  "#38bdf8",
  "#22c55e",
  "#f59e0b",
  "#f472b6",
  "#a78bfa",
  "#fb7185",
  "#2dd4bf",
];

function normalizeStoredTelegramGraph(
  points: any[] | undefined,
  metric: string,
): TelegramGraphChartData | null {
  const metricPoints = (points || []).filter(
    (point) => point.metric === metric,
  );
  if (!metricPoints.length) return null;
  const rowsByDate = new Map<string, Record<string, string | number>>();
  const seriesByKey = new Map<
    string,
    TelegramGraphChartData["series"][number]
  >();

  for (const point of metricPoints) {
    const date = formatLocalDate(point.date);
    const row = rowsByDate.get(date) || { label: date };
    row[String(point.series)] = toNumber(point.value);
    rowsByDate.set(date, row);

    if (!seriesByKey.has(String(point.series))) {
      seriesByKey.set(String(point.series), {
        key: String(point.series),
        name: String(point.seriesLabel || point.series),
        color: normalizeTelegramColor(
          point.color,
          telegramGraphColors[seriesByKey.size % telegramGraphColors.length],
        ),
        type: String(point.graphType || "line"),
      });
    }
  }

  return {
    rows: Array.from(rowsByDate.entries())
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([, row]) => row),
    series: Array.from(seriesByKey.values()),
  };
}

function normalizeTelegramGraph(graph: any): TelegramGraphChartData | null {
  if (graph?.status !== "available") return null;
  let payload = graph.data;
  if (typeof payload === "string") {
    try {
      payload = JSON.parse(payload);
    } catch {
      return null;
    }
  }
  if (!Array.isArray(payload?.columns)) return null;
  const columns = payload.columns.filter(
    (column: unknown) => Array.isArray(column) && column.length > 1,
  ) as Array<Array<string | number>>;
  const xColumn = columns.find((column) => column[0] === "x");
  const valueColumns = columns.filter((column) => column[0] !== "x");
  if (!xColumn || !valueColumns.length) return null;

  const series = valueColumns.map((column, index) => {
    const key = String(column[0]);
    return {
      key,
      name: String(payload.names?.[key] || key),
      color: normalizeTelegramColor(
        payload.colors?.[key],
        telegramGraphColors[index % telegramGraphColors.length],
      ),
      type: String(payload.types?.[key] || "line"),
    };
  });
  const rows = xColumn.slice(1).map((xValue, index) => {
    const row: Record<string, string | number> = {
      label: formatTelegramGraphLabel(xValue),
    };
    for (const column of valueColumns) {
      const value = Number(column[index + 1]);
      if (Number.isFinite(value)) row[String(column[0])] = value;
    }
    return row;
  });

  return rows.length ? { rows, series } : null;
}

function normalizeTelegramColor(value: unknown, fallback: string) {
  const match = String(value || "").match(/#[0-9a-f]{6}/i);
  return match?.[0] || fallback;
}

function formatTelegramGraphLabel(value: string | number) {
  const numericValue = Number(value);
  if (!Number.isFinite(numericValue)) return String(value);
  const milliseconds =
    numericValue > 100000000000
      ? numericValue
      : numericValue > 1000000000
        ? numericValue * 1000
        : null;
  return milliseconds ? formatLocalDate(new Date(milliseconds)) : String(value);
}

function MtprotoGraphChart({ chart }: { chart: TelegramGraphChartData }) {
  return (
    <div className="rounded-lg bg-slate-900/40 p-2">
      <div className="h-64">
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart
            data={chart.rows}
            margin={{ top: 8, right: 12, left: -16, bottom: 0 }}
          >
            <CartesianGrid stroke="#1e293b" strokeDasharray="4 4" />
            <XAxis dataKey="label" tick={{ fill: "#94a3b8", fontSize: 12 }} />
            <YAxis tick={{ fill: "#94a3b8", fontSize: 12 }} width={42} />
            <Tooltip
              contentStyle={{
                background: "#020617",
                border: "1px solid #334155",
                borderRadius: 10,
              }}
              labelStyle={{ color: "#e2e8f0" }}
            />
            {chart.series.map((series) =>
              series.type === "bar" ? (
                <Bar
                  key={series.key}
                  dataKey={series.key}
                  fill={series.color}
                  name={series.name}
                  stackId="telegram"
                />
              ) : (
                <Line
                  key={series.key}
                  type={series.type === "step" ? "stepAfter" : "linear"}
                  dataKey={series.key}
                  stroke={series.color}
                  strokeWidth={2}
                  dot={false}
                  name={series.name}
                />
              ),
            )}
          </ComposedChart>
        </ResponsiveContainer>
      </div>
      <TelegramGraphLegend series={chart.series} />
    </div>
  );
}

function TelegramGraphLegend({
  series,
}: {
  series: TelegramGraphChartData["series"];
}) {
  return (
    <div className="mt-2 flex flex-wrap gap-2 px-1 pb-1">
      {series.map((item) => (
        <span
          key={item.key}
          className="rounded-md px-2.5 py-1 text-xs font-semibold text-white shadow-sm"
          style={{ backgroundColor: item.color }}
        >
          {item.name}
        </span>
      ))}
    </div>
  );
}

function TelegramGraphPlaceholder({ graph }: { graph: any }) {
  const message =
    graph?.status === "pending"
      ? "Telegram is preparing this graph asynchronously. Run Sync again later."
      : graph?.status === "error"
        ? `Telegram graph error: ${graph.error || "unknown error"}`
        : "This graph is unavailable for the channel.";
  return (
    <div className="h-44 rounded bg-slate-900/40 p-3 text-sm text-slate-400">
      {message}
    </div>
  );
}
