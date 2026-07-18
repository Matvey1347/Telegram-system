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

const WORKSPACE_ROLE_LABELS = {
  owner: "Owner",
  admin: "Admin",
  MEDIA_BUYER: "Media buyer",
  member: "Member",
} as const;

export function InviteLinksTable({ links }: { links: TelegramInviteLink[] }) {
  if (!links.length) return <EmptyState text="No invite links yet." />;

  return (
    <div className="space-y-2">
      {links.map((link) => (
        <div
          key={link.id}
          className="rounded-lg border border-slate-800 bg-slate-900/30 p-3 text-sm"
        >
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0 flex-1">
              <p className="font-medium">{link.name || "Invite link"}</p>
              <div className="mt-2 flex items-start gap-3">
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
                  <p className="text-xs text-slate-400">
                    Created by{" "}
                    {link.creatorMember?.user.name ||
                      [link.creatorFirstName, link.creatorLastName]
                        .filter(Boolean)
                        .join(" ") ||
                      (link.creatorUsername
                        ? `@${link.creatorUsername}`
                        : "Telegram admin")}
                  </p>
                  {link.creatorMember ? (
                    <div className="mt-1 flex flex-wrap items-center gap-2 text-xs">
                      <span className="rounded-full border border-emerald-400/20 bg-emerald-500/10 px-2 py-0.5 text-emerald-200">
                        {WORKSPACE_ROLE_LABELS[link.creatorMember.role]}
                      </span>
                      {link.creatorMember.telegramUsername ? (
                        <span className="text-slate-400">
                          @{link.creatorMember.telegramUsername}
                        </span>
                      ) : null}
                    </div>
                  ) : (
                    <div className="mt-1 flex flex-wrap items-center gap-2 text-xs">
                      <span className="rounded-full border border-amber-400/20 bg-amber-500/10 px-2 py-0.5 text-amber-200">
                        Unlinked Telegram admin
                      </span>
                      {link.creatorUsername ? (
                        <span className="text-slate-400">
                          @{link.creatorUsername}
                        </span>
                      ) : null}
                    </div>
                  )}
                </div>
              </div>
              <p className="mt-2 break-all text-slate-400">{link.url || "-"}</p>
              {link.adCampaign?.title ? (
                <p className="mt-1 text-xs text-slate-400">
                  Campaign: {link.adCampaign.title}
                </p>
              ) : null}
            </div>
            <div className="shrink-0 text-right">
              <p className="text-lg font-semibold">{formatNumber(link.joinedCount)}</p>
              <p className="text-xs text-slate-400">joined</p>
              {link.requestedCount > 0 ? (
                <>
                  <p className="mt-2 text-sm font-medium text-amber-200">
                    {formatNumber(link.requestedCount)}
                  </p>
                  <p className="text-xs text-slate-400">pending requests</p>
                </>
              ) : null}
              <p
                className={`mt-2 text-xs ${
                  link.isRevoked ? "text-rose-300" : "text-emerald-300"
                }`}
              >
                {link.isRevoked ? "Revoked" : "Active"}
              </p>
              {link.createsJoinRequest ? (
                <p className="mt-1 text-xs text-slate-500">Join requests</p>
              ) : null}
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
