"use client";

import type { TelegramAdSaleComputedPaymentStatus } from "@telegram-system/shared";
import { AlertTriangle, Ban, CheckCircle2, CircleDashed, Clock3 } from "lucide-react";
import { channelLocalTime, type TelegramAdCalendarSlot } from "@/lib/telegram-ad-sales";

const toneStyles: Record<TelegramAdCalendarSlot["tone"], string> = {
  AVAILABLE: "border-emerald-700/60 bg-emerald-950/20 text-emerald-100",
  RESERVED: "border-amber-700/60 bg-amber-950/20 text-amber-100",
  SOLD: "border-sky-700/60 bg-sky-950/20 text-sky-100",
  BLOCKED: "border-neutral-700 bg-neutral-900/60 text-neutral-200",
  CONFLICT: "border-rose-700/60 bg-rose-950/20 text-rose-100",
  PAST: "border-neutral-800 bg-neutral-950 text-neutral-500",
};

const toneLabel: Record<TelegramAdCalendarSlot["tone"], string> = {
  AVAILABLE: "Available",
  RESERVED: "Reserved",
  SOLD: "Sold",
  BLOCKED: "Blocked",
  CONFLICT: "Conflict",
  PAST: "Past",
};

const paymentToneLabel: Record<TelegramAdSaleComputedPaymentStatus | "UNPAID", string> = {
  UNPAID: "Unpaid",
  PARTIALLY_PAID: "Partial",
  PAID: "Paid",
  OVERPAID: "Overpaid",
};

function ToneIcon({ tone }: { tone: TelegramAdCalendarSlot["tone"] }) {
  if (tone === "AVAILABLE") return <CheckCircle2 size={14} />;
  if (tone === "BLOCKED") return <Ban size={14} />;
  if (tone === "CONFLICT") return <AlertTriangle size={14} />;
  if (tone === "PAST") return <Clock3 size={14} />;
  return <CircleDashed size={14} />;
}

export function CalendarSlotCard({
  slot,
  advertiserName,
  saleTitle,
  paymentStatus,
  agreedPrice,
  onClick,
}: {
  slot: TelegramAdCalendarSlot;
  advertiserName?: string | null;
  saleTitle?: string | null;
  paymentStatus?: TelegramAdSaleComputedPaymentStatus | "UNPAID" | null;
  agreedPrice?: string | null;
  onClick?: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`w-full rounded-xl border p-3 text-left transition hover:translate-y-[-1px] hover:bg-opacity-90 ${toneStyles[slot.tone]}`}
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide">
            <ToneIcon tone={slot.tone} />
            <span>{toneLabel[slot.tone]}</span>
          </div>
          <p className="mt-2 text-sm font-semibold">{channelLocalTime(slot.scheduledAt)}</p>
          <p className="mt-1 text-xs opacity-80">{slot.timezone}</p>
        </div>
        <div className="rounded-full border border-current/20 px-2 py-1 text-[11px] font-medium uppercase tracking-wide">
          {slot.productId ? "Product" : "Slot"}
        </div>
      </div>

      {slot.existingPlacement ? (
        <div className="mt-3 space-y-1 text-sm">
          <p className="font-medium">{advertiserName || "Advertiser"}</p>
          <p className="text-xs opacity-80">{saleTitle || "Advertising sale"}</p>
          <div className="mt-2 flex flex-wrap gap-2 text-[11px] uppercase tracking-wide">
            <span className="rounded-full border border-current/20 px-2 py-1">
              {slot.existingPlacement.status}
            </span>
            {paymentStatus ? (
              <span className="rounded-full border border-current/20 px-2 py-1">
                {paymentToneLabel[paymentStatus]}
              </span>
            ) : null}
          </div>
          {agreedPrice ? (
            <p className="pt-1 text-xs opacity-90">Agreed {agreedPrice} {slot.currency}</p>
          ) : null}
        </div>
      ) : (
        <div className="mt-3 space-y-1 text-xs opacity-90">
          <p>Expected views: {slot.expectedViews.toLocaleString()}</p>
          <p>Recommended: {slot.recommendedPrice} {slot.currency}</p>
          <p>Minimum: {slot.minimumPrice} {slot.currency}</p>
          <p>{slot.blockingReason || slot.source}</p>
        </div>
      )}
    </button>
  );
}
