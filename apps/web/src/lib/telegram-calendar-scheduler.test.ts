import { describe, expect, it } from "vitest";
import {
  buildCalendarScheduleSlot,
  buildCalendarDaySchedulePlan,
  buildCalendarDayScheduleSlots,
  getCalendarSchedulablePosts,
  mergeCalendarScheduleSlots,
} from "./telegram-calendar-scheduler";
import type { TelegramManagedPostCalendarItem } from "@telegram-system/shared";
import type { TelegramChannelTimePost, TelegramManagedPost } from "./api";

describe("telegram-calendar-scheduler", () => {
  it("builds day slots with occupied, past, and available states", () => {
    const timePosts: TelegramChannelTimePost[] = [
      { id: "slot-1", title: "Morning", time: "09:00", position: 2 },
      { id: "slot-2", title: "Lunch", time: "13:00", position: 1 },
      { id: "slot-3", title: "Evening", time: "18:00", position: 3 },
    ];
    const items: TelegramManagedPostCalendarItem[] = [
      {
        id: "scheduled-post",
        telegramChannelId: "channel-1",
        title: "Already booked",
        text: null,
        status: "SCHEDULED",
        scheduledAt: "2026-07-28T13:00:00",
        publishedAt: null,
        origin: "SYSTEM",
        telegramRemoteStatus: "SCHEDULED",
        telegramMessageUrls: [],
        hasMedia: false,
        group: null,
        assignedMember: {
          id: "member-1",
          workspaceId: "workspace-1",
          name: "Member",
          email: null,
          photoUrl: null,
          role: null,
        },
      },
    ];

    const slots = buildCalendarDayScheduleSlots({
      dateKey: "2026-07-28",
      timePosts,
      items,
      now: new Date("2026-07-28T12:00:00"),
    });

    expect(slots.map((slot) => slot.time)).toEqual(["13:00", "09:00", "18:00"]);
    expect(slots[0].state).toBe("occupied");
    expect(slots[0].occupiedBy?.id).toBe("scheduled-post");
    expect(slots[1].state).toBe("past");
    expect(slots[2].state).toBe("available");
  });

  it("filters out published, scheduled, and imported Telegram posts from bulk scheduling", () => {
    const posts: TelegramManagedPost[] = [
      makePost({ id: "draft-1", status: "DRAFT", origin: "SYSTEM" }),
      makePost({ id: "failed-1", status: "FAILED", origin: "SYSTEM" }),
      makePost({ id: "scheduled-1", status: "SCHEDULED", origin: "SYSTEM" }),
      makePost({ id: "published-1", status: "PUBLISHED", origin: "SYSTEM" }),
      makePost({ id: "imported-1", status: "FAILED", origin: "TELEGRAM" }),
    ];

    expect(getCalendarSchedulablePosts(posts).map((post) => post.id)).toEqual([
      "draft-1",
      "failed-1",
    ]);
  });

  it("filters out posts whose internal tg-post dependencies are not published and synced", () => {
    const posts: TelegramManagedPost[] = [
      makePost({
        id: "blocked-draft",
        status: "DRAFT",
        origin: "SYSTEM",
        text: "[Go](tg-post:dependency-draft)",
      }),
      makePost({
        id: "ready-draft",
        status: "DRAFT",
        origin: "SYSTEM",
        text: "[Go](tg-post:dependency-published)",
      }),
      makePost({
        id: "dependency-draft",
        status: "DRAFT",
        origin: "SYSTEM",
      }),
      makePost({
        id: "dependency-published",
        status: "PUBLISHED",
        origin: "SYSTEM",
        telegramRemoteStatus: "PUBLISHED",
        telegramMessageIds: ["101"],
      }),
    ];

    expect(
      getCalendarSchedulablePosts(posts, {
        channelTelegramChatId: "-1001234567890",
      }).map((post) => post.id),
    ).toEqual(["ready-draft", "dependency-draft"]);
  });

  it("builds assignments in selection order and reports overflow when slots run out", () => {
    const posts: TelegramManagedPost[] = [
      makePost({ id: "post-1" }),
      makePost({ id: "post-2" }),
      makePost({ id: "post-3" }),
    ];
    const slots = [
      {
        id: "slot-1",
        title: "Morning",
        time: "09:00",
        scheduledAt: "2026-07-29T09:00:00.000Z",
        state: "available" as const,
      },
      {
        id: "slot-2",
        title: "Evening",
        time: "18:00",
        scheduledAt: "2026-07-29T18:00:00.000Z",
        state: "available" as const,
      },
    ];

    const plan = buildCalendarDaySchedulePlan({
      selectedPostIds: ["post-2", "post-3", "post-1"],
      posts,
      slots,
    });

    expect(plan.assignments).toEqual([
      { postId: "post-2", scheduledAt: "2026-07-29T09:00:00.000Z" },
      { postId: "post-3", scheduledAt: "2026-07-29T18:00:00.000Z" },
    ]);
    expect(plan.overflowPostIds).toEqual(["post-1"]);
  });

  it("supports custom schedule times and keeps them sorted with presets", () => {
    const presetSlots = [
      {
        id: "slot-1",
        title: "Morning",
        time: "09:00",
        scheduledAt: "2026-07-29T09:00:00.000Z",
        state: "available" as const,
        source: "preset" as const,
      },
    ];

    const customSlot = buildCalendarScheduleSlot({
      id: "custom:12:30",
      title: "Custom time",
      time: "12:30",
      dateKey: "2026-07-29",
      scheduledItemsByTime: new Map(),
      now: new Date("2026-07-28T12:00:00.000Z"),
      source: "custom",
    });

    const merged = mergeCalendarScheduleSlots(presetSlots, [customSlot]);

    expect(merged.map((slot) => `${slot.time}:${slot.source}`)).toEqual([
      "09:00:preset",
      "12:30:custom",
    ]);
  });

  it("prefers preset slots over custom duplicates at the same time", () => {
    const presetSlot = {
      id: "slot-1",
      title: "Morning",
      time: "09:00",
      scheduledAt: "2026-07-29T09:00:00.000Z",
      state: "available" as const,
      source: "preset" as const,
    };
    const customSlot = {
      id: "custom:09:00",
      title: "Custom time",
      time: "09:00",
      scheduledAt: "2026-07-29T09:00:00.000Z",
      state: "available" as const,
      source: "custom" as const,
    };

    const merged = mergeCalendarScheduleSlots([customSlot], [presetSlot]);

    expect(merged).toHaveLength(1);
    expect(merged[0]).toEqual(presetSlot);
  });
});

function makePost(
  overrides: Partial<TelegramManagedPost> & Pick<TelegramManagedPost, "id">,
): TelegramManagedPost {
  const { id, ...rest } = overrides;
  return {
    workspaceId: "workspace-1",
    telegramChannelId: "channel-1",
    assignedMemberId: "member-1",
    assignedMember: {
      id: "member-1",
      workspaceId: "workspace-1",
      userId: "user-1",
      role: "member",
      createdAt: "2026-07-01T00:00:00.000Z",
      user: {
        id: "user-1",
        email: "member@example.com",
        name: "Member",
      },
      isCurrentUser: false,
    },
    icon: null,
    groupId: null,
    groupPosition: null,
    sidebarPosition: null,
    group: null,
    title: overrides.id,
    text: null,
    imageUrls: [],
    status: "DRAFT",
    scheduledAt: null,
    publishedAt: null,
    telegramMessageIds: [],
    telegramMessageUrls: [],
    telegramRemoteStatus: "NONE",
    lastTelegramSyncedAt: null,
    lastTelegramSyncNote: null,
    publishMode: null,
    lastError: null,
    createdAt: "2026-07-01T00:00:00.000Z",
    updatedAt: "2026-07-01T00:00:00.000Z",
    origin: "SYSTEM",
    id,
    ...rest,
  };
}
