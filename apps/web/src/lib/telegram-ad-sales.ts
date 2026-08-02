"use client";

import type {
  TelegramAdAvailabilitySlot,
  TelegramAdAvailabilityState,
  TelegramAdSale,
  TelegramAdSalePlacement,
  TelegramManagedPostCalendarItem,
} from "@telegram-system/shared";
import type {
  TelegramChannel,
  TelegramChannelNetwork,
} from "./api";

export type TelegramAdCalendarView = "week" | "month" | "list";
export type TelegramAdSalesTab =
  | "calendar"
  | "sales"
  | "analytics"
  | "settings";

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
  selectedNetworkId?: string | null;
  networks: TelegramChannelNetwork[];
}): string[] {
  const ids = new Set(params.selectedChannelIds);
  if (params.selectedNetworkId) {
    const network = params.networks.find(
      (item) => item.id === params.selectedNetworkId,
    );
    for (const channel of network?.channels ?? []) {
      ids.add(channel.id);
    }
  }
  return [...ids];
}

export function channelLocalDateKey(value: string | Date) {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function channelLocalTime(value: string | Date) {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const hours = String(date.getHours()).padStart(2, "0");
  const minutes = String(date.getMinutes()).padStart(2, "0");
  return `${hours}:${minutes}`;
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
  return slots.map((slot) => ({
    ...slot,
    id: `${slot.channelId}:${slot.scheduledAt}:${slot.productId ?? "default"}`,
    tone: availabilityStateTone(slot.state),
  }));
}

export function groupSlotsByChannelDay(
  slots: TelegramAdAvailabilitySlot[],
): Map<string, TelegramAdCalendarSlot[]> {
  const grouped = new Map<string, TelegramAdCalendarSlot[]>();
  for (const slot of buildAdCalendarSlots(slots)) {
    const key = `${slot.channelId}:${channelLocalDateKey(slot.scheduledAt)}`;
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
  return username ? `${channel.title} · @${username.replace(/^@/, "")}` : channel.title;
}
