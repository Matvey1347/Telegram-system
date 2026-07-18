import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { InviteLinksTable } from "@/components/telegram/invite-links-table";
import { syncProgressToToast } from "@/lib/progress";
import type { TelegramInviteLink } from "@/lib/api";

describe("InviteLinksTable", () => {
  it("renders linked and unlinked creators with joined/requested counts", () => {
    const links: TelegramInviteLink[] = [
      {
        id: "link-1",
        telegramChannelId: "channel-1",
        name: "Owner Link",
        url: "https://t.me/+owner_link",
        joinedCount: 11,
        requestedCount: 0,
        isRevoked: false,
        createsJoinRequest: false,
        creatorMember: {
          id: "member-1",
          role: "admin",
          telegramUsername: "owner_admin",
          avatarIcon: null,
          user: { id: "user-1", name: "Owner Admin" },
        },
      },
      {
        id: "link-2",
        telegramChannelId: "channel-1",
        name: "Sasha Link",
        url: "https://t.me/+sasha_link",
        joinedCount: 13,
        requestedCount: 4,
        isRevoked: true,
        createsJoinRequest: true,
        creatorUsername: "sasha_admin",
        creatorFirstName: "Sasha",
        creatorLastName: "Admin",
        creatorMember: null,
      },
    ];

    render(<InviteLinksTable links={links} />);

    expect(screen.getByText(/Created by Owner Admin/)).toBeInTheDocument();
    expect(screen.getByText("@owner_admin")).toBeInTheDocument();
    expect(screen.getByText("Unlinked Telegram admin")).toBeInTheDocument();
    expect(screen.getByText("@sasha_admin")).toBeInTheDocument();
    expect(screen.getByText("11")).toBeInTheDocument();
    expect(screen.getByText("13")).toBeInTheDocument();
    expect(screen.getByText("4")).toBeInTheDocument();
    expect(screen.getByText("pending requests")).toBeInTheDocument();
    expect(screen.getByText("Revoked")).toBeInTheDocument();
  });
});

describe("syncProgressToToast", () => {
  it("uses inner invite-link phase progress sequentially", () => {
    const discovering = syncProgressToToast({
      id: "sync-1",
      title: "Sync Channel",
      item: {
        phase: "discovering_invite_admins",
        message: "Discovering invite-link creators",
      },
      current: 2,
      total: 8,
    });
    const loading = syncProgressToToast({
      id: "sync-1",
      title: "Sync Channel",
      item: {
        phase: "loading_invite_links",
        message: "Loading invite links 1/24",
        stageCurrent: 1,
        stageTotal: 24,
      },
      current: 2,
      total: 8,
    });

    expect(discovering.current).toBeUndefined();
    expect(discovering.total).toBeUndefined();
    expect(loading.current).toBe(1);
    expect(loading.total).toBe(24);
    expect(loading.message).toBe("Loading invite links 1/24");
  });
});
