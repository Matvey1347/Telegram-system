"use client";

import { type ReactNode, useEffect, useMemo, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowUpRight, RefreshCw } from "lucide-react";
import { useForm } from "react-hook-form";
import { AppShell } from "@/components/layout/app-shell";
import { ChannelPreview } from "@/components/telegram/channel-preview";
import {
  BotAccountsPanel,
  MtprotoAccountsPanel,
} from "@/components/telegram/telegram-account-panels";
import { TelegramEntityAvatar } from "@/components/telegram/telegram-entity-avatar";
import { TelegramSourceAvatar } from "@/components/telegram/telegram-source-avatar";
import { MoneyStack } from "@/components/ui/money-stack";
import {
  advertisingChannelsApi,
  currenciesApi,
  syncTelegramChannelNow,
  telegramChannelNetworksApi,
  telegramChannelsApi,
  type AdvertisingChannel,
  type CurrencySettings,
  type ExchangeRate,
  type ImportedTelegramSource,
  type TelegramAnalyticsSources,
  type TelegramChannel,
  type TelegramChannelFinancialSummary,
  type TelegramChannelNetwork,
  type TelegramChannelNetworkMember,
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
  Textarea,
  ToastStack,
  type ToastItem,
} from "@/components/ui/primitives";

type TelegramTab = "channels" | "networks" | "accounts" | "bot";
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

function formatDataType(value: string) {
  return value
    .toLowerCase()
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
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
  return value === "networks" || value === "accounts" || value === "bot"
    ? value
    : "channels";
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
  const [modalOpen, setModalOpen] = useState(false);
  const [selectedSource, setSelectedSource] =
    useState<TelegramChannelSourceAccess | null>(null);
  const { data = [], isLoading } = useQuery({
    queryKey: ["telegram-channel-sources", channelId],
    queryFn: () => telegramChannelsApi.sources(channelId),
  });
  const { data: analyticsSources, isLoading: analyticsSourcesLoading } =
    useQuery({
      queryKey: ["telegram-channel-analytics-sources", channelId],
      queryFn: () => telegramChannelsApi.analyticsSources(channelId),
      enabled: modalOpen,
    });
  const sourcesCount = data.length || fallbackAdminCount;
  return (
    <div className="mt-3 border-t border-slate-800 pt-3">
      <button
        type="button"
        onClick={() => setModalOpen(true)}
        className="flex w-full items-center justify-between gap-2 rounded-md px-0 py-1 text-left transition hover:text-blue-300"
      >
        <span className="text-sm font-semibold text-slate-200">
          Access sources
        </span>
        <span className="text-xs text-slate-400">
          {isLoading ? "Loading..." : `${sourcesCount} sources`}
        </span>
      </button>
      <ChannelSourcesModal
        open={modalOpen}
        onClose={() => {
          setModalOpen(false);
          setSelectedSource(null);
        }}
        sources={analyticsSources?.sources || data}
        dataAttribution={analyticsSources?.dataAttribution || []}
        isLoading={analyticsSourcesLoading}
        onSelectSource={setSelectedSource}
      />
      <SourceAccessModal
        access={selectedSource}
        onClose={() => setSelectedSource(null)}
      />
    </div>
  );
}

function ChannelSourcesModal({
  open,
  onClose,
  sources,
  dataAttribution,
  isLoading,
  onSelectSource,
}: {
  open: boolean;
  onClose: () => void;
  sources: Array<TelegramChannelSourceAccess & { usedFor?: string[] }>;
  dataAttribution: TelegramAnalyticsSources["dataAttribution"];
  isLoading: boolean;
  onSelectSource: (source: TelegramChannelSourceAccess) => void;
}) {
  return (
    <Modal open={open} onClose={onClose} title="Sync sources and scope">
      <div className="space-y-4">
        <div>
          <p className="mb-2 text-sm font-medium text-slate-200">
            Connected sources
          </p>
          {isLoading ? <LoadingState /> : null}
          {!isLoading && !sources.length ? (
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
                  <PermissionSummaryBadges source={source} />
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
            {dataAttribution.length ? (
              dataAttribution.map((item) => (
                <div
                  key={item.dataType}
                  className="flex flex-col gap-1 border-t border-slate-800 px-3 py-2 first:border-t-0 md:flex-row md:items-center md:justify-between"
                >
                  <div className="flex items-center gap-2">
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
              ))
            ) : (
              <p className="px-3 py-2 text-sm text-slate-400">
                {isLoading ? "Loading attribution..." : "No attribution data yet."}
              </p>
            )}
          </div>
        </div>
        <div className="rounded-md border border-slate-800 bg-slate-900/40 p-3 text-sm text-slate-300">
          <p>Now syncing: idle</p>
          <p>Last sync payload: Run sync to capture detailed result in UI</p>
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
          <div className="rounded-lg border border-slate-800 bg-slate-900/30 p-3">
            <p className="text-xs text-slate-400">Analytics</p>
            <p className="mt-1 font-medium text-slate-100">
              {access.canBeUsedForAnalytics
                ? "Can be used for analytics"
                : "Not enough access for analytics"}
            </p>
          </div>
        </div>
        <div className="rounded-md border border-slate-800 bg-slate-900/40 p-3">
          <p className="mb-2 font-medium text-slate-200">Permissions</p>
          <p className="mb-3 text-xs text-slate-400">
            {inviteLinksVisibility(access)}
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

function ChannelFinanceMiniSummary({
  channel,
  moneySettings,
  rates,
}: {
  channel: TelegramChannel;
  moneySettings?: CurrencySettings | null;
  rates?: ExchangeRate[];
}) {
  const { data: audience, isLoading: audienceLoading } = useQuery({
    queryKey: ["telegram-channel-audience", channel.id],
    queryFn: () => telegramChannelsApi.audience(channel.id),
  });
  const { data: summary, isLoading: summaryLoading } = useQuery({
    queryKey: ["telegram-channel-financial-summary", channel.id],
    queryFn: () => telegramChannelsApi.financialSummary(channel.id),
  });
  const loading = audienceLoading || summaryLoading;
  const primaryCurrency = moneySettings?.primaryCurrency || "USD";
  const hasNumber = (value: unknown) =>
    value != null && Number.isFinite(Number(value));
  const hasPositiveNumber = (value: unknown) => hasNumber(value) && Number(value) > 0;
  const moneyValue = (
    value: unknown,
    className = "font-semibold text-slate-100",
  ) => (
    <MoneyStack
      amount={Number(value)}
      currency={primaryCurrency}
      settings={moneySettings}
      rates={rates}
      mainClassName={className}
      subClassName="text-[11px] leading-tight text-slate-500"
    />
  );
  const kpiStatus = summary?.kpiStatus;
  const kpiTone =
    kpiStatus === "good"
      ? "border-emerald-800/80 bg-emerald-950/10"
      : kpiStatus === "acceptable"
        ? "border-yellow-800/80 bg-yellow-950/10"
        : kpiStatus === "bad"
          ? "border-rose-800/80 bg-rose-950/10"
          : "border-slate-800 bg-slate-900/30";
  const metrics: Array<{ label: string; value: ReactNode; prominent?: boolean }> = [];
  const joinedSubscribers = hasNumber(summary?.totalJoinedSubscribers)
    ? Number(summary?.totalJoinedSubscribers)
    : null;
  const paidActiveSubscribers = hasNumber(summary?.paidActiveSubscribersEstimate)
    ? Number(summary?.paidActiveSubscribersEstimate)
    : null;
  const inactiveSubscribers =
    joinedSubscribers != null && paidActiveSubscribers != null
      ? Math.max(joinedSubscribers - paidActiveSubscribers, 0)
      : null;
  const inactiveCpa =
    inactiveSubscribers && hasPositiveNumber(summary?.totalAdSpend)
      ? Number(summary?.totalAdSpend) / inactiveSubscribers
      : null;

  if (hasPositiveNumber(summary?.totalAdSpend)) {
    metrics.push({
      label: "Minus",
      value: moneyValue(
        -Number(summary?.totalAdSpend),
        "font-semibold text-rose-200",
      ),
      prominent: true,
    });
  }
  if (hasPositiveNumber(summary?.avgCpa)) {
    metrics.push({
      label: "CPA / sub",
      value: moneyValue(summary?.avgCpa),
    });
  }
  if (hasPositiveNumber(summary?.activeCpa)) {
    metrics.push({
      label: "CPA / active",
      value: moneyValue(summary?.activeCpa),
      prominent: true,
    });
  }
  if (hasPositiveNumber(inactiveCpa)) {
    metrics.push({
      label: "CPA / inactive",
      value: moneyValue(inactiveCpa),
    });
  }
  if (hasPositiveNumber(summary?.totalJoinedSubscribers)) {
    metrics.push({
      label: "Joined",
      value: formatNumber(summary?.totalJoinedSubscribers),
    });
  }
  if (hasNumber(audience?.viewRate)) {
    metrics.push({
      label: "View rate",
      value: formatPercent(audience?.viewRate, 1),
    });
  }
  const showQuality =
    audience?.dataQuality && audience.dataQuality !== "normal";
  const kpiTargets = [
    formatCompactKpiRange("target", channel.targetCpaFrom, channel.targetCpa),
    formatCompactKpiRange("ok", channel.acceptableCpaFrom, channel.acceptableCpa),
    formatCompactKpiRange(
      "stop",
      channel.stopCpaFrom ?? channel.stopCpa,
      null,
      true,
    ),
  ].filter(Boolean);

  return (
    <div className={`mt-3 rounded-md border p-3 ${kpiTone}`}>
      {loading ? (
        <p className="text-xs text-slate-400">Loading analytics...</p>
      ) : (
        <div className="space-y-2">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-[11px] uppercase tracking-wide text-slate-500">
                Performance
              </p>
              <p className="text-sm font-semibold text-slate-100">
                {formatNumber(
                  audience?.subscribersCount ?? channel.currentSubscribersCount,
                )}{" "}
                subs
                {hasNumber(audience?.activeSubscribersEstimate) ? (
                  <span className="font-normal text-slate-500">
                    {" "}
                    · {formatNumber(audience?.activeSubscribersEstimate)} active
                  </span>
                ) : null}
              </p>
            </div>
            {kpiStatus && kpiStatus !== "unknown" ? (
              <KpiPreviewTooltip
                summary={summary}
                targets={kpiTargets}
                className="shrink-0"
              >
                <span
                  className={`rounded border px-2 py-0.5 text-[11px] ${kpiBadgeClass(kpiStatus)}`}
                >
                  {summary?.kpiLabel || kpiStatus}
                </span>
              </KpiPreviewTooltip>
            ) : null}
          </div>

          {metrics.length ? (
            <div className="grid grid-cols-2 gap-2 text-xs">
              {metrics.slice(0, 6).map((metric) => (
                <PreviewMetric
                  key={metric.label}
                  label={metric.label}
                  value={metric.value}
                  prominent={metric.prominent}
                />
              ))}
            </div>
          ) : null}

          {(showQuality || kpiTargets.length) ? (
            <div className="flex flex-wrap items-center gap-1.5 pt-0.5">
              {showQuality && audience?.dataQuality ? (
                <DataQualityBadge
                  quality={audience.dataQuality}
                  reason={audience?.dataQualityReason}
                  warning={audience?.dataQualityWarning}
                  rawViewRate={audience?.rawViewRate}
                  subscriberBaseQuality={audience?.subscriberBaseQuality}
                />
              ) : null}
              {kpiTargets.length ? (
                <KpiPreviewTooltip summary={summary} targets={kpiTargets}>
                  <span className="inline-flex rounded border border-slate-700 px-2 py-0.5 text-[11px] text-slate-300">
                    KPI $: {kpiTargets.join(" · ")}
                  </span>
                </KpiPreviewTooltip>
              ) : null}
            </div>
          ) : null}
        </div>
      )}
    </div>
  );
}

function KpiPreviewTooltip({
  summary,
  targets,
  children,
  className = "",
}: {
  summary?: TelegramChannelFinancialSummary;
  targets: string[];
  children: ReactNode;
  className?: string;
}) {
  const currentCpa =
    summary?.avgCpa == null || !Number.isFinite(Number(summary.avgCpa))
      ? null
      : Number(summary.avgCpa);
  return (
    <span className={`group relative inline-flex cursor-help ${className}`}>
      {children}
      <span className="pointer-events-none absolute bottom-full right-0 z-50 mb-2 hidden w-72 rounded-md border border-slate-700 bg-slate-950 px-3 py-2 text-xs leading-relaxed text-slate-100 shadow-xl group-hover:block">
        <span className="block font-semibold text-white">
          KPI is calculated by CPA / sub
        </span>
        <span className="mt-1 block text-slate-300">
          Current CPA / sub:{" "}
          <span className="font-semibold text-white">
            {currentCpa == null ? "not enough data" : `$ ${formatNumber(currentCpa, 2)}`}
          </span>
        </span>
        {summary?.kpiStatus && summary.kpiStatus !== "unknown" ? (
          <span className="mt-1 block text-slate-300">
            Result:{" "}
            <span className={kpiBadgeClass(summary.kpiStatus).replace("border-", "text-")}>
              {summary.kpiLabel || summary.kpiStatus}
            </span>
          </span>
        ) : null}
        {targets.length ? (
          <span className="mt-2 block text-slate-400">
            Ranges: {targets.join(" · ")}
          </span>
        ) : null}
      </span>
    </span>
  );
}

function formatCompactKpiRange(
  label: string,
  from: unknown,
  to: unknown,
  openEnded = false,
) {
  const hasFrom = from != null && Number.isFinite(Number(from));
  const hasTo = to != null && Number.isFinite(Number(to));
  if (!hasFrom && !hasTo) return "";
  const fromText = hasFrom ? formatNumber(from, 2) : "";
  const toText = hasTo ? formatNumber(to, 2) : "";
  if (openEnded) return fromText ? `${label} ${fromText}+` : "";
  if (fromText && toText) return `${label} ${fromText}-${toText}`;
  if (fromText) return `${label} from ${fromText}`;
  return `${label} to ${toText}`;
}

function DataQualityBadge({
  quality,
  reason,
  warning,
  rawViewRate,
  subscriberBaseQuality,
}: {
  quality: string;
  reason?: string | null;
  warning?: string | null;
  rawViewRate?: number | null;
  subscriberBaseQuality?: string | null;
}) {
  const reasonText = dataQualityReasonText(reason);
  const badgeClass = kpiBadgeClass(
    quality === "normal"
      ? "good"
      : quality === "borderline"
        ? "acceptable"
        : "bad",
  );
  return (
    <span className="group relative mt-1 inline-flex cursor-help">
      <span className={`inline-flex rounded border px-2 py-0.5 text-xs ${badgeClass}`}>
        {quality}
      </span>
      <span className="pointer-events-none absolute bottom-full left-0 z-40 mb-2 hidden w-72 rounded-md border border-slate-700 bg-slate-950 px-3 py-2 text-xs leading-relaxed text-slate-100 shadow-xl group-hover:block">
        <span className="block font-semibold text-white">
          Data quality: {quality}
        </span>
        <span className="mt-1 block text-slate-300">
          This checks whether subscriber-based metrics look trustworthy.
        </span>
        <span className="mt-2 block text-slate-400">
          Normal: raw view rate up to 80%. Borderline: 80-120%.
          Suspicious: 120-200%. Anomalous: above 200% or invalid input.
        </span>
        {rawViewRate != null ? (
          <span className="mt-2 block text-slate-300">
            Current raw view rate: {formatPercent(rawViewRate, 1)}.
          </span>
        ) : null}
        {subscriberBaseQuality && subscriberBaseQuality !== "normal" ? (
          <span className="mt-1 block text-amber-200">
            Subscriber base: {subscriberBaseQuality}.
          </span>
        ) : null}
        {reasonText ? (
          <span className="mt-1 block text-slate-300">{reasonText}</span>
        ) : null}
        {warning ? (
          <span className="mt-1 block text-amber-200">{warning}</span>
        ) : null}
      </span>
    </span>
  );
}

function dataQualityReasonText(reason?: string | null) {
  if (reason === "views_within_normal_range") {
    return "Views are within the expected range for the subscriber base.";
  }
  if (reason === "views_close_to_subscribers_limit") {
    return "Views are close to subscriber count, so the estimate may be less stable.";
  }
  if (reason === "views_exceed_subscribers") {
    return "Views exceed subscribers, which can indicate external traffic, reposts, viral reach, or manipulation.";
  }
  if (reason === "views_strongly_exceed_subscribers") {
    return "Views strongly exceed subscribers, so active subscriber metrics are capped.";
  }
  if (reason === "subscriber_base_polluted") {
    return "Subscriber base is marked suspicious or polluted, so metrics are downgraded.";
  }
  if (reason === "missing_subscribers_or_views") {
    return "There are not enough valid subscribers or views to calculate this reliably.";
  }
  if (reason === "views_uplift_without_new_subscribers") {
    return "Views increased without matching subscriber growth.";
  }
  return "";
}

function PreviewMetric({ label, value, prominent }: {
  label: string;
  value: ReactNode;
  prominent?: boolean;
}) {
  return (
    <div
      className={prominent ? "rounded border border-slate-800/80 px-2 py-1" : ""}
    >
      <p className="text-slate-500">{label}</p>
      <div className="mt-0.5 truncate font-medium text-slate-100">{value}</div>
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
  const [networkFormOpen, setNetworkFormOpen] = useState(false);
  const [editingNetwork, setEditingNetwork] =
    useState<TelegramChannelNetwork | null>(null);
  const [deletingNetwork, setDeletingNetwork] =
    useState<TelegramChannelNetwork | null>(null);
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
    data: networks = [],
    isLoading: networksLoading,
    error: networksError,
  } = useQuery({
    queryKey: ["telegram-channel-networks"],
    queryFn: telegramChannelNetworksApi.list,
  });
  const { data: currencySettings } = useQuery({
    queryKey: ["currency-settings"],
    queryFn: currenciesApi.getSettings,
  });
  const { data: rates } = useQuery({
    queryKey: ["currency-rates"],
    queryFn: currenciesApi.listRates,
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
  const createNetworkMutation = useMutation({
    mutationFn: telegramChannelNetworksApi.create,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["telegram-channel-networks"] });
      setNetworkFormOpen(false);
      pushToast("Network created.", "success");
    },
    onError: (requestError: unknown) =>
      pushToast(
        requestErrorMessage(requestError, "Failed to create network."),
        "error",
      ),
  });
  const updateNetworkMutation = useMutation({
    mutationFn: ({
      id,
      payload,
    }: {
      id: string;
      payload: {
        name?: string;
        description?: string | null;
        telegramChannelIds?: string[];
      };
    }) => telegramChannelNetworksApi.update(id, payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["telegram-channel-networks"] });
      setEditingNetwork(null);
      setNetworkFormOpen(false);
      pushToast("Network updated.", "success");
    },
    onError: (requestError: unknown) =>
      pushToast(
        requestErrorMessage(requestError, "Failed to update network."),
        "error",
      ),
  });
  const deleteNetworkMutation = useMutation({
    mutationFn: (id: string) => telegramChannelNetworksApi.remove(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["telegram-channel-networks"] });
      setDeletingNetwork(null);
      pushToast("Network deleted.", "success");
    },
    onError: (requestError: unknown) =>
      pushToast(
        requestErrorMessage(requestError, "Failed to delete network."),
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
  const ownChannels = useMemo(
    () => (channels || []).filter(isOwnChannel),
    [channels],
  );
  const isLoading = channelsLoading || peopleLoading;
  const error = channelsError || peopleError;
  const emptyText =
    channelFilter === "own" ? "No own channels" : "No external channels";
  const headerAction =
    tab === "networks" ? (
      <Button
        onClick={() => {
          setEditingNetwork(null);
          setNetworkFormOpen(true);
        }}
      >
        Create network
      </Button>
    ) : tab === "bot" ? (
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
        {(["channels", "networks", "accounts", "bot"] as TelegramTab[]).map((item) => (
          <button
            key={item}
            type="button"
            className={`rounded-md px-4 py-2 text-sm ${tab === item ? "bg-blue-600 text-white" : "text-neutral-300 hover:bg-neutral-800"}`}
            onClick={() => updateTabs({ tab: item })}
          >
            {item === "channels"
              ? "Channels"
              : item === "networks"
                ? "Networks"
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
                  <ChannelFinanceMiniSummary
                    channel={channel}
                    moneySettings={currencySettings}
                    rates={rates}
                  />
                  {hasAdminLink ? (
                    <ChannelSourcesSummary
                      channelId={channel.id}
                      fallbackAdminCount={channel.adminLinks?.length || 0}
                    />
                  ) : null}
                  <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
                    {hasAdminLink ? (
                      <Button
                        className="inline-flex h-11 w-full items-center justify-center gap-2 border border-blue-500/40 bg-blue-600/95 text-center text-white shadow-[0_10px_24px_rgba(37,99,235,0.18)] transition hover:border-blue-400 hover:bg-blue-500"
                        variant="primary"
                        onClick={() => syncNowMutation.mutate(channel.id)}
                      >
                        <RefreshCw size={16} />
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
                        className="flex h-11 w-full items-center justify-center gap-2 rounded-md border border-slate-600/80 px-3 py-2 text-center text-sm font-semibold text-slate-200 transition hover:border-blue-400/70 hover:bg-slate-900 hover:text-white"
                      >
                        Open
                        <ArrowUpRight size={16} />
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
      ) : tab === "networks" ? (
        <TelegramNetworksSection
          networks={networks}
          loading={networksLoading}
          error={networksError}
          moneySettings={currencySettings}
          rates={rates}
          onEdit={(network) => {
            setEditingNetwork(network);
            setNetworkFormOpen(true);
          }}
          onDelete={setDeletingNetwork}
        />
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
      <NetworkFormModal
        open={networkFormOpen}
        network={editingNetwork}
        channels={ownChannels}
        isSubmitting={
          createNetworkMutation.isPending || updateNetworkMutation.isPending
        }
        onClose={() => {
          setNetworkFormOpen(false);
          setEditingNetwork(null);
        }}
        onSubmit={(payload) => {
          if (editingNetwork) {
            updateNetworkMutation.mutate({ id: editingNetwork.id, payload });
          } else {
            createNetworkMutation.mutate(payload);
          }
        }}
      />
      <ConfirmDeleteModal
        open={!!deletingNetwork}
        entityName={deletingNetwork?.name ?? ""}
        description="This deletes only the network. Telegram channels remain untouched."
        onClose={() => setDeletingNetwork(null)}
        onConfirm={() =>
          deletingNetwork && deleteNetworkMutation.mutate(deletingNetwork.id)
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

function TelegramNetworksSection({
  networks,
  loading,
  error,
  moneySettings,
  rates,
  onEdit,
  onDelete,
}: {
  networks: TelegramChannelNetwork[];
  loading: boolean;
  error: unknown;
  moneySettings?: CurrencySettings | null;
  rates?: ExchangeRate[];
  onEdit: (network: TelegramChannelNetwork) => void;
  onDelete: (network: TelegramChannelNetwork) => void;
}) {
  return (
    <>
      {loading ? <LoadingState /> : null}
      {error ? (
        <div className="rounded-lg border border-rose-700 p-3 text-sm text-rose-200">
          Failed to load networks.
        </div>
      ) : null}
      {!loading && !networks.length ? (
        <EmptyState text="No channel networks yet." />
      ) : null}
      {networks.length ? (
        <NetworksTable
          networks={networks}
          moneySettings={moneySettings}
          rates={rates}
          onEdit={onEdit}
          onDelete={onDelete}
        />
      ) : null}
    </>
  );
}

function NetworksTable({
  networks,
  moneySettings,
  rates,
  onEdit,
  onDelete,
}: {
  networks: TelegramChannelNetwork[];
  moneySettings?: CurrencySettings | null;
  rates?: ExchangeRate[];
  onEdit: (network: TelegramChannelNetwork) => void;
  onDelete: (network: TelegramChannelNetwork) => void;
}) {
  const primaryCurrency = moneySettings?.primaryCurrency;
  return (
    <div className="table-scroll w-full rounded-lg border border-neutral-800">
      <table className="w-full min-w-[980px] text-left text-sm">
        <thead className="bg-slate-950 text-xs uppercase text-neutral-400">
          <tr>
            <th className="w-[30%] px-3 py-3 font-medium">Name</th>
            <th className="w-[14%] px-3 py-3 font-medium">Audience</th>
            <th className="w-[10%] px-3 py-3 font-medium">View Rate</th>
            <th className="w-[15%] px-3 py-3 font-medium">Spend</th>
            <th className="w-[17%] px-3 py-3 font-medium">CPA</th>
            <th className="w-[8%] px-3 py-3 font-medium">KPI</th>
            <th className="w-[6%] px-3 py-3 text-right font-medium">Actions</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-neutral-800">
          {networks.map((network) => {
            const summary = network.summary;
            return (
              <tr key={network.id} className="bg-neutral-950 align-top">
                <td className="px-3 py-4">
                  <div className="min-w-0">
                    <Link
                      href={`/telegram-channel-networks/${network.id}`}
                      className="truncate font-semibold text-white hover:text-blue-300"
                    >
                      {network.name}
                    </Link>
                    {network.description ? (
                      <p className="mt-1 line-clamp-2 text-xs text-slate-500">
                        {network.description}
                      </p>
                    ) : null}
                    <p className="mt-1 text-xs text-slate-400">
                      {formatNumber(summary.channelsCount)} channels
                    </p>
                    <NetworkChannelsPreview channels={network.channels} />
                  </div>
                </td>
                <td className="px-3 py-4">
                  <div className="font-semibold text-white">
                    {formatNumber(summary.totalSubscribers)}
                  </div>
                  <div className="mt-1 text-xs text-slate-500">
                    active {formatNumber(summary.activeSubscribersEstimate)}
                  </div>
                </td>
                <td className="px-3 py-4 font-semibold text-white">
                  {formatPercent(summary.viewRate)}
                </td>
                <td className="whitespace-nowrap px-3 py-4">
                  <NetworkMoneyValue
                    amount={summary.totalAdSpend}
                    currency={primaryCurrency}
                    moneySettings={moneySettings}
                    rates={rates}
                  />
                </td>
                <td className="whitespace-nowrap px-3 py-4">
                  <NetworkMoneyValue
                    amount={summary.avgCpa}
                    currency={primaryCurrency}
                    moneySettings={moneySettings}
                    rates={rates}
                    label="avg"
                  />
                  <NetworkMoneyValue
                    amount={summary.activeCpa}
                    currency={primaryCurrency}
                    moneySettings={moneySettings}
                    rates={rates}
                    label="active"
                    className="mt-2"
                  />
                </td>
                <td className="px-3 py-4">
                  <span
                    className={`inline-flex rounded border px-2 py-0.5 text-xs ${kpiBadgeClass(summary.kpiStatus)}`}
                  >
                    {summary.kpiLabel || "-"}
                  </span>
                </td>
                <td className="px-3 py-3">
                  <div className="flex justify-end gap-2">
                    <IconButton onClick={() => onEdit(network)} />
                    <IconButton kind="delete" onClick={() => onDelete(network)} />
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function NetworkChannelsPreview({
  channels,
}: {
  channels: TelegramChannelNetworkMember[];
}) {
  const visibleChannels = channels.slice(0, 3);
  const hiddenCount = Math.max(channels.length - visibleChannels.length, 0);

  if (!visibleChannels.length) return null;

  return (
    <div className="mt-2 flex max-w-full flex-wrap gap-1.5">
      {visibleChannels.map((channel) => {
        const title = channel.title || channel.name || "-";
        const username = normalizeUsername(channel.username);

        return (
          <Link
            key={channel.id}
            href={`/telegram/channels/${channel.id}`}
            className="group flex max-w-[180px] items-center gap-2 rounded-md border border-slate-800 bg-slate-950/80 px-2 py-1 transition hover:border-blue-500/60 hover:bg-blue-950/20"
            title={username ? `${title} (@${username})` : title}
          >
            <TelegramEntityAvatar
              imageUrl={channel.photoUrl}
              kind="channel"
              alt={title}
              size="sm"
            />
            <span className="min-w-0">
              <span className="block truncate text-xs font-medium leading-tight text-slate-200 group-hover:text-blue-200">
                {title}
              </span>
              {username ? (
                <span className="block truncate text-[10px] leading-tight text-slate-500">
                  @{username}
                </span>
              ) : null}
            </span>
          </Link>
        );
      })}
      {hiddenCount ? (
        <span className="inline-flex h-10 items-center rounded-md border border-slate-800 bg-slate-950/80 px-2 text-xs font-medium text-slate-400">
          +{formatNumber(hiddenCount)}
        </span>
      ) : null}
    </div>
  );
}

function NetworkMoneyValue({
  amount,
  currency,
  moneySettings,
  rates,
  label,
  className = "",
}: {
  amount: number | string | null | undefined;
  currency?: string | null;
  moneySettings?: CurrencySettings | null;
  rates?: ExchangeRate[];
  label?: string;
  className?: string;
}) {
  return (
    <div className={className}>
      {label ? <p className="mb-0.5 text-xs text-slate-500">{label}</p> : null}
      <MoneyStack
        amount={amount}
        currency={currency}
        settings={moneySettings}
        rates={rates}
        amountInPrimary={amount}
        mainClassName="font-semibold text-slate-100"
        subClassName="text-xs text-slate-500"
      />
    </div>
  );
}

function NetworkFormModal({
  open,
  network,
  channels,
  isSubmitting,
  onClose,
  onSubmit,
}: {
  open: boolean;
  network: TelegramChannelNetwork | null;
  channels: TelegramChannel[];
  isSubmitting: boolean;
  onClose: () => void;
  onSubmit: (payload: {
    name: string;
    description?: string | null;
    telegramChannelIds: string[];
  }) => void;
}) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!open) return;
    setName(network?.name || "");
    setDescription(network?.description || "");
    setSelectedIds(network?.channels.map((channel) => channel.id) || []);
    setError("");
  }, [network, open]);

  const selectedSet = useMemo(() => new Set(selectedIds), [selectedIds]);
  const toggleChannel = (id: string) => {
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id],
    );
  };
  const submit = () => {
    const trimmedName = name.trim();
    if (!trimmedName) {
      setError("Name is required.");
      return;
    }
    if (selectedIds.length < 2) {
      setError("Network must contain at least 2 channels.");
      return;
    }
    onSubmit({
      name: trimmedName,
      description: description.trim() || null,
      telegramChannelIds: selectedIds,
    });
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={network ? "Edit network" : "Create network"}
    >
      <div className="space-y-4">
        <FormField label="Name" required>
          <Input value={name} onChange={(event) => setName(event.target.value)} />
        </FormField>
        <FormField label="Description">
          <Textarea
            value={description}
            onChange={(event) => setDescription(event.target.value)}
          />
        </FormField>
        <div>
          <p className="mb-2 text-sm font-medium text-slate-200">Channels</p>
          <div className="max-h-72 space-y-2 overflow-auto rounded-lg border border-slate-800 p-2">
            {channels.map((channel) => (
              <ChannelSelectRow
                key={channel.id}
                channel={channel}
                checked={selectedSet.has(channel.id)}
                onToggle={() => toggleChannel(channel.id)}
              />
            ))}
            {!channels.length ? (
              <p className="p-2 text-sm text-slate-400">
                No own channels available.
              </p>
            ) : null}
          </div>
          {error ? <p className="mt-2 text-sm text-rose-300">{error}</p> : null}
        </div>
        <div className="flex justify-end gap-2">
          <Button type="button" variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button type="button" disabled={isSubmitting} onClick={submit}>
            {isSubmitting ? "Saving..." : "Save"}
          </Button>
        </div>
      </div>
    </Modal>
  );
}

function ChannelSelectRow({
  channel,
  checked,
  onToggle,
}: {
  channel: TelegramChannel;
  checked: boolean;
  onToggle: () => void;
}) {
  const username = channel.username
    ? `@${String(channel.username).replace(/^@/, "")}`
    : "";
  return (
    <label
      className={`flex items-center gap-3 rounded-md border p-2 text-sm transition ${
        checked
          ? "border-blue-700 bg-slate-900"
          : "border-slate-800 bg-slate-900/30 hover:border-slate-700"
      }`}
    >
      <input
        type="checkbox"
        checked={checked}
        onChange={onToggle}
        className="h-4 w-4 shrink-0"
      />
      <TelegramEntityAvatar
        imageUrl={channel.photoUrl}
        kind="channel"
        alt={channel.title}
        size="md"
      />
      <div className="min-w-0 flex-1">
        <p className="truncate font-semibold leading-tight text-slate-100">
          {channel.title}
        </p>
        {username ? (
          <p className="mt-0.5 truncate text-xs text-slate-400">{username}</p>
        ) : null}
      </div>
    </label>
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
