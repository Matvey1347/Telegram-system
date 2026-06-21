"use client";

import { useMemo, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { AppShell } from "@/components/layout/app-shell";
import { ChannelPreview } from "@/components/telegram/channel-preview";
import {
  BotAccountsPanel,
  MtprotoAccountsPanel,
} from "@/components/telegram/telegram-account-panels";
import { TelegramSourceAvatar } from "@/components/telegram/telegram-source-avatar";
import {
  advertisingChannelsApi,
  syncTelegramChannelNow,
  telegramChannelsApi,
  type AdvertisingChannel,
  type ImportedTelegramSource,
  type TelegramChannel,
  type TelegramChannelFinancialSummary,
  type TelegramChannelSourceAccess,
} from "@/lib/api";
import {
  Button,
  ConfirmDeleteModal,
  EmptyState,
  EntityCard,
  FormField,
  IconButton,
  Input,
  LoadingState,
  Modal,
  PageHeader,
  ToastStack,
  type ToastItem,
} from "@/components/ui/primitives";

type TelegramTab = "channels" | "accounts" | "bot";
type ChannelFilter = "own" | "external";
type AccountFilter = "mtproto" | "people";

function normalizeUsername(value?: string | null) {
  return String(value || "")
    .replace(/^@/, "")
    .trim();
}

function requestErrorMessage(error: unknown, fallback: string) {
  const responseError = error as { response?: { data?: { message?: string } } };
  return responseError?.response?.data?.message || fallback;
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
  if (value == null || !Number.isFinite(Number(value))) return "-";
  return formatNumber(value, decimals);
}

function formatPercent(value: unknown, decimals = 1) {
  if (value == null || !Number.isFinite(Number(value))) return "-";
  return `${formatNumber(value, decimals)}%`;
}

function kpiBadgeClass(status?: TelegramChannelFinancialSummary["kpiStatus"]) {
  if (status === "good") return "border-emerald-700 text-emerald-200";
  if (status === "acceptable") return "border-yellow-700 text-yellow-200";
  if (status === "bad") return "border-rose-700 text-rose-200";
  return "border-slate-700 text-slate-300";
}

function formatLocalDate(value?: string | Date | null) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function isOwnChannel(channel: TelegramChannel) {
  return Array.isArray(channel.adminLinks) && channel.adminLinks.length > 0;
}

function isPersonSource(
  source: ImportedTelegramSource,
): source is AdvertisingChannel {
  return "kind" in source && source.kind === "person";
}

function parseTelegramTab(value: string | null): TelegramTab {
  return value === "accounts" || value === "bot" ? value : "channels";
}

function parseChannelFilter(value: string | null): ChannelFilter {
  return value === "external" ? "external" : "own";
}

function parseAccountFilter(value: string | null): AccountFilter {
  return value === "people" ? "people" : "mtproto";
}

function PersonPreview({
  person,
  username,
  onDelete,
}: {
  person: AdvertisingChannel;
  username: string;
  onDelete: () => void;
}) {
  const [imageFailed, setImageFailed] = useState(false);
  const imageUrl = person.imageUrl;
  const hasImage = Boolean(imageUrl && !imageFailed);

  return (
    <div className="mb-4 flex items-center gap-3 rounded-lg border border-neutral-700 bg-slate-900/70 p-3">
      {hasImage ? (
        <Image
          src={imageUrl as string}
          alt={person.title}
          width={56}
          height={56}
          className="h-14 w-14 shrink-0 rounded-full object-cover"
          unoptimized
          onError={() => setImageFailed(true)}
        />
      ) : (
        <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full border border-neutral-700 bg-neutral-900 text-lg font-semibold text-neutral-200">
          {String(person.title || "?")
            .slice(0, 1)
            .toUpperCase()}
        </div>
      )}
      <div className="min-w-0 flex-1">
        <p className="truncate text-lg font-semibold leading-none text-white">
          {person.title || "-"}
        </p>
        <p className="mt-1 truncate text-sm text-slate-300">
          {person.contactInfo || (username ? `@${username}` : "Person")}
        </p>
      </div>
      <IconButton kind="delete" onClick={onDelete} />
    </div>
  );
}

function ChannelSourcesSummary({
  channelId,
  fallbackAdminCount,
}: {
  channelId: string;
  fallbackAdminCount: number;
}) {
  const { data = [], isLoading } = useQuery({
    queryKey: ["telegram-channel-sources", channelId],
    queryFn: () => telegramChannelsApi.sources(channelId),
  });
  return (
    <div className="mt-3 border-t border-slate-800 pt-3">
      <div className="mb-2 flex items-center justify-between gap-2">
        <p className="text-sm font-semibold text-slate-200">Access sources</p>
        <span className="text-xs text-slate-400">
          {isLoading
            ? "Loading..."
            : `${data.length || fallbackAdminCount} sources`}
        </span>
      </div>
      {!isLoading && !data.length ? (
        <p className="text-xs text-slate-500">
          No detailed access data yet. Run Sync channels from the account card
          to refresh permissions.
        </p>
      ) : null}
      <div className="space-y-2">
        {data.map((source) => (
          <div
            key={`${source.sourceType}:${source.sourceId}`}
            className="min-h-28 rounded-md border border-slate-800 bg-slate-900/40 p-2"
          >
            <div className="flex items-start justify-between gap-2">
              <div className="flex min-w-0 items-center gap-3">
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
                  <p className="text-xs text-slate-400">{source.sourceType}</p>
                </div>
              </div>
              <AccessBadge
                label={formatRole(source.role)}
                tip={roleTooltip(source.role, source.sourceType)}
              />
            </div>
            <div
              className={`mt-2 flex flex-wrap items-center gap-1 text-xs ${source.canBeUsedForAnalytics ? "text-emerald-300" : "text-amber-300"}`}
            >
              <span>
                {source.canBeUsedForAnalytics
                  ? "Can be used for analytics"
                  : "Not enough access for analytics"}
              </span>
              <PermissionSummaryBadges source={source} />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function ChannelFinanceMiniSummary({ channel }: { channel: TelegramChannel }) {
  const { data: audience, isLoading: audienceLoading } = useQuery({
    queryKey: ["telegram-channel-audience", channel.id],
    queryFn: () => telegramChannelsApi.audience(channel.id),
  });
  const { data: summary, isLoading: summaryLoading } = useQuery({
    queryKey: ["telegram-channel-financial-summary", channel.id],
    queryFn: () => telegramChannelsApi.financialSummary(channel.id),
  });
  const loading = audienceLoading || summaryLoading;
  const currency = summary?.kpiCurrency || channel.kpiCurrency || "";
  return (
    <div className="mt-3 rounded-md border border-slate-800 bg-slate-900/30 p-3">
      {loading ? (
        <p className="text-xs text-slate-400">Loading analytics...</p>
      ) : (
        <div className="grid grid-cols-2 gap-2 text-xs">
          <MiniStat
            label="Subscribers"
            value={formatNumber(
              audience?.subscribersCount ?? channel.currentSubscribersCount,
            )}
          />
          <MiniStat
            label="Active estimate"
            value={formatNullableNumber(audience?.activeSubscribersEstimate)}
          />
          <MiniStat
            label="View rate"
            value={formatPercent(audience?.viewRate, 1)}
          />
          <MiniStat
            label="Spend"
            value={`${formatNumber(summary?.totalAdSpend, 2)} ${currency}`}
          />
          <MiniStat
            label="Avg CPA"
            value={
              summary?.avgCpa == null
                ? "-"
                : `${formatNumber(summary.avgCpa, 2)} ${currency}`
            }
          />
          <div>
            <p className="text-slate-500">KPI</p>
            {summary?.kpiStatus && summary.kpiStatus !== "unknown" ? (
              <span
                className={`mt-1 inline-flex rounded border px-2 py-0.5 text-xs ${kpiBadgeClass(summary.kpiStatus)}`}
              >
                {summary.kpiLabel || "-"}
              </span>
            ) : (
              <p className="mt-1 text-xs text-slate-200">-</p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function MiniStat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-slate-500">{label}</p>
      <p className="mt-0.5 truncate font-medium text-slate-100">{value}</p>
    </div>
  );
}

function PermissionSummaryBadges({
  source,
}: {
  source: TelegramChannelSourceAccess;
}) {
  if (hasFullAccess(source)) {
    return (
      <>
        <span className="text-slate-500">·</span>
        <AccessBadge
          label="Full access"
          tip={fullAccessTooltip(source)}
          tone="success"
        />
        <AccessBadge
          label={inviteLinksBadgeLabel(source)}
          tip={inviteLinksVisibility(source)}
          tone="info"
        />
      </>
    );
  }
  const labels = [
    source.permissions.canPostMessages ? "post" : null,
    source.permissions.canEditMessages ? "edit" : null,
    source.permissions.canDeleteMessages ? "delete" : null,
    source.permissions.canManageInviteLinks
      ? inviteLinksBadgeLabel(source)
      : null,
    source.permissions.canViewStats ? "stats" : null,
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

function hasFullAccess(source: TelegramChannelSourceAccess) {
  return (
    source.role === "OWNER" ||
    (source.role === "ADMIN" &&
      source.permissions.canPostMessages &&
      source.permissions.canEditMessages &&
      source.permissions.canDeleteMessages &&
      source.permissions.canManageInviteLinks &&
      source.permissions.canViewStats)
  );
}

function formatRole(role: string) {
  return role.charAt(0) + role.slice(1).toLowerCase();
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

function fullAccessTooltip(source: TelegramChannelSourceAccess) {
  return `Full access means this source has all meaningful analytics permissions currently tracked: publish, edit, delete, invite links, and stats. ${inviteLinksVisibility(source)}`;
}

function inviteLinksBadgeLabel(source: TelegramChannelSourceAccess) {
  if (source.role === "OWNER") return "All invite links";
  if (source.sourceType === "BOT") return "Own bot links only";
  return "Own admin links only";
}

function inviteLinksVisibility(source: TelegramChannelSourceAccess) {
  if (source.role === "OWNER")
    return "Invite links: owner access can see all channel invite links.";
  if (source.sourceType === "BOT")
    return "Invite links: bots can see only invite links created by this bot.";
  return "Invite links: admins can see only invite links created by this admin account.";
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
  const publicText = publicInfo.updated
    ? `Channel info: refreshed${publicInfo.subscribersCount != null ? `, ${formatNumber(publicInfo.subscribersCount)} subscribers` : ""}.`
    : publicInfo.reason
      ? `Channel info: not updated (${publicInfo.reason}).`
      : "Channel info: refreshed.";
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
  return `Sync completed.\n${publicText}\n${linkText}\n${postText}\n${statsText}`;
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

export default function TelegramChannelsPage() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const queryClient = useQueryClient();
  const [importOpen, setImportOpen] = useState(false);
  const [mtprotoCreateOpen, setMtprotoCreateOpen] = useState(false);
  const [botCreateOpen, setBotCreateOpen] = useState(false);
  const tab = parseTelegramTab(searchParams.get("tab"));
  const channelFilter = parseChannelFilter(searchParams.get("channelTab"));
  const accountFilter = parseAccountFilter(searchParams.get("accountTab"));
  const [deleting, setDeleting] = useState<TelegramChannel | null>(null);
  const [deletingPerson, setDeletingPerson] =
    useState<AdvertisingChannel | null>(null);
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const pushToast = (
    message: string,
    tone: ToastItem["tone"] = "info",
    durationMs = 3500,
  ) => {
    const id = Date.now() + Math.floor(Math.random() * 1000);
    setToasts((prev) => [...prev, { id, message, tone }]);
    setTimeout(
      () => setToasts((prev) => prev.filter((toast) => toast.id !== id)),
      durationMs,
    );
  };
  const updateTabs = (next: {
    tab?: TelegramTab;
    channelFilter?: ChannelFilter;
    accountFilter?: AccountFilter;
  }) => {
    const params = new URLSearchParams(searchParams.toString());
    const nextTab = next.tab || tab;
    params.set("tab", nextTab);
    if (next.channelFilter) params.set("channelTab", next.channelFilter);
    if (next.accountFilter) params.set("accountTab", next.accountFilter);
    router.replace(`${pathname}?${params.toString()}`, { scroll: false });
  };
  const {
    data: channels,
    isLoading: channelsLoading,
    error: channelsError,
  } = useQuery({
    queryKey: ["telegram-channels"],
    queryFn: telegramChannelsApi.list,
  });
  const {
    data: people,
    isLoading: peopleLoading,
    error: peopleError,
  } = useQuery({
    queryKey: ["advertising-people"],
    queryFn: advertisingChannelsApi.list,
  });
  const importMutation = useMutation({
    mutationFn: (input: string) => telegramChannelsApi.import(input),
    onSuccess: (source: ImportedTelegramSource) => {
      queryClient.invalidateQueries({ queryKey: ["telegram-channels"] });
      queryClient.invalidateQueries({ queryKey: ["advertising-people"] });
      setImportOpen(false);
      if (isPersonSource(source)) {
        updateTabs({ tab: "accounts", accountFilter: "people" });
      } else {
        updateTabs({
          tab: "channels",
          channelFilter:
            "adminLinks" in source && isOwnChannel(source) ? "own" : "external",
        });
      }
      pushToast(
        isPersonSource(source) ? "Person imported." : "Channel imported.",
        "success",
      );
    },
    onError: (requestError: unknown) =>
      pushToast(
        requestErrorMessage(requestError, "Failed to import source."),
        "error",
      ),
  });
  const deleteMutation = useMutation({
    mutationFn: (id: string) => telegramChannelsApi.remove(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["telegram-channels"] });
      setDeleting(null);
      pushToast("Channel deleted with related data.", "success");
    },
    onError: (requestError: unknown) =>
      pushToast(
        requestErrorMessage(requestError, "Failed to delete channel."),
        "error",
      ),
  });
  const deletePersonMutation = useMutation({
    mutationFn: (id: string) => advertisingChannelsApi.remove(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["advertising-people"] });
      setDeletingPerson(null);
      pushToast("Person deleted.", "success");
    },
    onError: (requestError: unknown) =>
      pushToast(
        requestErrorMessage(requestError, "Failed to delete person."),
        "error",
      ),
  });
  const syncNowMutation = useMutation({
    mutationFn: (id: string) => syncTelegramChannelNow(id),
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ["telegram-channels"] });
      pushToast(summarizeSync(result), "success", 8000);
    },
    onError: (requestError: unknown) =>
      pushToast(requestErrorMessage(requestError, "Sync failed."), "error"),
  });
  const filteredChannels = useMemo(
    () =>
      (channels || []).filter((channel: TelegramChannel) => {
        const hasAdminLink = isOwnChannel(channel);
        return channelFilter === "own" ? hasAdminLink : !hasAdminLink;
      }),
    [channels, channelFilter],
  );
  const isLoading = channelsLoading || peopleLoading;
  const error = channelsError || peopleError;
  const emptyText =
    channelFilter === "own" ? "No own channels" : "No external channels";
  const headerAction =
    tab === "bot" ? (
      <Button onClick={() => setBotCreateOpen(true)}>Connect bot</Button>
    ) : tab === "accounts" && accountFilter === "mtproto" ? (
      <Button onClick={() => setMtprotoCreateOpen(true)}>
        Connect account
      </Button>
    ) : (
      <Button onClick={() => setImportOpen(true)}>Import</Button>
    );

  return (
    <AppShell>
      <PageHeader
        title="Telegram"
        subtitle="Channels and Telegram accounts"
        action={headerAction}
      />
      <div className="mb-5 inline-flex rounded-lg border border-neutral-700 bg-neutral-900 p-1">
        {(["channels", "accounts", "bot"] as TelegramTab[]).map((item) => (
          <button
            key={item}
            type="button"
            className={`rounded-md px-4 py-2 text-sm ${tab === item ? "bg-blue-600 text-white" : "text-neutral-300 hover:bg-neutral-800"}`}
            onClick={() => updateTabs({ tab: item })}
          >
            {item === "channels"
              ? "Channels"
              : item === "accounts"
                ? "Accounts"
                : "Bot"}
          </button>
        ))}
      </div>
      {tab === "channels" ? (
        <>
          <div className="mb-5 flex gap-1 border-b border-neutral-800">
            {(["own", "external"] as ChannelFilter[]).map((item) => (
              <button
                key={item}
                type="button"
                className={`border-b-2 px-3 py-2 text-sm ${channelFilter === item ? "border-blue-500 text-white" : "border-transparent text-neutral-400 hover:text-white"}`}
                onClick={() =>
                  updateTabs({ tab: "channels", channelFilter: item })
                }
              >
                {item === "own" ? "Our channels" : "External channels"}
              </button>
            ))}
          </div>
          {isLoading ? <LoadingState /> : null}
          {error ? (
            <div className="text-red-300">Failed to load channels</div>
          ) : null}
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
            {filteredChannels.map((channel: TelegramChannel) => {
              const hasAdminLink = isOwnChannel(channel);
              const username = normalizeUsername(channel.username);
              return (
                <EntityCard key={channel.id} title="" actions={null}>
                  <ChannelPreview
                    channel={channel}
                    rightAction={
                      <IconButton
                        kind="delete"
                        onClick={() => setDeleting(channel)}
                      />
                    }
                  />
                  <div className="space-y-1">
                    <p>
                      Username:{" "}
                      {username ? (
                        <a
                          href={`https://t.me/${username}`}
                          target="_blank"
                          rel="noreferrer"
                          className="text-blue-300 hover:underline"
                        >
                          @{username}
                        </a>
                      ) : (
                        "-"
                      )}
                    </p>
                  </div>
                  <ChannelFinanceMiniSummary channel={channel} />
                  {hasAdminLink ? (
                    <ChannelSourcesSummary
                      channelId={channel.id}
                      fallbackAdminCount={channel.adminLinks?.length || 0}
                    />
                  ) : null}
                  <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
                    {hasAdminLink ? (
                      <Button
                        className="h-11 w-full text-center"
                        variant="secondary"
                        onClick={() => syncNowMutation.mutate(channel.id)}
                      >
                        Sync
                      </Button>
                    ) : null}
                    {!hasAdminLink && username ? (
                      <Button
                        className="h-11 w-full text-center"
                        variant="secondary"
                        onClick={() => importMutation.mutate(`@${username}`)}
                      >
                        Refresh Public
                      </Button>
                    ) : null}
                    {hasAdminLink ? (
                      <Link
                        href={`/telegram/channels/${channel.id}`}
                        className="flex h-11 w-full items-center justify-center rounded-md border border-slate-600 px-3 py-2 text-center text-sm text-slate-200 hover:bg-slate-800"
                      >
                        Analytics
                      </Link>
                    ) : null}
                  </div>
                </EntityCard>
              );
            })}
          </div>
          {!isLoading && !filteredChannels.length ? (
            <EmptyState text={emptyText} />
          ) : null}
        </>
      ) : tab === "accounts" ? (
        <>
          <div className="mb-5 flex gap-1 border-b border-neutral-800">
            {(["mtproto", "people"] as AccountFilter[]).map((item) => (
              <button
                key={item}
                type="button"
                className={`border-b-2 px-3 py-2 text-sm ${accountFilter === item ? "border-blue-500 text-white" : "border-transparent text-neutral-400 hover:text-white"}`}
                onClick={() =>
                  updateTabs({ tab: "accounts", accountFilter: item })
                }
              >
                {item === "mtproto" ? "MTProto" : "People"}
              </button>
            ))}
          </div>
          {accountFilter === "mtproto" ? (
            <MtprotoAccountsPanel
              createOpen={mtprotoCreateOpen}
              onCreateClose={() => setMtprotoCreateOpen(false)}
            />
          ) : null}
          {accountFilter === "people" ? (
            <>
              {isLoading ? <LoadingState /> : null}
              {error ? (
                <div className="text-red-300">Failed to load people</div>
              ) : null}
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
                {(people || []).map((person: AdvertisingChannel) => {
                  const username = normalizeUsername(person.username);
                  return (
                    <EntityCard
                      key={person.selectionId || person.id}
                      title=""
                      actions={null}
                    >
                      <PersonPreview
                        person={person}
                        username={username}
                        onDelete={() => setDeletingPerson(person)}
                      />
                      {person.notes ? (
                        <p className="mt-2 text-sm text-neutral-400">
                          {String(person.notes).slice(0, 120)}
                        </p>
                      ) : null}
                    </EntityCard>
                  );
                })}
              </div>
              {!isLoading && !(people || []).length ? (
                <EmptyState text="No people" />
              ) : null}
            </>
          ) : null}
        </>
      ) : (
        <BotAccountsPanel
          createOpen={botCreateOpen}
          onCreateClose={() => setBotCreateOpen(false)}
        />
      )}
      <ImportChannelModal
        open={importOpen}
        onClose={() => setImportOpen(false)}
        onSubmit={(input) => importMutation.mutate(input)}
        isSubmitting={importMutation.isPending}
      />
      <ConfirmDeleteModal
        open={!!deleting}
        entityName={deleting?.title ?? ""}
        description="This deletes the channel and related campaigns, promos, invite links, and stats."
        onClose={() => setDeleting(null)}
        onConfirm={() => deleting && deleteMutation.mutate(deleting.id)}
        label="Delete"
      />
      <ConfirmDeleteModal
        open={!!deletingPerson}
        entityName={deletingPerson?.title ?? ""}
        description="This deletes the person from advertising sources."
        onClose={() => setDeletingPerson(null)}
        onConfirm={() =>
          deletingPerson && deletePersonMutation.mutate(deletingPerson.id)
        }
        label="Delete"
      />
      <ToastStack
        items={toasts}
        onClose={(id) =>
          setToasts((prev) => prev.filter((toast) => toast.id !== id))
        }
      />
    </AppShell>
  );
}

function ImportChannelModal({
  open,
  onClose,
  onSubmit,
  isSubmitting,
}: {
  open: boolean;
  onClose: () => void;
  onSubmit: (input: string) => void;
  isSubmitting: boolean;
}) {
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<{ input: string }>({ defaultValues: { input: "" } });
  return (
    <Modal open={open} onClose={onClose} title="Import">
      <form
        className="space-y-3"
        onSubmit={handleSubmit((values) => {
          onSubmit(values.input);
          reset({ input: "" });
        })}
      >
        <FormField
          label="@username or Telegram link"
          required
          error={errors.input ? "Required field" : undefined}
        >
          <Input
            placeholder="@channel, @person or https://t.me/name"
            {...register("input", { required: true })}
          />
        </FormField>
        <div className="flex justify-end gap-2">
          <Button variant="secondary" type="button" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" disabled={isSubmitting}>
            {isSubmitting ? "Importing..." : "Import"}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
