"use client";

import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { InviteLinkHistoryPoint, InviteLinkHistorySummary } from "@/lib/api";

function formatNumber(value: unknown) {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed.toLocaleString() : "0";
}

function formatPercent(value: unknown) {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? `${parsed.toFixed(1)}%` : "0.0%";
}

function formatShortDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  const day = String(date.getDate()).padStart(2, "0");
  const month = String(date.getMonth() + 1).padStart(2, "0");
  return `${day}.${month}`;
}

function drawdownClass(summary: InviteLinkHistorySummary) {
  if (summary.drawdownPercent >= 25) {
    return "border-rose-700/80 bg-rose-950/30 text-rose-200";
  }
  if (summary.drawdownPercent >= 10) {
    return "border-amber-700/80 bg-amber-950/30 text-amber-200";
  }
  return "border-emerald-700/60 bg-emerald-950/20 text-emerald-200";
}

function hasVisibleInviteLinkHistory(
  points: InviteLinkHistoryPoint[],
  summary: InviteLinkHistorySummary,
) {
  if (
    summary.currentJoinedCount > 0 ||
    summary.currentRequestedCount > 0 ||
    summary.peakJoinedCount > 0 ||
    summary.peakRequestedCount > 0 ||
    summary.drawdownFromPeak > 0
  ) {
    return true;
  }
  return points.some(
    (point) =>
      Number(point.joinedCount || 0) > 0 ||
      Number(point.requestedCount || 0) > 0 ||
      Number(point.totalAttributed || 0) > 0,
  );
}

export function InviteLinkHistoryPanel({
  title = "Invite link history",
  subtitle,
  points,
  summary,
}: {
  title?: string;
  subtitle?: string;
  points: InviteLinkHistoryPoint[];
  summary: InviteLinkHistorySummary | null;
}) {
  if (!points.length || !summary) {
    return (
      <div className="rounded-lg border border-slate-800 bg-slate-900/20 p-4 text-sm text-slate-400">
        No invite-link history yet. Run at least one sync after this feature is enabled.
      </div>
    );
  }

  if (!hasVisibleInviteLinkHistory(points, summary)) {
    return null;
  }

  const showPeak = summary.peakJoinedCount !== summary.currentJoinedCount;
  const showPending = summary.currentRequestedCount > 0;
  const showDrop = summary.drawdownFromPeak > 0;

  return (
    <div className="space-y-4 rounded-lg border border-slate-800 bg-slate-900/20 p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold uppercase tracking-wide text-slate-300">
            {title}
          </h3>
          {subtitle ? (
            <p className="mt-1 text-xs text-slate-500">{subtitle}</p>
          ) : null}
        </div>
        <span
          className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-medium ${drawdownClass(summary)}`}
        >
          Drop from peak {formatPercent(summary.drawdownPercent)}
        </span>
      </div>

      <div className="grid gap-2 sm:grid-cols-4">
        <div className="rounded-lg border border-slate-800 bg-slate-950/40 p-3">
          <p className="text-xs text-slate-500">Current joined</p>
          <p className="mt-1 text-lg font-semibold text-white">
            {formatNumber(summary.currentJoinedCount)}
          </p>
        </div>
        {showPeak ? (
          <div className="rounded-lg border border-slate-800 bg-slate-950/40 p-3">
            <p className="text-xs text-slate-500">Peak joined</p>
            <p className="mt-1 text-lg font-semibold text-white">
              {formatNumber(summary.peakJoinedCount)}
            </p>
          </div>
        ) : null}
        {showPending ? (
          <div className="rounded-lg border border-slate-800 bg-slate-950/40 p-3">
            <p className="text-xs text-slate-500">Current pending</p>
            <p className="mt-1 text-lg font-semibold text-amber-200">
              {formatNumber(summary.currentRequestedCount)}
            </p>
          </div>
        ) : null}
        {showDrop ? (
          <div className="rounded-lg border border-slate-800 bg-slate-950/40 p-3">
            <p className="text-xs text-slate-500">Drop from peak</p>
            <p className="mt-1 text-lg font-semibold text-white">
              {formatNumber(summary.drawdownFromPeak)}
            </p>
          </div>
        ) : null}
      </div>

      <div className="h-64 rounded-lg border border-slate-800 bg-slate-950/40 p-3">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={points}>
            <CartesianGrid stroke="#1e293b" strokeDasharray="3 3" />
            <XAxis
              dataKey="syncedAt"
              tickFormatter={formatShortDate}
              stroke="#64748b"
              minTickGap={24}
            />
            <YAxis stroke="#64748b" />
            <Tooltip
              contentStyle={{
                backgroundColor: "#020617",
                border: "1px solid #334155",
                borderRadius: 12,
                color: "#e2e8f0",
              }}
              labelFormatter={(value) =>
                new Date(String(value)).toLocaleString()
              }
            />
            <Line
              type="monotone"
              dataKey="joinedCount"
              name="Joined"
              stroke="#60a5fa"
              strokeWidth={2.5}
              dot={false}
            />
            <Line
              type="monotone"
              dataKey="requestedCount"
              name="Pending"
              stroke="#f59e0b"
              strokeWidth={2}
              dot={false}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
