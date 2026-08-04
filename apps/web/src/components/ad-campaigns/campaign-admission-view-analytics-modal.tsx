"use client";

import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
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
import { X } from "lucide-react";
import { adCampaignsApi, type AdCampaign } from "@/lib/api";

function formatNumber(value: unknown, decimals = 0) {
  if (value == null || !Number.isFinite(Number(value))) return "-";
  return Number(value).toLocaleString(undefined, {
    maximumFractionDigits: decimals,
    minimumFractionDigits: decimals,
  });
}

function formatDate(value?: string | null) {
  if (!value) return "-";
  return new Date(value).toLocaleString();
}

function modeLabel(value?: string | null) {
  if (value === "BOOTSTRAPPED_CUMULATIVE") return "Reconstructed from existing data";
  if (value === "EXACT_DELTA") return "Exact";
  return "-";
}

export function CampaignAdmissionViewAnalyticsModal({
  campaign,
  onClose,
}: {
  campaign: AdCampaign | null;
  onClose: () => void;
}) {
  const { data, isLoading } = useQuery({
    queryKey: ["ad-campaign-admission-view-analytics", campaign?.id],
    queryFn: () => adCampaignsApi.admissionViewAnalytics(campaign!.id),
    enabled: Boolean(campaign?.id),
  });
  const batches = data?.batches || [];
  const summary = data?.latestBatch ?? null;
  const chartData = useMemo(
    () => {
      const byTime = new Map<
        string,
        {
          collectedAt: string;
          timestamp: number;
          avgViewsTotal: number;
          avgViewsCount: number;
          uplift: number;
          incremental: number;
        }
      >();
      for (const batch of batches) {
        for (const point of batch.points || []) {
          const timestamp = new Date(point.collectedAt).getTime();
          if (!Number.isFinite(timestamp)) continue;
          const key = new Date(timestamp).toISOString();
          const row =
            byTime.get(key) ?? {
              collectedAt: new Date(timestamp).toLocaleDateString(),
              timestamp,
              avgViewsTotal: 0,
              avgViewsCount: 0,
              uplift: 0,
              incremental: 0,
            };
          if (point.avgViews != null && Number.isFinite(Number(point.avgViews))) {
            row.avgViewsTotal += Number(point.avgViews);
            row.avgViewsCount += 1;
          }
          row.uplift += Math.max(0, Number(point.cumulativeAvgViewsUplift || 0));
          row.incremental += Math.max(0, Number(point.incrementalAvgViewsUplift || 0));
          byTime.set(key, row);
        }
      }
      return [...byTime.values()]
        .sort((a, b) => a.timestamp - b.timestamp)
        .map((row) => ({
          collectedAt: row.collectedAt,
          avgViews: row.avgViewsCount ? row.avgViewsTotal / row.avgViewsCount : null,
          uplift: row.uplift,
          incremental: row.incremental,
        }));
    },
    [batches],
  );

  if (!campaign) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
      <div className="max-h-[90vh] w-full max-w-5xl overflow-auto rounded-lg border border-slate-800 bg-slate-950 p-5 text-slate-100 shadow-2xl">
        <div className="mb-4 flex items-start justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold">View uplift</h2>
            <p className="text-sm text-slate-400">{campaign.title}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            title="Close"
            className="cursor-pointer rounded-lg border border-neutral-700 p-2 text-neutral-200 hover:bg-neutral-800"
          >
            <X size={16} />
          </button>
        </div>

        {isLoading ? (
          <p className="text-sm text-slate-400">Loading...</p>
        ) : !batches.length ? (
          <p className="text-sm text-slate-400">No admission analytics yet.</p>
        ) : (
          <div className="space-y-4">
            {summary ? (
              <>
                <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                  <Info
                    label="Joined"
                    value={`+${formatNumber(summary.releasedSubscribersCount)}`}
                  />
                  <Info
                    label="First observed"
                    value={formatDate(summary.firstObservedAt)}
                  />
                  <Info
                    label="Last collected"
                    value={formatDate(summary.lastCollectedAt)}
                  />
                  <Info label="Baseline method" value={summary.baselineMethod} />
                  <Info
                    label="Baseline avg views"
                    value={formatNumber(summary.baselineAvgViews)}
                  />
                  <Info
                    label="Current avg views"
                    value={formatNumber(summary.currentAvgViews)}
                  />
                  <Info
                    label="View uplift"
                    value={formatNumber(summary.cumulativeAvgViewsUplift)}
                  />
                  <Info
                    label="Last sync uplift"
                    value={formatNumber(summary.incrementalAvgViewsUplift)}
                  />
                  <Info
                    label="Estimated active"
                    value={`${formatNumber(summary.estimatedActiveSubscribers)} / ${formatNumber(summary.releasedSubscribersCount)}`}
                  />
                  <Info
                    label="Activation"
                    value={
                      summary.activationRate == null
                        ? "-"
                        : `${formatNumber(summary.activationRate, 1)}%`
                    }
                  />
                  <Info label="Quality" value={summary.dataQuality} />
                  <Info
                    label="Tracked posts"
                    value={`${formatNumber(summary.trackedPostsCount)} / ${formatNumber(summary.originalTrackedPostsCount)}`}
                  />
                </div>

                {summary.baselineMethod === "EARLIEST_OBSERVED" ? (
                  <p className="rounded border border-amber-800 bg-amber-950/20 px-3 py-2 text-sm text-amber-100">
                    Observed growth from the earliest available post snapshot
                  </p>
                ) : null}
                {summary.dataQualityReason ? (
                  <p className="rounded border border-slate-800 bg-black/20 px-3 py-2 text-sm text-slate-300">
                    {summary.dataQualityReason}
                  </p>
                ) : null}

                <div className="h-72 rounded border border-slate-800 bg-black/20 p-3">
                  <ResponsiveContainer width="100%" height="100%">
                    <ComposedChart data={chartData}>
                      <CartesianGrid stroke="#1f2937" strokeDasharray="3 3" />
                      <XAxis dataKey="collectedAt" stroke="#94a3b8" fontSize={12} />
                      <YAxis stroke="#94a3b8" fontSize={12} />
                      <Tooltip
                        contentStyle={{
                          background: "#020617",
                          border: "1px solid #334155",
                          color: "#e2e8f0",
                        }}
                      />
                      <Bar dataKey="incremental" fill="#64748b" />
                      <Line
                        type="monotone"
                        dataKey="avgViews"
                        stroke="#38bdf8"
                        strokeWidth={2}
                        dot={false}
                      />
                      <Line
                        type="monotone"
                        dataKey="uplift"
                        stroke="#34d399"
                        strokeWidth={2}
                        dot={false}
                      />
                    </ComposedChart>
                  </ResponsiveContainer>
                </div>
              </>
            ) : null}

            <div className="rounded border border-slate-800 bg-black/20">
              <div className="grid grid-cols-[1fr_80px_100px_100px_90px] gap-2 border-b border-slate-800 px-3 py-2 text-[10px] uppercase text-slate-500">
                <span>Batch</span>
                <span className="text-right">Joined</span>
                <span className="text-right">Avg views</span>
                <span className="text-right">Uplift</span>
                <span className="text-right">Active</span>
              </div>
              <div className="divide-y divide-slate-800">
                {batches.map((batch) => (
                  <div
                    key={batch.id}
                    className="grid grid-cols-[1fr_80px_100px_100px_90px] gap-2 px-3 py-2 text-sm"
                  >
                    <div className="min-w-0">
                      <div className="truncate text-slate-100">
                        {modeLabel(batch.detectionMode)}
                      </div>
                      <div className="truncate text-xs text-slate-500">
                        {formatDate(batch.firstObservedAt)}
                      </div>
                    </div>
                    <span className="text-right text-slate-200">
                      +{formatNumber(batch.releasedSubscribersCount)}
                    </span>
                    <span className="text-right text-slate-200">
                      {formatNumber(batch.currentAvgViews)}
                    </span>
                    <span className="text-right text-emerald-200">
                      +{formatNumber(batch.cumulativeAvgViewsUplift)}
                    </span>
                    <span className="text-right text-slate-200">
                      {formatNumber(batch.estimatedActiveSubscribers)}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded border border-slate-800 bg-black/20 px-3 py-2">
      <p className="text-[10px] uppercase text-slate-500">{label}</p>
      <p className="mt-1 text-sm text-slate-100">{value || "-"}</p>
    </div>
  );
}
