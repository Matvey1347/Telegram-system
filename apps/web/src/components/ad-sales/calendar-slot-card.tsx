"use client";

import type { TelegramAdSaleComputedPaymentStatus } from "@telegram-system/shared";
import { CheckCircle2, CircleDashed, Clock3 } from "lucide-react";
import { channelLocalTime, type TelegramAdCalendarSlot } from "@/lib/telegram-ad-sales";

const toneStyles: Record<TelegramAdCalendarSlot["tone"], string> = {
  AVAILABLE: "border-emerald-700/60 bg-emerald-950/20 text-emerald-100",
  RESERVED: "border-amber-700/60 bg-amber-950/20 text-amber-100",
  SOLD: "border-sky-700/60 bg-sky-950/20 text-sky-100",
  BLOCKED: "border-neutral-700 bg-neutral-900/60 text-neutral-200",
  CONFLICT: "border-rose-700/60 bg-rose-950/20 text-rose-100",
  PAST: "border-rose-700/60 bg-rose-950/20 text-rose-100",
};

const paymentToneLabel: Record<TelegramAdSaleComputedPaymentStatus | "UNPAID", string> = {
  UNPAID: "Unpaid",
  PARTIALLY_PAID: "Partial",
  PAID: "Paid",
  OVERPAID: "Overpaid",
};

function OpportunityIcon({ tone }: { tone: TelegramAdCalendarSlot["tone"] }) {
  if (tone === "AVAILABLE") return <CheckCircle2 size={14} />;
  if (tone === "PAST") return <Clock3 size={14} />;
  return <CircleDashed size={14} />;
}

function opportunityTitle(slot: TelegramAdCalendarSlot) {
  if (slot.state === "AVAILABLE") return "Add Ad Slot";
  if (slot.state === "PAST") return "Missed ad slot";
  if (slot.existingPlacement) return "Ad placement";
  return "No ad slot";
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
  const interactive = Boolean(onClick);
  return (
    <button
      type="button"
      disabled={!interactive}
      onClick={onClick}
      className={`w-full rounded-lg border p-2.5 text-left transition ${
        interactive ? "hover:translate-y-[-1px] hover:bg-opacity-90" : "cursor-default"
      } ${toneStyles[slot.tone]}`}
    >
      <div className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wide">
        <OpportunityIcon tone={slot.tone} />
        <span>{opportunityTitle(slot)}</span>
      </div>

      {slot.existingPlacement ? (
        <div className="mt-3 space-y-1 text-sm">
          <p className="font-medium">{advertiserName || "Advertiser"}</p>
          <p className="text-xs opacity-80">{saleTitle || "Advertising sale"}</p>
          <div className="mt-2 flex flex-wrap gap-2 text-[11px] uppercase tracking-wide">
            <span className="rounded-full border border-current/20 px-2 py-1">
              {slot.existingPlacement.status.replaceAll("_", " ")}
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
          {slot.existingPlacement.status !== "RESERVED" ? (
            <p className="text-xs opacity-70">
              Assigned time: {channelLocalTime(slot.scheduledAt, slot.timezone)}
            </p>
          ) : null}
        </div>
      ) : null}
    </button>
  );
}
