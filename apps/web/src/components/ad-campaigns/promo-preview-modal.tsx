"use client";

import { TelegramPostPreview } from "@/components/telegram/telegram-post-preview";
import { Modal } from "@/components/ui/primitives";
import type { Promo } from "@/lib/api";

function PromoVisual({ promo }: { promo: Promo }) {
  if (promo.icon?.imageUrl) {
    return (
      <img
        src={promo.icon.imageUrl}
        alt=""
        className="h-8 w-8 rounded-full object-cover"
      />
    );
  }
  if (promo.icon?.emoji) {
    return (
      <span className="inline-flex h-8 w-8 items-center justify-center text-2xl leading-none">
        {promo.icon.emoji}
      </span>
    );
  }
  return null;
}

function PromoAssignedMemberChip({
  member,
}: {
  member: NonNullable<Promo["assignedMember"]>;
}) {
  const label = member.user?.name || "Member";
  const avatarImageUrl = member.avatarIcon?.imageUrl ?? undefined;
  const avatarEmoji = member.avatarIcon?.emoji ?? undefined;
  return (
    <a
      href="/workspace-members"
      title={`Assigned member: ${label}\nClick to open workspace members.\nCtrl/Cmd + click opens it in a new tab.`}
      className="inline-flex max-w-[220px] items-center gap-1.5 rounded-full border border-slate-700/80 bg-slate-900/70 px-2 py-1 text-xs text-slate-200 transition-colors hover:border-slate-500 hover:text-white"
    >
      {avatarImageUrl ? (
        <img
          src={avatarImageUrl}
          alt=""
          className="h-4 w-4 shrink-0 rounded-full object-cover"
        />
      ) : null}
      {!avatarImageUrl && avatarEmoji ? (
        <span className="inline-flex h-4 w-4 shrink-0 items-center justify-center text-[12px] leading-none">
          {avatarEmoji}
        </span>
      ) : null}
      {!avatarImageUrl && !avatarEmoji ? (
        <span className="inline-flex h-4 w-4 shrink-0 items-center justify-center rounded-full border border-slate-600 text-[10px] text-slate-400">
          {label.slice(0, 1).toUpperCase()}
        </span>
      ) : null}
      <span className="truncate">{label}</span>
    </a>
  );
}

export function PromoPreviewModal({
  promo,
  onClose,
}: {
  promo: Promo | null;
  onClose: () => void;
}) {
  return (
    <Modal
      open={Boolean(promo)}
      onClose={onClose}
      title={promo?.title || "Promo preview"}
      size="xl"
    >
      {promo ? (
        <div className="grid items-start gap-4 xl:grid-cols-[minmax(260px,0.75fr)_minmax(0,1.25fr)]">
          <TelegramPostPreview
            channelTitle={promo.telegramChannel?.title || "Telegram channel"}
            channelPhotoUrl={promo.telegramChannel?.photoUrl}
            text={promo.text || ""}
            imageUrls={promo.imageData ? [promo.imageData] : []}
          />
          <div className="space-y-4 rounded-lg border border-slate-800 bg-slate-900/25 p-4">
            <div className="flex items-center gap-3">
              <PromoVisual promo={promo} />
              <div className="min-w-0">
                <h3 className="truncate text-lg font-semibold text-white">
                  {promo.title}
                </h3>
                {promo.telegramChannel ? (
                  <p className="text-sm text-slate-400">
                    {promo.telegramChannel.title}
                  </p>
                ) : null}
                {promo.assignedMember ? (
                  <div className="mt-2">
                    <PromoAssignedMemberChip member={promo.assignedMember} />
                  </div>
                ) : null}
              </div>
            </div>
            {promo.text ? (
              <div>
                <p className="mb-2 text-xs uppercase tracking-wide text-slate-500">
                  Text
                </p>
                <div className="whitespace-pre-wrap rounded-lg border border-slate-800 bg-slate-950/40 p-3 text-sm text-slate-200">
                  {promo.text}
                </div>
              </div>
            ) : null}
            {promo.imageData ? (
              <div>
                <p className="mb-2 text-xs uppercase tracking-wide text-slate-500">
                  Image
                </p>
                <img
                  src={promo.imageData}
                  alt=""
                  className="max-h-[320px] rounded-lg border border-slate-800 object-contain"
                />
              </div>
            ) : null}
          </div>
        </div>
      ) : null}
    </Modal>
  );
}
