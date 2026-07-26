import { describe, expect, it } from "vitest";
import {
  buildAutoGroupedPostTitle,
  getNextGroupedPostNumber,
} from "@/lib/telegram-post-title";
import type { TelegramManagedPost } from "@/lib/api";

const createPost = (
  overrides: Partial<TelegramManagedPost> = {},
): TelegramManagedPost =>
  ({
    id: "post-1",
    workspaceId: "workspace-1",
    telegramChannelId: "channel-1",
    origin: "SYSTEM",
    assignedMemberId: "member-1",
    assignedMember: {
      id: "member-1",
      workspaceId: "workspace-1",
      userId: "user-1",
      role: "OWNER",
      createdAt: "2026-07-26T10:00:00.000Z",
      updatedAt: "2026-07-26T10:00:00.000Z",
      user: {
        id: "user-1",
        name: "Test User",
        email: "test@example.com",
      },
    },
    title: "1) Test",
    text: "",
    imageUrls: [],
    status: "DRAFT",
    telegramMessageIds: [],
    telegramMessageUrls: [],
    telegramRemoteStatus: "NONE",
    createdAt: "2026-07-26T10:00:00.000Z",
    updatedAt: "2026-07-26T10:00:00.000Z",
    ...overrides,
  }) as TelegramManagedPost;

describe("telegram-post-title", () => {
  it("returns the next number only for the selected group", () => {
    const next = getNextGroupedPostNumber({
      groupId: "group-1",
      posts: [
        createPost({ id: "a", groupId: "group-1" }),
        createPost({ id: "b", groupId: "group-1" }),
        createPost({ id: "c", groupId: "group-2" }),
      ],
    });

    expect(next).toBe(3);
    expect(buildAutoGroupedPostTitle(next)).toBe("3) ");
  });

  it("includes pending new posts and skips ungrouped drafts", () => {
    expect(
      getNextGroupedPostNumber({
        groupId: "group-1",
        posts: [createPost({ id: "a", groupId: "group-1" })],
        pendingGroupPostCount: 2,
      }),
    ).toBe(4);

    expect(
      getNextGroupedPostNumber({
        groupId: null,
        posts: [createPost({ id: "a", groupId: "group-1" })],
      }),
    ).toBeNull();
  });
});
