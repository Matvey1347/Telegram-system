import type {
  ScheduleManagedPostsBatchItem,
  TelegramManagedPostCalendarItem,
} from "@telegram-system/shared";
import type { TelegramChannelTimePost, TelegramManagedPost } from "./api";

export type CalendarDayScheduleSlotState = "available" | "occupied" | "past";

export type CalendarDayScheduleSlot = {
  id: string;
  title: string;
  time: string;
  iconId?: string | null;
  source?: "preset" | "custom";
  scheduledAt: string;
  state: CalendarDayScheduleSlotState;
  occupiedBy?: TelegramManagedPostCalendarItem;
};

export type CalendarDaySchedulePlan = {
  assignments: ScheduleManagedPostsBatchItem[];
  assignedPostIds: string[];
  overflowPostIds: string[];
};

export function localTimeKey(value: string | Date) {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const hours = String(date.getHours()).padStart(2, "0");
  const minutes = String(date.getMinutes()).padStart(2, "0");
  return `${hours}:${minutes}`;
}

export function calendarScheduledAt(dateKey: string, time: string) {
  return new Date(`${dateKey}T${time}:00`);
}

export function buildCalendarScheduleSlot(params: {
  id: string;
  title: string;
  time: string;
  iconId?: string | null;
  dateKey: string;
  scheduledItemsByTime: Map<string, TelegramManagedPostCalendarItem>;
  now?: Date;
  source?: "preset" | "custom";
}) {
  const slotDate = calendarScheduledAt(params.dateKey, params.time);
  const occupiedBy = params.scheduledItemsByTime.get(params.time);
  const state = occupiedBy
    ? "occupied"
    : slotDate.getTime() <= (params.now ?? new Date()).getTime()
      ? "past"
      : "available";
  return {
    id: params.id,
    title: params.title,
    time: params.time,
    iconId: params.iconId,
    source: params.source ?? "preset",
    scheduledAt: slotDate.toISOString(),
    state,
    ...(occupiedBy ? { occupiedBy } : {}),
  } satisfies CalendarDayScheduleSlot;
}

export function buildCalendarDayScheduleSlots({
  dateKey,
  timePosts,
  items,
  now = new Date(),
}: {
  dateKey: string;
  timePosts: TelegramChannelTimePost[];
  items: TelegramManagedPostCalendarItem[];
  now?: Date;
}) {
  const scheduledItemsByTime = new Map(
    items
      .filter((item) => item.status === "SCHEDULED" && item.scheduledAt)
      .map((item) => [localTimeKey(item.scheduledAt as string), item] as const),
  );

  return [...timePosts]
    .sort(
      (left, right) =>
        (left.position ?? Number.MAX_SAFE_INTEGER) -
          (right.position ?? Number.MAX_SAFE_INTEGER) ||
        left.time.localeCompare(right.time),
    )
    .map<CalendarDayScheduleSlot>((timePost) =>
      buildCalendarScheduleSlot({
        id: timePost.id,
        title: timePost.title,
        time: timePost.time,
        iconId: timePost.iconId,
        dateKey,
        scheduledItemsByTime,
        now,
        source: "preset",
      }),
    );
}

export function mergeCalendarScheduleSlots(
  ...collections: CalendarDayScheduleSlot[][]
) {
  const byTime = new Map<string, CalendarDayScheduleSlot>();
  for (const collection of collections) {
    for (const slot of collection) {
      const current = byTime.get(slot.time);
      if (!current) {
        byTime.set(slot.time, slot);
        continue;
      }
      const shouldReplace =
        current.source === "custom" &&
        slot.source === "preset";
      if (shouldReplace) {
        byTime.set(slot.time, slot);
      }
    }
  }
  return [...byTime.values()].sort((left, right) =>
    left.time.localeCompare(right.time),
  );
}

export function getCalendarSchedulablePosts(posts: TelegramManagedPost[]) {
  return [...posts]
    .filter(
      (post) =>
        post.origin !== "TELEGRAM" &&
        (post.status === "DRAFT" || post.status === "FAILED"),
    )
    .sort(
      (left, right) =>
        new Date(left.createdAt).getTime() - new Date(right.createdAt).getTime(),
    );
}

export function buildCalendarDaySchedulePlan({
  selectedPostIds,
  posts,
  slots,
}: {
  selectedPostIds: string[];
  posts: TelegramManagedPost[];
  slots: CalendarDayScheduleSlot[];
}): CalendarDaySchedulePlan {
  const postById = new Map(posts.map((post) => [post.id, post]));
  const selectedPosts = selectedPostIds
    .map((postId) => postById.get(postId))
    .filter((post): post is TelegramManagedPost => Boolean(post));
  const availableSlots = slots.filter((slot) => slot.state === "available");
  const assignments = selectedPosts
    .slice(0, availableSlots.length)
    .map((post, index) => ({
      postId: post.id,
      scheduledAt: availableSlots[index].scheduledAt,
    }));
  return {
    assignments,
    assignedPostIds: assignments.map((item) => item.postId),
    overflowPostIds: selectedPosts.slice(availableSlots.length).map((post) => post.id),
  };
}
