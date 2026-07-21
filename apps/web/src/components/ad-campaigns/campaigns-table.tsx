"use client";

import { type MouseEventHandler, useMemo, useState } from "react";
import { CircleHelp } from "lucide-react";
import { MoneyStack } from "@/components/ui/money-stack";
import { IconButton } from "@/components/ui/primitives";
import { InviteLinkPreviewModal } from "@/components/telegram/invite-link-preview-modal";
import type {
  AdCampaign,
  AdCampaignKpiStatus,
  Promo,
  TelegramChannel,
  TelegramInviteLink,
} from "@/lib/api";

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

function displayCampaignTitle(campaign: AdCampaign) {
  const date = toInputDate(
    campaign?.placementDate || campaign?.startedAt || (campaign as any)?.createdAt,
  );
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
      label: "Active",
      value:
        (campaign as any)?.cappedActiveSubscribersFromAd ??
        (campaign as any)?.activeSubscribersFromAd,
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
  if (promo.icon?.imageUrl) {
    return (
      <img
        src={promo.icon.imageUrl}
        alt=""
        className="h-4 w-4 rounded-full object-cover"
      />
    );
  }
  if (promo.icon?.emoji) {
    return (
      <span className="inline-flex h-4 w-4 items-center justify-center text-[13px] leading-none">
        {promo.icon.emoji}
      </span>
    );
  }
  return null;
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
  const avatarImageUrl = member.avatarIcon?.imageUrl ?? undefined;
  const avatarEmoji = member.avatarIcon?.emoji ?? undefined;
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
  net,
  left,
  moneySettings,
  rates,
  kpiStatus,
  metrics,
  onShowKpiTooltip,
  onHideKpiTooltip,
}: {
  campaign: AdCampaign;
  cost: number;
  currency: string;
  primaryCost: number;
  costPerJoined: number | null;
  primaryCostPerJoined: number | null;
  joined: number;
  net: number;
  left: number;
  moneySettings: any;
  rates: any[] | undefined;
  kpiStatus: AdCampaignKpiStatus;
  metrics: Array<{ label: string; value: string }>;
  onShowKpiTooltip: (channel: TelegramChannel | undefined, element: HTMLElement) => void;
  onHideKpiTooltip: () => void;
}) {
  const kpiTextClass = kpiMetricTextClass(kpiStatus);
  const cardClass = performanceCardClass(kpiStatus);
  const shouldShowKpiTooltip =
    kpiStatus === "good" || kpiStatus === "acceptable" || kpiStatus === "bad";

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
          <MoneyStack
            amount={cost}
            currency={currency}
            settings={moneySettings}
            rates={rates}
            amountInPrimary={primaryCost}
            mainClassName="font-semibold leading-snug text-white"
            subClassName="text-xs leading-snug text-slate-500"
          />
        </div>
        <div>
          <p className="mb-1 text-[10px] uppercase tracking-wide text-slate-500">
            Joined
          </p>
          <p className={`font-semibold leading-snug ${kpiTextClass}`}>
            {formatMetric(joined)}
          </p>
          <p className="text-xs leading-snug text-slate-500">
            Net {formatMetric(net)}
            {left > 0 ? ` / left ${formatMetric(left)}` : ""}
          </p>
        </div>
        <div>
          <p className="mb-1 text-[10px] uppercase tracking-wide text-slate-500">
            CPA
          </p>
          {costPerJoined !== null ? (
            <MoneyStack
              amount={costPerJoined}
              currency={currency}
              settings={moneySettings}
              rates={rates}
              amountInPrimary={primaryCostPerJoined}
              mainClassName={`font-semibold leading-snug ${kpiTextClass}`}
              subClassName="text-xs leading-snug text-slate-500"
            />
          ) : (
            <p className="text-slate-500">-</p>
          )}
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
              window.open(
                `/ad-campaigns?view=promos&promoId=${promo.id}`,
                "_blank",
                "noopener,noreferrer",
              );
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
          {inviteLink.creatorMember?.avatarIcon?.imageUrl ? (
            <img
              src={inviteLink.creatorMember.avatarIcon.imageUrl}
              alt=""
              className="h-4 w-4 rounded-full object-cover"
            />
          ) : inviteLink.creatorPhotoUrl ? (
            <img
              src={inviteLink.creatorPhotoUrl}
              alt=""
              className="h-4 w-4 rounded-full object-cover"
            />
          ) : null}
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

  const normalizedCampaigns = useMemo(
    () =>
      campaigns.map((campaign) => {
        const joined =
          campaign.analytics?.joinedCount ?? campaign.joinedCount ?? 0;
        const net = campaign.analytics?.netGrowth ?? campaign.netGrowthCount ?? joined;
        const left = campaign.analytics?.leftCount ?? campaign.leftCount ?? 0;
        const cost = Number(campaign.price || campaign.costAmount || 0);
        const primaryCost = Number(campaign.priceInPrimaryCurrency ?? 0);
        const costPerJoined = joined > 0 ? cost / joined : null;
        const primaryCostPerJoined = joined > 0 ? primaryCost / joined : null;
        const metrics = campaignMetrics(campaign);
        const kpiStatus = effectiveCampaignKpiStatus(
          campaign,
          primaryCostPerJoined,
          costPerJoined,
        );
        return {
          campaign,
          joined,
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
              <th
                className="px-4 py-3 font-medium"
                title="Hover a campaign performance card to see this channel's KPI ranges."
              >
                <span className="inline-flex items-center gap-1">
                  Performance
                  <CircleHelp size={13} className="text-slate-500" />
                </span>
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
                    net={row.net}
                    left={row.left}
                    moneySettings={moneySettings}
                    rates={rates}
                    kpiStatus={row.kpiStatus}
                    metrics={row.metrics}
                    onShowKpiTooltip={showKpiTooltip}
                    onHideKpiTooltip={() => setKpiTooltip(null)}
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
    </>
  );
}
