"use client";

import { useState } from "react";
import { InviteLinkPreviewCard } from "@/components/telegram/invite-link-preview-card";
import { InviteLinkPreviewModal } from "@/components/telegram/invite-link-preview-modal";
import type { TelegramInviteLink } from "@/lib/api";

function EmptyState({ text }: { text: string }) {
  return (
    <div className="rounded-lg border border-slate-800 bg-slate-900/30 p-3 text-sm text-slate-400">
      {text}
    </div>
  );
}

export function InviteLinksTable({ links }: { links: TelegramInviteLink[] }) {
  const [previewLink, setPreviewLink] = useState<TelegramInviteLink | null>(null);
  const visibleLinks = links.filter((link) => {
    const totalAttributed =
      Number(link.joinedCount || 0) + Number(link.requestedCount || 0);
    return link.name !== "Imported MTProto link" || totalAttributed > 0;
  });

  if (!visibleLinks.length) return <EmptyState text="No invite links yet." />;

  return (
    <>
      <div className="space-y-2">
        {visibleLinks.map((link) => (
          <InviteLinkPreviewCard
            key={link.id}
            link={link}
            onPreview={setPreviewLink}
          />
        ))}
      </div>
      <InviteLinkPreviewModal
        inviteLink={previewLink}
        onClose={() => setPreviewLink(null)}
      />
    </>
  );
}
