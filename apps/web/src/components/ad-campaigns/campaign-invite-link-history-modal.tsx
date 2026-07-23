"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  adCampaignsApi,
  type AdCampaign,
  type TelegramInviteLink,
} from "@/lib/api";
import { Modal } from "@/components/ui/primitives";
import { InviteLinkHistoryPanel } from "@/components/telegram/invite-link-history-panel";
import { InviteLinkPreviewModal } from "@/components/telegram/invite-link-preview-modal";

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

function drawdownValueClass(value: number) {
  if (value > 0) return "text-rose-300";
  return "text-white";
}

function hasVisibleInviteLinkHistory(summary: {
  currentJoinedCount: number;
  currentRequestedCount: number;
  peakJoinedCount: number;
  peakRequestedCount?: number;
  drawdownFromPeak: number;
}) {
  return (
    summary.currentJoinedCount > 0 ||
    summary.currentRequestedCount > 0 ||
    summary.peakJoinedCount > 0 ||
    Number(summary.peakRequestedCount || 0) > 0 ||
    summary.drawdownFromPeak > 0
  );
}

export function CampaignInviteLinkHistoryModal({
  campaign,
  onClose,
}: {
  campaign: AdCampaign | null;
  onClose: () => void;
}) {
  const [previewLink, setPreviewLink] = useState<TelegramInviteLink | null>(null);
  const embeddedHistory = campaign?.inviteLinkHistory ?? null;
  const historyQuery = useQuery({
    queryKey: ["campaign-invite-link-history", campaign?.id],
    queryFn: () => adCampaignsApi.inviteLinkHistory(campaign!.id),
    enabled: !embeddedHistory && Boolean(campaign?.id),
  });
  const resolvedHistory = embeddedHistory ?? historyQuery.data ?? null;
  const isLoadingHistory = !embeddedHistory && historyQuery.isLoading;

  return (
    <Modal
      open={Boolean(campaign)}
      onClose={onClose}
      title={campaign?.title || "Campaign invite-link history"}
      size="xl"
    >
      {campaign ? (
        <div className="space-y-4">
          {isLoadingHistory ? (
            <div className="rounded-lg border border-slate-800 bg-slate-900/20 p-4 text-sm text-slate-400">
              Loading campaign history...
            </div>
          ) : null}

          {!isLoadingHistory ? (
            <>
              <InviteLinkHistoryPanel
                title="Campaign invite-link trend"
                subtitle="Aggregate joined and pending requests across all campaign invite links after each sync."
                points={resolvedHistory?.points || []}
                summary={resolvedHistory?.summary || null}
              />

              <div className="rounded-lg border border-slate-800 bg-slate-900/20 p-4">
                <div className="mb-3 flex items-center justify-between gap-2">
                  <h3 className="text-sm font-semibold uppercase tracking-wide text-slate-300">
                    Invite links breakdown
                  </h3>
                  <span className="text-xs text-slate-500">
                    {formatNumber(resolvedHistory?.summary.inviteLinksCount || 0)}{" "}
                    links
                  </span>
                </div>
                <div className="space-y-2">
                  {(resolvedHistory?.inviteLinks || []).map((link) => {
                    if (!hasVisibleInviteLinkHistory(link.summary)) return null;
                    const showDrop = Number(link.summary.drawdownFromPeak || 0) > 0;
                    const previewLink: TelegramInviteLink = {
                      ...link,
                      telegramChannelId: campaign.telegramChannelId,
                    };
                    return (
                      <button
                        key={link.id}
                        type="button"
                        onClick={() => setPreviewLink(previewLink)}
                        className="flex w-full flex-wrap items-center justify-between gap-3 rounded-lg border border-slate-800 bg-slate-950/40 px-3 py-2 text-left transition-colors hover:border-slate-700 hover:bg-slate-950/60"
                      >
                        <div className="min-w-0">
                          <p className="truncate text-sm font-medium text-white">
                            {link.name}
                          </p>
                          <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-500">
                            <p>
                              current {formatNumber(link.summary.currentJoinedCount)} /
                              peak {formatNumber(link.summary.peakJoinedCount)}
                            </p>
                            {showDrop ? (
                              <p>
                                Drop from peak{" "}
                                <span
                                  className={`font-semibold ${drawdownValueClass(link.summary.drawdownFromPeak)}`}
                                >
                                  {formatNumber(link.summary.drawdownFromPeak)}
                                </span>
                              </p>
                            ) : null}
                          </div>
                        </div>
                        {showDrop ? (
                          <span
                            className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-medium ${drawdownClass(link.summary.drawdownPercent)}`}
                          >
                            drop {formatPercent(link.summary.drawdownPercent)}
                          </span>
                        ) : null}
                      </button>
                    );
                  })}
                </div>
              </div>
            </>
          ) : null}
          <InviteLinkPreviewModal
            inviteLink={previewLink}
            onClose={() => setPreviewLink(null)}
          />
        </div>
      ) : null}
    </Modal>
  );
}
