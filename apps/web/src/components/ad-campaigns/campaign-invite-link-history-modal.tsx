"use client";

import { useQuery } from "@tanstack/react-query";
import { adCampaignsApi, type AdCampaign } from "@/lib/api";
import { Modal } from "@/components/ui/primitives";
import { InviteLinkHistoryPanel } from "@/components/telegram/invite-link-history-panel";

function formatNumber(value: unknown) {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed.toLocaleString() : "0";
}

function formatPercent(value: unknown) {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? `${parsed.toFixed(1)}%` : "0.0%";
}

function drawdownClass(percent: number) {
  if (percent >= 25) {
    return "border-rose-700/80 bg-rose-950/30 text-rose-200";
  }
  if (percent >= 10) {
    return "border-amber-700/80 bg-amber-950/30 text-amber-200";
  }
  return "border-emerald-700/60 bg-emerald-950/20 text-emerald-200";
}

export function CampaignInviteLinkHistoryModal({
  campaign,
  onClose,
}: {
  campaign: AdCampaign | null;
  onClose: () => void;
}) {
  const historyQuery = useQuery({
    queryKey: ["campaign-invite-link-history", campaign?.id],
    queryFn: () => adCampaignsApi.inviteLinkHistory(campaign!.id),
    enabled: Boolean(campaign?.id),
  });

  return (
    <Modal
      open={Boolean(campaign)}
      onClose={onClose}
      title={campaign?.title || "Campaign invite-link history"}
      size="xl"
    >
      {campaign ? (
        <div className="space-y-4">
          {historyQuery.isLoading ? (
            <div className="rounded-lg border border-slate-800 bg-slate-900/20 p-4 text-sm text-slate-400">
              Loading campaign history...
            </div>
          ) : null}

          {!historyQuery.isLoading ? (
            <>
              <InviteLinkHistoryPanel
                title="Campaign invite-link trend"
                subtitle="Aggregate joined and pending requests across all campaign invite links after each sync."
                points={historyQuery.data?.points || []}
                summary={historyQuery.data?.summary || null}
              />

              <div className="rounded-lg border border-slate-800 bg-slate-900/20 p-4">
                <div className="mb-3 flex items-center justify-between gap-2">
                  <h3 className="text-sm font-semibold uppercase tracking-wide text-slate-300">
                    Invite links breakdown
                  </h3>
                  <span className="text-xs text-slate-500">
                    {formatNumber(historyQuery.data?.summary.inviteLinksCount || 0)}{" "}
                    links
                  </span>
                </div>
                <div className="space-y-2">
                  {(historyQuery.data?.inviteLinks || []).map((link) => (
                    <div
                      key={link.id}
                      className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-slate-800 bg-slate-950/40 px-3 py-2"
                    >
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium text-white">
                          {link.name}
                        </p>
                        <p className="truncate text-xs text-slate-500">
                          current {formatNumber(link.summary.currentJoinedCount)} /
                          peak {formatNumber(link.summary.peakJoinedCount)}
                        </p>
                      </div>
                      <span
                        className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-medium ${drawdownClass(link.summary.drawdownPercent)}`}
                      >
                        drop {formatPercent(link.summary.drawdownPercent)}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </>
          ) : null}
        </div>
      ) : null}
    </Modal>
  );
}
