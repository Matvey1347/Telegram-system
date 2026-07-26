import type { BulkActionResult } from "./post-groups";

export type TelegramManagedPostOrigin = "SYSTEM" | "TELEGRAM";

export type ManagedPostsSyncResult = {
  checked: number;
  updated: number;
  importedScheduled: number;
  remoteScheduledTotal: number;
  publishedEarly: number;
  movedToDraft: number;
  broken: number;
  missing: number;
};

export type TelegramManagedPostCalendarItem = {
  id: string;
  telegramChannelId: string;
  title: string;
  text?: string | null;
  status: "SCHEDULED" | "PUBLISHED";
  scheduledAt?: string | null;
  publishedAt?: string | null;
  origin: TelegramManagedPostOrigin;
  telegramRemoteStatus: string;
  telegramMessageUrls: string[];
  hasMedia: boolean;
  group?: {
    id: string;
    title: string;
    icon?: string | null;
  } | null;
  assignedMember: {
    id: string;
    workspaceId: string;
    name: string;
    email?: string | null;
    photoUrl?: string | null;
    role?: string | null;
  };
};

export type TelegramManagedPostCalendarResult = {
  from: string;
  to: string;
  items: TelegramManagedPostCalendarItem[];
  summary: {
    scheduledInRange: number;
    publishedInRange: number;
    futureScheduledTotal: number;
    lastScheduledAt: string | null;
  };
};

export type ScheduleManagedPostsBatchItem = {
  postId: string;
  scheduledAt: string;
  longTextMode?: "IMAGES_THEN_TEXT" | "CAPTION_THEN_TEXT";
};

export type ScheduleManagedPostsBatchPayload = {
  items: ScheduleManagedPostsBatchItem[];
};

export type ScheduleManagedPostsBatchResult = BulkActionResult & {
  action: BulkActionResult["action"] | "SCHEDULE_BATCH";
};
