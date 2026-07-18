"use client";

import {
  Fragment,
  type ReactNode,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { createPortal } from "react-dom";
import { useParams } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Clock3,
  ChevronDown,
  ChevronRight,
  ChevronUp,
  CircleHelp,
  Database,
  Eye,
  Pencil,
  RefreshCw,
  Smile,
  Trash2,
} from "lucide-react";
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
import { IconPicker } from "@/components/icons/icon-picker";
import { ChannelPreview } from "@/components/telegram/channel-preview";
import { ChannelAccessBadge, telegramChannelAccessLabel } from "@/components/telegram/channel-access-badge";
import { InviteLinksTable } from "@/components/telegram/invite-links-table";
import { TelegramSourceAvatar } from "@/components/telegram/telegram-source-avatar";
import { MoneyStack } from "@/components/ui/money-stack";
import {
  Button,
  DateRangeInput,
  FormField,
  Input,
  LoadingState,
  Modal,
  PageHeader,
  TimeInput,
  TooltipBubble,
} from "@/components/ui/primitives";
import {
  currenciesApi,
  getTelegramChannelAnalytics,
  getTelegramChannelPosts,
  syncTelegramChannelNowWithProgress,
  telegramChannelsApi,
  type Icon,
  type TelegramChannel,
  type TelegramChannelAudienceSnapshot,
  type TelegramInviteLink,
  type TelegramChannelSourceAccess,
} from "@/lib/api";
import { scheduleProgressDismiss, syncProgressToToast } from "@/lib/progress";
import { invalidateTelegramChannelQueries } from "@/lib/telegram-query-invalidation";
import { useAppToast } from "@/providers/toast-provider";

function formatLocalDate(value?: string | Date | null) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function formatLocalDateTime(value?: string | Date | number | null) {
  if (value == null) return "-";
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  const hours = String(date.getHours()).padStart(2, "0");
  const minutes = String(date.getMinutes()).padStart(2, "0");
  return `${year}-${month}-${day} ${hours}:${minutes}`;
}

function toChartTimestamp(value: unknown) {
  if (value == null) return null;
  const numericValue = Number(value);
  if (Number.isFinite(numericValue)) {
    return numericValue > 100000000000 ? numericValue : numericValue * 1000;
  }
  const date = new Date(value as string | Date);
  return Number.isNaN(date.getTime()) ? null : date.getTime();
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

function hasNumericValue(value: unknown) {
  return value != null && Number.isFinite(Number(value));
}

function hasPositiveValue(value: unknown) {
  return hasNumericValue(value) && Number(value) > 0;
}

function hasKpiSettings(channel?: TelegramChannel) {
  return Boolean(
    channel?.targetCpa != null ||
      channel?.acceptableCpa != null ||
      channel?.stopCpa != null,
  );
}

function channelSubtitle(channel?: TelegramChannel | null) {
  const username = String(channel?.username || "").trim();
  if (username) return username.startsWith("@") ? username : `@${username}`;
  return telegramChannelAccessLabel(channel?.accessMode);
}

function dataQualityBadgeClass(status?: string | null) {
  if (status === "normal") return "border-emerald-700 text-emerald-200";
  if (status === "borderline") return "border-yellow-700 text-yellow-200";
  if (status === "suspicious") return "border-amber-700 text-amber-200";
  if (status === "anomalous" || status === "invalid")
    return "border-rose-700 text-rose-200";
  return "border-slate-700 text-slate-300";
}

function nullableNumber(value: unknown) {
  if (value == null || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function valueInRange(value: number, from: number | null, to: number | null) {
  if (from == null && to == null) return false;
  if (from != null && value < from) return false;
  if (to != null && value > to) return false;
  return true;
}

type CampaignKpiStatus = "good" | "acceptable" | "bad" | "unknown";

type ChannelSectionState = {
  posts: boolean;
  inviteLinks: boolean;
  campaigns: boolean;
};

const closedChannelSections: ChannelSectionState = {
  posts: false,
  inviteLinks: false,
  campaigns: false,
};

function channelSectionsStorageKey(channelId: string) {
  return `telegram-channel:${channelId}:open-sections`;
}

function readStoredChannelSections(channelId: string): ChannelSectionState {
  if (typeof window === "undefined") return closedChannelSections;
  try {
    const raw = window.localStorage.getItem(channelSectionsStorageKey(channelId));
    if (!raw) return closedChannelSections;
    const parsed = JSON.parse(raw) as Partial<ChannelSectionState>;
    return {
      posts: Boolean(parsed.posts),
      inviteLinks: Boolean(parsed.inviteLinks),
      campaigns: Boolean(parsed.campaigns),
    };
  } catch {
    return closedChannelSections;
  }
}

export default function TelegramChannelAnalyticsPage() {
  const params = useParams<{ id: string }>();
  const id = params.id;
  const queryClient = useQueryClient();
  const { pushToast, setProgress, clearProgress } = useAppToast();
  const [todayIso] = useState(() => formatLocalDate(new Date()));
  const [thirtyDaysAgoIso] = useState(() =>
    formatLocalDate(new Date(Date.now() - 30 * 24 * 3600 * 1000)),
  );
  const [syncScopeOpen, setSyncScopeOpen] = useState(false);
  const [syncStatusOpen, setSyncStatusOpen] = useState(false);
  const [rangeMode, setRangeMode] = useState<"30d" | "all" | "custom">("all");
  const [customFrom, setCustomFrom] = useState(thirtyDaysAgoIso);
  const [customTo, setCustomTo] = useState(todayIso);
  const [lastSyncResult, setLastSyncResult] = useState<any>(null);
  const [selectedSourceAccess, setSelectedSourceAccess] =
    useState<TelegramChannelSourceAccess | null>(null);
  const [openSections, setOpenSections] = useState<ChannelSectionState>(() =>
    readStoredChannelSections(id),
  );
  const [settings, setSettings] = useState<SettingsState>({
    seedSubscribersCount: "0",
    activeSubscribersWindow: "5",
    knownFakeSubscribersCount: "0",
    ownViewsPerPost: "0",
    ownReactionsPerPost: "0",
    targetCpaFrom: "",
    targetCpa: "",
    acceptableCpaFrom: "",
    acceptableCpa: "",
    stopCpaFrom: "",
    stopCpa: "",
    timePosts: [],
  });

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
  const { data: channel } = useQuery({
    queryKey: ["telegram-channel", id],
    queryFn: () => telegramChannelsApi.get(id),
  });
  const { data: audience } = useQuery({
    queryKey: ["telegram-channel-audience", id],
    queryFn: () => telegramChannelsApi.audience(id),
  });
  const { data: financialSummary } = useQuery({
    queryKey: ["telegram-channel-financial-summary", id],
    queryFn: () => telegramChannelsApi.financialSummary(id),
  });
  const { data: audienceSnapshots = [] } = useQuery({
    queryKey: ["telegram-channel-audience-snapshots", id],
    queryFn: () => telegramChannelsApi.audienceSnapshots(id, 80),
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
  const { data: currencySettings } = useQuery({
    queryKey: ["currency-settings"],
    queryFn: currenciesApi.getSettings,
  });
  const { data: rates } = useQuery({
    queryKey: ["currency-rates"],
    queryFn: currenciesApi.listRates,
  });

  useEffect(() => {
    window.localStorage.setItem(
      channelSectionsStorageKey(id),
      JSON.stringify(openSections),
    );
  }, [id, openSections]);

  useEffect(() => {
    const source = channel || data?.channel;
    if (!source) return;
    setSettings({
      seedSubscribersCount: String(source.seedSubscribersCount ?? 0),
      activeSubscribersWindow: String(source.activeSubscribersWindow ?? 5),
      knownFakeSubscribersCount: String(source.knownFakeSubscribersCount ?? 0),
      ownViewsPerPost: String(source.ownViewsPerPost ?? 0),
      ownReactionsPerPost: String(source.ownReactionsPerPost ?? 0),
      targetCpaFrom:
        source.targetCpaFrom == null ? "" : String(source.targetCpaFrom),
      targetCpa: source.targetCpa == null ? "" : String(source.targetCpa),
      acceptableCpaFrom:
        source.acceptableCpaFrom == null ? "" : String(source.acceptableCpaFrom),
      acceptableCpa:
        source.acceptableCpa == null ? "" : String(source.acceptableCpa),
      stopCpaFrom:
        source.stopCpaFrom == null
          ? source.stopCpa == null
            ? ""
            : String(source.stopCpa)
          : String(source.stopCpaFrom),
      stopCpa: "",
      timePosts: (source.timePosts || []).map((item: {
        id: string;
        title: string;
        time: string;
        iconId?: string | null;
        icon?: Icon | null;
      }) => ({
        id: item.id,
        title: item.title,
        time: item.time,
        iconId: item.iconId || null,
        icon: item.icon || null,
      })),
    });
  }, [channel, data?.channel]);

  const syncMutation = useMutation({
    mutationFn: async () => {
      const progressId = `telegram-channel-sync:${id}`;
      const progressTitle = `Sync ${channel?.title || "channel"}`;
      setProgress({
        id: progressId,
        title: progressTitle,
        current: 0,
        total: 8,
        message: "Starting sync…",
        iconUrl: channel?.photoUrl || undefined,
      });
      try {
        const result = await syncTelegramChannelNowWithProgress(
          id,
          (item, current, total) => {
            setProgress(
              syncProgressToToast({
                id: progressId,
                title: progressTitle,
                item,
                current,
                total,
                iconUrl: channel?.photoUrl || undefined,
              }),
            );
          },
        );
        setProgress({
          id: progressId,
          title: progressTitle,
          current: 8,
          total: 8,
          message: "Channel sync completed",
          completed: true,
          successCount: 1,
          failedCount: 0,
          skippedCount: 0,
          iconUrl: channel?.photoUrl || undefined,
        });
        scheduleProgressDismiss(clearProgress, progressId);
        return result;
      } catch (error) {
        clearProgress(progressId);
        throw error;
      }
    },
    onSuccess: (result) => {
      void invalidateTelegramChannelQueries(queryClient, id);
      setLastSyncResult(result);
      pushToast(summarizeSync(result), "success", 8000);
    },
    onError: (error: any) =>
      pushToast(error?.response?.data?.message || "Sync failed.", "error"),
  });

  const settingsMutation = useMutation({
    mutationFn: () =>
      telegramChannelsApi.update(id, {
        seedSubscribersCount: toNumber(settings.seedSubscribersCount),
        activeSubscribersWindow: Math.max(
          1,
          toNumber(settings.activeSubscribersWindow),
        ),
        knownFakeSubscribersCount: Math.max(
          0,
          toNumber(settings.knownFakeSubscribersCount),
        ),
        ownViewsPerPost: Math.max(0, toNumber(settings.ownViewsPerPost)),
        ownReactionsPerPost: Math.max(
          0,
          toNumber(settings.ownReactionsPerPost),
        ),
        targetCpaFrom:
          settings.targetCpaFrom === "" ? null : toNumber(settings.targetCpaFrom),
        targetCpa: settings.targetCpa === "" ? null : toNumber(settings.targetCpa),
        acceptableCpaFrom:
          settings.acceptableCpaFrom === ""
            ? null
            : toNumber(settings.acceptableCpaFrom),
        acceptableCpa:
          settings.acceptableCpa === "" ? null : toNumber(settings.acceptableCpa),
        stopCpaFrom:
          settings.stopCpaFrom === "" ? null : toNumber(settings.stopCpaFrom),
        stopCpa: null,
        timePosts: settings.timePosts.map((item) => ({
          title: item.title.trim(),
          time: item.time,
          iconId: item.iconId || null,
        })),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["telegram-channel", id] });
      queryClient.invalidateQueries({
        queryKey: ["telegram-channel-analytics", id],
      });
      queryClient.invalidateQueries({
        queryKey: ["telegram-channel-audience", id],
      });
      queryClient.invalidateQueries({
        queryKey: ["telegram-channel-financial-summary", id],
      });
      queryClient.invalidateQueries({ queryKey: ["telegram-channels"] });
      pushToast("Settings saved.", "success");
    },
    onError: (error: any) =>
      pushToast(error?.response?.data?.message || "Failed to save settings.", "error"),
  });

  const manualMetricsMutation = useMutation({
    mutationFn: ({
      postId,
      payload,
    }: {
      postId: string;
      payload: {
        manualOwnViews?: number;
        manualOwnReactions?: number;
        excludeFromAnalytics?: boolean;
      };
    }) => telegramChannelsApi.updatePostManualMetrics(id, postId, payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["telegram-channel-posts", id] });
      queryClient.invalidateQueries({
        queryKey: ["telegram-channel-audience", id],
      });
      queryClient.invalidateQueries({
        queryKey: ["telegram-channel-financial-summary", id],
      });
      queryClient.invalidateQueries({
        queryKey: ["telegram-channel-audience-snapshots", id],
      });
      pushToast("Post correction saved.", "success");
    },
    onError: (error: any) =>
      pushToast(
        error?.response?.data?.message || "Failed to save post correction.",
        "error",
      ),
  });

  const posts = useMemo(
    () =>
      postsData?.items?.length ? postsData.items : data?.recentPosts || [],
    [data?.recentPosts, postsData?.items],
  );
  const visiblePosts = useMemo(
    () =>
      posts.filter(
        (post: any) =>
          String(post?.text || "").trim().length > 0 || post?.hasMedia,
      ),
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
      mtprotoGraphConfigs
        .map((config) => {
          const chart =
          normalizeStoredTelegramGraph(data?.channelStatsPoints, config.key) ||
          normalizeTelegramGraph(mtprotoStats?.graphs?.[config.key]);
          return {
            ...config,
            chart,
          };
        })
        .filter(hasRenderableTelegramGraphItem),
    [data?.channelStatsPoints, mtprotoStats],
  );
  const activeChannel = (channel || data?.channel) as TelegramChannel | undefined;
  const hasKpi = Boolean(
    settings.targetCpaFrom ||
      settings.targetCpa ||
      settings.acceptableCpaFrom ||
      settings.acceptableCpa ||
      settings.stopCpaFrom ||
      settings.stopCpa,
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
  const statCards = [
    {
      key: "subscribers",
      show: hasPositiveValue(computed.subscribers),
      title: "Subscribers",
      value: formatNumber(computed.subscribers),
      hint: "Latest channel value",
    },
    {
      key: "posts",
      show: hasPositiveValue(computed.postsCount),
      title: "Posts Synced",
      value: formatNumber(computed.postsCount),
      hint: `${computed.visiblePostsCount} with content`,
    },
    {
      key: "views",
      show: hasPositiveValue(computed.viewsTotal),
      title: "Total Views",
      value: formatNumber(computed.viewsTotal),
      hint: "Sum from post metrics",
    },
    {
      key: "avgViews",
      show: hasNumericValue(computed.averagePostViews),
      title: "Average Views",
      value: formatNullableNumber(computed.averagePostViews),
      hint: "Posts with views > 0",
    },
    {
      key: "err",
      show: hasNumericValue(computed.err),
      title: "ERR",
      value: formatPercent(computed.err, 2),
      hint: `Eligible posts: ${computed.eligiblePostsCount}`,
    },
    {
      key: "reactions",
      show: hasPositiveValue(computed.reactionsTotal),
      title: "Reactions",
      value: formatNumber(computed.reactionsTotal),
      hint: `Rate: ${formatPercent(computed.reactionRate, 2)}`,
    },
    {
      key: "forwards",
      show: hasPositiveValue(computed.forwardsTotal),
      title: "Forwards",
      value: formatNumber(computed.forwardsTotal),
      hint: `Rate: ${formatPercent(computed.forwardRate, 2)}`,
    },
    {
      key: "joined",
      show: hasPositiveValue(computed.joinedFromLinks),
      title: "Joined From Links",
      value: formatNumber(computed.joinedFromLinks),
      hint: "Invite-link usage",
    },
    {
      key: "cpa",
      show: hasNumericValue(computed.cpa),
      title: "Campaign CPA",
      value: formatNumber(computed.cpa, 2),
      hint: "Spend / joined from links",
    },
    {
      key: "comments",
      show: hasPositiveValue(computed.commentsTotal),
      title: "Comments",
      value: formatNumber(computed.commentsTotal),
      hint: "Post comments",
    },
    {
      key: "inviteLinks",
      show: inviteLinks.length > 0,
      title: "Invite Links",
      value: formatNumber(inviteLinks.length),
      hint: "Imported invite links",
    },
    {
      key: "campaigns",
      show: campaigns.length > 0,
      title: "Campaigns",
      value: formatNumber(campaigns.length),
      hint: "Attributed campaign rows",
    },
  ].filter((card) => card.show);

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
        const costInPrimary = hasNumericValue(campaign.priceInPrimaryCurrency)
          ? toNumber(campaign.priceInPrimaryCurrency)
          : null;
        const kpiCost = costInPrimary != null
          ? costInPrimary
          : cost;
        return {
          ...campaign,
          joined,
          cost,
          costInPrimary,
          cpa: joined > 0 ? cost / joined : null,
          cpaForKpi: joined > 0 ? kpiCost / joined : null,
        };
      }),
    [campaigns],
  );
  const hasAudienceChart = audienceSnapshots.some(
    (snapshot) =>
      snapshot.subscribersCount != null ||
      snapshot.activeSubscribersEstimate != null,
  );

  return (
    <AppShell>
      <PageHeader
        title={data?.channel?.title || "Channel Analytics"}
        subtitle={channelSubtitle(data?.channel)}
        action={
          <div className="flex flex-wrap items-center justify-end gap-2">
            <KpiSettingsControl
              settings={settings}
              setSettings={setSettings}
              isSaving={settingsMutation.isPending}
              onSave={() => settingsMutation.mutate()}
            />
            <SeedSettingsControl
              settings={settings}
              setSettings={setSettings}
              isSaving={settingsMutation.isPending}
              onSave={() => settingsMutation.mutate()}
            />
            <TimePostsControl
              settings={settings}
              setSettings={setSettings}
              isSaving={settingsMutation.isPending}
              onSave={() => settingsMutation.mutate()}
            />
            <InfoTooltip
              tip={
                latestSnapshot
                  ? `Last sync: ${new Date(latestSnapshot.syncedAt).toLocaleString()}`
                  : "No Telegram snapshot yet."
              }
            >
              <button
                type="button"
                onClick={() => setSyncStatusOpen(true)}
                className="flex h-11 w-11 items-center justify-center rounded-lg border border-slate-600/80 bg-slate-900 text-slate-200 transition hover:border-blue-400/70 hover:bg-slate-800 hover:text-white"
              >
                <RefreshCw size={18} />
              </button>
            </InfoTooltip>
            <Button
              variant="primary"
              disabled={syncMutation.isPending}
              onClick={() => syncMutation.mutate()}
              className="inline-flex h-11 items-center justify-center gap-2 border border-blue-500/40 bg-blue-600/95 px-5 text-white shadow-[0_10px_24px_rgba(37,99,235,0.18)] transition hover:border-blue-400 hover:bg-blue-500"
            >
              <RefreshCw
                size={16}
                className={syncMutation.isPending ? "animate-spin" : ""}
              />
              {syncMutation.isPending ? "Syncing..." : "Sync"}
            </Button>
            <InfoTooltip tip="Sync uses the best connected source available for each data type and records attribution.">
              <button
                type="button"
                onClick={() => setSyncScopeOpen(true)}
                className="flex h-11 w-11 items-center justify-center rounded-lg border border-slate-600/80 bg-slate-900 text-slate-200 transition hover:border-blue-400/70 hover:bg-slate-800 hover:text-white"
              >
                <CircleHelp size={18} />
              </button>
            </InfoTooltip>
          </div>
        }
      />
      <div className="mt-3">
        <ChannelAccessBadge accessMode={data?.channel?.accessMode} />
      </div>
      {isLoading ? <LoadingState /> : null}
      <section className="mt-5 grid gap-4 xl:grid-cols-[minmax(320px,0.85fr)_minmax(0,1.4fr)]">
        <div className="min-w-0 space-y-3">
          {data?.channel ? (
            <ChannelPreview
              channel={{
                ...data.channel,
                currentSubscribersCount: computed.subscribers,
              }}
              className="!mb-0"
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
        </div>
        <ChannelMetricsDeck metrics={statCards} />
      </section>

      <section className="mt-4 grid grid-cols-[repeat(auto-fit,minmax(min(460px,100%),1fr))] gap-4">
        <AudienceOverview audience={audience} />
        <FinancialOverview
          summary={financialSummary}
          currencySettings={currencySettings}
          rates={rates}
          hasKpi={hasKpiSettings(activeChannel)}
          settings={settings}
        />
      </section>

      {hasAudienceChart || mtprotoGraphs.length ? (
        <section className="mt-6">
          <h3 className="mb-3 text-lg font-semibold">Charts</h3>
          <div className="grid grid-cols-[repeat(auto-fit,minmax(min(420px,100%),1fr))] gap-4">
            {hasAudienceChart ? (
              <AudienceSnapshotsPanel snapshots={audienceSnapshots} />
            ) : null}
            {mtprotoGraphs.map(({ key, title, chart }) => (
              <SimplePanel key={key} title={title}>
                <MtprotoGraphChart chart={chart} />
              </SimplePanel>
            ))}
          </div>
        </section>
      ) : null}

      {campaignRows.length ? (
        <section className="mt-6">
          <SectionToggle
            title="Campaign Attribution"
            open={openSections.campaigns}
            onToggle={() =>
              setOpenSections((prev) => ({ ...prev, campaigns: !prev.campaigns }))
            }
          />
          {openSections.campaigns ? (
            <CampaignsTable
              campaigns={campaignRows}
              settings={settings}
              currencySettings={currencySettings}
              rates={rates}
            />
          ) : null}
        </section>
      ) : null}

      {isPostsLoading || postsError || visiblePosts.length ? (
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
              {!isPostsLoading && !postsError && visiblePosts.length ? (
                <PostsTable
                  channelId={params.id}
                  posts={visiblePosts}
                  subscribers={computed.subscribers}
                  savingPostId={
                    manualMetricsMutation.isPending
                      ? manualMetricsMutation.variables?.postId
                      : null
                  }
                  onSaveManualMetrics={(postId, payload) =>
                    manualMetricsMutation.mutate({ postId, payload })
                  }
                />
              ) : null}
            </>
          ) : null}
        </section>
      ) : null}

      {topInviteLinks.length ? (
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
      ) : null}

      <SyncStatusModal
        open={syncStatusOpen}
        onClose={() => setSyncStatusOpen(false)}
        latestSnapshot={latestSnapshot}
        mtprotoStats={mtprotoStats}
      />
      <SyncScopeModal
        open={syncScopeOpen}
        onClose={() => setSyncScopeOpen(false)}
        sources={analyticsSources?.sources || []}
        dataAttribution={analyticsSources?.dataAttribution || []}
        isSyncing={syncMutation.isPending}
        lastSyncResult={lastSyncResult}
        onSelectSource={setSelectedSourceAccess}
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
    <section className="flex flex-wrap items-end gap-2 rounded-lg border border-slate-700 bg-slate-950/20 p-3">
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
        <div className="w-72">
          <FormField label="Period">
            <DateRangeInput
              from={customFrom}
              to={customTo}
              onChange={(range) => {
                setCustomFrom(range.from);
                setCustomTo(range.to);
              }}
            />
          </FormField>
        </div>
      ) : null}
    </section>
  );
}

function ChannelMetricsDeck({
  metrics,
}: {
  metrics: Array<{
    key: string;
    title: string;
    value: string;
    hint?: string;
  }>;
}) {
  if (!metrics.length) return null;
  const primaryKeys = new Set(["subscribers", "err", "avgViews", "cpa"]);
  const primaryMetrics = metrics.filter((metric) => primaryKeys.has(metric.key));
  const secondaryMetrics = metrics.filter((metric) => !primaryKeys.has(metric.key));
  const visiblePrimary = primaryMetrics.length ? primaryMetrics : metrics.slice(0, 4);
  const visibleSecondary = primaryMetrics.length
    ? secondaryMetrics
    : metrics.slice(4);
  return (
    <div className="rounded-lg border border-slate-700 bg-slate-950/30 p-3">
      <div className="mb-3 flex items-center justify-between gap-3">
        <h3 className="text-sm font-semibold uppercase text-slate-400">
          Channel pulse
        </h3>
        <span className="rounded border border-slate-700 px-2 py-0.5 text-xs text-slate-400">
          {metrics.length} metrics
        </span>
      </div>
      <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">
        {visiblePrimary.map((metric) => (
          <div
            key={metric.key}
            className="min-h-[82px] rounded-lg border border-slate-800 bg-slate-900/40 p-3"
          >
            <p className="truncate text-xs text-slate-400">{metric.title}</p>
            <p className="mt-1.5 truncate text-xl font-semibold text-white">
              {metric.value}
            </p>
            {metric.hint ? (
              <p className="mt-1 truncate text-xs text-slate-500">{metric.hint}</p>
            ) : null}
          </div>
        ))}
      </div>
      {visibleSecondary.length ? (
        <div className="mt-2 grid grid-cols-[repeat(auto-fit,minmax(min(140px,100%),1fr))] gap-2">
          {visibleSecondary.map((metric) => (
            <CompactMetric key={metric.key} metric={metric} />
          ))}
        </div>
      ) : null}
    </div>
  );
}

function CompactMetric({
  metric,
}: {
  metric: { title: string; value: string; hint?: string };
}) {
  return (
    <div className="rounded-lg border border-slate-800 bg-slate-900/25 px-2.5 py-1.5">
      <div className="flex items-baseline justify-between gap-2">
        <p className="truncate text-xs text-slate-400">{metric.title}</p>
        <p className="shrink-0 text-sm font-semibold text-slate-100">
          {metric.value}
        </p>
      </div>
      {metric.hint ? (
        <p className="mt-0.5 truncate text-[11px] text-slate-500">
          {metric.hint}
        </p>
      ) : null}
    </div>
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
      <h3 className="mb-2.5 text-base font-semibold">{title}</h3>
      {children}
    </div>
  );
}

function OverviewGrid({ children }: { children: ReactNode }) {
  return (
    <div className="grid grid-cols-[repeat(auto-fit,minmax(min(136px,100%),1fr))] gap-2">
      {children}
    </div>
  );
}

function AudienceOverview({ audience }: { audience: any }) {
  return (
    <SimplePanel title="Audience overview">
      {audience?.dataQualityWarning ? (
        <div className="mb-2 rounded-lg border border-amber-700/70 bg-amber-950/30 px-3 py-2 text-xs font-medium text-amber-100">
          {audience.dataQualityWarning}
        </div>
      ) : null}
      <OverviewGrid>
        <SnapshotItem
          label="Subscribers"
          value={formatNullableNumber(audience?.subscribersCount)}
        />
        <SnapshotItem
          label="Known fake subscribers"
          value={formatNumber(audience?.knownFakeSubscribersCount)}
        />
        <SnapshotItem
          label="Effective subscribers"
          value={formatNullableNumber(audience?.effectiveSubscribersCount)}
        />
        <SnapshotItem
          label="Own / seed subscribers"
          value={formatNumber(audience?.seedSubscribersCount)}
        />
        <SnapshotItem
          label="Own views per post"
          value={formatNumber(audience?.ownViewsPerPost)}
        />
        <SnapshotItem
          label="Own reactions per post"
          value={formatNumber(audience?.ownReactionsPerPost)}
        />
        <SnapshotItem
          label="Active subscribers"
          value={formatNullableNumber(audience?.activeSubscribersEstimate)}
        />
        <SnapshotItem
          label="Raw active estimate"
          value={formatNullableNumber(audience?.rawActiveSubscribersEstimate)}
        />
        <SnapshotItem
          label="Capped active estimate"
          value={formatNullableNumber(audience?.cappedActiveSubscribersEstimate)}
        />
        <SnapshotItem
          label="Paid active estimate"
          value={formatNullableNumber(audience?.paidActiveSubscribersEstimate)}
        />
        <SnapshotItem label="View rate" value={formatPercent(audience?.viewRate)} />
        <SnapshotItem
          label="Raw view rate"
          value={formatPercent(audience?.rawViewRate)}
        />
        <SnapshotItem
          label="Capped view rate"
          value={formatPercent(audience?.cappedViewRate)}
        />
        <SnapshotItem
          label="Avg adjusted views"
          value={formatNullableNumber(audience?.avgViewsAdjusted, 1)}
        />
        <SnapshotItem
          label="Avg adjusted reactions"
          value={formatNullableNumber(audience?.avgReactionsAdjusted, 1)}
        />
        <div className="min-h-[58px] rounded-lg border border-slate-800 bg-slate-900/25 px-2.5 py-2">
          <p className="text-xs text-slate-400">Data quality</p>
          <span
            className={`mt-1 inline-flex rounded border px-2 py-0.5 text-xs ${dataQualityBadgeClass(audience?.dataQuality)}`}
          >
            {audience?.dataQuality || "-"}
          </span>
          {audience?.subscriberBaseQuality ? (
            <p className="mt-1 truncate text-xs text-slate-400">
              Subscriber base: {audience.subscriberBaseQuality}
            </p>
          ) : null}
        </div>
        <SnapshotItem
          label="Posts window"
          value={`${formatNumber(audience?.postsUsed)} / ${formatNumber(audience?.postsWindow)}`}
        />
      </OverviewGrid>
    </SimplePanel>
  );
}

function FinancialOverview({
  summary,
  currencySettings,
  rates,
  hasKpi,
  settings,
}: {
  summary: any;
  currencySettings: any;
  rates: any[] | undefined;
  hasKpi: boolean;
  settings: SettingsState;
}) {
  const primaryCurrency = currencySettings?.primaryCurrency || "USD";
  const hasPaidLaunches =
    toNumber(summary?.campaignsCount) > 0 || toNumber(summary?.totalAdSpend) > 0;
  if (!hasKpi && !hasPaidLaunches) return null;
  const moneyValue = (value: unknown) =>
    value == null ? (
      "-"
    ) : (
      <MoneyStack
        amount={value as number}
        currency={primaryCurrency}
        settings={currencySettings}
        rates={rates}
        mainClassName="font-semibold text-white"
        subClassName="text-xs text-slate-400"
      />
    );
  const metrics = [
    {
      key: "spend",
      show: hasPositiveValue(summary?.totalAdSpend),
      node: <SnapshotItem label="Total ad spend" value={moneyValue(summary?.totalAdSpend)} />,
    },
    {
      key: "campaigns",
      show: hasPositiveValue(summary?.campaignsCount),
      node: <SnapshotItem label="Campaigns count" value={formatNumber(summary?.campaignsCount)} />,
    },
    {
      key: "joined",
      show: hasPositiveValue(summary?.totalJoinedSubscribers),
      node: <SnapshotItem label="Total joined subscribers" value={formatNumber(summary?.totalJoinedSubscribers)} />,
    },
    {
      key: "active",
      show: hasPositiveValue(summary?.paidActiveSubscribersEstimate),
      node: <SnapshotItem label="Active subscribers from ads" value={formatNullableNumber(summary?.paidActiveSubscribersEstimate)} />,
    },
    {
      key: "avgCpa",
      show: hasNumericValue(summary?.avgCpa),
      node: <SnapshotItem label="Avg CPA" value={moneyValue(summary?.avgCpa)} />,
    },
    {
      key: "activeCpa",
      show: hasNumericValue(summary?.activeCpa),
      node: <SnapshotItem label="Active CPA" value={moneyValue(summary?.activeCpa)} />,
    },
    {
      key: "activeRate",
      show: hasNumericValue(summary?.avgActiveRate),
      node: <SnapshotItem label="Avg active rate" value={formatPercent(summary?.avgActiveRate)} />,
    },
    {
      key: "retention",
      show: hasNumericValue(summary?.avgRetention7d),
      node: <SnapshotItem label="Avg retention 7d" value={formatPercent(summary?.avgRetention7d)} />,
    },
  ].filter((metric) => metric.show);
  const showKpiStatus = hasKpi && summary?.kpiStatus && summary.kpiStatus !== "unknown";
  return (
    <SimplePanel title="KPI / Financial overview">
      {hasKpi && !hasPaidLaunches ? (
        <div className="mb-2 rounded-lg border border-slate-800 bg-slate-900/30 px-3 py-2 text-xs text-slate-300">
          No paid launches yet.
        </div>
      ) : null}
      {metrics.length || showKpiStatus ? (
        <div className="space-y-2">
          <OverviewGrid>
            {metrics.map((metric) => (
              <Fragment key={metric.key}>{metric.node}</Fragment>
            ))}
            {showKpiStatus ? (
              <div className="min-h-[58px] rounded-lg border border-slate-800 bg-slate-900/25 px-2.5 py-2">
                <p className="text-xs text-slate-400">KPI status</p>
                <span
                  className={`mt-1 inline-flex rounded border px-2 py-0.5 text-xs ${kpiBadgeClass(summary?.kpiStatus)}`}
                >
                  {summary?.kpiLabel || "-"}
                </span>
              </div>
            ) : null}
          </OverviewGrid>
          {hasKpi ? <KpiTargetsInline settings={settings} /> : null}
        </div>
      ) : null}
    </SimplePanel>
  );
}

type SettingsState = {
  seedSubscribersCount: string;
  activeSubscribersWindow: string;
  knownFakeSubscribersCount: string;
  ownViewsPerPost: string;
  ownReactionsPerPost: string;
  targetCpaFrom: string;
  targetCpa: string;
  acceptableCpaFrom: string;
  acceptableCpa: string;
  stopCpaFrom: string;
  stopCpa: string;
  timePosts: Array<{
    id: string;
    title: string;
    time: string;
    iconId?: string | null;
    icon?: Icon | null;
  }>;
};

function KpiSettingsControl({
  settings,
  setSettings,
  isSaving,
  onSave,
}: {
  settings: SettingsState;
  setSettings: (settings: SettingsState) => void;
  isSaving: boolean;
  onSave: () => void;
}) {
  const [open, setOpen] = useState(false);
  const setValue = (key: keyof SettingsState, value: string) =>
    setSettings({ ...settings, [key]: value });
  const hasKpi = Boolean(
    settings.targetCpaFrom ||
      settings.targetCpa ||
      settings.acceptableCpaFrom ||
      settings.acceptableCpa ||
      settings.stopCpaFrom ||
      settings.stopCpa,
  );
  const save = () => {
    onSave();
    setOpen(false);
  };

  return (
    <>
      <Button
        type="button"
        variant={hasKpi ? "secondary" : "primary"}
        onClick={() => setOpen(true)}
        className={
          hasKpi
            ? "inline-flex h-11 items-center justify-center gap-2 border border-slate-600/80 bg-slate-900 px-5 text-slate-100 transition hover:border-blue-400/70 hover:bg-slate-800 hover:text-white"
            : "inline-flex h-11 items-center justify-center gap-2 border border-blue-500/40 bg-blue-600/95 px-5 text-white shadow-[0_10px_24px_rgba(37,99,235,0.18)] transition hover:border-blue-400 hover:bg-blue-500"
        }
      >
        <Pencil size={15} />
        {hasKpi ? "Edit KPI" : "Set KPI"}
      </Button>
      <Modal open={open} onClose={() => setOpen(false)} title="KPI settings">
        <div className="space-y-4">
          <div className="space-y-3">
            <KpiRangeFields
              label="Target CPA"
              fromValue={settings.targetCpaFrom}
              toValue={settings.targetCpa}
              onFromChange={(value) => setValue("targetCpaFrom", value)}
              onToChange={(value) => setValue("targetCpa", value)}
            />
            <KpiRangeFields
              label="Acceptable CPA"
              fromValue={settings.acceptableCpaFrom}
              toValue={settings.acceptableCpa}
              onFromChange={(value) => setValue("acceptableCpaFrom", value)}
              onToChange={(value) => setValue("acceptableCpa", value)}
            />
            <KpiRangeFields
              label="Stop CPA"
              fromValue={settings.stopCpaFrom}
              onFromChange={(value) => setValue("stopCpaFrom", value)}
              openEnded
            />
          </div>
          <div className="flex justify-end gap-2">
            <Button
              type="button"
              variant="secondary"
              onClick={() => setOpen(false)}
            >
              Cancel
            </Button>
            <Button type="button" disabled={isSaving} onClick={save}>
              {isSaving ? "Saving..." : "Save KPI"}
            </Button>
          </div>
        </div>
      </Modal>
    </>
  );
}

function KpiRangeFields({
  label,
  fromValue,
  toValue,
  onFromChange,
  onToChange,
  openEnded = false,
}: {
  label: string;
  fromValue: string;
  toValue?: string;
  onFromChange: (value: string) => void;
  onToChange?: (value: string) => void;
  openEnded?: boolean;
}) {
  return (
    <div className="rounded-lg border border-slate-800 bg-slate-900/20 p-3">
      <p className="mb-2 text-sm font-semibold text-slate-200">{label} ($)</p>
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        <FormField label={openEnded ? "From ($), no upper limit" : "From ($)"}>
          <Input
            type="number"
            min={0}
            step="0.01"
            value={fromValue}
            onChange={(event) => onFromChange(event.target.value)}
          />
        </FormField>
        {openEnded ? (
          <div className="flex items-end">
            <p className="rounded-md border border-rose-900/60 bg-rose-950/20 px-3 py-2 text-sm text-rose-200">
              This value and higher
            </p>
          </div>
        ) : (
          <FormField label="To ($)">
            <Input
              type="number"
              min={0}
              step="0.01"
              value={toValue}
              onChange={(event) => onToChange?.(event.target.value)}
            />
          </FormField>
        )}
      </div>
    </div>
  );
}

function SeedSettingsControl({
  settings,
  setSettings,
  isSaving,
  onSave,
}: {
  settings: SettingsState;
  setSettings: (settings: SettingsState) => void;
  isSaving: boolean;
  onSave: () => void;
}) {
  const [open, setOpen] = useState(false);
  const setValue = (key: keyof SettingsState, value: string) =>
    setSettings({ ...settings, [key]: value });
  const hasSeed = Boolean(
    toNumber(settings.seedSubscribersCount) ||
      toNumber(settings.ownViewsPerPost) ||
      toNumber(settings.ownReactionsPerPost) ||
      toNumber(settings.knownFakeSubscribersCount),
  );
  const save = () => {
    onSave();
    setOpen(false);
  };

  return (
    <>
      <Button
        type="button"
        variant={hasSeed ? "secondary" : "primary"}
        onClick={() => setOpen(true)}
        className={
          hasSeed
            ? "inline-flex h-11 items-center justify-center gap-2 border border-slate-600/80 bg-slate-900 px-5 text-slate-100 transition hover:border-blue-400/70 hover:bg-slate-800 hover:text-white"
            : "inline-flex h-11 items-center justify-center gap-2 border border-blue-500/40 bg-blue-600/95 px-5 text-white shadow-[0_10px_24px_rgba(37,99,235,0.18)] transition hover:border-blue-400 hover:bg-blue-500"
        }
      >
        <Pencil size={15} />
        {hasSeed ? "Edit seed" : "Set seed"}
      </Button>
      <Modal open={open} onClose={() => setOpen(false)} title="Seed settings">
        <div className="space-y-4">
          <div className="rounded-lg border border-slate-800 bg-slate-900/30 p-3 text-sm text-slate-300">
            These values are subtracted from subscribers and post metrics before
            analytics are calculated. Per-post manual corrections still add on
            top for unusual posts.
          </div>
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            <FormField label="Own / seed subscribers">
              <Input
                type="number"
                min={0}
                value={settings.seedSubscribersCount}
                onChange={(event) =>
                  setValue("seedSubscribersCount", event.target.value)
                }
              />
            </FormField>
            <FormField label="Known fake subscribers">
              <Input
                type="number"
                min={0}
                value={settings.knownFakeSubscribersCount}
                onChange={(event) =>
                  setValue("knownFakeSubscribersCount", event.target.value)
                }
              />
            </FormField>
            <FormField label="Own views per post">
              <Input
                type="number"
                min={0}
                value={settings.ownViewsPerPost}
                onChange={(event) =>
                  setValue("ownViewsPerPost", event.target.value)
                }
              />
            </FormField>
            <FormField label="Own reactions per post">
              <Input
                type="number"
                min={0}
                value={settings.ownReactionsPerPost}
                onChange={(event) =>
                  setValue("ownReactionsPerPost", event.target.value)
                }
              />
            </FormField>
            <FormField label="Active posts window">
              <Input
                type="number"
                min={1}
                value={settings.activeSubscribersWindow}
                onChange={(event) =>
                  setValue("activeSubscribersWindow", event.target.value)
                }
              />
            </FormField>
          </div>
          <div className="flex justify-end gap-2">
            <Button
              type="button"
              variant="secondary"
              onClick={() => setOpen(false)}
            >
              Cancel
            </Button>
            <Button type="button" disabled={isSaving} onClick={save}>
              {isSaving ? "Saving..." : "Save seed"}
            </Button>
          </div>
        </div>
      </Modal>
    </>
  );
}

function TimePostsControl({
  settings,
  setSettings,
  isSaving,
  onSave,
}: {
  settings: SettingsState;
  setSettings: (settings: SettingsState) => void;
  isSaving: boolean;
  onSave: () => void;
}) {
  const [open, setOpen] = useState(false);
  const hasTimePosts = settings.timePosts.length > 0;

  const updateTimePost = (
    index: number,
    patch: Partial<SettingsState["timePosts"][number]>,
  ) => {
    setSettings({
      ...settings,
      timePosts: settings.timePosts.map((item, itemIndex) =>
        itemIndex === index ? { ...item, ...patch } : item,
      ),
    });
  };

  const addTimePost = () => {
    setSettings({
      ...settings,
      timePosts: [
        ...settings.timePosts,
        {
          id: `draft-${Date.now()}-${settings.timePosts.length}`,
          title: "",
          time: "17:00",
          iconId: null,
          icon: null,
        },
      ],
    });
  };

  const removeTimePost = (index: number) => {
    setSettings({
      ...settings,
      timePosts: settings.timePosts.filter((_, itemIndex) => itemIndex !== index),
    });
  };

  const save = () => {
    onSave();
    setOpen(false);
  };

  return (
    <>
      <Button
        type="button"
        variant={hasTimePosts ? "secondary" : "primary"}
        onClick={() => setOpen(true)}
        className={
          hasTimePosts
            ? "inline-flex h-11 items-center justify-center gap-2 border border-slate-600/80 bg-slate-900 px-5 text-slate-100 transition hover:border-blue-400/70 hover:bg-slate-800 hover:text-white"
            : "inline-flex h-11 items-center justify-center gap-2 border border-blue-500/40 bg-blue-600/95 px-5 text-white shadow-[0_10px_24px_rgba(37,99,235,0.18)] transition hover:border-blue-400 hover:bg-blue-500"
        }
      >
        <Clock3 size={15} />
        {hasTimePosts ? "Edit time posts" : "Set time posts"}
      </Button>
      <Modal open={open} onClose={() => setOpen(false)} title="Time posts">
        <div className="space-y-4">
          <div className="rounded-lg border border-slate-800 bg-slate-900/30 p-3 text-sm text-slate-300">
            Save reusable channel publishing slots. Later, in schedule mode, you
            can insert these times with one tap.
          </div>
          <div className="space-y-3">
            {settings.timePosts.map((item, index) => (
              <div
                key={item.id}
                className="rounded-lg border border-slate-800 bg-slate-900/20 p-3"
              >
                <div className="grid gap-3 md:grid-cols-[auto_minmax(0,1fr)_140px_auto]">
                  <div className="flex items-end">
                    <IconPicker
                      compact
                      iconId={item.iconId || null}
                      onChange={(iconId) =>
                        updateTimePost(index, { iconId: iconId || null, icon: null })
                      }
                      buttonLabel="Pick icon"
                    />
                  </div>
                  <FormField label="Title">
                    <Input
                      value={item.title}
                      onChange={(event) =>
                        updateTimePost(index, { title: event.target.value })
                      }
                      placeholder="Optional label"
                    />
                  </FormField>
                  <FormField label="Time">
                    <TimeInput
                      value={item.time}
                      onChange={(event) =>
                        updateTimePost(index, { time: event.target.value })
                      }
                    />
                  </FormField>
                  <div className="flex items-end">
                    <Button
                      type="button"
                      variant="secondary"
                      className="h-10 px-3"
                      onClick={() => removeTimePost(index)}
                    >
                      <Trash2 size={15} />
                    </Button>
                  </div>
                </div>
              </div>
            ))}
            {!settings.timePosts.length ? (
              <div className="rounded-lg border border-dashed border-slate-700 p-4 text-sm text-slate-400">
                No time posts yet. Add your first reusable channel slot.
              </div>
            ) : null}
          </div>
          <div className="flex items-center justify-between gap-3">
            <Button
              type="button"
              variant="secondary"
              onClick={addTimePost}
              className="inline-flex items-center gap-2 whitespace-nowrap"
            >
              <Clock3 size={15} />
              Add time post
            </Button>
            <div className="flex justify-end gap-2">
              <Button
                type="button"
                variant="secondary"
                onClick={() => setOpen(false)}
              >
                Cancel
              </Button>
              <Button
                type="button"
                disabled={
                  isSaving ||
                  settings.timePosts.some(
                    (item) => !/^([01]\d|2[0-3]):[0-5]\d$/.test(item.time),
                  )
                }
                onClick={save}
              >
                {isSaving ? "Saving..." : "Save time posts"}
              </Button>
            </div>
          </div>
        </div>
      </Modal>
    </>
  );
}

function KpiTargetsInline({ settings }: { settings: SettingsState }) {
  return (
    <div className="grid grid-cols-[repeat(auto-fit,minmax(min(150px,100%),1fr))] gap-2">
      <KpiTarget
        tone="good"
        label="Target CPA"
        from={settings.targetCpaFrom}
        to={settings.targetCpa}
        compact
      />
      <KpiTarget
        tone="warn"
        label="Acceptable CPA"
        from={settings.acceptableCpaFrom}
        to={settings.acceptableCpa}
        compact
      />
      <KpiTarget
        tone="bad"
        label="Stop CPA"
        from={settings.stopCpaFrom}
        openEnded
        compact
      />
    </div>
  );
}

function KpiTarget({
  tone,
  label,
  from,
  to,
  openEnded = false,
  compact = false,
}: {
  tone: "good" | "warn" | "bad";
  label: string;
  from?: string;
  to?: string;
  openEnded?: boolean;
  compact?: boolean;
}) {
  const toneClass = {
    good: "border-emerald-800/80 bg-emerald-950/30 text-emerald-200",
    warn: "border-yellow-800/80 bg-yellow-950/30 text-yellow-200",
    bad: "border-rose-800/80 bg-rose-950/30 text-rose-200",
  }[tone];
  const display = formatKpiRange(from, to, openEnded);
  return (
    <div className={`rounded-lg border ${compact ? "px-2.5 py-2" : "p-3"} ${toneClass}`}>
      <p className="text-xs opacity-80">{label}</p>
      <p className={compact ? "mt-1 text-sm font-semibold" : "mt-1 text-lg font-semibold"}>
        {display}
      </p>
    </div>
  );
}

function formatKpiRange(from?: string, to?: string, openEnded = false) {
  const fromValue = from ? `$ ${formatNumber(from, 2)}` : "";
  const toValue = to ? `$ ${formatNumber(to, 2)}` : "";
  if (openEnded) return fromValue ? `${fromValue}+` : "-";
  if (fromValue && toValue) return `${fromValue} - ${toValue}`;
  if (fromValue) return `from ${fromValue}`;
  if (toValue) return `to ${toValue}`;
  return "-";
}

function AudienceSnapshotsPanel({
  snapshots,
}: {
  snapshots: TelegramChannelAudienceSnapshot[];
}) {
  const chartRows = snapshots
    .map((snapshot) => ({
      timestamp: toChartTimestamp(snapshot.collectedAt),
      subscribersCount: snapshot.subscribersCount ?? null,
      activeSubscribersEstimate: snapshot.activeSubscribersEstimate ?? null,
    }))
    .filter(
      (row) =>
        row.timestamp != null &&
        (row.subscribersCount != null || row.activeSubscribersEstimate != null),
    );
  if (!chartRows.length) return null;
  return (
    <SimplePanel title="Audience chart">
      <div className="h-64 rounded-lg bg-slate-900/40 p-2">
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart
            data={chartRows}
            margin={{ top: 8, right: 12, left: -12, bottom: 0 }}
          >
            <CartesianGrid stroke="#1e293b" strokeDasharray="4 4" />
            <XAxis
              dataKey="timestamp"
              type="number"
              domain={["dataMin", "dataMax"]}
              tickFormatter={(value) => formatLocalDate(value)}
              tick={{ fill: "#94a3b8", fontSize: 12 }}
              minTickGap={24}
            />
            <YAxis tick={{ fill: "#94a3b8", fontSize: 12 }} width={48} />
            <Tooltip
              labelFormatter={(value) => formatLocalDateTime(value)}
              contentStyle={{
                background: "#020617",
                border: "1px solid #334155",
                borderRadius: 10,
              }}
              labelStyle={{ color: "#e2e8f0" }}
            />
            <Line
              type="linear"
              dataKey="subscribersCount"
              stroke="#38bdf8"
              strokeWidth={2}
              dot={false}
              name="Subscribers"
            />
            <Line
              type="linear"
              dataKey="activeSubscribersEstimate"
              stroke="#22c55e"
              strokeWidth={2}
              dot={false}
              name="Active estimate"
            />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
    </SimplePanel>
  );
}

function kpiBadgeClass(status?: string) {
  if (status === "good") return "border-emerald-700 text-emerald-200";
  if (status === "acceptable") return "border-yellow-700 text-yellow-200";
  if (status === "bad") return "border-rose-700 text-rose-200";
  return "border-slate-700 text-slate-300";
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

function SyncStatusModal({
  open,
  onClose,
  latestSnapshot,
  mtprotoStats,
}: {
  open: boolean;
  onClose: () => void;
  latestSnapshot: any;
  mtprotoStats: any;
}) {
  return (
    <Modal open={open} onClose={onClose} title="Sync status">
      {latestSnapshot ? (
        <div className="grid grid-cols-1 gap-3 text-sm md:grid-cols-2">
          <SnapshotItem
            label="Latest snapshot"
            value={new Date(latestSnapshot.syncedAt).toLocaleString()}
          />
          <SnapshotItem label="Status" value={mtprotoStats?.status || "unknown"} />
          <SnapshotItem
            label="Followers"
            value={formatNullableNumber(mtprotoStats?.followers?.current)}
          />
          <SnapshotItem
            label="Views / Post"
            value={formatNullableNumber(mtprotoStats?.views_per_post?.current, 1)}
          />
          <SnapshotItem
            label="Shares / Post"
            value={formatNullableNumber(mtprotoStats?.shares_per_post?.current, 1)}
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
            value={formatTelegramPercent(mtprotoStats?.enabled_notifications)}
          />
          <SnapshotItem
            label="Telegram window"
            value={formatStatsPeriod(mtprotoStats?.period, mtprotoStats?.graphs)}
          />
        </div>
      ) : (
        <EmptyState text="No channel snapshot yet." />
      )}
    </Modal>
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
      <TooltipBubble
        side="top"
        align="left"
        className="hidden w-64 border-slate-700 bg-slate-950 px-2 py-1.5 text-xs leading-relaxed text-slate-100 group-hover:block"
      >
        {tip}
      </TooltipBubble>
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
    <div className="table-scroll w-full">
      <table className="w-max min-w-full text-sm">
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
  channelId,
  posts,
  subscribers,
  savingPostId,
  onSaveManualMetrics,
}: {
  channelId: string;
  posts: any[];
  subscribers: number;
  savingPostId?: string | null;
  onSaveManualMetrics: (
    postId: string,
    payload: {
      manualOwnViews?: number;
      manualOwnReactions?: number;
      excludeFromAnalytics?: boolean;
    },
  ) => void;
}) {
  const wrapperRef = useRef<HTMLDivElement | null>(null);
  const headerScrollRef = useRef<HTMLDivElement | null>(null);
  const floatingHeaderScrollRef = useRef<HTMLDivElement | null>(null);
  const bodyScrollRef = useRef<HTMLDivElement | null>(null);
  const headerContentRef = useRef<HTMLDivElement | null>(null);
  const [sortState, setSortState] = useState<{
    key:
      | "postDate"
      | "viewsCount"
      | "forwardsCount"
      | "reactionsCount"
      | "commentsCount"
      | "err"
      | "reactionRate"
      | null;
    direction: "asc" | "desc";
  }>({
    key: null,
    direction: "desc",
  });
  const columns = [
    { label: "Date", className: "text-left", sortKey: "postDate" as const },
    { label: "Text", className: "text-left" },
    { label: "Views", className: "text-right", sortKey: "viewsCount" as const },
    { label: "Forwards", className: "text-right", sortKey: "forwardsCount" as const },
    { label: "Reactions", className: "text-right", sortKey: "reactionsCount" as const },
    { label: "Comments", className: "text-right", sortKey: "commentsCount" as const },
    { label: "ERR", className: "text-right", sortKey: "err" as const },
    { label: "Reaction Rate", className: "text-right", sortKey: "reactionRate" as const },
    { label: "Manual correction", className: "text-right" },
  ];
  const gridTemplateColumns =
    "7rem minmax(18rem,1fr) 6rem 6rem 7rem 7rem 7rem 8rem 13rem";
  const [floatingHeader, setFloatingHeader] = useState({
    visible: false,
    left: 0,
    width: 0,
    height: 0,
  });
  const syncHeaderScroll = () => {
    if (!bodyScrollRef.current) return;
    const scrollLeft = bodyScrollRef.current.scrollLeft;
    if (headerScrollRef.current) {
      headerScrollRef.current.scrollLeft = scrollLeft;
    }
    if (floatingHeaderScrollRef.current) {
      floatingHeaderScrollRef.current.scrollLeft = scrollLeft;
    }
  };
  const toggleSort = (
    key: NonNullable<typeof sortState.key>,
  ) => {
    setSortState((prev) => ({
      key,
      direction:
        prev.key === key && prev.direction === "asc" ? "desc" : "asc",
    }));
  };
  const sortedPosts = useMemo(() => {
    if (!sortState.key) return posts;

    const getSortValue = (post: any) => {
      const views = toNumber(post.viewsCount);
      const reactions = toNumber(post.reactionsCount);
      switch (sortState.key) {
        case "postDate":
          return new Date(post.postDate ?? 0).getTime();
        case "viewsCount":
          return views;
        case "forwardsCount":
          return toNumber(post.forwardsCount);
        case "reactionsCount":
          return reactions;
        case "commentsCount":
          return toNumber(post.commentsCount);
        case "err":
          return subscribers > 0 ? (views / subscribers) * 100 : -1;
        case "reactionRate":
          return views > 0 ? (reactions / views) * 100 : -1;
        default:
          return 0;
      }
    };

    return [...posts].sort((a, b) => {
      const aValue = getSortValue(a);
      const bValue = getSortValue(b);
      const result = aValue < bValue ? -1 : aValue > bValue ? 1 : 0;
      return sortState.direction === "asc" ? result : -result;
    });
  }, [posts, sortState, subscribers]);

  useEffect(() => {
    const updateFloatingHeader = () => {
      const wrapper = wrapperRef.current;
      const header = headerContentRef.current;
      if (!wrapper || !header) return;

      const rect = wrapper.getBoundingClientRect();
      const headerHeight = header.getBoundingClientRect().height;
      const shouldShow = rect.top <= 0 && rect.bottom > headerHeight;

      setFloatingHeader((prev) => {
        const next = {
          visible: shouldShow,
          left: rect.left,
          width: rect.width,
          height: headerHeight,
        };
        if (
          prev.visible === next.visible &&
          prev.left === next.left &&
          prev.width === next.width &&
          prev.height === next.height
        ) {
          return prev;
        }
        return next;
      });
    };

    updateFloatingHeader();
    window.addEventListener("scroll", updateFloatingHeader, { passive: true });
    window.addEventListener("resize", updateFloatingHeader);
    return () => {
      window.removeEventListener("scroll", updateFloatingHeader);
      window.removeEventListener("resize", updateFloatingHeader);
    };
  }, []);

  const renderHeaderMarkup = (measure = false) => (
    <div
      ref={measure ? headerContentRef : null}
      className="grid min-w-[1200px] w-full"
      style={{ gridTemplateColumns }}
    >
      {columns.map((column) => (
        <div
          key={column.label}
          className={`whitespace-nowrap px-3 py-2 ${column.className}`}
        >
          {column.sortKey ? (
            <button
              type="button"
              onClick={() => toggleSort(column.sortKey)}
              className={`inline-flex items-center gap-1 ${
                column.className.includes("text-right") ? "ml-auto" : ""
              }`}
            >
              <span>{column.label}</span>
              {sortState.key === column.sortKey ? (
                sortState.direction === "asc" ? (
                  <ChevronUp size={14} />
                ) : (
                  <ChevronDown size={14} />
                )
              ) : (
                <ChevronDown size={14} className="opacity-35" />
              )}
            </button>
          ) : (
            column.label
          )}
        </div>
      ))}
    </div>
  );

  if (!posts.length)
    return <EmptyState text="No post metrics with text yet." />;

  return (
    <div ref={wrapperRef} className="w-full rounded-lg border border-slate-700">
      <div
        ref={headerScrollRef}
        className="overflow-hidden rounded-t-lg border-b border-slate-800 bg-slate-900 text-xs font-semibold text-slate-300"
      >
        {renderHeaderMarkup(true)}
      </div>
      {floatingHeader.visible
        ? createPortal(
            <div
              className="fixed top-0 z-[90]"
              style={{
                left: floatingHeader.left,
                width: floatingHeader.width,
              }}
            >
              <div
                ref={floatingHeaderScrollRef}
                className="overflow-hidden rounded-t-lg border border-slate-700 border-b-slate-800 bg-slate-900 text-xs font-semibold text-slate-300 shadow-[0_8px_24px_rgba(0,0,0,0.45)]"
              >
                {renderHeaderMarkup()}
              </div>
            </div>,
            document.body,
          )
        : null}
      <div
        ref={bodyScrollRef}
        className="overflow-x-auto"
        onScroll={syncHeaderScroll}
      >
        <div className="min-w-[1200px] w-full text-sm">
          {sortedPosts.map((post) => {
            const views = toNumber(post.viewsCount);
            const reactions = toNumber(post.reactionsCount);
            return (
              <div
                key={post.id}
                className="grid border-t border-slate-800"
                style={{ gridTemplateColumns }}
              >
                <div className="whitespace-nowrap px-3 py-2">
                  {formatLocalDate(post.postDate)}
                </div>
                <div className="min-w-0 px-3 py-2">
                  <PostTextTooltip channelId={channelId} post={post} />
                </div>
                <div className="whitespace-nowrap px-3 py-2 text-right">
                  {formatNumber(views)}
                </div>
                <div className="whitespace-nowrap px-3 py-2 text-right">
                  {formatNumber(post.forwardsCount)}
                </div>
                <div className="whitespace-nowrap px-3 py-2 text-right">
                  {formatNumber(reactions)}
                </div>
                <div className="whitespace-nowrap px-3 py-2 text-right">
                  {formatNumber(post.commentsCount)}
                </div>
                <div className="whitespace-nowrap px-3 py-2 text-right">
                  {subscribers > 0
                    ? formatPercent((views / subscribers) * 100, 2)
                    : "-"}
                </div>
                <div className="whitespace-nowrap px-3 py-2 text-right">
                  {views > 0
                    ? formatPercent((reactions / views) * 100, 2)
                    : "-"}
                </div>
                <div className="px-3 py-2">
                  <PostManualMetricsEditor
                    post={post}
                    isSaving={savingPostId === post.id}
                    onSave={(payload) =>
                      onSaveManualMetrics(post.id, payload)
                    }
                  />
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function PostTextTooltip({
  channelId,
  post,
}: {
  channelId: string;
  post: {
    id: string;
    text?: string | null;
    formattedText?: string | null;
    hasMedia?: boolean;
    mediaKind?: string | null;
  };
}) {
  const triggerRef = useRef<HTMLSpanElement | null>(null);
  const tooltipRef = useRef<HTMLSpanElement | null>(null);
  const [open, setOpen] = useState(false);
  const [pinned, setPinned] = useState(false);
  const [position, setPosition] = useState({
    top: 0,
    left: 0,
    ready: false,
  });
  const media = useQuery({
    queryKey: ["telegram-post-media", channelId, post.id],
    queryFn: () => telegramChannelsApi.postMedia(channelId, post.id),
    enabled: open && Boolean(post.hasMedia),
    staleTime: 5 * 60_000,
  });
  const [mediaUrl, setMediaUrl] = useState("");
  useEffect(() => {
    if (!media.data) {
      setMediaUrl("");
      return;
    }
    const url = URL.createObjectURL(media.data);
    setMediaUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [media.data]);
  const text = post.text || "";

  useEffect(() => {
    if (!pinned) return;
    const closeOnOutsideClick = (event: MouseEvent) => {
      const target = event.target as Node;
      if (
        triggerRef.current?.contains(target) ||
        tooltipRef.current?.contains(target)
      ) {
        return;
      }
      setPinned(false);
      setOpen(false);
    };
    document.addEventListener("mousedown", closeOnOutsideClick);
    return () => document.removeEventListener("mousedown", closeOnOutsideClick);
  }, [pinned]);

  useLayoutEffect(() => {
    if (!open || !triggerRef.current || !tooltipRef.current) return;
    const trigger = triggerRef.current.getBoundingClientRect();
    const tooltip = tooltipRef.current.getBoundingClientRect();
    const gap = 8;
    const padding = 12;
    const spaceAbove = trigger.top - padding;
    const spaceBelow = window.innerHeight - trigger.bottom - padding;
    const showAbove =
      spaceAbove >= tooltip.height + gap || spaceAbove > spaceBelow;
    const top = showAbove
      ? Math.max(padding, trigger.top - tooltip.height - gap)
      : Math.min(
          window.innerHeight - tooltip.height - padding,
          trigger.bottom + gap,
        );
    const left = Math.min(
      window.innerWidth - tooltip.width - padding,
      Math.max(padding, trigger.left),
    );
    setPosition({ top, left, ready: true });
  }, [open, text, mediaUrl]);

  const tooltip =
    open && typeof document !== "undefined"
      ? createPortal(
          <span
            ref={tooltipRef}
            onClick={(event) => event.stopPropagation()}
            className={`fixed z-[9999] max-h-[70vh] w-[min(28rem,calc(100vw-1.5rem))] overflow-auto rounded-xl border border-slate-700 bg-[#182533] p-3 text-sm leading-relaxed text-slate-100 shadow-2xl ${position.ready ? "opacity-100" : "opacity-0"}`}
            style={{ top: position.top, left: position.left }}
          >
            {post.hasMedia ? (
              <span className="mb-3 block overflow-hidden rounded-lg bg-black/30">
                {mediaUrl && media.data?.type.startsWith("image/") ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={mediaUrl}
                    alt=""
                    className="max-h-80 w-full object-contain"
                  />
                ) : media.isLoading ? (
                  <span className="flex h-36 items-center justify-center text-slate-400">
                    Loading image…
                  </span>
                ) : (
                  <span className="flex h-24 items-center justify-center text-slate-400">
                    Telegram media
                  </span>
                )}
              </span>
            ) : null}
            {post.formattedText ? (
              <span
                className="telegram-preview-text block whitespace-pre-wrap break-words"
                dangerouslySetInnerHTML={{ __html: post.formattedText }}
              />
            ) : text ? (
              <span className="block whitespace-pre-wrap break-words">
                {text}
              </span>
            ) : null}
          </span>,
          document.body,
        )
      : null;

  return (
    <span
      ref={triggerRef}
      className="block min-w-0"
      onMouseEnter={() => {
        setPosition((prev) => ({ ...prev, ready: false }));
        setOpen(true);
      }}
      onMouseLeave={() => {
        if (!pinned) setOpen(false);
      }}
      onFocus={() => {
        setPosition((prev) => ({ ...prev, ready: false }));
        setOpen(true);
      }}
      onBlur={() => {
        if (!pinned) setOpen(false);
      }}
      onClick={() => {
        setPosition((prev) => ({ ...prev, ready: false }));
        const nextPinned = !pinned;
        setPinned(nextPinned);
        setOpen(nextPinned);
      }}
      title={pinned ? "Click to close preview" : "Click to keep preview open"}
      tabIndex={0}
    >
      <span className="flex min-w-0 items-center gap-1.5">
        <span className="min-w-0 truncate">
          {text || (post.hasMedia ? "Image" : "-")}
        </span>
        {post.hasMedia ? (
          <span className="shrink-0" aria-label="Post contains media">
            🖼
          </span>
        ) : null}
      </span>
      {tooltip}
    </span>
  );
}

function PostManualMetricsEditor({
  post,
  isSaving,
  onSave,
}: {
  post: any;
  isSaving: boolean;
  onSave: (payload: {
    manualOwnViews?: number;
    manualOwnReactions?: number;
    excludeFromAnalytics?: boolean;
  }) => void;
}) {
  const [open, setOpen] = useState(false);
  const [manualOwnViews, setManualOwnViews] = useState(
    String(post.manualOwnViews ?? 0),
  );
  const [manualOwnReactions, setManualOwnReactions] = useState(
    String(post.manualOwnReactions ?? 0),
  );

  useEffect(() => {
    setManualOwnViews(String(post.manualOwnViews ?? 0));
    setManualOwnReactions(String(post.manualOwnReactions ?? 0));
  }, [post.manualOwnReactions, post.manualOwnViews]);

  const ownViews = toNumber(post.manualOwnViews);
  const ownReactions = toNumber(post.manualOwnReactions);
  const hasCorrection = ownViews > 0 || ownReactions > 0;
  const save = () =>
    {
      onSave({
      manualOwnViews: Math.max(0, toNumber(manualOwnViews)),
      manualOwnReactions: Math.max(0, toNumber(manualOwnReactions)),
      excludeFromAnalytics: true,
      });
      setOpen(false);
    };

  return (
    <>
      <div className="flex items-center justify-end gap-2">
        {hasCorrection ? (
          <div className="min-w-0 space-y-1 text-xs text-slate-300">
            <p className="flex items-center gap-1 whitespace-nowrap">
              <Eye size={13} className="text-slate-500" />
              {formatNumber(ownViews)}
            </p>
            <p className="flex items-center gap-1 whitespace-nowrap">
              <Smile size={13} className="text-slate-500" />
              {formatNumber(ownReactions)}
            </p>
          </div>
        ) : (
          <span className="text-slate-500">-</span>
        )}
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-slate-700 text-slate-300 hover:bg-slate-800"
          title="Edit manual correction"
        >
          <Pencil size={15} />
        </button>
      </div>
      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title="Manual correction"
      >
        <div className="space-y-4">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <FormField label="Own views">
              <Input
                type="number"
                min={0}
                value={manualOwnViews}
                onChange={(event) => setManualOwnViews(event.target.value)}
              />
            </FormField>
            <FormField label="Own reactions">
              <Input
                type="number"
                min={0}
                value={manualOwnReactions}
                onChange={(event) => setManualOwnReactions(event.target.value)}
              />
            </FormField>
          </div>
          <div className="flex justify-end gap-2">
            <Button
              type="button"
              variant="secondary"
              onClick={() => setOpen(false)}
            >
              Cancel
            </Button>
            <Button type="button" disabled={isSaving} onClick={save}>
              {isSaving ? "Saving..." : "Save"}
            </Button>
          </div>
        </div>
      </Modal>
    </>
  );
}

function CampaignsTable({
  campaigns,
  settings,
  currencySettings,
  rates,
}: {
  campaigns: any[];
  settings: SettingsState;
  currencySettings: any;
  rates: any[] | undefined;
}) {
  return (
    <div className="table-scroll w-full rounded-lg border border-slate-700">
      <table className="w-max min-w-full text-sm">
        <thead className="bg-slate-900/60 text-slate-300">
          <tr>
            <th className="px-3 py-2 text-left">Campaign</th>
            <th className="px-3 py-2 text-left">Date</th>
            <th className="px-3 py-2 text-right">Joined</th>
            <th className="px-3 py-2 text-right">Cost</th>
            <th className="px-3 py-2 text-right">CPA</th>
          </tr>
        </thead>
        <tbody>
          {campaigns.map((campaign) => {
            const status = campaignKpiStatus(campaign.cpaForKpi, settings);
            return (
              <tr
                key={campaign.id}
                className={`border-t border-slate-800 ${campaignRowKpiClass(status)}`}
              >
                <td className="max-w-md truncate px-3 py-2">
                  {campaignDisplayTitleWithDate(campaign)}
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
                  <MoneyStack
                    amount={campaign.cost}
                    currency={campaign.currency}
                    settings={currencySettings}
                    rates={rates}
                    amountInPrimary={campaign.costInPrimary}
                    className="inline-block min-w-[112px] text-right"
                    mainClassName="font-semibold leading-snug text-white"
                    subClassName="text-xs leading-snug text-slate-500"
                  />
                </td>
                <td className="px-3 py-2 text-right">
                  {campaign.cpa == null ? (
                    "-"
                  ) : (
                    <div
                      className={`inline-flex min-w-[112px] justify-center rounded px-2 py-1 ${campaignCpaBadgeClass(status)}`}
                    >
                      <MoneyStack
                        amount={campaign.cpa}
                        currency={campaign.currency}
                        settings={currencySettings}
                        rates={rates}
                        amountInPrimary={campaign.cpaForKpi}
                        mainClassName="text-xs font-semibold leading-snug"
                        subClassName="text-[11px] font-medium leading-snug opacity-75"
                      />
                    </div>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function campaignDisplayTitleWithDate(campaign: any) {
  const date = formatLocalDate(
    campaign?.placementDate || campaign?.startedAt || campaign?.createdAt,
  );
  const title = campaignDisplayTitle(campaign);
  return date && date !== "-" ? `${date} | ${title}` : title;
}

function campaignDisplayTitle(campaign: any) {
  const date = formatLocalDate(
    campaign?.placementDate || campaign?.startedAt || campaign?.createdAt,
  );
  let title = String(campaign?.title || "").trim();
  title = title.replace(/^Telegram ad campaign:\s*/i, "").trim();
  if (date && date !== "-") {
    title = title
      .replace(new RegExp(`^${date}\\s*\\|\\s*`), "")
      .replace(new RegExp(`^${date}\\b\\s*[-|:]?\\s*`), "")
      .trim();
  }
  if (!title || /^Campaign\s+\d{4}-\d{2}-\d{2}$/i.test(title)) {
    return generatedCampaignDisplayTitle(campaign);
  }
  return title;
}

function generatedCampaignDisplayTitle(campaign: any) {
  const sources = campaignSourceLabels(campaign);
  const promo = campaign?.promo?.title;
  const parts = [...sources.slice(0, 2), promo].filter(Boolean);
  if (parts.length) return [...new Set(parts)].join(" | ");
  return campaign?.telegramChannel?.title || "Campaign";
}

function campaignSourceLabels(campaign: any) {
  const normalized = (campaign?.advertisingChannels || [])
    .map((source: any) =>
      source?.title ||
      source?.name ||
      source?.advertisingSource?.name ||
      source?.advertisingSource?.title,
    )
    .filter(Boolean);
  const telegramSources = (campaign?.advertisingTelegramChannels || [])
    .map((placement: any) => placement?.telegramChannel?.title)
    .filter(Boolean);
  return [...new Set([...telegramSources, ...normalized])];
}

function campaignKpiStatus(
  value: unknown,
  settings: SettingsState,
): CampaignKpiStatus {
  const cpa = nullableNumber(value);
  if (cpa == null) return "unknown";
  const targetFrom = nullableNumber(settings.targetCpaFrom);
  const targetTo = nullableNumber(settings.targetCpa);
  const acceptableFrom = nullableNumber(settings.acceptableCpaFrom);
  const acceptableTo = nullableNumber(settings.acceptableCpa);
  const stopFrom =
    nullableNumber(settings.stopCpaFrom) ?? nullableNumber(settings.stopCpa);
  if (
    targetFrom == null &&
    targetTo == null &&
    acceptableFrom == null &&
    acceptableTo == null &&
    stopFrom == null
  ) {
    return "unknown";
  }
  if (valueInRange(cpa, targetFrom, targetTo)) return "good";
  if (valueInRange(cpa, acceptableFrom, acceptableTo)) return "acceptable";
  if (valueInRange(cpa, stopFrom, null)) return "bad";
  return "unknown";
}

function campaignRowKpiClass(status: CampaignKpiStatus) {
  if (status === "good") return "bg-emerald-950/10";
  if (status === "acceptable") return "bg-yellow-950/10";
  if (status === "bad") return "bg-rose-950/15";
  return "";
}

function campaignCpaBadgeClass(status: CampaignKpiStatus) {
  if (status === "good")
    return "border-emerald-700/80 bg-emerald-950/40 text-emerald-200";
  if (status === "acceptable")
    return "border-yellow-700/80 bg-yellow-950/40 text-yellow-200";
  if (status === "bad")
    return "border-rose-700/80 bg-rose-950/40 text-rose-200";
  return "border-slate-700 bg-slate-900/40 text-slate-200";
}

function SnapshotItem({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="min-h-[58px] rounded-lg border border-slate-800 bg-slate-900/25 px-2.5 py-2">
      <p className="truncate text-xs text-slate-400">{label}</p>
      <div className="mt-1 truncate text-sm font-semibold text-slate-100">
        {value || "-"}
      </div>
    </div>
  );
}

function summarizeSync(result: any) {
  const status = result?.status || "success";
  const steps = Array.isArray(result?.steps) ? result.steps : [];
  const historical = result?.historical || {};
  const publicInfo = result?.publicInfo || {};
  const posts = result?.postsMetricsSync || {};
  const olderPosts = result?.olderPostsBackfill || {};
  const stats = result?.channelStatsSync || {};
  const managedPosts = result?.managedPostsSync || {};
  const importedLinks = toNumber(historical.imported);
  const updatedLinks = toNumber(historical.updated);
  const dailyRows = toNumber(historical.postsUpdated);
  const syncedPosts = toNumber(posts.syncedPosts);
  const olderSyncedPosts = toNumber(olderPosts.syncedPosts);
  const points = toNumber(stats.pointsUpserted);
  const syncedManagedPosts = Array.isArray(managedPosts.posts)
    ? managedPosts.posts.length
    : 0;
  const failedSteps = steps.filter((step: any) => step?.status === "failed");
  const skippedSteps = steps.filter((step: any) => step?.status === "skipped");
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
  const managedPostsText = syncedManagedPosts
    ? `Managed posts: refreshed ${syncedManagedPosts}.`
    : "Managed posts: no changes returned.";
  const statusText =
    status === "partial"
      ? "Sync completed partially."
      : status === "failed"
        ? "Sync failed."
        : "Sync completed.";
  const notes = [
    failedSteps.length ? `Failed steps: ${failedSteps.length}.` : null,
    skippedSteps.length ? `Skipped steps: ${skippedSteps.length}.` : null,
  ]
    .filter(Boolean)
    .join(" ");
  return `${statusText}\n${publicText}\n${linkText}\n${postText}\n${statsText}\n${managedPostsText}${notes ? `\n${notes}` : ""}`;
}

function InfoTooltip({ tip, children }: { tip: string; children?: ReactNode }) {
  return (
    <span className="group relative inline-flex">
      {children || (
        <span className="inline-flex h-5 w-5 cursor-help items-center justify-center rounded-full border border-slate-600 text-slate-300">
          <CircleHelp size={13} />
        </span>
      )}
      <TooltipBubble
        side="bottom"
        align="right"
        className="w-64 border-slate-700 bg-slate-950 px-2 py-1.5 text-xs text-slate-100 opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100"
      >
        {tip}
      </TooltipBubble>
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
  rows: Array<Record<string, string | number> & { timestamp: number }>;
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
  const rowsByDate = new Map<number, Record<string, string | number> & { timestamp: number }>();
  const seriesByKey = new Map<
    string,
    TelegramGraphChartData["series"][number]
  >();

  for (const point of metricPoints) {
    const timestamp = toChartTimestamp(point.date);
    if (timestamp == null) continue;
    const row = rowsByDate.get(timestamp) || { timestamp };
    row[String(point.series)] = toNumber(point.value);
    rowsByDate.set(timestamp, row);

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
      .sort(([left], [right]) => left - right)
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
    const timestamp = toChartTimestamp(xValue);
    if (timestamp == null) return null;
    const row: Record<string, string | number> & { timestamp: number } = {
      timestamp,
    };
    for (const column of valueColumns) {
      const value = Number(column[index + 1]);
      if (Number.isFinite(value)) row[String(column[0])] = value;
    }
    return row;
  }).filter((row): row is Record<string, string | number> & { timestamp: number } => row != null);

  return rows.length ? { rows, series } : null;
}

function hasRenderableTelegramChart(
  chart: TelegramGraphChartData | null,
): chart is TelegramGraphChartData {
  if (!chart?.rows.length || !chart.series.length) return false;
  return chart.rows.some((row) =>
    chart.series.some((series) => Number.isFinite(Number(row[series.key]))),
  );
}

function hasRenderableTelegramGraphItem<T extends { chart: TelegramGraphChartData | null }>(
  item: T,
): item is T & { chart: TelegramGraphChartData } {
  return hasRenderableTelegramChart(item.chart);
}

function normalizeTelegramColor(value: unknown, fallback: string) {
  const match = String(value || "").match(/#[0-9a-f]{6}/i);
  return match?.[0] || fallback;
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
            <XAxis
              dataKey="timestamp"
              type="number"
              domain={["dataMin", "dataMax"]}
              tickFormatter={(value) => formatLocalDate(value)}
              tick={{ fill: "#94a3b8", fontSize: 12 }}
              minTickGap={24}
            />
            <YAxis tick={{ fill: "#94a3b8", fontSize: 12 }} width={42} />
            <Tooltip
              labelFormatter={(value) => formatLocalDateTime(value)}
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
