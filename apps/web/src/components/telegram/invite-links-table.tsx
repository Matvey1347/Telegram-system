"use client";

import { IconAvatar } from "@/components/icons/icon-avatar";
import { TelegramEntityAvatar } from "@/components/telegram/telegram-entity-avatar";
import type { TelegramInviteLink } from "@/lib/api";

function formatNumber(value: unknown) {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed.toLocaleString() : "0";
}

function EmptyState({ text }: { text: string }) {
  return (
    <div className="rounded-lg border border-slate-800 bg-slate-900/30 p-3 text-sm text-slate-400">
      {text}
    </div>
  );
}

export function InviteLinksTable({ links }: { links: TelegramInviteLink[] }) {
  const visibleLinks = links.filter((link) => {
    const totalAttributed =
      Number(link.joinedCount || 0) + Number(link.requestedCount || 0);
    return link.name !== "Imported MTProto link" || totalAttributed > 0;
  });

  if (!visibleLinks.length) return <EmptyState text="No invite links yet." />;

  return (
    <div className="space-y-2">
      {visibleLinks.map((link) => (
        <div
          key={link.id}
          className="rounded-lg border border-slate-800 bg-slate-900/30 px-3 py-2 text-sm"
        >
          <div className="flex items-center justify-between gap-3">
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
                    Created by{" "}
                    {link.creatorMember?.user.name ||
                      [link.creatorFirstName, link.creatorLastName]
                        .filter(Boolean)
                        .join(" ") ||
                      (link.creatorUsername
                        ? `@${link.creatorUsername}`
                        : "Telegram admin")}
                  </p>
                </div>
              </div>
              <p className="mt-1.5 break-all text-sm text-slate-400">
                {link.url || "-"}
              </p>
              {link.adCampaign?.title ? (
                <p className="mt-1 text-xs text-slate-400">
                  Campaign: {link.adCampaign.title}
                </p>
              ) : null}
            </div>
            <div className="shrink-0">
              <div className="flex items-center gap-4 text-right">
                <div>
                  <p className="text-base font-semibold leading-none">
                    {formatNumber(link.joinedCount)}
                  </p>
                  <p className="mt-0.5 text-[11px] text-slate-400">joined</p>
                </div>
                <div>
                  <p className="text-base font-semibold leading-none text-amber-200">
                    {formatNumber(link.requestedCount)}
                  </p>
                  <p className="mt-0.5 whitespace-nowrap text-[11px] text-slate-400">
                    pending requests
                  </p>
                </div>
                <p
                  className={`whitespace-nowrap text-xs font-medium ${
                    link.isRevoked ? "text-rose-300" : "text-emerald-300"
                  }`}
                >
                  {link.isRevoked ? "Revoked" : "Active"}
                </p>
              </div>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
