"use client";

import type {
  TelegramAdAvailabilitySlot,
  TelegramAdAvailabilityState,
  TelegramAdSale,
  TelegramAdSalePlacement,
  TelegramManagedPostCalendarItem,
} from "@telegram-system/shared";
import type { TelegramChannel, TelegramChannelNetwork } from "./api";

export type TelegramAdCalendarView = "week" | "month" | "list";
export type TelegramAdSalesCalendarRangeMode = "week" | "month" | "threeMonths";
export type TelegramAdSalesTab =
  | "calendar"
  | "sales"
  | "clients"
  | "analytics"
  | "settings";

const AD_SALES_CALENDAR_RANGE_STORAGE_PREFIX =
  "telegram-ad-sales:calendar-range";

function adSalesCalendarRangeStorageKey(storage: Pick<Storage, "getItem">) {
  const workspaceId = storage.getItem("selected-workspace-id") || "default";
  return `${AD_SALES_CALENDAR_RANGE_STORAGE_PREFIX}:${workspaceId}`;
}

export function readAdSalesCalendarRangeMode(
  storage: Pick<Storage, "getItem"> | null | undefined,
): TelegramAdSalesCalendarRangeMode | null {
  if (!storage) return null;
  try {
    const value = storage.getItem(adSalesCalendarRangeStorageKey(storage));
    return value === "week" || value === "month" || value === "threeMonths"
      ? value
      : null;
  } catch {
    return null;
  }
}

export function writeAdSalesCalendarRangeMode(
  storage: Pick<Storage, "getItem" | "setItem"> | null | undefined,
  view: TelegramAdSalesCalendarRangeMode,
) {
  if (!storage) return;
  try {
    storage.setItem(adSalesCalendarRangeStorageKey(storage), view);
  } catch {
    // Storage can be unavailable in restricted browsing modes.
  }
}

export type TelegramAdCalendarSlotTone =
  | "AVAILABLE"
  | "RESERVED"
  | "SOLD"
  | "BLOCKED"
  | "CONFLICT"
  | "PAST";

export type TelegramAdCalendarSlot = TelegramAdAvailabilitySlot & {
  id: string;
  tone: TelegramAdCalendarSlotTone;
};

export type TelegramAdUnderpricingSummary = {
  recommendedDelta: number;
  minimumDelta: number;
  discountPercent: number;
  isBelowRecommended: boolean;
  isBelowMinimum: boolean;
};

export type TelegramAdPaymentAllocationDraft = {
  placementId: string;
  amount: number;
};

export type TelegramAdCalendarOverlayPlacement = {
  id: string;
  saleId: string;
  saleTitle: string;
  advertiserName: string;
  status: TelegramAdSalePlacement["status"];
  paidStatus: TelegramAdSale["paymentStatus"] | "UNPAID";
  agreedPrice: string;
  currency: string;
  productLabel: string;
  plannedDeleteAt: string | null;
  scheduledAt: string;
  channelId: string;
};

export function toNumber(value: string | number | null | undefined) {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

export function formatPercentValue(value: number) {
  return Math.max(0, Number(value.toFixed(2)));
}

export function buildUnderpricingSummary(params: {
  recommendedPrice: string | number | null | undefined;
  minimumPrice: string | number | null | undefined;
  agreedPrice: string | number | null | undefined;
}): TelegramAdUnderpricingSummary {
  const recommended = toNumber(params.recommendedPrice);
  const minimum = toNumber(params.minimumPrice);
  const agreed = toNumber(params.agreedPrice);
  const recommendedDelta = Math.max(0, recommended - agreed);
  const minimumDelta = Math.max(0, minimum - agreed);
  const discountPercent =
    minimum > 0 && minimumDelta > 0
      ? formatPercentValue((minimumDelta / minimum) * 100)
      : 0;
  return {
    recommendedDelta,
    minimumDelta,
    discountPercent,
    isBelowRecommended: agreed < recommended,
    isBelowMinimum: agreed < minimum,
  };
}

export function autoAllocatePayment(params: {
  amount: number;
  placements: Array<{
    id: string;
    agreedPrice?: string | number | null;
    paidAllocatedAmount?: string | number | null;
  }>;
}): {
  allocations: TelegramAdPaymentAllocationDraft[];
  allocatedTotal: number;
  unallocatedAmount: number;
} {
  let remaining = Math.max(0, params.amount);
  const allocations: TelegramAdPaymentAllocationDraft[] = [];
  for (const placement of params.placements) {
    const unpaid = Math.max(
      0,
      toNumber(placement.agreedPrice) - toNumber(placement.paidAllocatedAmount),
    );
    if (unpaid <= 0 || remaining <= 0) continue;
    const amount = Math.min(unpaid, remaining);
    allocations.push({ placementId: placement.id, amount });
    remaining = Math.max(0, Number((remaining - amount).toFixed(2)));
  }
  const allocatedTotal = Number(
    allocations.reduce((sum, item) => sum + item.amount, 0).toFixed(2),
  );
  return {
    allocations,
    allocatedTotal,
    unallocatedAmount: Number(
      Math.max(0, params.amount - allocatedTotal).toFixed(2),
    ),
  };
}

export function expandNetworkChannelIds(params: {
  selectedChannelIds: string[];
  allChannelIds?: string[];
  selectedNetworkId?: string | null;
  networks: TelegramChannelNetwork[];
}): string[] {
  if (params.selectedNetworkId) {
    const network = params.networks.find(
      (item) => item.id === params.selectedNetworkId,
    );
    const networkChannelIds = (network?.channels ?? []).map(
      (channel) => channel.id,
    );
    const networkIds = new Set(networkChannelIds);
    if (!params.selectedChannelIds.length) {
      return networkChannelIds;
    }
    return params.selectedChannelIds.filter((channelId) =>
      networkIds.has(channelId),
    );
  }
  if (!params.selectedChannelIds.length) {
    return Array.from(new Set(params.allChannelIds ?? []));
  }
  return Array.from(new Set(params.selectedChannelIds));
}

export function channelLocalDateKey(
  value: string | Date,
  timezone = "Europe/Warsaw",
) {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const year = parts.find((part) => part.type === "year")?.value ?? "0000";
  const month = parts.find((part) => part.type === "month")?.value ?? "01";
  const day = parts.find((part) => part.type === "day")?.value ?? "01";
  return `${year}-${month}-${day}`;
}

export function channelLocalTime(
  value: string | Date,
  timezone = "Europe/Warsaw",
) {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: timezone,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(date);
}

function zonedParts(date: Date, timezone: string) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);
  return Object.fromEntries(parts.map((part) => [part.type, part.value]));
}

export function zonedDateTimeToUtc(
  dateKey: string,
  time: string,
  timezone: string,
) {
  const [year, month, day] = dateKey.split("-").map(Number);
  const [hour, minute, second = 0] = time.split(":").map(Number);
  let guess = new Date(Date.UTC(year, month - 1, day, hour, minute, second));
  for (let index = 0; index < 4; index += 1) {
    const parts = zonedParts(guess, timezone);
    const desired = Date.UTC(year, month - 1, day, hour, minute, second);
    const actual = Date.UTC(
      Number(parts.year),
      Number(parts.month) - 1,
      Number(parts.day),
      Number(parts.hour),
      Number(parts.minute),
      Number(parts.second),
    );
    const delta = desired - actual;
    if (delta === 0) return guess;
    guess = new Date(guess.getTime() + delta);
  }
  return guess;
}

export function availabilityStateTone(
  state: TelegramAdAvailabilityState,
): TelegramAdCalendarSlotTone {
  switch (state) {
    case "AVAILABLE":
      return "AVAILABLE";
    case "RESERVED":
      return "RESERVED";
    case "SOLD":
      return "SOLD";
    case "PAST":
      return "PAST";
    case "BLOCKED_BY_POLICY":
    case "MANUAL_ONLY":
      return "BLOCKED";
    case "CONFLICT_WITH_AD":
    case "CONFLICT_WITH_ORGANIC_POST":
      return "CONFLICT";
    default:
      return "BLOCKED";
  }
}

export function buildAdCalendarSlots(
  slots: TelegramAdAvailabilitySlot[],
): TelegramAdCalendarSlot[] {
  return slots.map((slot, index) => ({
    ...slot,
    id:
      slot.inventoryOpportunityKey ||
      slot.existingPlacement?.id ||
      `${slot.channelId}:${slot.scheduledAt}:${slot.productId ?? "default"}:${index}`,
    tone: availabilityStateTone(slot.state),
  }));
}

export function groupSlotsByChannelDay(
  slots: TelegramAdAvailabilitySlot[],
): Map<string, TelegramAdCalendarSlot[]> {
  const grouped = new Map<string, TelegramAdCalendarSlot[]>();
  for (const slot of buildAdCalendarSlots(slots)) {
    const key = `${slot.channelId}:${channelLocalDateKey(slot.scheduledAt, slot.timezone)}`;
    const current = grouped.get(key) ?? [];
    current.push(slot);
    grouped.set(key, current);
  }
  for (const [key, items] of grouped) {
    grouped.set(
      key,
      [...items].sort((left, right) =>
        left.scheduledAt.localeCompare(right.scheduledAt),
      ),
    );
  }
  return grouped;
}

export function collectAdOverlayPlacements(
  sales: TelegramAdSale[],
): TelegramAdCalendarOverlayPlacement[] {
  return sales.flatMap((sale) =>
    sale.placements.map((placement) => ({
      id: placement.id,
      saleId: sale.id,
      saleTitle: sale.title || sale.advertiserName,
      advertiserName: sale.advertiserName,
      status: placement.status,
      paidStatus: sale.paymentStatus || "UNPAID",
      agreedPrice: placement.agreedPrice,
      currency: placement.currency,
      productLabel: placement.telegramAdProductId || "Ad placement",
      plannedDeleteAt: placement.plannedDeleteAt ?? null,
      scheduledAt: placement.scheduledAt,
      channelId: placement.telegramChannelId,
    })),
  );
}

export function findOverlayPlacementForManagedPost(params: {
  calendarItem: TelegramManagedPostCalendarItem;
  overlays: TelegramAdCalendarOverlayPlacement[];
}) {
  return params.overlays.find(
    (overlay) =>
      overlay.channelId === params.calendarItem.telegramChannelId &&
      channelLocalDateKey(overlay.scheduledAt) ===
        channelLocalDateKey(params.calendarItem.scheduledAt ?? "") &&
      channelLocalTime(overlay.scheduledAt) ===
        channelLocalTime(params.calendarItem.scheduledAt ?? ""),
  );
}

export function getChannelOptionLabel(channel: TelegramChannel) {
  const username = channel.username?.trim();
  return username
    ? `${channel.title} · @${username.replace(/^@/, "")}`
    : channel.title;
}
