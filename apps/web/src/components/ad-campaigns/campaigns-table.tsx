"use client";

import { type MouseEventHandler, type ReactNode, useMemo, useState } from "react";
import { TrendingUp } from "lucide-react";
import { Line, LineChart, ResponsiveContainer } from "recharts";
import { CampaignAdmissionViewAnalyticsModal } from "@/components/ad-campaigns/campaign-admission-view-analytics-modal";
import { CampaignInviteLinkHistoryModal } from "@/components/ad-campaigns/campaign-invite-link-history-modal";
import { PromoPreviewModal } from "@/components/ad-campaigns/promo-preview-modal";
import { IconAvatar } from "@/components/icons/icon-avatar";
import { IconButton } from "@/components/ui/primitives";
import { InviteLinkPreviewModal } from "@/components/telegram/invite-link-preview-modal";
import {
  MetricPreviewLabel,
  resolveMetricPreviewIcon,
} from "@/lib/metric-preview-icons";
import { getMoneyPreview } from "@/lib/money";
import type {
  AdCampaign,
  AdCampaignKpiStatus,
  Promo,
  TelegramChannel,
  TelegramInviteLink,
} from "@/lib/api";

function InviteLinkCreatorAvatar({
  inviteLink,
}: {
  inviteLink: TelegramInviteLink;
}) {
  if (inviteLink.creatorMember) {
    return (
      <IconAvatar
        icon={inviteLink.creatorMember.avatarPresentation}
        label={inviteLink.creatorMember.user?.name || inviteLink.name}
        size="xs"
        className="rounded-full"
      />
    );
  }
  if (inviteLink.creatorPhotoUrl) {
    return (
      <img
        src={inviteLink.creatorPhotoUrl}
        alt=""
        className="h-4 w-4 shrink-0 rounded-full object-cover"
      />
    );
  }
  return (
    <span className="inline-flex h-4 w-4 shrink-0 items-center justify-center rounded-full border border-slate-700 text-[10px] text-slate-400">
      {String(
        inviteLink.creatorFirstName ||
          inviteLink.creatorUsername ||
          inviteLink.name ||
          "A",
      )
        .slice(0, 1)
        .toUpperCase()}
    </span>
  );
}

function formatMetric(value: unknown, decimals = 0) {
  if (value == null || !Number.isFinite(Number(value))) return "-";
  return Number(value).toLocaleString(undefined, {
    maximumFractionDigits: decimals,
    minimumFractionDigits: decimals,
  });
}

function formatPercent(value: unknown, decimals = 1) {
  if (value == null || !Number.isFinite(Number(value))) return "-";
  return `${formatMetric(value, decimals)}%`;
}

function moneyBreakdown(
  amount: number | null,
  currency: string,
  moneySettings: any,
  rates: any[] | undefined,
) {
  return getMoneyPreview({ amount, currency, settings: moneySettings, rates })
    .map((item, index) => ({
      currency: item.currency,
      label: item.amount == null ? null : `${index === 0 ? "" : "≈ "}${item.label}`,
      isMain: index === 0,
    }))
    .filter((item) => item.label != null);
}

function numberOrNull(value: unknown) {
  if (value == null) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function isInRange(value: number, from: number | null, to: number | null) {
  if (from == null && to == null) return false;
  if (from != null && value < from) return false;
  if (to != null && value > to) return false;
  return true;
}

function calculatedKpiStatus(
  value: number | null,
  channel?: AdCampaign["telegramChannel"],
): AdCampaignKpiStatus {
  if (value == null || !channel) return "unknown";
  const targetFrom = numberOrNull(channel.targetCpaFrom);
  const target = numberOrNull(channel.targetCpa);
  const acceptableFrom = numberOrNull(channel.acceptableCpaFrom);
  const acceptable = numberOrNull(channel.acceptableCpa);
  const stopFrom =
    numberOrNull(channel.stopCpaFrom) ?? numberOrNull(channel.stopCpa);
  if (
    targetFrom == null &&
    target == null &&
    acceptableFrom == null &&
    acceptable == null &&
    stopFrom == null
  ) {
    return "unknown";
  }
  if (isInRange(value, targetFrom, target)) return "good";
  if (isInRange(value, acceptableFrom, acceptable)) return "acceptable";
  if (isInRange(value, stopFrom, null)) return "bad";
  return "unknown";
}

function effectiveCampaignKpiStatus(
  campaign: AdCampaign,
  primaryCostPerJoined: number | null,
  costPerJoined: number | null,
): AdCampaignKpiStatus {
  return calculatedKpiStatus(
    primaryCostPerJoined ?? costPerJoined,
    campaign.telegramChannel,
  );
}

function resolveCampaignCustomTitle(
  customTitleTemplate?: string | null,
  dateValue?: string | null,
) {
  const template = String(customTitleTemplate ?? "").trim();
  if (!template) return "";
  if (!dateValue) return template.replace(/\[date\]/gi, "").trim();
  return template.replace(/\[date\]/gi, dateValue).trim();
}

function displayCampaignTitle(campaign: AdCampaign) {
  const date = toInputDate(
    campaign?.placementDate || campaign?.startedAt || (campaign as any)?.createdAt,
  );
  const customTitle = resolveCampaignCustomTitle(
    campaign?.customTitleTemplate,
    date,
  );
  if (customTitle) return customTitle;
  let title = String(campaign?.title || "").trim();
  title = title.replace(/^Telegram ad campaign:\s*/i, "").trim();
  if (date) {
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

function displayCampaignTitleWithDate(campaign: AdCampaign) {
  if (String(campaign?.customTitleTemplate || "").trim()) {
    return displayCampaignTitle(campaign);
  }
  const date = toInputDate(
    campaign?.placementDate || campaign?.startedAt || (campaign as any)?.createdAt,
  );
  return date ? `${date} | ${displayCampaignTitle(campaign)}` : displayCampaignTitle(campaign);
}

function generatedCampaignDisplayTitle(campaign: AdCampaign) {
  const sources = (campaign?.advertisingChannels || [])
    .map((source: any) => source.title || source.name)
    .filter(Boolean);
  const promo = campaign?.promo?.title;
  const parts = [...sources.slice(0, 2), promo].filter(Boolean);
  if (parts.length) return [...new Set(parts)].join(" | ");
  return campaign?.telegramChannel?.title || "Campaign";
}

function toInputDate(value?: string | null) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function hasValue(value: unknown) {
  return value != null && Number.isFinite(Number(value));
}

function campaignMetrics(campaign: AdCampaign) {
  const metrics = [
    {
      label: "New subs",
      value: (campaign as any)?.newSubscribers,
      format: (value: unknown) => formatMetric(value),
    },
    {
      label: "Raw uplift",
      value: (campaign as any)?.rawActiveSubscribersFromAd,
      format: (value: unknown) => formatMetric(value),
    },
    {
      label: "Active CPA",
      value: (campaign as any)?.cappedActiveCpa ?? (campaign as any)?.activeCpa,
      format: (value: unknown) => formatMetric(value, 2),
    },
    {
      label: "Retention 7d",
      value: (campaign as any)?.retention7d,
      format: (value: unknown) => formatPercent(value),
    },
  ];

  return metrics
    .filter((metric) => hasValue(metric.value))
    .map((metric) => ({ label: metric.label, value: metric.format(metric.value) }));
}

function kpiMetricTextClass(status?: AdCampaignKpiStatus | null) {
  if (status === "good") return "text-emerald-300";
  if (status === "acceptable") return "text-yellow-200";
  if (status === "bad") return "text-rose-200";
  return "text-white";
}

function performanceCardClass(status?: AdCampaignKpiStatus | null) {
  if (status === "good") return "border-emerald-700/70 bg-emerald-950/20";
  if (status === "acceptable") return "border-yellow-700/70 bg-yellow-950/20";
  if (status === "bad") return "border-rose-700/70 bg-rose-950/20";
  return "border-slate-800 bg-slate-950/40";
}

function kpiStatusClass(status?: AdCampaignKpiStatus | null) {
  if (status === "good")
    return "border-emerald-700 bg-emerald-950/20 text-emerald-200";
  if (status === "acceptable")
    return "border-yellow-700 bg-yellow-950/20 text-yellow-200";
  if (status === "bad") return "border-rose-700 bg-rose-950/20 text-rose-200";
  return "border-slate-700 bg-slate-950/30 text-slate-300";
}

function kpiStatusLabel(status?: AdCampaignKpiStatus | null) {
  if (status === "good") return "KPI hit";
  if (status === "acceptable") return "KPI ok";
  if (status === "bad") return "KPI missed";
  return "KPI unknown";
}

function kpiStatusTitle(status?: AdCampaignKpiStatus | null) {
  if (status === "good") return "CPA is inside target KPI range.";
  if (status === "acceptable") return "CPA is inside acceptable KPI range.";
  if (status === "bad") return "CPA is inside stop KPI range.";
  return "KPI range or enough CPA data is missing.";
}

function formatKpiRange(
  from?: number | string | null,
  to?: number | string | null,
  openEnded = false,
) {
  const fromValue = numberOrNull(from);
  const toValue = numberOrNull(to);
  if (openEnded && fromValue != null) return `${formatMetric(fromValue, 2)}+`;
  if (fromValue != null && toValue != null) {
    return `${formatMetric(fromValue, 2)}-${formatMetric(toValue, 2)}`;
  }
  if (fromValue != null) return `${formatMetric(fromValue, 2)}+`;
  if (toValue != null) return `≤${formatMetric(toValue, 2)}`;
  return "-";
}

function hypothesisStatusClass(status?: string) {
  if (status === "winner") return "border-emerald-700 text-emerald-200";
  if (status === "loser") return "border-rose-700 text-rose-200";
  if (status === "paused") return "border-yellow-700 text-yellow-200";
  if (status === "archived") return "border-slate-700 text-slate-400";
  return "border-blue-700 text-blue-200";
}

function PromoVisual({ promo }: { promo: Promo }) {
  return <IconAvatar icon={promo.iconPresentation} label={promo.title} size="xs" bordered={false} className="!bg-transparent" />;
}

function SourceChip({
  source,
  fallback,
  compact = false,
  href,
  title,
}: {
  source: any;
  fallback?: string;
  compact?: boolean;
  href?: string;
  title?: string;
}) {
  const label = source?.title || source?.name || fallback || "-";
  const content = (
    <>
      {source?.photoUrl || source?.imageUrl ? (
        <img
          src={source.photoUrl || source.imageUrl}
          alt=""
          className={`${compact ? "h-4 w-4" : "h-5 w-5"} shrink-0 rounded-full object-cover`}
        />
      ) : (
        <span
          className={`${compact ? "h-4 w-4" : "h-5 w-5"} inline-flex shrink-0 items-center justify-center rounded-full border border-slate-700 text-[10px] text-slate-400`}
        >
          {String(label).slice(0, 1).toUpperCase()}
        </span>
      )}
      <span className="truncate">{label}</span>
    </>
  );
  if (!href) {
    return (
      <span
        className={`inline-flex items-center gap-2 ${compact ? "max-w-[200px]" : "max-w-[220px]"}`}
        title={title}
      >
        {content}
      </span>
    );
  }
  return (
    <a
      href={href}
      title={title}
      className={`inline-flex items-center gap-2 transition-colors hover:text-white ${compact ? "max-w-[200px]" : "max-w-[220px]"}`}
    >
      {content}
    </a>
  );
}

function MemberChip({
  member,
}: {
  member: NonNullable<AdCampaign["assignedMember"]>;
}) {
  const label = member.user?.name || "Member";
  const avatarImageUrl = member.avatarPresentation?.type === "image" ? member.avatarPresentation.url : undefined;
  const avatarEmoji = member.avatarPresentation?.type === "unicode" ? member.avatarPresentation.value : undefined;
  return (
    <a
      href="/workspace-members"
      title={`Assigned member: ${label}\nClick to open workspace members.\nCtrl/Cmd + click opens it in a new tab.`}
      className="inline-flex max-w-[220px] items-center gap-1.5 rounded-full border border-slate-700/80 bg-slate-900/70 px-2 py-1 text-xs text-slate-200 transition-colors hover:border-slate-500 hover:text-white"
    >
      {avatarImageUrl ? (
        <img
          src={avatarImageUrl}
          alt=""
          className="h-4 w-4 shrink-0 rounded-full object-cover"
        />
      ) : null}
      {!avatarImageUrl && avatarEmoji ? (
        <span className="inline-flex h-4 w-4 shrink-0 items-center justify-center text-[12px] leading-none">
          {avatarEmoji}
        </span>
      ) : null}
      {!avatarImageUrl && !avatarEmoji ? (
        <span className="inline-flex h-4 w-4 shrink-0 items-center justify-center rounded-full border border-slate-600 text-[10px] text-slate-400">
          {label.slice(0, 1).toUpperCase()}
        </span>
      ) : null}
      <span className="truncate">{label}</span>
    </a>
  );
}

function KpiRangeChip({
  tone,
  label,
}: {
  tone: "target" | "ok" | "stop";
  label: string;
}) {
  const className = {
    target: "border-emerald-700 bg-emerald-950/50 text-emerald-200",
    ok: "border-yellow-700 bg-yellow-950/50 text-yellow-200",
    stop: "border-rose-700 bg-rose-950/50 text-rose-200",
  }[tone];
  return <span className={`rounded border px-2 py-1 ${className}`}>{label}</span>;
}

function KpiTooltip({
  channel,
  left,
  top,
}: {
  channel: TelegramChannel;
  left: number;
  top: number;
}) {
  return (
    <div
      className="fixed z-[80] rounded-lg border border-slate-700 bg-neutral-950 px-3 py-2 shadow-2xl"
      style={{ left, top, width: 430 }}
    >
      <div className="flex flex-wrap items-center gap-2 text-sm font-semibold">
        <span className="text-white">KPI $:</span>
        <KpiRangeChip
          tone="target"
          label={`target ${formatKpiRange(channel.targetCpaFrom, channel.targetCpa)}`}
        />
        <KpiRangeChip
          tone="ok"
          label={`ok ${formatKpiRange(channel.acceptableCpaFrom, channel.acceptableCpa)}`}
        />
        <KpiRangeChip
          tone="stop"
          label={`stop ${formatKpiRange(
            channel.stopCpaFrom ?? channel.stopCpa,
            null,
            true,
          )}`}
        />
      </div>
    </div>
  );
}

function KpiStatusBadge({
  status,
  onMouseEnter,
  onMouseLeave,
}: {
  status?: AdCampaignKpiStatus | null;
  onMouseEnter?: MouseEventHandler<HTMLSpanElement>;
  onMouseLeave?: MouseEventHandler<HTMLSpanElement>;
}) {
  return (
    <span
      className={`inline-flex rounded border px-2 py-0.5 text-xs ${kpiStatusClass(status)} ${status && status !== "unknown" && onMouseEnter ? "cursor-help" : ""}`}
      title={kpiStatusTitle(status)}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
    >
      {kpiStatusLabel(status)}
    </span>
  );
}

function PerformanceCell({
  campaign,
  cost,
  currency,
  primaryCost,
  costPerJoined,
  primaryCostPerJoined,
  joined,
  pending,
  attributed,
  left,
  moneySettings,
  rates,
  kpiStatus,
  metrics,
  onShowKpiTooltip,
  onHideKpiTooltip,
  onOpenHistory,
  onOpenAdmissionAnalytics,
}: {
  campaign: AdCampaign;
  cost: number;
  currency: string;
  primaryCost: number;
  costPerJoined: number | null;
  primaryCostPerJoined: number | null;
  joined: number;
  pending: number;
  attributed: number;
  left: number;
  moneySettings: any;
  rates: any[] | undefined;
  kpiStatus: AdCampaignKpiStatus;
  metrics: Array<{ label: string; value: string }>;
  onShowKpiTooltip: (channel: TelegramChannel | undefined, element: HTMLElement) => void;
  onHideKpiTooltip: () => void;
  onOpenHistory?: () => void;
  onOpenAdmissionAnalytics?: () => void;
}) {
  const kpiTextClass = kpiMetricTextClass(kpiStatus);
  const cardClass = performanceCardClass(kpiStatus);
  const shouldShowKpiTooltip =
    kpiStatus === "good" || kpiStatus === "acceptable" || kpiStatus === "bad";
  const peakJoined = joined + Math.max(0, left);
  const unsubscribedPercent =
    peakJoined > 0 ? (Math.max(0, left) / peakJoined) * 100 : 0;
  const historySummary = campaign.inviteLinkHistory?.summary ?? null;
  const historyPeakAttributed = Number(historySummary?.peakTotalAttributed ?? 0);
  const historyCurrentAttributed = Number(
    historySummary?.currentTotalAttributed ?? 0,
  );
  const historyCurrentJoined = Number(historySummary?.currentJoinedCount ?? 0);
  const historyDropPercent = Number(historySummary?.drawdownPercent ?? 0);
  const historyDropAbsolute = Number(historySummary?.drawdownFromPeak ?? 0);
  const resolvedPeakAttributed =
    historyPeakAttributed > 0 ? historyPeakAttributed : attributed;
  const resolvedCurrentAttributed =
    historyCurrentAttributed > 0 ? historyCurrentAttributed : attributed;
  const resolvedCurrentJoined =
    historyCurrentJoined > 0 ? historyCurrentJoined : joined;
  const resolvedDropPercent =
    historySummary != null ? historyDropPercent : unsubscribedPercent;
  const resolvedDropAbsolute =
    historySummary != null ? historyDropAbsolute : Math.max(0, left);
  const showTrendDelta = resolvedPeakAttributed > resolvedCurrentAttributed;
  const peakPrimaryCostPerJoined =
    resolvedPeakAttributed > 0 ? primaryCost / resolvedPeakAttributed : null;
  const peakCostPerJoined =
    resolvedPeakAttributed > 0 ? cost / resolvedPeakAttributed : null;
  const showPeakCost =
    showTrendDelta &&
    peakPrimaryCostPerJoined != null &&
    primaryCostPerJoined != null &&
    Math.abs(peakPrimaryCostPerJoined - primaryCostPerJoined) >= 0.005;
  const spendBreakdown = moneyBreakdown(cost, currency, moneySettings, rates);
  const cpaBreakdown =
    costPerJoined != null
      ? moneyBreakdown(costPerJoined, currency, moneySettings, rates)
      : [];
  const peakCpaBreakdown =
    peakCostPerJoined != null
      ? moneyBreakdown(
          peakCostPerJoined,
          currency,
          moneySettings,
          rates,
        )
      : [];

  return (
    <div className={`rounded-xl border p-3 ${cardClass}`}>
      <div className="mb-3 flex flex-wrap items-start justify-between gap-2">
        <KpiStatusBadge
          status={kpiStatus}
          onMouseEnter={(event) => {
            if (!shouldShowKpiTooltip) return;
            onShowKpiTooltip(campaign.telegramChannel, event.currentTarget);
          }}
          onMouseLeave={() => {
            if (!shouldShowKpiTooltip) return;
            onHideKpiTooltip();
          }}
        />
      </div>
      <div className="grid grid-cols-[minmax(90px,1fr)_minmax(70px,0.7fr)_minmax(80px,0.8fr)] gap-3">
        <div>
          <p className="mb-1 text-[10px] uppercase tracking-wide text-slate-500">
            Spend
          </p>
          <div>
            <p className="font-semibold leading-snug text-white">
              {spendBreakdown[0]?.label ?? "-"}
            </p>
            <div className="text-xs leading-snug text-slate-500">
              {spendBreakdown.slice(1).map((item) => (
                <div key={item.currency}>{item.label}</div>
              ))}
            </div>
          </div>
        </div>
        <div>
          <p className="mb-1 text-[10px] uppercase tracking-wide text-slate-500">
            Attributed
          </p>
          <p className={`font-semibold leading-snug ${kpiTextClass}`}>
            {formatMetric(attributed)}
          </p>
          <div className="mt-1 space-y-0.5 text-xs leading-snug text-slate-500">
            <p>Joined {formatMetric(resolvedCurrentJoined)}</p>
            <p>Pending {formatMetric(pending)}</p>
          </div>
        </div>
        <div>
          <p className="mb-1 text-[10px] uppercase tracking-wide text-slate-500">
            CPA
          </p>
          {cpaBreakdown.length ? (
            <div>
              <p className={`font-semibold leading-snug ${kpiTextClass}`}>
                {cpaBreakdown[0]?.label ?? "-"}
              </p>
              <div className="text-xs leading-snug text-slate-500">
                {cpaBreakdown.slice(1).map((item) => (
                  <div key={item.currency}>{item.label}</div>
                ))}
              </div>
            </div>
          ) : (
            <p className="text-slate-500">-</p>
          )}
          {showPeakCost ? (
            <div className="mt-1 space-y-0.5 text-xs leading-snug text-slate-500">
              <p>Peak {peakCpaBreakdown[0]?.label ?? "-"}</p>
            </div>
          ) : null}
        </div>
      </div>
      {metrics.length ? (
        <div className="mt-3 flex flex-wrap gap-1.5">
          {metrics.slice(0, 4).map((metric) => (
            <span
              key={metric.label}
              className="rounded border border-slate-700/80 bg-black/20 px-2 py-0.5 text-xs text-slate-200"
            >
              {metric.label}: {metric.value}
            </span>
          ))}
        </div>
      ) : null}
      {campaign.inviteLinks?.length ? (
        <div className="mt-3">
          <div className="mb-2 flex flex-wrap items-center gap-1.5 text-xs">
            {showTrendDelta ? (
              <span className="rounded border border-slate-700/80 bg-black/20 px-2 py-0.5 text-slate-200">
                Peak {formatMetric(resolvedPeakAttributed)}
              </span>
            ) : null}
            {resolvedDropPercent > 0 ? (
              <span className="rounded border border-amber-700/80 bg-amber-950/20 px-2 py-0.5 text-amber-200">
                Drop {formatPercent(resolvedDropPercent)}
                {resolvedDropAbsolute > 0
                  ? ` · ${formatMetric(resolvedDropAbsolute)}`
                  : ""}
              </span>
            ) : null}
            <button
              type="button"
              onClick={onOpenHistory}
              className="inline-flex items-center gap-1 rounded-full border border-slate-700 px-2.5 py-0.5 text-xs text-slate-200 transition-colors hover:border-slate-500 hover:text-white"
              title="Open invite-link history for this campaign"
            >
              <TrendingUp size={12} />
              Trend
            </button>
          </div>
        </div>
      ) : null}
      <AdmissionViewUpliftBlock
        campaign={campaign}
        onOpenDetails={onOpenAdmissionAnalytics}
      />
    </div>
  );
}

function AdmissionViewUpliftBlock({
  campaign,
  onOpenDetails,
}: {
  campaign: AdCampaign;
  onOpenDetails?: () => void;
}) {
  const analytics = campaign.admissionViewAnalytics;
  const batch = analytics?.latestBatch;
  if (!batch) return null;
  const isBootstrap = batch.detectionMode === "BOOTSTRAPPED_CUMULATIVE";
  const isObserved = batch.baselineMethod === "EARLIEST_OBSERVED";
  const hasBaseline = batch.baselineAvgViews != null;
  const currentAvgViews = batch.currentAvgViews;
  const uplift = batch.cumulativeAvgViewsUplift;
  const incremental = batch.incrementalAvgViewsUplift;
  const qualityWarning =
    batch.dataQuality !== "GOOD" ? batch.dataQualityReason || batch.dataQuality : null;
  const sparklinePoints = (analytics?.points || [])
    .map((point, index) => ({
      index,
      value: point.cumulativeAvgViewsUplift ?? 0,
    }))
    .filter((point) => Number.isFinite(point.value));

  return (
    <div className="mt-3 border-t border-slate-800 pt-3">
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-1.5">
          <MetricPreviewLabel
            label="View uplift"
            metricKey="views"
            className="text-xs font-semibold text-slate-100"
          />
          <span
            className="rounded border border-slate-700 px-1.5 py-0.5 text-[10px] uppercase text-slate-400"
            title={
              isBootstrap
                ? "Reconstructed from the first available invite-link snapshot."
                : "Detected from a positive joined-count delta between two invite-link snapshots."
            }
          >
            {isBootstrap ? "Reconstructed" : "Exact"}
          </span>
        </div>
        {onOpenDetails ? (
          <button
            type="button"
            onClick={onOpenDetails}
            className="text-xs text-slate-300 hover:text-white"
          >
            Details
          </button>
        ) : null}
      </div>
      <div className="grid grid-cols-[1fr_auto] gap-3">
        <div className="space-y-1.5 text-xs text-slate-400">
          <MetricRow
            label={isBootstrap ? "Joined before first tracked sync" : "Joined"}
            metricKey="joined"
          >
            <span className="text-slate-100">
              +{formatMetric(batch.releasedSubscribersCount)}
            </span>
          </MetricRow>
          {hasBaseline && currentAvgViews != null ? (
            <MetricRow
              label={isObserved ? "Observed avg views" : "Avg views"}
              metricKey="views"
            >
              <span className="text-slate-100">
                {formatMetric(batch.baselineAvgViews)} → {formatMetric(currentAvgViews)}
              </span>
            </MetricRow>
          ) : null}
          {uplift != null ? (
            <MetricRow
              label={isObserved ? "Observed view growth" : "View uplift"}
              metricKey="views"
            >
              <span className="text-emerald-200">+{formatMetric(uplift)}</span>
              {incremental != null ? (
                <span className="text-slate-500"> · Last sync +{formatMetric(incremental)}</span>
              ) : null}
            </MetricRow>
          ) : (
            <p>View growth: not enough historical post data</p>
          )}
          {batch.estimatedActiveSubscribers != null ? (
            <MetricRow label="Estimated active" metricKey="active">
              <span className="text-slate-100">
                {formatMetric(batch.estimatedActiveSubscribers)} /{" "}
                {formatMetric(batch.releasedSubscribersCount)}
              </span>
              {batch.activationRate != null ? (
                <span className="text-slate-500">
                  {" "}
                  · {isBootstrap ? "Activation estimate" : "Activation"}{" "}
                  {formatPercent(batch.activationRate)}
                </span>
              ) : null}
            </MetricRow>
          ) : null}
          {qualityWarning ? (
            <p className="text-amber-200">{qualityWarning}</p>
          ) : null}
        </div>
        {sparklinePoints.length > 1 ? (
          <div className="h-14 w-24">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={sparklinePoints}>
                <Line
                  type="monotone"
                  dataKey="value"
                  stroke="#34d399"
                  strokeWidth={2}
                  dot={false}
                  isAnimationActive={false}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        ) : null}
      </div>
    </div>
  );
}

function MetricRow({
  label,
  metricKey,
  children,
}: {
  label: string;
  metricKey: string;
  children: ReactNode;
}) {
  const preview = resolveMetricPreviewIcon({ label, metricKey });
  const Icon = preview?.icon;
  return (
    <div className="grid grid-cols-[18px_minmax(96px,max-content)_minmax(0,1fr)] items-center gap-x-2 text-xs leading-5">
      <span className="flex h-5 w-[18px] items-center justify-center">
        {Icon ? (
          <Icon
            size={14}
            className={preview?.toneClassName ?? "text-slate-400"}
            aria-hidden="true"
          />
        ) : null}
      </span>
      <span className="flex h-5 items-center whitespace-nowrap text-slate-400">
        {label}
      </span>
      <span className="flex min-w-0 items-center text-slate-400">
        {children}
      </span>
    </div>
  );
}

function PromoList({
  promos,
  inline = false,
  onOpenPromo,
}: {
  promos: Promo[];
  inline?: boolean;
  onOpenPromo?: (promo: Promo) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const [previewPromo, setPreviewPromo] = useState<Promo | null>(null);
  if (!promos.length) return null;
  const visible = expanded ? promos : promos.slice(0, 3);
  const hiddenCount = Math.max(0, promos.length - visible.length);
  const content = (
    <>
      {visible.map((promo) => (
        <button
          key={promo.id}
          type="button"
          onClick={(event) => {
            if (event.metaKey || event.ctrlKey || !onOpenPromo) {
              if (event.metaKey || event.ctrlKey) {
                window.open(
                  `/ad-campaigns?view=promos&promoId=${promo.id}`,
                  "_blank",
                  "noopener,noreferrer",
                );
                return;
              }
              setPreviewPromo(promo);
              return;
            }
            onOpenPromo(promo);
          }}
          title={`Promo: ${promo.title}\nClick to open its preview modal.\nCtrl/Cmd + click opens it in a new tab.`}
          className="inline-flex max-w-[240px] items-center gap-1.5 rounded-full border border-blue-800 bg-blue-950/30 px-2.5 py-1 text-xs text-blue-100 transition-colors hover:bg-blue-950/50"
        >
          <PromoVisual promo={promo} />
          <span className="truncate">{promo.title}</span>
        </button>
      ))}
      {hiddenCount ? (
        <button
          type="button"
          onClick={() => setExpanded(true)}
          className="rounded-full border border-slate-700 px-2 py-1 text-xs text-slate-300 transition-colors hover:border-slate-500 hover:text-white"
          title={`Show ${hiddenCount} more promos`}
        >
          +{hiddenCount}
        </button>
      ) : null}
      <PromoPreviewModal
        promo={previewPromo}
        onClose={() => setPreviewPromo(null)}
      />
    </>
  );
  if (inline) return content;
  return <div className="flex max-w-full flex-wrap gap-1.5">{content}</div>;
}

function InviteLinkList({
  inviteLinks,
  inline = false,
}: {
  inviteLinks: TelegramInviteLink[];
  inline?: boolean;
}) {
  const [expanded, setExpanded] = useState(false);
  const [previewLink, setPreviewLink] = useState<TelegramInviteLink | null>(null);

  if (!inviteLinks.length) return null;
  const visible = expanded ? inviteLinks : inviteLinks.slice(0, 3);
  const hiddenCount = Math.max(0, inviteLinks.length - visible.length);

  const content = (
    <>
      {visible.map((inviteLink) => (
        <button
          key={inviteLink.id}
          type="button"
          onClick={(event) => {
            if (event.metaKey || event.ctrlKey) {
              window.open(inviteLink.url, "_blank", "noopener,noreferrer");
              return;
            }
            setPreviewLink(inviteLink);
          }}
          title={`Invite link: ${inviteLink.name}\nClick to open preview modal.\nCtrl/Cmd + click opens the invite link in a new tab.`}
          className="inline-flex max-w-[240px] items-center gap-1 rounded-full border border-amber-800 bg-amber-950/20 px-2 py-1 text-xs text-amber-100 transition-colors hover:bg-amber-950/35"
        >
          <InviteLinkCreatorAvatar inviteLink={inviteLink} />
          <span className="truncate">{inviteLink.name}</span>
        </button>
      ))}
      {hiddenCount ? (
        <button
          type="button"
          onClick={() => setExpanded(true)}
          className="rounded-full border border-slate-700 px-2 py-1 text-xs text-slate-300 transition-colors hover:border-slate-500 hover:text-white"
          title={`Show ${hiddenCount} more invite links`}
        >
          +{hiddenCount}
        </button>
      ) : null}
      <InviteLinkPreviewModal
        inviteLink={previewLink}
        onClose={() => setPreviewLink(null)}
      />
    </>
  );

  if (inline) return content;
  return <div className="flex max-w-full flex-wrap gap-1.5">{content}</div>;
}

function SourceList({ sources }: { sources: any[] }) {
  const [expanded, setExpanded] = useState(false);
  if (!sources.length) return null;
  const visible = expanded ? sources : sources.slice(0, 3);
  const hiddenCount = Math.max(0, sources.length - visible.length);
  return (
    <div className="flex max-w-full flex-wrap gap-1.5">
      {visible.map((source) => (
        <a
          key={source.selectionId || source.id}
          href={
            source.selectionId?.startsWith("source:")
              ? "/advertising-channels"
              : source.id
                ? `/telegram/channels/${source.id}`
                : "/advertising-channels"
          }
          title={`${source.selectionId?.startsWith("source:") ? "Advertising source" : "Telegram channel source"}: ${source.title || source.name}\nClick to open it.\nCtrl/Cmd + click opens it in a new tab.`}
          className="inline-flex max-w-[260px] items-center gap-1.5 rounded-full bg-slate-900 px-2 py-1 text-xs text-slate-200 ring-1 ring-slate-800 transition-colors hover:bg-slate-800"
        >
          {source.photoUrl || source.imageUrl ? (
            <img
              src={source.photoUrl || source.imageUrl}
              alt=""
              className="h-4 w-4 rounded-full object-cover"
            />
          ) : null}
          <span className="truncate">{source.title || source.name}</span>
        </a>
      ))}
      {hiddenCount ? (
        <button
          type="button"
          onClick={() => setExpanded(true)}
          className="rounded-full border border-slate-700 px-2 py-1 text-xs text-slate-300 transition-colors hover:border-slate-500 hover:text-white"
          title={`Show ${hiddenCount} more sources`}
        >
          +{hiddenCount}
        </button>
      ) : null}
    </div>
  );
}

function HypothesisLinks({ links }: { links: any[] }) {
  const [expanded, setExpanded] = useState(false);
  if (!links.length) return <span className="text-slate-500">-</span>;
  const visible = expanded ? links : links.slice(0, 2);
  const hiddenCount = Math.max(0, links.length - visible.length);
  return (
    <div className="flex min-w-0 max-w-full flex-wrap gap-1.5">
      {visible.map((link) => (
        <span
          key={link.hypothesis.id}
          className={`inline-flex min-w-0 max-w-full rounded-full border px-2 py-0.5 text-xs ${hypothesisStatusClass(link.hypothesis.status)}`}
        >
          <span className="truncate">{link.hypothesis.name}</span>
        </span>
      ))}
      {hiddenCount ? (
        <button
          type="button"
          onClick={() => setExpanded(true)}
          className="rounded-full border border-slate-700 px-2 py-0.5 text-xs text-slate-300 transition-colors hover:border-slate-500 hover:text-white"
          title={`Show ${hiddenCount} more hypotheses`}
        >
          +{hiddenCount}
        </button>
      ) : null}
    </div>
  );
}

export function AdCampaignsTable({
  campaigns,
  moneySettings,
  rates,
  onEdit,
  onDelete,
  onToggleExclude,
  onOpenPromo,
  showActions = true,
  showHypotheses = true,
}: {
  campaigns: AdCampaign[];
  moneySettings: any;
  rates: any[] | undefined;
  onEdit?: (campaign: AdCampaign) => void;
  onDelete?: (campaign: AdCampaign) => void;
  onToggleExclude?: (campaign: AdCampaign, excludeFromAnalytics: boolean) => void;
  onOpenPromo?: (promo: Promo) => void;
  showActions?: boolean;
  showHypotheses?: boolean;
}) {
  const [kpiTooltip, setKpiTooltip] = useState<{
    channel: TelegramChannel;
    left: number;
    top: number;
  } | null>(null);
  const [historyCampaign, setHistoryCampaign] = useState<AdCampaign | null>(null);
  const [admissionAnalyticsCampaign, setAdmissionAnalyticsCampaign] =
    useState<AdCampaign | null>(null);

  const normalizedCampaigns = useMemo(
    () =>
      campaigns.map((campaign) => {
        const inviteLinkJoined = Number(
          campaign.inviteLinks?.reduce(
            (sum, link) => sum + Number(link.joinedCount ?? 0),
            0,
          ) ?? 0,
        );
        const inviteLinkAttributed = Number(
          campaign.inviteLinks?.reduce(
            (sum, link) =>
              sum +
              Number(link.joinedCount ?? 0) +
              Number(link.requestedCount ?? 0),
            0,
          ) ?? 0,
        );
        const joined =
          inviteLinkJoined > 0
            ? inviteLinkJoined
            : Number(campaign.analytics?.joinedCount ?? campaign.joinedCount ?? 0);
        const pending =
          inviteLinkAttributed > 0
            ? Math.max(0, inviteLinkAttributed - inviteLinkJoined)
            : Number(campaign.analytics?.requestedCount ?? 0);
        const attributed =
          inviteLinkAttributed > 0
            ? inviteLinkAttributed
            : Number(campaign.analytics?.attributedCount ?? joined + pending);
        const net = campaign.analytics?.netGrowth ?? campaign.netGrowthCount ?? joined;
        const left = campaign.analytics?.leftCount ?? campaign.leftCount ?? 0;
        const cost = Number(campaign.price || campaign.costAmount || 0);
        const primaryCost = Number(campaign.priceInPrimaryCurrency ?? 0);
        const costPerJoined = attributed > 0 ? cost / attributed : null;
        const primaryCostPerJoined =
          attributed > 0 ? primaryCost / attributed : null;
        const metrics = campaignMetrics(campaign);
        const kpiStatus = effectiveCampaignKpiStatus(
          campaign,
          primaryCostPerJoined,
          costPerJoined,
        );
        return {
          campaign,
          joined,
          pending,
          attributed,
          net,
          left,
          cost,
          primaryCost,
          costPerJoined,
          primaryCostPerJoined,
          metrics,
          kpiStatus,
        };
      }),
    [campaigns],
  );

  const showKpiTooltip = (
    channel: TelegramChannel | undefined,
    element: HTMLElement,
  ) => {
    if (!channel) return;
    const rect = element.getBoundingClientRect();
    const width = 430;
    const left = Math.min(
      Math.max(16, rect.left),
      Math.max(16, window.innerWidth - width - 16),
    );
    const top = Math.min(rect.bottom + 10, Math.max(16, window.innerHeight - 96));
    setKpiTooltip({ channel, left, top });
  };

  return (
    <>
      <div className="table-scroll mb-5 w-full rounded-lg border border-neutral-800">
        <table className="w-full min-w-[1120px] table-fixed text-left text-sm">
          <colgroup>
            <col className="w-[420px]" />
            <col className="w-[360px]" />
            {showHypotheses ? <col className="w-[180px]" /> : null}
            {showActions ? <col className="w-[140px]" /> : null}
          </colgroup>
          <thead className="bg-slate-950 text-xs uppercase text-neutral-400">
            <tr>
              <th className="px-4 py-3 font-medium">Campaign</th>
              <th className="px-4 py-3 font-medium">
                Performance
              </th>
              {showHypotheses ? (
                <th className="px-4 py-3 font-medium">Hypotheses</th>
              ) : null}
              {showActions ? (
                <th className="px-4 py-3 text-right font-medium">Actions</th>
              ) : null}
            </tr>
          </thead>
          <tbody className="divide-y divide-neutral-800">
            {normalizedCampaigns.map((row, index) => (
              <tr
                key={row.campaign.id}
                id={`campaign-${row.campaign.id}`}
                className={`align-top text-slate-200 transition-colors hover:bg-neutral-900 ${index % 2 ? "bg-neutral-950" : "bg-black"}`}
              >
                <td className="px-4 py-4">
                  <div className="min-w-0 space-y-3">
                    <div className="truncate font-semibold text-white">
                      {displayCampaignTitleWithDate(row.campaign)}
                    </div>
                    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-500">
                      <SourceChip
                        source={row.campaign.telegramChannel}
                        fallback="-"
                        compact
                        href={
                          row.campaign.telegramChannel?.id
                            ? `/telegram/channels/${row.campaign.telegramChannel.id}`
                            : undefined
                        }
                        title={
                          row.campaign.telegramChannel?.title
                            ? `Own Telegram channel: ${row.campaign.telegramChannel.title}\nClick to open this channel.\nCtrl/Cmd + click opens it in a new tab.`
                            : undefined
                        }
                      />
                      {row.campaign.assignedMember ? (
                        <MemberChip member={row.campaign.assignedMember} />
                      ) : null}
                    </div>
                    <div className="flex max-w-full flex-wrap items-center gap-1.5">
                      <PromoList
                        promos={
                          row.campaign.promos || (row.campaign.promo ? [row.campaign.promo] : [])
                        }
                        onOpenPromo={onOpenPromo}
                        inline
                      />
                      <InviteLinkList
                        inviteLinks={row.campaign.inviteLinks || []}
                        inline
                      />
                    </div>
                    <SourceList sources={row.campaign.advertisingChannels || []} />
                  </div>
                </td>
                <td className="px-4 py-4">
                  <PerformanceCell
                    campaign={row.campaign}
                    cost={row.cost}
                    currency={row.campaign.currency}
                    primaryCost={row.primaryCost}
                    costPerJoined={row.costPerJoined}
                    primaryCostPerJoined={row.primaryCostPerJoined}
                    joined={row.joined}
                    pending={row.pending}
                    attributed={row.attributed}
                    left={row.left}
                    moneySettings={moneySettings}
                    rates={rates}
                    kpiStatus={row.kpiStatus}
                    metrics={row.metrics}
                    onShowKpiTooltip={showKpiTooltip}
                    onHideKpiTooltip={() => setKpiTooltip(null)}
                    onOpenHistory={() => setHistoryCampaign(row.campaign)}
                    onOpenAdmissionAnalytics={() =>
                      setAdmissionAnalyticsCampaign(row.campaign)
                    }
                  />
                </td>
                {showHypotheses ? (
                  <td className="px-4 py-4">
                    <HypothesisLinks links={row.campaign.hypothesisLinks || []} />
                  </td>
                ) : null}
                {showActions ? (
                  <td className="px-4 py-4">
                    <div className="flex min-w-[108px] items-center justify-end gap-2 whitespace-nowrap">
                      {onToggleExclude ? (
                        <label
                          className="flex items-center gap-1 text-xs text-slate-400"
                          title="Exclude from performance summary"
                        >
                          <input
                            type="checkbox"
                            checked={Boolean(row.campaign.excludeFromAnalytics)}
                            onChange={(event) =>
                              onToggleExclude(row.campaign, event.target.checked)
                            }
                          />
                        </label>
                      ) : null}
                      {onEdit ? (
                        <IconButton onClick={() => onEdit(row.campaign)} />
                      ) : null}
                      {onDelete ? (
                        <IconButton
                          kind="delete"
                          onClick={() => onDelete(row.campaign)}
                        />
                      ) : null}
                    </div>
                  </td>
                ) : null}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {kpiTooltip ? (
        <KpiTooltip
          channel={kpiTooltip.channel}
          left={kpiTooltip.left}
          top={kpiTooltip.top}
        />
      ) : null}
      <CampaignInviteLinkHistoryModal
        campaign={historyCampaign}
        onClose={() => setHistoryCampaign(null)}
      />
      <CampaignAdmissionViewAnalyticsModal
        campaign={admissionAnalyticsCampaign}
        onClose={() => setAdmissionAnalyticsCampaign(null)}
      />
    </>
  );
}
