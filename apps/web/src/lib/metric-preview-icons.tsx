import type { LucideIcon } from "lucide-react";
import {
  BadgeDollarSign,
  CalendarRange,
  Eye,
  EyeOff,
  MessageCircleMore,
  Percent,
  Sparkles,
  TrendingDown,
  TrendingUp,
  UserCheck,
  UserMinus,
  UserPlus,
  Users,
  UserX,
} from "lucide-react";

function normalizeMetricToken(value: string) {
  return value.trim().toLowerCase().replace(/[^a-z0-9]+/g, " ");
}

type MetricIconMatch = {
  tokens: string[];
  icon: LucideIcon;
  toneClassName?: string;
};

const metricIconMatches: MetricIconMatch[] = [
  { tokens: ["ad spend", "total spend", "spend", "cost"], icon: TrendingDown, toneClassName: "text-rose-300" },
  { tokens: ["cpm", "cpa", "price", "revenue", "outstanding", "underpricing"], icon: BadgeDollarSign, toneClassName: "text-emerald-300" },
  { tokens: ["views", "view rate", "err"], icon: Eye, toneClassName: "text-sky-300" },
  { tokens: ["subscribers", "joined", "attributed"], icon: Users, toneClassName: "text-violet-300" },
  { tokens: ["active subscribers", "active estimate", "active"], icon: UserCheck, toneClassName: "text-emerald-300" },
  { tokens: ["known fake subscribers", "fake subscribers"], icon: UserX, toneClassName: "text-rose-300" },
  { tokens: ["inactive subscribers", "inactive"], icon: UserMinus, toneClassName: "text-amber-300" },
  { tokens: ["pending requests", "pending"], icon: UserPlus, toneClassName: "text-amber-300" },
  { tokens: ["placements", "slots", "upcoming"], icon: CalendarRange, toneClassName: "text-blue-300" },
  { tokens: ["reactions"], icon: Sparkles, toneClassName: "text-fuchsia-300" },
  { tokens: ["comments"], icon: MessageCircleMore, toneClassName: "text-cyan-300" },
  { tokens: ["fill rate", "rate"], icon: Percent, toneClassName: "text-teal-300" },
  { tokens: ["underpricing loss"], icon: TrendingDown, toneClassName: "text-rose-300" },
  { tokens: ["growth", "trend"], icon: TrendingUp, toneClassName: "text-emerald-300" },
];

const metricKeyMatches: Record<string, MetricIconMatch> = {
  subscribers: { tokens: [], icon: Users, toneClassName: "text-violet-300" },
  avgViews: { tokens: [], icon: Eye, toneClassName: "text-sky-300" },
  views: { tokens: [], icon: Eye, toneClassName: "text-sky-300" },
  active: { tokens: [], icon: UserCheck, toneClassName: "text-emerald-300" },
  cpa: { tokens: [], icon: BadgeDollarSign, toneClassName: "text-emerald-300" },
  err: { tokens: [], icon: Percent, toneClassName: "text-teal-300" },
  reactions: { tokens: [], icon: Sparkles, toneClassName: "text-fuchsia-300" },
  comments: { tokens: [], icon: MessageCircleMore, toneClassName: "text-cyan-300" },
  joined: { tokens: [], icon: UserPlus, toneClassName: "text-amber-300" },
  posts: { tokens: [], icon: EyeOff, toneClassName: "text-slate-300" },
  forwards: { tokens: [], icon: TrendingUp, toneClassName: "text-blue-300" },
};

export function resolveMetricPreviewIcon(params: {
  label: string;
  metricKey?: string;
}) {
  const normalizedLabel = normalizeMetricToken(params.label);
  if (params.metricKey && metricKeyMatches[params.metricKey]) {
    return metricKeyMatches[params.metricKey];
  }
  return (
    metricIconMatches.find((entry) =>
      entry.tokens.some((token) => normalizedLabel.includes(token)),
    ) ?? null
  );
}

export function MetricPreviewLabel({
  label,
  metricKey,
  className = "text-sm text-neutral-400",
}: {
  label: string;
  metricKey?: string;
  className?: string;
}) {
  const preview = resolveMetricPreviewIcon({ label, metricKey });
  const Icon = preview?.icon;
  return (
    <span className={`inline-flex items-center gap-2 ${className}`}>
      {Icon ? (
        <Icon
          size={14}
          className={preview?.toneClassName ?? "text-neutral-400"}
          aria-hidden="true"
        />
      ) : null}
      <span>{label}</span>
    </span>
  );
}
