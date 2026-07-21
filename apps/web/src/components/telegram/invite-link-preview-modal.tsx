"use client";

import { Modal } from "@/components/ui/primitives";
import type { TelegramInviteLink } from "@/lib/api";
import { InviteLinkPreviewCard } from "@/components/telegram/invite-link-preview-card";

export function InviteLinkPreviewModal({
  inviteLink,
  onClose,
}: {
  inviteLink: TelegramInviteLink | null;
  onClose: () => void;
}) {
  return (
    <Modal
      open={Boolean(inviteLink)}
      onClose={onClose}
      title={inviteLink?.name || "Invite link preview"}
      size="xl"
    >
      {inviteLink ? (
        <InviteLinkPreviewCard link={inviteLink} className="border-slate-700" />
      ) : null}
    </Modal>
  );
}
