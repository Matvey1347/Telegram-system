"use client";

import { useQuery } from "@tanstack/react-query";
import { Modal } from "@/components/ui/primitives";
import {
  getTelegramChannelInviteLinkHistory,
  type TelegramInviteLink,
} from "@/lib/api";
import { InviteLinkPreviewCard } from "@/components/telegram/invite-link-preview-card";
import { InviteLinkHistoryPanel } from "@/components/telegram/invite-link-history-panel";

export function InviteLinkPreviewModal({
  inviteLink,
  onClose,
}: {
  inviteLink: TelegramInviteLink | null;
  onClose: () => void;
}) {
  const historyQuery = useQuery({
    queryKey: ["invite-link-history", inviteLink?.telegramChannelId, inviteLink?.id],
    queryFn: () =>
      getTelegramChannelInviteLinkHistory(
        inviteLink!.telegramChannelId,
        inviteLink!.id,
      ),
    enabled: Boolean(inviteLink?.telegramChannelId && inviteLink?.id),
  });

  return (
    <Modal
      open={Boolean(inviteLink)}
      onClose={onClose}
      title={inviteLink?.name || "Invite link preview"}
      size="xl"
    >
      {inviteLink ? (
        <div className="space-y-4">
          <InviteLinkPreviewCard
            link={inviteLink}
            history={historyQuery.data ?? null}
            className="border-slate-700"
          />
          {historyQuery.isLoading ? (
            <div className="rounded-lg border border-slate-800 bg-slate-900/20 p-4 text-sm text-slate-400">
              Loading invite-link history...
            </div>
          ) : null}
          {!historyQuery.isLoading ? (
            <InviteLinkHistoryPanel
              title="Invite link trend"
              subtitle="Joined and pending requests saved after each sync."
              points={historyQuery.data?.points || []}
              summary={historyQuery.data?.summary || null}
            />
          ) : null}
        </div>
      ) : null}
    </Modal>
  );
}
