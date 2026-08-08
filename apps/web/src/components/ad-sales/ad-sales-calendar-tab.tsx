"use client";

import { useMemo } from "react";
import type {
  TelegramAdAvailabilitySlot,
  TelegramAdSale,
} from "@telegram-system/shared";
import { CalendarSlotCard } from "@/components/ad-sales/calendar-slot-card";
import { TelegramEntityAvatar } from "@/components/telegram/telegram-entity-avatar";
import { Card, FormField, Select, Skeleton } from "@/components/ui/primitives";
import type { CurrencySettings, ExchangeRate, TelegramChannel } from "@/lib/api";
import {
  buildAdCalendarSlots,
  channelLocalDateKey,
  channelLocalTime,
  toNumber,
} from "@/lib/telegram-ad-sales";
import { formatMoneyPreview } from "@/lib/money";

const adSalesPanelClass =
  "rounded-[22px] border border-neutral-800 bg-[#171717]";
const adSalesSoftPanelClass =
  "rounded-[18px] border border-neutral-800 bg-[#111111]";

type SlotsLayoutView = "calendar" | "list";

function dateKey(value: Date) {
  return channelLocalDateKey(value);
}

export function CalendarTab(props: {
  loadingChannelIds: string[];
  failedChannelIds: string[];
  calendarView: SlotsLayoutView;
  onCalendarViewChange: (value: SlotsLayoutView) => void;
  calendarRangeMode: "week" | "month" | "threeMonths";
  calendarCursor: Date;
  calendarFrom: Date;
  calendarTo: Date;
  calendarDays: Date[];
  channels: TelegramChannel[];
  selectedChannelIds: string[];
  statusFilter: string;
  onStatusFilterChange: (value: string) => void;
  slotVisibility: "all" | "free" | "busy";
  onSlotVisibilityChange: (value: "all" | "free" | "busy") => void;
  filteredSlots: ReturnType<typeof buildAdCalendarSlots>;
  sales: TelegramAdSale[];
  daySummaries: Array<{
    channelId: string;
    date: string;
    timezone: string;
    organicPostsCountForDay: number;
    adsCountForDay: number;
  }>;
  settings?: CurrencySettings;
  rates?: ExchangeRate[];
  workspaceTimezone: string;
  onCreateFromSlot: (slot: TelegramAdAvailabilitySlot) => void;
  onOpenSale: (saleId: string) => void;
}) {
  const loadingChannelIds = useMemo(
    () => new Set(props.loadingChannelIds),
    [props.loadingChannelIds],
  );
  const failedChannelIds = useMemo(
    () => new Set(props.failedChannelIds),
    [props.failedChannelIds],
  );
  const slotsByChannelDay = useMemo(() => {
    const grouped = new Map<string, typeof props.filteredSlots>();
    for (const slot of props.filteredSlots) {
      const key = `${slot.channelId}:${slot.date}`;
      const current = grouped.get(key) ?? [];
      current.push(slot);
      grouped.set(key, current);
    }
    return grouped;
  }, [props.filteredSlots]);

  const daySummariesByChannelDay = useMemo(() => {
    const grouped = new Map<
      string,
      {
        channelId: string;
        date: string;
        timezone: string;
        organicPostsCountForDay: number;
        adsCountForDay: number;
      }
    >();
    for (const summary of props.daySummaries) {
      grouped.set(`${summary.channelId}:${summary.date}`, summary);
    }
    return grouped;
  }, [props.daySummaries]);

  const visibleChannels = useMemo(
    () =>
      props.channels.filter((channel) =>
        props.selectedChannelIds.length
          ? props.selectedChannelIds.includes(channel.id)
          : true,
      ),
    [props.channels, props.selectedChannelIds],
  );
  const todayKey = channelLocalDateKey(new Date());
  const futureSlotsByChannel = useMemo(() => {
    const grouped = new Map<string, typeof props.filteredSlots>();
    for (const slot of props.filteredSlots) {
      if (slot.date < todayKey) continue;
      const current = grouped.get(slot.channelId) ?? [];
      current.push(slot);
      grouped.set(slot.channelId, current);
    }
    for (const slots of grouped.values()) {
      slots.sort(
        (left, right) =>
          new Date(left.scheduledAt).getTime() -
          new Date(right.scheduledAt).getTime(),
      );
    }
    return grouped;
  }, [props.filteredSlots, todayKey]);

  const saleById = useMemo(
    () => new Map(props.sales.map((sale) => [sale.id, sale])),
    [props.sales],
  );

  const renderSlot = (
    slot: ReturnType<typeof buildAdCalendarSlots>[number],
  ) => {
    const sale = slot.existingPlacement?.saleId
      ? saleById.get(slot.existingPlacement.saleId)
      : undefined;
    return (
      <CalendarSlotCard
        key={slot.id}
        slot={slot}
        advertiserName={sale?.advertiserName}
        saleTitle={sale?.title}
        paymentStatus={sale?.paymentStatus || "UNPAID"}
        agreedPrice={
          sale?.placements.find(
            (placement) => placement.id === slot.existingPlacement?.id,
          )?.agreedPrice
        }
        onClick={
          slot.existingPlacement?.saleId
            ? () => props.onOpenSale(slot.existingPlacement!.saleId)
            : slot.state === "AVAILABLE" ||
                (slot.state === "PAST" && !slot.existingPlacement)
              ? () => props.onCreateFromSlot(slot)
              : undefined
        }
      />
    );
  };
  const placementDetailsForSlot = (
    slot: ReturnType<typeof buildAdCalendarSlots>[number],
  ) => {
    const sale = slot.existingPlacement?.saleId
      ? saleById.get(slot.existingPlacement.saleId)
      : undefined;
    const placement = sale?.placements.find(
      (item) => item.id === slot.existingPlacement?.id,
    );
    return {
      sale,
      placement,
      price: toNumber(placement?.agreedPrice),
      currency: placement?.currency || slot.currency,
    };
  };
  const summarizeRevenue = (slots: ReturnType<typeof buildAdCalendarSlots>) => {
    const totals = new Map<string, number>();
    for (const slot of slots) {
      const details = placementDetailsForSlot(slot);
      if (!details.placement) continue;
      totals.set(
        details.currency,
        (totals.get(details.currency) ?? 0) + details.price,
      );
    }
    return Array.from(totals.entries()).map(([currency, amount]) => ({
      currency,
      amount,
      label: formatMoneyPreview({
        amount,
        currency,
        settings: props.settings,
        rates: props.rates,
      }),
    }));
  };
  const createManualSlot = (
    channel: TelegramChannel,
    day: Date,
  ): TelegramAdAvailabilitySlot => {
    const date = dateKey(day);
    return {
      channelId: channel.id,
      date,
      inventoryOpportunityKey: null,
      scheduledAt: `${date}T12:00:00.000Z`,
      timezone: props.workspaceTimezone,
      source: "manual",
      state: "AVAILABLE",
      blockingReason: null,
      nextOrganicPostAt: null,
      productId: null,
      expectedViews: channel.ownViewsPerPost ?? 0,
      recommendedPrice: "0",
      minimumPrice: "0",
      currency: props.settings?.primaryCurrency ?? "USD",
      existingPlacement: null,
      organicPostsCountForDay: 0,
      adsCountForDay: 0,
    };
  };

  return (
    <div className="space-y-5">
      <Card className={adSalesPanelClass}>
        <div className="grid gap-4 xl:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)_180px]">
          <FormField label="Status">
            <Select
              value={props.statusFilter}
              onChange={(event) =>
                props.onStatusFilterChange(event.target.value)
              }
            >
              <option value="">All states</option>
              <option value="AVAILABLE" className="text-emerald-300">
                ● Available
              </option>
              <option value="RESERVED" className="text-amber-300">
                ● Reserved
              </option>
              <option value="SOLD" className="text-blue-300">
                ● Sold
              </option>
              <option value="BLOCKED_BY_POLICY" className="text-rose-300">
                ● Blocked
              </option>
              <option
                value="CONFLICT_WITH_ORGANIC_POST"
                className="text-orange-300"
              >
                ● Conflict
              </option>
              <option value="PAST" className="text-neutral-400">
                ● Past
              </option>
            </Select>
          </FormField>
          <FormField label="Visibility">
            <Select
              value={props.slotVisibility}
              onChange={(event) =>
                props.onSlotVisibilityChange(
                  event.target.value as "all" | "free" | "busy",
                )
              }
            >
              <option value="all">All</option>
              <option value="free">Only free</option>
              <option value="busy">Only busy</option>
            </Select>
          </FormField>
          <FormField label="Layout">
            <Select
              value={props.calendarView}
              onChange={(event) =>
                props.onCalendarViewChange(
                  event.target.value as "calendar" | "list",
                )
              }
            >
              <option value="calendar">Calendar</option>
              <option value="list">List</option>
            </Select>
          </FormField>
        </div>
      </Card>

      {props.calendarView === "calendar" &&
      props.calendarRangeMode !== "week" ? (
        <div className={adSalesPanelClass}>
          <div className="overflow-hidden rounded-xl border border-slate-800/80">
            <div className="grid grid-cols-7 border-b border-slate-800/80 bg-[#09111e]">
              {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map(
                (label) => (
                  <div
                    key={label}
                    className="border-r border-slate-800/80 px-3 py-2 text-center text-xs font-medium text-neutral-400 last:border-r-0"
                  >
                    {label}
                  </div>
                ),
              )}
            </div>
            <div className="grid grid-cols-7">
              {props.calendarDays.map((day) => {
                const dayDateKey = dateKey(day);
                const outsideMonth =
                  day < props.calendarFrom || day > props.calendarTo;
                const daySlots = visibleChannels.flatMap((channel) =>
                  (
                    slotsByChannelDay.get(`${channel.id}:${dayDateKey}`) ?? []
                  ).map((slot) => ({
                    channel,
                    slot,
                  })),
                );
                const soldSlots = daySlots.filter(({ slot }) =>
                  Boolean(slot.existingPlacement),
                );
                const addSlotChannel = visibleChannels[0] ?? null;
                const revenue = summarizeRevenue(
                  soldSlots.map(({ slot }) => slot),
                );
                return (
                  <div
                    key={day.toISOString()}
                    className={`group/day relative min-h-[96px] border-b border-r border-slate-900/70 p-2 ${outsideMonth ? "bg-black/20 opacity-45" : "bg-[#111111]"}`}
                  >
                    <div className="mb-1.5 flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <div className="flex items-center gap-1.5">
                          <span className="text-sm font-semibold text-white">
                            {day.getDate()}
                          </span>
                          {dayDateKey === todayKey ? (
                            <span className="rounded-full bg-blue-600 px-1.5 py-0.5 text-[9px] font-semibold text-white">
                              Today
                            </span>
                          ) : null}
                        </div>
                        {revenue.length ? (
                          <div className="mt-0.5 space-y-0.5 text-[10px] font-semibold leading-tight text-emerald-300">
                            {revenue.map((item) => (
                              <p key={item.currency}>{item.label}</p>
                            ))}
                          </div>
                        ) : null}
                      </div>
                      {addSlotChannel ? (
                        <button
                          type="button"
                          onClick={() =>
                            props.onCreateFromSlot(
                              createManualSlot(addSlotChannel, day),
                            )
                          }
                          className="shrink-0 rounded-md border border-emerald-700/70 bg-emerald-950/80 px-2 py-1 text-[10px] font-semibold text-emerald-100 opacity-0 shadow-sm transition hover:border-emerald-500 focus-visible:opacity-100 group-hover/day:opacity-100"
                        >
                          Add slot
                        </button>
                      ) : null}
                    </div>
                    <div className="space-y-1">
                      {soldSlots.slice(0, 3).map(({ channel, slot }) => {
                        const details = placementDetailsForSlot(slot);
                        return (
                          <button
                            key={`${channel.id}:${slot.id}`}
                            type="button"
                            disabled={!slot.existingPlacement?.saleId}
                            onClick={() => {
                              if (slot.existingPlacement?.saleId) {
                                props.onOpenSale(slot.existingPlacement.saleId);
                              }
                            }}
                            title={`${channel.title} · ${details.sale?.advertiserName || "Ad placement"} · ${formatMoneyPreview({ amount: details.price, currency: details.currency, settings: props.settings, rates: props.rates })}`}
                            className="flex w-full items-center gap-1.5 rounded-md border border-sky-800/70 bg-sky-950/20 px-1.5 py-1 text-left text-[10px] font-medium text-sky-100 transition hover:border-sky-500"
                          >
                            <TelegramEntityAvatar
                              imageUrl={channel.photoUrl}
                              kind="channel"
                              alt={channel.title}
                              size="xs"
                            />
                            <span className="min-w-0 truncate">
                              {details.sale?.advertiserName || channel.title}
                            </span>
                            <span className="ml-auto shrink-0 text-[9px] opacity-80">
                              {formatMoneyPreview({ amount: details.price, currency: details.currency, settings: props.settings, rates: props.rates })}
                            </span>
                          </button>
                        );
                      })}
                      {soldSlots.length > 3 ? (
                        <button
                          type="button"
                          onClick={() =>
                            soldSlots[3]?.slot.existingPlacement?.saleId &&
                            props.onOpenSale(
                              soldSlots[3].slot.existingPlacement.saleId,
                            )
                          }
                          className="w-full rounded-md border border-neutral-800 bg-neutral-950/70 px-2 py-1 text-left text-[10px] font-medium text-neutral-300 transition hover:border-neutral-600"
                        >
                          +{soldSlots.length - 3} more sold
                        </button>
                      ) : null}
                      {props.loadingChannelIds.length ? (
                        <Skeleton className="h-6 w-full" />
                      ) : null}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      ) : null}

      {props.calendarView === "calendar" &&
      props.calendarRangeMode === "week" ? (
        <div className={adSalesPanelClass}>
          <div className="overflow-x-auto">
            <div className="min-w-max">
              <div
                className="sticky top-0 z-10 border-b border-slate-800/80 bg-[#09111e]/95 backdrop-blur"
                style={{
                  display: "grid",
                  gridTemplateColumns: `180px repeat(${props.calendarDays.length}, minmax(165px, 165px))`,
                }}
              >
                <div className="border-r border-slate-800/80 px-4 py-3 text-sm font-semibold text-white">
                  Channels
                </div>
                {props.calendarDays.map((day) => (
                  <div
                    key={day.toISOString()}
                    className="border-r border-slate-800/80 px-3 py-2.5 text-sm"
                  >
                    <p className="font-semibold text-white">
                      {day.toLocaleDateString(undefined, {
                        weekday: "short",
                        day: "numeric",
                        month: "short",
                      })}
                    </p>
                  </div>
                ))}
              </div>
              {visibleChannels.map((channel) => (
                <div
                  key={channel.id}
                  className="border-b border-slate-900/60 last:border-b-0"
                  style={{
                    display: "grid",
                    gridTemplateColumns: `180px repeat(${props.calendarDays.length}, minmax(165px, 165px))`,
                  }}
                >
                  <div className="sticky left-0 z-[1] border-r border-slate-800/80 bg-[#09111e] px-3 py-3">
                    <div className="flex items-center gap-2">
                      <TelegramEntityAvatar
                        imageUrl={channel.photoUrl}
                        kind="channel"
                        alt={channel.title}
                        size="sm"
                      />
                      <div className="min-w-0">
                        <p className="truncate font-medium text-white">
                          {channel.title}
                        </p>
                        {channel.username ? (
                          <p className="truncate text-xs text-neutral-500">
                            {channel.username}
                          </p>
                        ) : null}
                      </div>
                    </div>
                  </div>
                  {props.calendarDays.map((day) => {
                    const dayKey = `${channel.id}:${dateKey(day)}`;
                    const slots = slotsByChannelDay.get(dayKey) ?? [];
                    const soldSlots = slots.filter((slot) =>
                      Boolean(slot.existingPlacement),
                    );
                    const revenue = summarizeRevenue(soldSlots);
                    const summary = daySummariesByChannelDay.get(dayKey);
                    const organicCount = summary?.organicPostsCountForDay ?? 0;
                    const adSlotsCount =
                      summary?.adsCountForDay ?? soldSlots.length;
                    return (
                      <div
                        key={dayKey}
                        className="group/day min-h-24 border-r border-slate-900/60 p-2"
                      >
                        {loadingChannelIds.has(channel.id) ? (
                          <>
                            <Skeleton className="mb-2 h-3 w-24" />
                            <Skeleton className="h-10 w-full" />
                          </>
                        ) : failedChannelIds.has(channel.id) ? (
                          <p className="text-xs text-rose-300">
                            Could not load slots.
                          </p>
                        ) : (
                          <>
                            <div className="mb-1.5 flex items-start justify-between gap-2">
                              <div className="min-w-0 text-[10px] uppercase tracking-wide text-neutral-500">
                                <p>
                                  {organicCount} organic · {adSlotsCount} slots
                                </p>
                                {revenue.length ? (
                                  <div className="mt-0.5 space-y-0.5 font-semibold normal-case tracking-normal text-emerald-300">
                                    {revenue.map((item) => (
                                      <p key={item.currency}>{item.label}</p>
                                    ))}
                                  </div>
                                ) : null}
                              </div>
                              <button
                                type="button"
                                onClick={() =>
                                  props.onCreateFromSlot(
                                    createManualSlot(channel, day),
                                  )
                                }
                                className="shrink-0 rounded-md border border-emerald-700/70 bg-emerald-950/80 px-2 py-1 text-[10px] font-semibold text-emerald-100 opacity-0 transition hover:border-emerald-500 focus-visible:opacity-100 group-hover/day:opacity-100"
                              >
                                Add slot
                              </button>
                            </div>
                            <div className="space-y-1.5">
                              {soldSlots.slice(0, 2).map(renderSlot)}
                            </div>
                          </>
                        )}
                      </div>
                    );
                  })}
                </div>
              ))}
            </div>
          </div>
        </div>
      ) : null}

      {props.calendarView === "list" ? (
        <div className="space-y-3">
          {visibleChannels.map((channel) => {
            const slots = futureSlotsByChannel.get(channel.id) ?? [];
            return (
              <Card key={channel.id} className={adSalesSoftPanelClass}>
                <div className="flex items-center gap-2">
                  <TelegramEntityAvatar
                    imageUrl={channel.photoUrl}
                    kind="channel"
                    alt={channel.title}
                    size="sm"
                  />
                  <p className="font-medium text-white">{channel.title}</p>
                </div>
                {loadingChannelIds.has(channel.id) ? (
                  <div className="mt-3 grid gap-2 md:grid-cols-2 xl:grid-cols-3">
                    {Array.from({ length: 3 }, (_, index) => (
                      <Skeleton key={index} className="h-16 w-full" />
                    ))}
                  </div>
                ) : failedChannelIds.has(channel.id) ? (
                  <p className="mt-3 text-sm text-rose-300">
                    Could not load slots.
                  </p>
                ) : slots.length ? (
                  <div className="mt-3 grid gap-2 md:grid-cols-2 xl:grid-cols-3">
                    {slots.slice(0, 6).map((slot) => (
                      <button
                        key={slot.id}
                        type="button"
                        disabled={
                          slot.state !== "AVAILABLE" &&
                          !slot.existingPlacement?.saleId
                        }
                        onClick={() => {
                          if (slot.existingPlacement?.saleId) {
                            props.onOpenSale(slot.existingPlacement.saleId);
                            return;
                          }
                          if (slot.state === "AVAILABLE")
                            props.onCreateFromSlot(slot);
                        }}
                        className={`rounded-lg border p-3 text-left transition ${
                          slot.state === "AVAILABLE"
                            ? "border-emerald-700/60 bg-emerald-950/20 hover:border-emerald-500"
                            : slot.existingPlacement?.saleId
                              ? "border-slate-700 bg-slate-950/70 hover:border-slate-500"
                              : "cursor-default border-neutral-800 bg-neutral-950/60"
                        }`}
                      >
                        <p className="text-sm font-medium text-white">
                          {new Date(slot.scheduledAt).toLocaleDateString(
                            undefined,
                            {
                              weekday: "short",
                              day: "numeric",
                              month: "short",
                            },
                          )}
                          {" · "}
                          {channelLocalTime(slot.scheduledAt, slot.timezone)}
                        </p>
                        <p className="mt-1 text-xs text-neutral-400">
                          {slot.state === "AVAILABLE"
                            ? "Add Ad Slot"
                            : slot.state.replaceAll("_", " ")}
                        </p>
                      </button>
                    ))}
                  </div>
                ) : (
                  <p className="mt-3 text-sm text-neutral-500">
                    No upcoming slots for the selected filters.
                  </p>
                )}
              </Card>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}
