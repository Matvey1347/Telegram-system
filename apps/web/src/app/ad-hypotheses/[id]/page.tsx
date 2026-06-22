"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AppShell } from "@/components/layout/app-shell";
import {
  Button,
  EmptyState,
  EntityCard,
  LoadingState,
  PageHeader,
  ToastStack,
  type ToastItem,
} from "@/components/ui/primitives";
import {
  adHypothesesApi,
  type AdHypothesisCampaignSummary,
  type AdHypothesisKpiStatus,
  type AdHypothesisStatus,
} from "@/lib/api";
import { useState } from "react";

function toNumber(value: unknown) {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function formatNumber(value: unknown, decimals = 0) {
  if (value == null || !Number.isFinite(Number(value))) return "-";
  return toNumber(value).toLocaleString(undefined, {
    maximumFractionDigits: decimals,
    minimumFractionDigits: decimals,
  });
}

function formatPercent(value: unknown, decimals = 1) {
  if (value == null || !Number.isFinite(Number(value))) return "-";
  return `${formatNumber(value, decimals)}%`;
}

function statusBadgeClass(status?: AdHypothesisStatus) {
  if (status === "winner") return "border-emerald-700 text-emerald-200";
  if (status === "loser") return "border-rose-700 text-rose-200";
  if (status === "paused") return "border-yellow-700 text-yellow-200";
  if (status === "archived") return "border-slate-700 text-slate-400";
  return "border-blue-700 text-blue-200";
}

function kpiBadgeClass(status?: AdHypothesisKpiStatus) {
  if (status === "good") return "border-emerald-700 text-emerald-200";
  if (status === "acceptable") return "border-yellow-700 text-yellow-200";
  if (status === "bad") return "border-rose-700 text-rose-200";
  return "border-slate-700 text-slate-300";
}

export default function AdHypothesisDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const queryClient = useQueryClient();
  const id = params.id;
  const [toasts, setToasts] = useState<ToastItem[]>([]);
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

  const { data: hypothesis, isLoading, error } = useQuery({
    queryKey: ["ad-hypothesis", id],
    queryFn: () => adHypothesesApi.get(id),
  });
  const deleteMutation = useMutation({
    mutationFn: () => adHypothesesApi.remove(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["ad-hypotheses"] });
      queryClient.invalidateQueries({ queryKey: ["ad-campaigns"] });
      router.push("/ad-hypotheses");
    },
    onError: () => pushToast("Failed to delete hypothesis.", "error"),
  });

  const summary = hypothesis?.summary;

  return (
    <AppShell>
      <PageHeader
        title={hypothesis?.name || "Ad Hypothesis"}
        subtitle={hypothesis?.description || "Advertising theory analytics"}
        action={
          <div className="flex gap-2">
            <Link
              href="/ad-hypotheses"
              className="rounded-lg border border-slate-700 px-4 py-2 text-sm text-slate-200 hover:bg-slate-800"
            >
              Back
            </Link>
            <Link
              href="/ad-hypotheses"
              className="rounded-lg border border-slate-700 px-4 py-2 text-sm text-slate-200 hover:bg-slate-800"
            >
              Edit
            </Link>
            <Button
              type="button"
              variant="danger"
              disabled={deleteMutation.isPending}
              onClick={() => deleteMutation.mutate()}
            >
              Delete
            </Button>
          </div>
        }
      />
      {hypothesis ? (
        <div className="mb-4 flex flex-wrap items-center gap-2">
          <span
            className={`inline-flex rounded-full border px-2 py-0.5 text-xs ${statusBadgeClass(hypothesis.status)}`}
          >
            {hypothesis.status}
          </span>
        </div>
      ) : null}
      {isLoading ? <LoadingState /> : null}
      {error ? (
        <div className="rounded-lg border border-rose-700 p-3 text-sm text-rose-200">
          Failed to load hypothesis.
        </div>
      ) : null}
      {summary ? (
        <>
          <section className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
            <MetricCard title="Campaigns count" value={formatNumber(summary.campaignsCount)} />
            <MetricCard title="Total spend" value={formatNumber(summary.totalSpend, 2)} />
            <MetricCard
              title="Joined subscribers"
              value={formatNumber(summary.totalJoinedSubscribers)}
            />
            <MetricCard title="Avg CPA" value={formatNumber(summary.avgCpa, 2)} />
            <MetricCard
              title="Active subscribers"
              value={formatNumber(summary.activeSubscribersEstimate)}
            />
            <MetricCard title="Active CPA" value={formatNumber(summary.activeCpa, 2)} />
            <MetricCard title="Active rate" value={formatPercent(summary.avgActiveRate)} />
            <MetricCard title="Retention 7d" value={formatPercent(summary.avgRetention7d)} />
            <MetricCard
              title="Engagement rate"
              value={formatPercent(summary.engagementRate)}
            />
            <EntityCard title="KPI status" actions={null}>
              <span
                className={`inline-flex rounded border px-2 py-0.5 text-xs ${kpiBadgeClass(summary.kpiStatus)}`}
              >
                {summary.kpiStatus}
              </span>
            </EntityCard>
          </section>
          <section className="mt-6 grid grid-cols-1 gap-4 lg:grid-cols-3">
            <EntityCard title="Decision" actions={null}>
              <p className="text-sm text-slate-300">{summary.decision}</p>
            </EntityCard>
            <EntityCard title="Conclusion" actions={null}>
              {hypothesis?.conclusion ? (
                <p className="text-sm text-slate-300">{hypothesis.conclusion}</p>
              ) : (
                <EmptyState text="No conclusion yet." />
              )}
            </EntityCard>
            <div className="grid grid-cols-1 gap-4">
              <CampaignMiniBlock title="Best campaign" campaign={summary.bestCampaign} />
              <CampaignMiniBlock title="Worst campaign" campaign={summary.worstCampaign} />
            </div>
          </section>
          <section className="mt-6">
            <h3 className="mb-3 text-lg font-semibold">Campaigns</h3>
            {hypothesis?.campaignSummaries?.length ? (
              <CampaignsTable campaigns={hypothesis.campaignSummaries} />
            ) : (
              <EmptyState text="No campaigns in this hypothesis." />
            )}
          </section>
        </>
      ) : null}
      <ToastStack
        items={toasts}
        onClose={(toastId) =>
          setToasts((prev) => prev.filter((toast) => toast.id !== toastId))
        }
      />
    </AppShell>
  );
}

function MetricCard({ title, value }: { title: string; value: string }) {
  return (
    <EntityCard title={title} actions={null}>
      <p className="text-2xl font-semibold">{value}</p>
    </EntityCard>
  );
}

function CampaignMiniBlock({
  title,
  campaign,
}: {
  title: string;
  campaign?: AdHypothesisCampaignSummary | null;
}) {
  return (
    <EntityCard title={title} actions={null}>
      {campaign ? (
        <div className="text-sm">
          <p className="truncate font-medium text-slate-100">{campaign.title}</p>
          <p className="mt-1 text-slate-400">
            CPA {formatNumber(campaign.cpa, 2)} · active CPA {formatNumber(campaign.activeCpa, 2)}
          </p>
        </div>
      ) : (
        <p className="text-sm text-slate-400">-</p>
      )}
    </EntityCard>
  );
}

function CampaignsTable({
  campaigns,
}: {
  campaigns: AdHypothesisCampaignSummary[];
}) {
  return (
    <div className="overflow-x-auto rounded-lg border border-slate-700">
      <table className="w-full min-w-[1480px] table-fixed text-sm">
        <thead className="bg-slate-900/60 text-slate-300">
          <tr>
            <th className="w-64 px-3 py-2 text-left">Campaign</th>
            <th className="w-48 px-3 py-2 text-left">Target channel</th>
            <th className="w-56 px-3 py-2 text-left">Source</th>
            <th className="w-28 px-3 py-2 text-right">Spend</th>
            <th className="w-32 px-3 py-2 text-right">Joined</th>
            <th className="w-32 px-3 py-2 text-right">Active</th>
            <th className="w-28 px-3 py-2 text-right">CPA</th>
            <th className="w-32 px-3 py-2 text-right">Active CPA</th>
            <th className="w-32 px-3 py-2 text-right">Active rate</th>
            <th className="w-32 px-3 py-2 text-right">Retention 7d</th>
            <th className="w-28 px-3 py-2 text-right">Views</th>
            <th className="w-28 px-3 py-2 text-right">Reactions</th>
            <th className="w-32 px-3 py-2 text-right">Engagement</th>
            <th className="w-32 px-3 py-2 text-left">Overall</th>
            <th className="w-44 px-3 py-2 text-left">Calculated</th>
            <th className="w-28 px-3 py-2 text-left">KPI</th>
          </tr>
        </thead>
        <tbody>
          {campaigns.map((campaign) => (
            <tr key={campaign.campaignId} className="border-t border-slate-800">
              <td className="px-3 py-2">
                <span className="block truncate font-medium">{campaign.title}</span>
              </td>
              <td className="px-3 py-2">
                {campaign.targetChannel ? (
                  <Link
                    href={`/telegram/channels/${campaign.targetChannel.id}`}
                    className="block truncate text-blue-300 hover:underline"
                  >
                    {campaign.targetChannel.title}
                  </Link>
                ) : (
                  "-"
                )}
              </td>
              <td className="px-3 py-2">
                <span className="block truncate">{campaign.source || "-"}</span>
              </td>
              <td className="px-3 py-2 text-right">{formatNumber(campaign.spend, 2)}</td>
              <td className="px-3 py-2 text-right">{formatNumber(campaign.joinedSubscribers)}</td>
              <td className="px-3 py-2 text-right">{formatNumber(campaign.activeSubscribersEstimate)}</td>
              <td className="px-3 py-2 text-right">{formatNumber(campaign.cpa, 2)}</td>
              <td className="px-3 py-2 text-right">{formatNumber(campaign.activeCpa, 2)}</td>
              <td className="px-3 py-2 text-right">{formatPercent(campaign.activeRate)}</td>
              <td className="px-3 py-2 text-right">{formatPercent(campaign.retention7d)}</td>
              <td className="px-3 py-2 text-right">{formatNumber(campaign.views)}</td>
              <td className="px-3 py-2 text-right">{formatNumber(campaign.reactions)}</td>
              <td className="px-3 py-2 text-right">{formatPercent(campaign.engagementRate)}</td>
              <td className="px-3 py-2">
                <span className={`inline-flex rounded border px-2 py-0.5 text-xs ${kpiBadgeClass(campaign.overallStatus || "unknown")}`}>
                  {campaign.overallStatus || "unknown"}
                </span>
              </td>
              <td className="px-3 py-2 text-slate-400">
                {campaign.analyticsLastCalculatedAt ? new Date(campaign.analyticsLastCalculatedAt).toLocaleString() : "-"}
              </td>
              <td className="px-3 py-2">
                <span
                  className={`inline-flex rounded border px-2 py-0.5 text-xs ${kpiBadgeClass(campaign.kpiStatus)}`}
                >
                  {campaign.kpiStatus}
                </span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
