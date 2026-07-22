"use client";
import {
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { IconAvatar } from "@/components/icons/icon-avatar";
import { TelegramEntityAvatar } from "@/components/telegram/telegram-entity-avatar";
import {
  type InviteLinkHistoryPoint,
  type InviteLinkHistorySummary,
  type TelegramInviteLink,
  type TelegramInviteLinkHistory,
} from "@/lib/api";

function formatNumber(value: unknown) {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed.toLocaleString() : "0";
}

function creatorLabel(link: TelegramInviteLink) {
  return (
    link.creatorMember?.user.name ||
    [link.creatorFirstName, link.creatorLastName].filter(Boolean).join(" ") ||
    (link.creatorUsername ? `@${link.creatorUsername}` : "Telegram admin")
  );
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

function historyTone(summary: InviteLinkHistorySummary | null) {
  if (!summary) return "border-slate-800 bg-slate-950/30 text-slate-300";
  if (summary.drawdownPercent >= 25) {
    return "border-rose-700/70 bg-rose-950/20 text-rose-200";
  }
  if (summary.drawdownPercent >= 10) {
    return "border-amber-700/70 bg-amber-950/20 text-amber-200";
  }
  return "border-emerald-700/60 bg-emerald-950/20 text-emerald-200";
}

function hasVisibleInviteLinkHistory(
  points: InviteLinkHistoryPoint[],
  summary: InviteLinkHistorySummary | null,
) {
  if (!summary) return false;
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

function InviteLinkHistoryMiniPreview({
  points,
  summary,
}: {
  points: InviteLinkHistoryPoint[];
  summary: InviteLinkHistorySummary | null;
}) {
  if (!points.length || !summary || !hasVisibleInviteLinkHistory(points, summary)) {
    return null;
  }

  return (
    <div className="mt-3 rounded-lg border border-slate-800 bg-slate-950/30 p-3">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <span
            className={`inline-flex rounded-full border px-2 py-1 text-[11px] font-medium ${historyTone(summary)}`}
          >
            Drop {formatPercent(summary.drawdownPercent)}
          </span>
          <span className="text-xs text-slate-400">
            peak {formatNumber(summary.peakJoinedCount)}
          </span>
          <span className="text-xs text-slate-400">
            current {formatNumber(summary.currentJoinedCount)}
          </span>
        </div>
        <span className="text-[11px] text-slate-500">
          {points.length} sync points
        </span>
      </div>

      <div className="mt-3 h-20">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={points}>
            <XAxis
              dataKey="syncedAt"
              tickFormatter={formatShortDate}
              stroke="#475569"
              minTickGap={18}
              tickLine={false}
              axisLine={false}
            />
            <YAxis hide domain={["dataMin", "dataMax"]} />
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
              strokeWidth={2}
              dot={false}
            />
            <Line
              type="monotone"
              dataKey="requestedCount"
              name="Pending"
              stroke="#f59e0b"
              strokeWidth={1.5}
              dot={false}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

export function InviteLinkPreviewCard({
  link,
  className = "",
  history,
  showHistoryPreview = true,
  onPreview,
}: {
  link: TelegramInviteLink;
  className?: string;
  history?: TelegramInviteLinkHistory | null;
  showHistoryPreview?: boolean;
  onPreview?: (link: TelegramInviteLink) => void;
}) {
  const joinedCount = Number(link.joinedCount || 0);
  const requestedCount = Number(link.requestedCount || 0);
  const showJoined = joinedCount > 0;
  const showRequested = requestedCount > 0;
  const showSingleZero = !showJoined && !showRequested;
  const resolvedHistory = history ?? link.history ?? null;
  const unsubscribedPercent = resolvedHistory?.summary?.drawdownPercent ?? null;
  const campaignHref =
    link.adCampaign?.id && link.telegramChannelId
      ? `/telegram/channels/${link.telegramChannelId}#campaign-${link.adCampaign.id}`
      : null;

  return (
    <div
      className={`rounded-lg border border-slate-800 bg-slate-900/30 px-3 py-2 text-sm ${className}`.trim()}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <p className="font-medium">{link.name || "Invite link"}</p>
          <div className="mt-1.5 flex items-center gap-2.5">
            {link.creatorMember ? (
              <IconAvatar
                icon={link.creatorMember.avatarIcon}
                label={link.creatorMember.user.name}
                size="sm"
              />
            ) : (
              <TelegramEntityAvatar
                imageUrl={link.creatorPhotoUrl ?? undefined}
                kind="person"
                alt={
                  link.creatorFirstName ||
                  link.creatorUsername ||
                  "Telegram admin"
                }
                size="sm"
              />
            )}
            <div className="min-w-0">
              <p className="truncate text-xs text-slate-400">
                Created by {creatorLabel(link)}
              </p>
            </div>
          </div>
          <p className="mt-1.5 break-all text-sm text-slate-400">
            {link.url || "-"}
          </p>
          {link.adCampaign?.title ? (
            <p className="mt-1 text-xs text-slate-400">
              Campaign:{" "}
              {campaignHref ? (
                <a
                  href={campaignHref}
                  className="text-blue-300 underline-offset-2 transition-colors hover:text-blue-200 hover:underline"
                  title={`Open this campaign on the channel page and scroll to it.\nCtrl/Cmd + click opens it in a new tab.`}
                >
                  {link.adCampaign.title}
                </a>
              ) : (
                link.adCampaign.title
              )}
            </p>
          ) : null}
        </div>
        <div className="shrink-0">
          <div className="flex items-center gap-4 text-right">
            {showJoined ? (
              <div>
                <p className="text-base font-semibold leading-none">
                  {formatNumber(joinedCount)}
                </p>
                <p className="mt-0.5 text-[11px] text-slate-400">joined</p>
              </div>
            ) : null}
            {showRequested ? (
              <div>
                <p className="text-base font-semibold leading-none text-amber-200">
                  {formatNumber(requestedCount)}
                </p>
                <p className="mt-0.5 whitespace-nowrap text-[11px] text-slate-400">
                  pending requests
                </p>
              </div>
            ) : null}
            {showSingleZero ? (
              <div className="min-w-[32px] text-center">
                <p className="text-base font-semibold leading-none text-slate-200">
                  0
                </p>
              </div>
            ) : null}
            {link.isRevoked ? (
              <p className="whitespace-nowrap text-xs font-medium text-rose-300">
                Revoked
              </p>
            ) : null}
          </div>
        </div>
      </div>

      <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs text-slate-500">Unsubscribed from peak</span>
          <span
            className={`inline-flex rounded-full border px-2 py-1 text-[11px] font-medium ${historyTone(resolvedHistory?.summary || null)}`}
          >
            {unsubscribedPercent != null
              ? formatPercent(unsubscribedPercent)
              : "-"}
          </span>
        </div>
        {onPreview ? (
          <button
            type="button"
            onClick={() => onPreview(link)}
            className="rounded-full border border-slate-700 px-2.5 py-1 text-xs text-slate-200 transition-colors hover:border-slate-500 hover:text-white"
          >
            Preview
          </button>
        ) : null}
      </div>

      {showHistoryPreview && !resolvedHistory?.summary ? (
        <div className="mt-3 rounded-lg border border-slate-800 bg-slate-950/30 px-3 py-2 text-xs text-slate-500">
          No history yet. Run sync to start tracking joined peaks and unsubscribed percent.
        </div>
      ) : null}

      {showHistoryPreview ? (
        <InviteLinkHistoryMiniPreview
          points={resolvedHistory?.points || []}
          summary={resolvedHistory?.summary || null}
        />
      ) : null}
    </div>
  );
}
