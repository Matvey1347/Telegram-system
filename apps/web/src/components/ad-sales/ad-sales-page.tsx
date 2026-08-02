"use client";

import { useEffect, useMemo, useState } from "react";
import { useQueries, useQuery, useQueryClient } from "@tanstack/react-query";
import { usePathname, useRouter } from "next/navigation";
import {
  BarChart3,
  CalendarDays,
  CircleDollarSign,
  Info,
  Layers3,
  Plus,
  Settings2,
} from "lucide-react";
import type {
  TelegramAdAvailabilitySlot,
  TelegramAdPriceSnapshot,
  TelegramAdProduct,
  TelegramAdSale,
} from "@telegram-system/shared";
import { AppShell } from "@/components/layout/app-shell";
import { PageTabHead } from "@/components/layout/page-tab-head";
import { MemberBadge } from "@/components/workspace/member-badge";
import { MemberSelect } from "@/components/workspace/member-select";
import { MoneyStack } from "@/components/ui/money-stack";
import { Pagination } from "@/components/ui/pagination";
import {
  Button,
  Card,
  EmptyState,
  ErrorState,
  FormField,
  Input,
  LoadingState,
  Modal,
  MultiSelect,
  PageHeader,
  Select,
  TableLoadingState,
  Textarea,
  Tooltip,
} from "@/components/ui/primitives";
import {
  CalendarSlotCard,
} from "@/components/ad-sales/calendar-slot-card";
import {
  allowedSaleActions,
  SaleStatusActions,
  type SaleActionKey,
} from "@/components/ad-sales/sale-status-actions";
import { RegisterPaymentModal } from "@/components/ad-sales/register-payment-modal";
import { SaleWizardModal } from "@/components/ad-sales/sale-wizard-modal";
import { AdSalesAnalyticsPanel } from "@/components/ad-sales/ad-sales-analytics-panel";
import {
  accountsApi,
  authApi,
  currenciesApi,
  telegramAdSalesApi,
  telegramChannelsApi,
  telegramChannelNetworksApi,
  type Account,
  type TelegramChannel,
  type TelegramChannelNetwork,
  type TelegramManagedPost,
} from "@/lib/api";
import {
  buildAdCalendarSlots,
  buildUnderpricingSummary,
  channelLocalDateKey,
  channelLocalTime,
  collectAdOverlayPlacements,
  expandNetworkChannelIds,
  getChannelOptionLabel,
  type TelegramAdSalesTab,
  type TelegramAdCalendarView,
} from "@/lib/telegram-ad-sales";
import {
  invalidateTelegramAdSalesQueries,
  telegramAdSalesKeys,
} from "@/lib/telegram-ad-sales-query";
import { useAppToast } from "@/providers/toast-provider";

const tabs: Array<{
  id: TelegramAdSalesTab;
  label: string;
  icon: typeof CalendarDays;
}> = [
  { id: "calendar", label: "Calendar", icon: CalendarDays },
  { id: "sales", label: "Deals", icon: CircleDollarSign },
  { id: "analytics", label: "Analytics", icon: BarChart3 },
  { id: "settings", label: "Setup", icon: Settings2 },
];

const tabDescriptions: Record<TelegramAdSalesTab, string> = {
  calendar:
    "Book placements here. Green slots are available, while busy and past slots are only history.",
  sales:
    "Track created deals here: reserved, confirmed, paid, published, and completed placements.",
  analytics:
    "See revenue, fill rate, overdue payments, and channel performance for the current selection.",
  settings:
    "Configure formats, audience baseline, and the posting rule that turns organic posts into ad slots.",
};

function startOfWeek(value: Date) {
  const date = new Date(value);
  const day = date.getDay() || 7;
  date.setDate(date.getDate() - day + 1);
  date.setHours(0, 0, 0, 0);
  return date;
}

function addDays(value: Date, days: number) {
  const date = new Date(value);
  date.setDate(date.getDate() + days);
  return date;
}

function dateKey(value: Date) {
  return value.toISOString().slice(0, 10);
}

function startOfMonth(value: Date) {
  return new Date(value.getFullYear(), value.getMonth(), 1);
}

function endOfMonth(value: Date) {
  return new Date(value.getFullYear(), value.getMonth() + 1, 0, 23, 59, 59, 999);
}

function monthGridDays(value: Date) {
  const start = startOfWeek(startOfMonth(value));
  return Array.from({ length: 42 }, (_, index) => addDays(start, index));
}

function rangeForView(view: TelegramAdCalendarView, cursor: Date) {
  if (view === "month") {
    return {
      from: startOfMonth(cursor),
      to: endOfMonth(cursor),
    };
  }
  if (view === "list") {
    return {
      from: startOfWeek(cursor),
      to: addDays(startOfWeek(cursor), 20),
    };
  }
  return {
    from: startOfWeek(cursor),
    to: addDays(startOfWeek(cursor), 6),
  };
}

function tabButtonClass(active: boolean) {
  return active
    ? "border-blue-500 bg-blue-600 text-white"
    : "border-neutral-800 bg-neutral-900 text-neutral-300 hover:border-neutral-700 hover:text-white";
}

function saleChannelCount(sale: TelegramAdSale) {
  return new Set(sale.placements.map((placement) => placement.telegramChannelId)).size;
}

function isSaleUnderpriced(sale: TelegramAdSale) {
  return sale.placements.some((placement) =>
    buildUnderpricingSummary({
      agreedPrice: placement.agreedPrice,
      recommendedPrice: placement.recommendedPrice,
      minimumPrice: placement.minimumPrice,
    }).isBelowMinimum,
  );
}

function saleStatusTone(status: TelegramAdSale["status"]) {
  if (status === "COMPLETED") return "bg-emerald-900/40 text-emerald-300 border-emerald-700";
  if (status === "CONFIRMED" || status === "IN_PROGRESS")
    return "bg-blue-900/40 text-blue-300 border-blue-700";
  if (status === "RESERVED") return "bg-amber-900/40 text-amber-300 border-amber-700";
  if (status === "CANCELLED") return "bg-red-900/40 text-red-300 border-red-700";
  return "bg-neutral-800 text-neutral-300 border-neutral-700";
}

function paymentStatusTone(status: string) {
  if (status === "PAID") return "bg-emerald-900/40 text-emerald-300 border-emerald-700";
  if (status === "PARTIALLY_PAID") return "bg-amber-900/40 text-amber-300 border-amber-700";
  if (status === "OVERPAID") return "bg-blue-900/40 text-blue-300 border-blue-700";
  return "bg-red-900/40 text-red-300 border-red-700";
}

function EnumPill({
  label,
  tone,
}: {
  label: string;
  tone: string;
}) {
  return (
    <span className={`inline-flex rounded-full border px-2 py-0.5 text-xs font-medium ${tone}`}>
      {label}
    </span>
  );
}

const tabRouteMap: Record<TelegramAdSalesTab, string> = {
  calendar: "/ad-sales/calendar",
  sales: "/ad-sales/sales",
  analytics: "/ad-sales/analytics",
  settings: "/ad-sales/settings",
};

function routeTabFromPathname(pathname: string): TelegramAdSalesTab {
  if (pathname.startsWith("/ad-sales/pricing")) return "settings";
  if (pathname.startsWith("/ad-sales/analytics")) return "analytics";
  if (pathname.startsWith("/ad-sales/settings")) return "settings";
  if (pathname.startsWith("/ad-sales/sales")) return "sales";
  return "calendar";
}

export function AdSalesPage() {
  const pathname = usePathname();
  const router = useRouter();
  const queryClient = useQueryClient();
  const { pushToast } = useAppToast();
  const [tab, setTab] = useState<TelegramAdSalesTab>(() => routeTabFromPathname(pathname));
  const [calendarView, setCalendarView] = useState<TelegramAdCalendarView>("week");
  const [calendarCursor, setCalendarCursor] = useState(() => new Date("2026-08-01T12:00:00.000Z"));
  const [selectedNetworkId, setSelectedNetworkId] = useState("");
  const [selectedChannelIds, setSelectedChannelIds] = useState<string[]>([]);
  const [selectedProductIds, setSelectedProductIds] = useState<string[]>([]);
  const [statusFilter, setStatusFilter] = useState("");
  const [responsibleMemberId, setResponsibleMemberId] = useState("");
  const [slotVisibility, setSlotVisibility] = useState<"all" | "free" | "busy">("all");
  const [salesPage, setSalesPage] = useState(1);
  const [salesPageSize, setSalesPageSize] = useState(25);
  const [saleSearch, setSaleSearch] = useState("");
  const [paymentStatusFilter, setPaymentStatusFilter] = useState("");
  const [underpricedOnly, setUnderpricedOnly] = useState(false);
  const [unpaidOnly, setUnpaidOnly] = useState(false);
  const [selectedSaleId, setSelectedSaleId] = useState<string | null>(null);
  const [saleWizardOpen, setSaleWizardOpen] = useState(false);
  const [wizardSeedSlot, setWizardSeedSlot] = useState<TelegramAdAvailabilitySlot | null>(null);
  const [paymentSaleId, setPaymentSaleId] = useState<string | null>(null);
  const [postEditorPlacement, setPostEditorPlacement] = useState<{
    saleId: string;
    placementId: string;
  } | null>(null);
  const [postTitle, setPostTitle] = useState("");
  const [postText, setPostText] = useState("");
  const [postImages, setPostImages] = useState("");

  useEffect(() => {
    setTab(routeTabFromPathname(pathname));
  }, [pathname]);

  const { from, to } = useMemo(
    () => rangeForView(calendarView, calendarCursor),
    [calendarCursor, calendarView],
  );

  const { data: settings } = useQuery({
    queryKey: ["currency-settings"],
    queryFn: currenciesApi.getSettings,
  });
  const { data: me } = useQuery({
    queryKey: ["auth", "me"],
    queryFn: authApi.me,
  });
  const { data: rates } = useQuery({
    queryKey: ["currency-rates"],
    queryFn: currenciesApi.listRates,
  });
  const { data: channels = [] } = useQuery({
    queryKey: ["telegram-channels"],
    queryFn: telegramChannelsApi.list,
  });
  const { data: networks = [] } = useQuery({
    queryKey: ["telegram-channel-networks"],
    queryFn: telegramChannelNetworksApi.list,
  });
  const { data: accounts = [] } = useQuery({
    queryKey: ["accounts"],
    queryFn: accountsApi.list,
  });
  const workspaceTimezone = me?.workspace.timezone || "Europe/Warsaw";
  const salesQuery = useQuery({
    queryKey: telegramAdSalesKeys.sales({
      page: salesPage,
      pageSize: salesPageSize,
      status: statusFilter || undefined,
    }),
    queryFn: () =>
      telegramAdSalesApi.listSalesPage({
        page: salesPage,
        pageSize: salesPageSize,
        ...(statusFilter ? { status: statusFilter } : {}),
      }),
  });
  const selectedSaleQuery = useQuery({
    queryKey: selectedSaleId ? telegramAdSalesKeys.sale(selectedSaleId) : ["telegram-ad-sale", "none"],
    queryFn: () => telegramAdSalesApi.getSale(selectedSaleId!),
    enabled: Boolean(selectedSaleId),
  });

  const saleableChannels = useMemo(
    () =>
      channels.filter((channel) => channel.preview?.canPostMessages),
    [channels],
  );
  const saleableChannelIds = useMemo(
    () => new Set(saleableChannels.map((channel) => channel.id)),
    [saleableChannels],
  );
  const saleableNetworks = useMemo(
    () =>
      networks
        .map((network) => ({
          ...network,
          channels: network.channels.filter((channel) =>
            saleableChannelIds.has(channel.id),
          ),
        }))
        .filter((network) => network.channels.length > 0),
    [networks, saleableChannelIds],
  );

  const effectiveChannelIds = useMemo(
    () =>
      expandNetworkChannelIds({
        selectedChannelIds,
        selectedNetworkId: selectedNetworkId || null,
        networks: saleableNetworks as TelegramChannelNetwork[],
      }),
    [saleableNetworks, selectedChannelIds, selectedNetworkId],
  );

  useEffect(() => {
    if (saleableChannels.length && !effectiveChannelIds.length) {
      setSelectedChannelIds(saleableChannels.slice(0, 3).map((channel) => channel.id));
    }
  }, [effectiveChannelIds.length, saleableChannels]);

  useEffect(() => {
    if (!selectedChannelIds.length) return;
    const allowedIds = new Set(saleableChannels.map((channel) => channel.id));
    const nextIds = selectedChannelIds.filter((channelId) => allowedIds.has(channelId));
    if (nextIds.length !== selectedChannelIds.length) {
      setSelectedChannelIds(nextIds);
    }
  }, [saleableChannels, selectedChannelIds]);

  const channelProductQueries = useQueries({
    queries: effectiveChannelIds.map((channelId) => ({
      queryKey: telegramAdSalesKeys.channelProducts(channelId),
      queryFn: () => telegramAdSalesApi.listChannelProducts(channelId),
      enabled: tab === "calendar" || tab === "settings" || saleWizardOpen,
    })),
  });
  const productsByChannelId = useMemo<Record<string, TelegramAdProduct[]>>(
    () =>
      Object.fromEntries(
        effectiveChannelIds.map((channelId, index) => [
          channelId,
          (channelProductQueries[index]?.data ?? []) as TelegramAdProduct[],
        ]),
      ),
    [channelProductQueries, effectiveChannelIds],
  );

  const availabilityQuery = useQuery({
    queryKey: telegramAdSalesKeys.availability({
      from: from.toISOString(),
      to: to.toISOString(),
      channelIds: effectiveChannelIds,
      productIds: selectedProductIds,
      networkId: selectedNetworkId || undefined,
    }),
    queryFn: () =>
      telegramAdSalesApi.availability({
        from: from.toISOString(),
        to: to.toISOString(),
        channelIds: effectiveChannelIds,
        ...(selectedNetworkId ? { networkId: selectedNetworkId } : {}),
        ...(selectedProductIds.length ? { productIds: selectedProductIds } : {}),
      }),
    enabled: Boolean(effectiveChannelIds.length),
  });

  const managedPostCalendarQueries = useQueries({
    queries: effectiveChannelIds.map((channelId) => ({
      queryKey: ["telegram-managed-posts-calendar", channelId, { from: from.toISOString(), to: to.toISOString() }],
      queryFn: () =>
        telegramChannelsApi.managedPostsCalendar(channelId, {
          from: from.toISOString(),
          to: to.toISOString(),
        }),
      enabled: tab === "calendar" && calendarView !== "list",
    })),
  });

  const filteredSales = useMemo(() => {
    let items = salesQuery.data?.items ?? [];
    const search = saleSearch.trim().toLowerCase();
    if (search) {
      items = items.filter((sale) =>
        [sale.title, sale.advertiserName, sale.advertiserTelegram, sale.advertiserContact]
          .filter(Boolean)
          .some((value) => String(value).toLowerCase().includes(search)),
      );
    }
    if (paymentStatusFilter) {
      items = items.filter((sale) => sale.paymentStatus === paymentStatusFilter);
    }
    if (responsibleMemberId) {
      items = items.filter((sale) => sale.assignedMemberId === responsibleMemberId);
    }
    if (underpricedOnly) {
      items = items.filter(isSaleUnderpriced);
    }
    if (unpaidOnly) {
      items = items.filter((sale) => sale.paymentStatus !== "PAID");
    }
    if (selectedChannelIds.length) {
      items = items.filter((sale) =>
        sale.placements.some((placement) => effectiveChannelIds.includes(placement.telegramChannelId)),
      );
    }
    return items;
  }, [
    effectiveChannelIds,
    paymentStatusFilter,
    responsibleMemberId,
    saleSearch,
    salesQuery.data?.items,
    selectedChannelIds.length,
    underpricedOnly,
    unpaidOnly,
  ]);

  const filteredSlots = useMemo(() => {
    let items = buildAdCalendarSlots(availabilityQuery.data?.slots ?? []);
    if (statusFilter) {
      items = items.filter(
        (slot) => slot.existingPlacement?.status === statusFilter || slot.state === statusFilter,
      );
    }
    if (slotVisibility === "free") {
      items = items.filter((slot) => slot.state === "AVAILABLE");
    }
    if (slotVisibility === "busy") {
      items = items.filter((slot) => slot.state !== "AVAILABLE");
    }
    return items;
  }, [availabilityQuery.data?.slots, slotVisibility, statusFilter]);

  const organicByChannelId = useMemo(
    () =>
      Object.fromEntries(
        effectiveChannelIds.map((channelId, index) => [
          channelId,
          managedPostCalendarQueries[index]?.data?.items ?? [],
        ]),
      ) as Record<string, Array<{ id: string; title: string; status: string; scheduledAt?: string | null; publishedAt?: string | null; telegramMessageUrls: string[] }>>,
    [effectiveChannelIds, managedPostCalendarQueries],
  );

  const overlayPlacements = useMemo(
    () => collectAdOverlayPlacements(salesQuery.data?.items ?? []),
    [salesQuery.data?.items],
  );

  const pricingChannels = useMemo(
    () =>
      effectiveChannelIds
        .map((channelId) => channels.find((channel) => channel.id === channelId))
        .filter((channel): channel is TelegramChannel => Boolean(channel)),
    [channels, effectiveChannelIds],
  );

  const pricingHistoryQueries = useQueries({
    queries: pricingChannels.map((channel) => ({
      queryKey: telegramAdSalesKeys.priceHistory(channel.id, { limit: 20 }),
      queryFn: () => telegramAdSalesApi.priceHistory(channel.id, { limit: 20 }),
      enabled: tab === "settings",
    })),
  });

  const policyQueries = useQueries({
    queries: pricingChannels.map((channel) => ({
      queryKey: telegramAdSalesKeys.policy(channel.id),
      queryFn: () => telegramAdSalesApi.getPolicy(channel.id),
      enabled: tab === "settings",
    })),
  });

  async function handleCreateSale(payload: Parameters<NonNullable<React.ComponentProps<typeof SaleWizardModal>["onSubmit"]>>[0]) {
    const sale = await telegramAdSalesApi.createSale({
      advertiserId: payload.advertiserId,
      createAdvertiser: payload.createAdvertiser,
      advertiserName: payload.advertiserName,
      advertiserTelegram: payload.advertiserTelegram,
      advertiserContact: payload.advertiserContact,
      notes: payload.notes,
      settlementCurrency: payload.settlementCurrency,
      assignedMemberId: payload.assignedMemberId,
    }, true);

    for (const placement of payload.placements) {
      await telegramAdSalesApi.addPlacement(sale.id, {
        telegramChannelId: placement.channelId,
        telegramAdProductId: placement.productId,
        scheduledAt: placement.scheduledAt,
        timezone: placement.timezone,
        agreedPrice: placement.agreedPrice,
        recommendedPrice: placement.recommendedPrice,
        minimumPrice: placement.minimumPrice,
        expectedViews: placement.expectedViews,
        pricingMode: placement.pricingMode,
        manualPriceReason: placement.manualPriceReason,
      }, true);
    }
    const refreshed = await telegramAdSalesApi.getSale(sale.id);
    try {
      const reserved = await telegramAdSalesApi.reserveSale(sale.id, {
        placements: refreshed.placements.map((placement) => ({
          placementId: placement.id,
          scheduledAt: placement.scheduledAt,
        })),
      }, true);
      await invalidateTelegramAdSalesQueries(queryClient, {
        saleId: reserved.id,
        channelIds: reserved.placements.map((placement) => placement.telegramChannelId),
      });
      pushToast("Ad sale reserved successfully.", "success");
      return { sale: reserved };
    } catch (error) {
      await invalidateTelegramAdSalesQueries(queryClient, {
        saleId: refreshed.id,
        channelIds: refreshed.placements.map((placement) => placement.telegramChannelId),
      });
      throw error;
    }
  }

  async function refreshSaleAfterMutation(saleId: string, channelIds: string[]) {
    await invalidateTelegramAdSalesQueries(queryClient, { saleId, channelIds });
    await queryClient.invalidateQueries({ queryKey: telegramAdSalesKeys.sales({}) });
  }

  const selectedSale = selectedSaleQuery.data ?? null;
  const selectedPaymentSale =
    paymentSaleId != null
      ? selectedSale?.id === paymentSaleId
        ? selectedSale
        : salesQuery.data?.items.find((sale) => sale.id === paymentSaleId) ?? null
      : null;

  return (
    <AppShell>
      <PageTabHead title="Ad Sales" emoji="💼" color="#0f766e" />
      <PageHeader
        title="Advertising sales"
        subtitle="Sell ad placements across your own Telegram channels and networks."
        action={
          <Button
            onClick={() => {
              setWizardSeedSlot(null);
              setSaleWizardOpen(true);
            }}
          >
            <span className="inline-flex items-center gap-2">
              <Plus size={16} />
              New sale
            </span>
          </Button>
        }
      />

      <Card className="mb-5">
        <div className="flex flex-wrap gap-2">
          {tabs.map((item) => {
            const Icon = item.icon;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => {
                  setTab(item.id);
                  router.replace(tabRouteMap[item.id]);
                }}
                className={`inline-flex items-center gap-2 rounded-full border px-4 py-2 text-sm font-medium ${tabButtonClass(tab === item.id)}`}
              >
                <Icon size={16} />
                {item.label}
                <Tooltip
                  side="bottom"
                  align="center"
                  className="w-fit"
                  content={<span className="block w-72">{tabDescriptions[item.id]}</span>}
                >
                  <span
                    className="inline-flex h-5 w-5 items-center justify-center rounded-full text-neutral-300 transition hover:text-white"
                    onClick={(event) => event.stopPropagation()}
                  >
                    <Info size={14} />
                  </span>
                </Tooltip>
              </button>
            );
          })}
        </div>
      </Card>

      {tab === "calendar" ? (
        <CalendarTab
          calendarView={calendarView}
          onCalendarViewChange={setCalendarView}
          calendarCursor={calendarCursor}
          onCalendarCursorChange={setCalendarCursor}
          channels={saleableChannels}
          networks={saleableNetworks}
          selectedNetworkId={selectedNetworkId}
          onSelectedNetworkIdChange={setSelectedNetworkId}
          selectedChannelIds={selectedChannelIds}
          onSelectedChannelIdsChange={setSelectedChannelIds}
          selectedProductIds={selectedProductIds}
          onSelectedProductIdsChange={setSelectedProductIds}
          statusFilter={statusFilter}
          onStatusFilterChange={setStatusFilter}
          slotVisibility={slotVisibility}
          onSlotVisibilityChange={setSlotVisibility}
          filteredSlots={filteredSlots}
          organicByChannelId={organicByChannelId}
          overlayPlacements={overlayPlacements}
          sales={salesQuery.data?.items ?? []}
          settings={settings}
          rates={rates}
          onCreateFromSlot={(slot) => {
            setWizardSeedSlot(slot);
            setSaleWizardOpen(true);
          }}
        />
      ) : null}

      {tab === "sales" ? (
        <SalesTab
          sales={filteredSales}
          loading={salesQuery.isLoading}
          error={salesQuery.error}
          page={salesQuery.data?.pagination.page ?? salesPage}
          pageSize={salesQuery.data?.pagination.pageSize ?? salesPageSize}
          pagination={salesQuery.data?.pagination}
          onPageChange={setSalesPage}
          onPageSizeChange={setSalesPageSize}
          search={saleSearch}
          onSearchChange={setSaleSearch}
          statusFilter={statusFilter}
          onStatusFilterChange={setStatusFilter}
          paymentStatusFilter={paymentStatusFilter}
          onPaymentStatusFilterChange={setPaymentStatusFilter}
          responsibleMemberId={responsibleMemberId}
          onResponsibleMemberIdChange={setResponsibleMemberId}
          underpricedOnly={underpricedOnly}
          onUnderpricedOnlyChange={setUnderpricedOnly}
          unpaidOnly={unpaidOnly}
          onUnpaidOnlyChange={setUnpaidOnly}
          settings={settings}
          rates={rates}
          onOpenSale={setSelectedSaleId}
        />
      ) : null}

      {tab === "analytics" ? (
        <AdSalesAnalyticsPanel
          selectedChannelIds={effectiveChannelIds}
          selectedNetworkId={selectedNetworkId || null}
        />
      ) : null}

      {tab === "settings" ? (
        <SettingsTab
          channels={pricingChannels}
          supportedCurrencies={settings?.supportedCurrencies ?? ["USD", "EUR", "PLN", "UAH"]}
          workspaceTimezone={workspaceTimezone}
          productsByChannelId={productsByChannelId}
          historyQueries={pricingHistoryQueries.map((query) => query.data ?? [])}
          policies={policyQueries.map((query) => query.data)}
          onCreateProduct={async (channelId, payload) => {
            await telegramAdSalesApi.createProduct(channelId, payload);
            await queryClient.invalidateQueries({
              queryKey: telegramAdSalesKeys.channelProducts(channelId),
            });
          }}
          onUpdateProduct={async (productId, payload, channelId) => {
            await telegramAdSalesApi.updateProduct(productId, payload);
            await queryClient.invalidateQueries({
              queryKey: telegramAdSalesKeys.channelProducts(channelId),
            });
          }}
          onUpdatePolicy={async (channelId, payload) => {
            await telegramAdSalesApi.updatePolicy(channelId, payload);
            await queryClient.invalidateQueries({
              queryKey: telegramAdSalesKeys.policy(channelId),
            });
          }}
          onApplyPolicyToChannels={async (channelIds, payload) => {
            await Promise.all(
              channelIds.map((channelId) => telegramAdSalesApi.updatePolicy(channelId, payload)),
            );
            await Promise.all(
              channelIds.map((channelId) =>
                queryClient.invalidateQueries({
                  queryKey: telegramAdSalesKeys.policy(channelId),
                }),
              ),
            );
          }}
          onRecalculate={async (channelId, productId) => {
            await telegramAdSalesApi.createQuote({
              telegramChannelId: channelId,
              telegramAdProductId: productId || undefined,
            });
            await queryClient.invalidateQueries({
              queryKey: telegramAdSalesKeys.priceHistory(channelId, { limit: 20 }),
            });
          }}
          onRecommendPolicy={async (channelId, payload) => {
            const recommendation = await telegramAdSalesApi.recommendPolicy(channelId, {});
            await telegramAdSalesApi.updatePolicy(channelId, {
              ...payload,
              ...recommendation,
            });
            await queryClient.invalidateQueries({
              queryKey: telegramAdSalesKeys.policy(channelId),
            });
          }}
        />
      ) : null}

      <SaleWizardModal
        open={saleWizardOpen}
        onClose={() => setSaleWizardOpen(false)}
        channels={saleableChannels}
        networks={saleableNetworks as TelegramChannelNetwork[]}
        productsByChannelId={productsByChannelId}
        defaultCurrency={settings?.primaryCurrency || "USD"}
        supportedCurrencies={settings?.supportedCurrencies ?? ["USD", "EUR", "PLN", "UAH"]}
        workspaceTimezone={workspaceTimezone}
        initialChannelId={wizardSeedSlot?.channelId ?? null}
        initialScheduledAt={wizardSeedSlot?.scheduledAt ?? null}
        onSearchAdvertisers={(query) => telegramAdSalesApi.searchAdvertisers({ q: query, limit: 5 })}
        onRequestQuote={async ({ channelId, productId, pricingMode }) =>
          telegramAdSalesApi.createQuote({
            telegramChannelId: channelId,
            telegramAdProductId: productId,
            pricingMode,
          })
        }
        onFindNearestSlot={async ({ channelId, productId, from }) => {
          const result = await telegramAdSalesApi.availability({
            from,
            to: addDays(new Date(from), 14).toISOString(),
            channelIds: [channelId],
            ...(productId ? { productIds: [productId] } : {}),
          });
          const nearest = result.slots.find((slot) => slot.state === "AVAILABLE");
          return nearest
            ? {
                scheduledAt: nearest.scheduledAt,
                recommendedPrice: nearest.recommendedPrice,
                minimumPrice: nearest.minimumPrice,
                expectedViews: nearest.expectedViews,
              }
            : null;
        }}
        onSubmit={handleCreateSale}
      />

      <RegisterPaymentModal
        open={Boolean(paymentSaleId)}
        onClose={() => setPaymentSaleId(null)}
        sale={selectedPaymentSale}
        accounts={accounts as Account[]}
        defaultCurrency={settings?.primaryCurrency || "USD"}
        onSubmit={async (payload) => {
          if (!selectedPaymentSale) return;
          await telegramAdSalesApi.createPayment(selectedPaymentSale.id, payload);
          await refreshSaleAfterMutation(
            selectedPaymentSale.id,
            selectedPaymentSale.placements.map((placement) => placement.telegramChannelId),
          );
          setPaymentSaleId(null);
        }}
      />

      <SaleDetailsModal
        sale={selectedSale}
        open={Boolean(selectedSaleId)}
        onClose={() => setSelectedSaleId(null)}
        settings={settings}
        rates={rates}
        onAction={async (sale, action, placement) => {
          const placementId = placement?.id;
          if (action === "confirm") {
            await telegramAdSalesApi.confirmSale(sale.id);
          } else if (action === "reserve") {
            await telegramAdSalesApi.reserveSale(sale.id, {
              placements: sale.placements.map((item) => ({
                placementId: item.id,
                scheduledAt: item.scheduledAt,
              })),
            });
          } else if (action === "cancel") {
            placementId
              ? await telegramAdSalesApi.cancelPlacement(sale.id, placementId, {})
              : await telegramAdSalesApi.cancelSale(sale.id);
          } else if (action === "register-payment") {
            setPaymentSaleId(sale.id);
            return;
          } else if (action === "create-post" && placementId) {
            setPostEditorPlacement({ saleId: sale.id, placementId });
            setPostTitle(sale.title || sale.advertiserName);
            setPostText("");
            setPostImages("");
            return;
          } else if (action === "schedule" && placementId) {
            await telegramAdSalesApi.schedulePlacement(sale.id, placementId, {});
          } else if (action === "publish" && placementId) {
            await telegramAdSalesApi.publishPlacement(sale.id, placementId, {});
          } else if (action === "reschedule" && placementId) {
            await telegramAdSalesApi.reschedulePlacement(sale.id, placementId, {
              scheduledAt: placement.scheduledAt,
            });
          } else if (action === "retry-deletion" && placementId) {
            await telegramAdSalesApi.retryDeletion(sale.id, placementId, {});
          } else if (action === "complete-permanent" && placementId) {
            await telegramAdSalesApi.completePermanentPlacement(sale.id, placementId, {});
          } else if (action === "attach-post" && placementId) {
            const channelPosts = await telegramChannelsApi.managedPosts(placement.telegramChannelId);
            const candidate = channelPosts.find((post) => post.status === "DRAFT");
            if (!candidate) {
              pushToast("No draft managed post found for this channel.", "error");
              return;
            }
            await telegramAdSalesApi.attachManagedPost(sale.id, placementId, {
              managedPostId: candidate.id,
            });
          }
          await refreshSaleAfterMutation(
            sale.id,
            sale.placements.map((item) => item.telegramChannelId),
          );
          await queryClient.invalidateQueries({
            queryKey: telegramAdSalesKeys.sale(sale.id),
          });
        }}
      />

      <Modal
        open={Boolean(postEditorPlacement)}
        onClose={() => setPostEditorPlacement(null)}
        title="Create advertising post"
        size="xl"
      >
        <div className="space-y-4">
          <FormField label="Title">
            <Input value={postTitle} onChange={(event) => setPostTitle(event.target.value)} />
          </FormField>
          <FormField label="Text">
            <Textarea rows={8} value={postText} onChange={(event) => setPostText(event.target.value)} />
          </FormField>
          <FormField label="Image URLs">
            <Textarea
              rows={4}
              value={postImages}
              onChange={(event) => setPostImages(event.target.value)}
              placeholder="One URL per line"
            />
          </FormField>
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setPostEditorPlacement(null)}>
              Cancel
            </Button>
            <Button
              onClick={async () => {
                if (!postEditorPlacement) return;
                await telegramAdSalesApi.createManagedPostFromPlacement(
                  postEditorPlacement.saleId,
                  postEditorPlacement.placementId,
                  {
                    title: postTitle,
                    text: postText,
                    imageUrls: postImages
                      .split("\n")
                      .map((value) => value.trim())
                      .filter(Boolean),
                  },
                );
                const saleId = postEditorPlacement.saleId;
                setPostEditorPlacement(null);
                await queryClient.invalidateQueries({
                  queryKey: telegramAdSalesKeys.sale(saleId),
                });
                await queryClient.invalidateQueries({ queryKey: telegramAdSalesKeys.root });
              }}
            >
              Create post
            </Button>
          </div>
        </div>
      </Modal>
    </AppShell>
  );
}

function CalendarTab(props: {
  calendarView: TelegramAdCalendarView;
  onCalendarViewChange: (value: TelegramAdCalendarView) => void;
  calendarCursor: Date;
  onCalendarCursorChange: (value: Date) => void;
  channels: TelegramChannel[];
  networks: TelegramChannelNetwork[];
  selectedNetworkId: string;
  onSelectedNetworkIdChange: (value: string) => void;
  selectedChannelIds: string[];
  onSelectedChannelIdsChange: (value: string[]) => void;
  selectedProductIds: string[];
  onSelectedProductIdsChange: (value: string[]) => void;
  statusFilter: string;
  onStatusFilterChange: (value: string) => void;
  slotVisibility: "all" | "free" | "busy";
  onSlotVisibilityChange: (value: "all" | "free" | "busy") => void;
  filteredSlots: ReturnType<typeof buildAdCalendarSlots>;
  organicByChannelId: Record<string, Array<{ id: string; title: string; status: string; scheduledAt?: string | null; publishedAt?: string | null; telegramMessageUrls: string[] }>>;
  overlayPlacements: ReturnType<typeof collectAdOverlayPlacements>;
  sales: TelegramAdSale[];
  settings: Awaited<ReturnType<typeof currenciesApi.getSettings>> | undefined;
  rates: Awaited<ReturnType<typeof currenciesApi.listRates>> | undefined;
  onCreateFromSlot: (slot: TelegramAdAvailabilitySlot) => void;
}) {
  const monthDays = useMemo(() => monthGridDays(props.calendarCursor), [props.calendarCursor]);
  const slotsByChannelDay = useMemo(() => {
    const grouped = new Map<string, typeof props.filteredSlots>();
    for (const slot of props.filteredSlots) {
      const key = `${slot.channelId}:${channelLocalDateKey(slot.scheduledAt)}`;
      const current = grouped.get(key) ?? [];
      current.push(slot);
      grouped.set(key, current);
    }
    return grouped;
  }, [props.filteredSlots]);

  const visibleChannels = useMemo(
    () =>
      props.channels.filter((channel) =>
        props.selectedChannelIds.length
          ? props.selectedChannelIds.includes(channel.id)
          : true,
      ),
    [props.channels, props.selectedChannelIds],
  );

  return (
    <div className="space-y-5">
      <Card>
        <div className="grid gap-4 xl:grid-cols-[1.2fr_1fr_1fr_1fr_1fr]">
          <FormField label="Network">
            <Select
              value={props.selectedNetworkId}
              onChange={(event) => props.onSelectedNetworkIdChange(event.target.value)}
            >
              <option value="">All networks</option>
              {props.networks.map((network) => (
                <option key={network.id} value={network.id}>
                  {network.name}
                </option>
              ))}
            </Select>
          </FormField>
          <FormField label="Channels">
            <MultiSelect
              value={props.selectedChannelIds}
              onChange={props.onSelectedChannelIdsChange}
              placeholder="Choose channels"
              options={props.channels.map((channel) => ({
                value: channel.id,
                label: getChannelOptionLabel(channel),
                iconUrl: channel.photoUrl,
                iconFallback: channel.title,
              }))}
            />
          </FormField>
          <FormField label="Status">
            <Select
              value={props.statusFilter}
              onChange={(event) => props.onStatusFilterChange(event.target.value)}
            >
              <option value="">All states</option>
              <option value="AVAILABLE">Available</option>
              <option value="RESERVED">Reserved</option>
              <option value="SOLD">Sold</option>
              <option value="BLOCKED_BY_POLICY">Blocked</option>
              <option value="CONFLICT_WITH_ORGANIC_POST">Conflict</option>
              <option value="PAST">Past</option>
            </Select>
          </FormField>
          <FormField label="Visibility">
            <Select
              value={props.slotVisibility}
              onChange={(event) => props.onSlotVisibilityChange(event.target.value as "all" | "free" | "busy")}
            >
              <option value="all">All</option>
              <option value="free">Only free</option>
              <option value="busy">Only busy</option>
            </Select>
          </FormField>
          <FormField label="View">
            <div className="flex gap-2">
              {(["week", "month", "list"] as const).map((view) => (
                <button
                  key={view}
                  type="button"
                  onClick={() => props.onCalendarViewChange(view)}
                  className={`rounded-full border px-3 py-2 text-sm ${tabButtonClass(props.calendarView === view)}`}
                >
                  {view[0].toUpperCase() + view.slice(1)}
                </button>
              ))}
            </div>
          </FormField>
        </div>
      </Card>

      {props.calendarView === "week" ? (
        <div className="overflow-hidden rounded-2xl border border-neutral-800 bg-neutral-950">
          <div className="sticky top-0 z-10 grid grid-cols-[220px_repeat(7,minmax(220px,1fr))] border-b border-neutral-800 bg-neutral-950/95 backdrop-blur">
            <div className="border-r border-neutral-800 px-4 py-3 text-sm font-semibold text-white">
              Channels
            </div>
            {Array.from({ length: 7 }, (_, index) => addDays(startOfWeek(props.calendarCursor), index)).map((day) => (
              <div key={day.toISOString()} className="border-r border-neutral-800 px-4 py-3 text-sm">
                <p className="font-semibold text-white">
                  {day.toLocaleDateString(undefined, { weekday: "short", day: "numeric", month: "short" })}
                </p>
              </div>
            ))}
          </div>
          {visibleChannels.map((channel) => (
            <div
              key={channel.id}
              className="grid grid-cols-[220px_repeat(7,minmax(220px,1fr))] border-b border-neutral-900 last:border-b-0"
            >
              <div className="sticky left-0 z-[1] border-r border-neutral-800 bg-neutral-950 px-4 py-4">
                <p className="font-medium text-white">{channel.title}</p>
                <p className="text-xs text-neutral-500">{channel.username || "No username"}</p>
              </div>
              {Array.from({ length: 7 }, (_, index) => addDays(startOfWeek(props.calendarCursor), index)).map((day) => {
                const dayKey = `${channel.id}:${dateKey(day)}`;
                const slots = slotsByChannelDay.get(dayKey) ?? [];
                const organic = (props.organicByChannelId[channel.id] ?? []).filter(
                  (item) => channelLocalDateKey(item.scheduledAt || item.publishedAt || "") === dateKey(day),
                );
                return (
                  <div key={dayKey} className="min-h-52 border-r border-neutral-900 p-3">
                    <div className="mb-2 flex items-center justify-between text-[11px] uppercase tracking-wide text-neutral-500">
                      <span>{organic.length} organic</span>
                      <span>{slots.length} ad slots</span>
                    </div>
                    <div className="space-y-2">
                      {organic.map((item) => (
                        <div key={item.id} className="rounded-lg border border-neutral-800 bg-neutral-900/80 p-2 text-xs text-neutral-300">
                          <p className="font-medium text-white">{item.title}</p>
                          <p>{channelLocalTime(item.scheduledAt || item.publishedAt || "")} · {item.status}</p>
                        </div>
                      ))}
                      {slots.slice(0, 4).map((slot) => {
                        const sale = props.sales.find((item) => item.id === slot.existingPlacement?.saleId);
                        return (
                          <CalendarSlotCard
                            key={slot.id}
                            slot={slot}
                            advertiserName={sale?.advertiserName}
                            saleTitle={sale?.title}
                            paymentStatus={sale?.paymentStatus || "UNPAID"}
                            agreedPrice={
                              sale?.placements.find((placement) => placement.id === slot.existingPlacement?.id)?.agreedPrice
                            }
                            onClick={slot.state === "AVAILABLE" ? () => props.onCreateFromSlot(slot) : undefined}
                          />
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      ) : null}

      {props.calendarView === "month" ? (
        <div className="grid gap-3 md:grid-cols-7">
          {monthDays.map((day) => {
            const daySales = props.filteredSlots.filter(
              (slot) => channelLocalDateKey(slot.scheduledAt) === dateKey(day),
            );
            return (
              <Card key={day.toISOString()} className="min-h-44">
                <div className="flex items-center justify-between">
                  <p className="font-medium text-white">
                    {day.toLocaleDateString(undefined, { day: "numeric", month: "short" })}
                  </p>
                  <span className="text-xs text-neutral-500">{daySales.length} slots</span>
                </div>
                <div className="mt-3 space-y-2">
                  {daySales.slice(0, 3).map((slot) => (
                    <CalendarSlotCard
                      key={slot.id}
                      slot={slot}
                      onClick={slot.state === "AVAILABLE" ? () => props.onCreateFromSlot(slot) : undefined}
                    />
                  ))}
                </div>
              </Card>
            );
          })}
        </div>
      ) : null}

      {props.calendarView === "list" ? (
        <div className="space-y-3">
          {props.filteredSlots.map((slot) => (
            <Card key={slot.id}>
              <div className="grid gap-3 lg:grid-cols-[1.2fr_1fr_1fr_1fr] lg:items-center">
                <div>
                  <p className="font-medium text-white">
                    {props.channels.find((channel) => channel.id === slot.channelId)?.title || slot.channelId}
                  </p>
                  <p className="text-xs text-neutral-500">
                    {new Date(slot.scheduledAt).toLocaleString()} · {slot.timezone}
                  </p>
                </div>
                <div className="text-sm text-neutral-300">
                  {slot.expectedViews.toLocaleString()} views · {slot.recommendedPrice} {slot.currency}
                </div>
                <div className="text-sm text-neutral-300">
                  {slot.state} · {slot.blockingReason || slot.source}
                </div>
                <div className="flex justify-end">
                  <Button
                    disabled={slot.state !== "AVAILABLE"}
                    onClick={() => {
                      if (slot.state !== "AVAILABLE") return;
                      props.onCreateFromSlot(slot);
                    }}
                  >
                    {slot.state === "AVAILABLE" ? "Book slot" : "Unavailable"}
                  </Button>
                </div>
              </div>
            </Card>
          ))}
          {!props.filteredSlots.length ? <EmptyState text="No slots for the selected filters." /> : null}
        </div>
      ) : null}
    </div>
  );
}

function SalesTab(props: {
  sales: TelegramAdSale[];
  loading: boolean;
  error: unknown;
  page: number;
  pageSize: number;
  pagination?: { totalItems: number; totalPages: number; hasNextPage: boolean; hasPreviousPage: boolean; page: number; pageSize: number };
  onPageChange: (value: number) => void;
  onPageSizeChange: (value: number) => void;
  search: string;
  onSearchChange: (value: string) => void;
  statusFilter: string;
  onStatusFilterChange: (value: string) => void;
  paymentStatusFilter: string;
  onPaymentStatusFilterChange: (value: string) => void;
  responsibleMemberId: string;
  onResponsibleMemberIdChange: (value: string) => void;
  underpricedOnly: boolean;
  onUnderpricedOnlyChange: (value: boolean) => void;
  unpaidOnly: boolean;
  onUnpaidOnlyChange: (value: boolean) => void;
  settings: Awaited<ReturnType<typeof currenciesApi.getSettings>> | undefined;
  rates: Awaited<ReturnType<typeof currenciesApi.listRates>> | undefined;
  onOpenSale: (saleId: string) => void;
}) {
  const statusOptions = [
    { value: "", label: "All statuses" },
    { value: "DRAFT", label: "Draft" },
    { value: "RESERVED", label: "Reserved" },
    { value: "CONFIRMED", label: "Confirmed" },
    { value: "IN_PROGRESS", label: "In progress" },
    { value: "COMPLETED", label: "Completed" },
    { value: "CANCELLED", label: "Cancelled" },
  ];
  const paymentStatusOptions = [
    { value: "", label: "All payment states" },
    { value: "UNPAID", label: "Unpaid" },
    { value: "PARTIALLY_PAID", label: "Partially paid" },
    { value: "PAID", label: "Paid" },
    { value: "OVERPAID", label: "Overpaid" },
  ];

  return (
    <div className="space-y-5">
      <Card>
        <div className="grid gap-4 xl:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)_minmax(0,1fr)_minmax(0,1fr)_auto_auto]">
          <FormField label="Search">
            <Input value={props.search} onChange={(event) => props.onSearchChange(event.target.value)} />
          </FormField>
          <FormField label="Status">
            <Select
              value={props.statusFilter}
              onChange={(event) => props.onStatusFilterChange(event.target.value)}
            >
              {statusOptions.map((option) => (
                <option key={option.value || "all"} value={option.value}>
                  {option.label}
                </option>
              ))}
            </Select>
          </FormField>
          <FormField label="Payment status">
            <Select
              value={props.paymentStatusFilter}
              onChange={(event) => props.onPaymentStatusFilterChange(event.target.value)}
            >
              {paymentStatusOptions.map((option) => (
                <option key={option.value || "all"} value={option.value}>
                  {option.label}
                </option>
              ))}
            </Select>
          </FormField>
          <FormField label="Responsible">
            <MemberSelect
              value={props.responsibleMemberId}
              onChange={props.onResponsibleMemberIdChange}
              includeAll
            />
          </FormField>
          <label className="flex min-h-[76px] items-end">
            <span className="inline-flex items-center gap-3 rounded-xl border border-neutral-800 bg-neutral-950/70 px-4 py-3 text-sm text-neutral-200">
              <span className="relative inline-flex h-5 w-5 items-center justify-center">
                <input
                  type="checkbox"
                  checked={props.underpricedOnly}
                  onChange={(event) => props.onUnderpricedOnlyChange(event.target.checked)}
                  className="peer h-5 w-5 cursor-pointer appearance-none rounded border border-neutral-600 bg-neutral-900 checked:border-blue-500 checked:bg-blue-600"
                />
                <span className="pointer-events-none absolute text-xs font-bold text-white opacity-0 peer-checked:opacity-100">
                  ✓
                </span>
              </span>
              Underpriced only
            </span>
          </label>
          <label className="flex min-h-[76px] items-end">
            <span className="inline-flex items-center gap-3 rounded-xl border border-neutral-800 bg-neutral-950/70 px-4 py-3 text-sm text-neutral-200">
              <span className="relative inline-flex h-5 w-5 items-center justify-center">
                <input
                  type="checkbox"
                  checked={props.unpaidOnly}
                  onChange={(event) => props.onUnpaidOnlyChange(event.target.checked)}
                  className="peer h-5 w-5 cursor-pointer appearance-none rounded border border-neutral-600 bg-neutral-900 checked:border-blue-500 checked:bg-blue-600"
                />
                <span className="pointer-events-none absolute text-xs font-bold text-white opacity-0 peer-checked:opacity-100">
                  ✓
                </span>
              </span>
              Unpaid only
            </span>
          </label>
        </div>
      </Card>

      {props.loading ? <TableLoadingState columns={8} rows={6} /> : null}
      {props.error ? <ErrorState text="Could not load ad sales." /> : null}
      {!props.loading && !props.error ? (
        <div className="overflow-hidden rounded-2xl border border-neutral-800 bg-neutral-950">
          <div className="table-scroll w-full">
            <table className="w-full min-w-[1180px] text-left text-sm">
              <thead className="bg-neutral-900 text-xs uppercase text-neutral-400">
                <tr>
                  <th className="px-4 py-3">Sale</th>
                  <th className="px-4 py-3">Advertiser</th>
                  <th className="px-4 py-3">Channels</th>
                  <th className="px-4 py-3">Nearest placement</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3">Payment</th>
                  <th className="px-4 py-3">Total agreed</th>
                  <th className="px-4 py-3">Outstanding</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-900">
                {props.sales.map((sale) => {
                  const nearestPlacement = [...sale.placements].sort((left, right) =>
                    left.scheduledAt.localeCompare(right.scheduledAt),
                  )[0];
                  return (
                    <tr
                      key={sale.id}
                      className="cursor-pointer bg-neutral-950 transition hover:bg-neutral-900/60"
                      onClick={() => props.onOpenSale(sale.id)}
                    >
                      <td className="px-4 py-4">
                        <p className="font-medium text-white">{sale.title || "Untitled sale"}</p>
                        <p className="text-xs text-neutral-500">{new Date(sale.createdAt).toLocaleString()}</p>
                      </td>
                      <td className="px-4 py-4">
                        <p className="text-white">{sale.advertiserName}</p>
                        <p className="text-xs text-neutral-500">{sale.advertiserTelegram || sale.advertiserContact || "-"}</p>
                      </td>
                      <td className="px-4 py-4">{saleChannelCount(sale)}</td>
                      <td className="px-4 py-4">
                        {nearestPlacement ? new Date(nearestPlacement.scheduledAt).toLocaleString() : "-"}
                      </td>
                      <td className="px-4 py-4">
                        <EnumPill label={sale.status.replaceAll("_", " ")} tone={saleStatusTone(sale.status)} />
                      </td>
                      <td className="px-4 py-4">
                        <EnumPill
                          label={(sale.paymentStatus || "UNPAID").replaceAll("_", " ")}
                          tone={paymentStatusTone(sale.paymentStatus || "UNPAID")}
                        />
                      </td>
                      <td className="px-4 py-4">
                        <MoneyStack
                          amount={Number(sale.totalAgreedAmount || 0)}
                          currency={sale.settlementCurrency}
                          settings={props.settings}
                          rates={props.rates}
                        />
                      </td>
                      <td className="px-4 py-4">
                        <MoneyStack
                          amount={Number(sale.outstandingAmount || 0)}
                          currency={sale.settlementCurrency}
                          settings={props.settings}
                          rates={props.rates}
                        />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          {!props.sales.length ? <div className="p-4"><EmptyState text="No sales matched the current filters." /></div> : null}
        </div>
      ) : null}

      {props.pagination ? (
        <Pagination
          page={props.pagination.page}
          pageSize={props.pagination.pageSize}
          totalItems={props.pagination.totalItems}
          totalPages={props.pagination.totalPages}
          hasNextPage={props.pagination.hasNextPage}
          hasPreviousPage={props.pagination.hasPreviousPage}
          onPageChange={props.onPageChange}
          onPageSizeChange={props.onPageSizeChange}
        />
      ) : null}
    </div>
  );
}

function AnalyticsTab(props: {
  sales: TelegramAdSale[];
  settings: Awaited<ReturnType<typeof currenciesApi.getSettings>> | undefined;
  rates: Awaited<ReturnType<typeof currenciesApi.listRates>> | undefined;
}) {
  const totals = useMemo(() => {
    return props.sales.reduce(
      (acc, sale) => {
        acc.revenue += Number(sale.totalAgreedAmount || 0);
        acc.paid += Number(sale.totalPaidAmount || 0);
        acc.outstanding += Number(sale.outstandingAmount || 0);
        acc.expectedViews += sale.placements.reduce((sum, placement) => sum + placement.expectedViews, 0);
        acc.actualViews += sale.placements.reduce((sum, placement) => sum + (placement.actualViewsFinal || 0), 0);
        acc.placements += sale.placements.length;
        return acc;
      },
      { revenue: 0, paid: 0, outstanding: 0, expectedViews: 0, actualViews: 0, placements: 0 },
    );
  }, [props.sales]);

  return (
    <div className="grid gap-4 lg:grid-cols-5">
      <MetricMoneyCard label="Revenue" amount={totals.revenue} settings={props.settings} rates={props.rates} />
      <MetricMoneyCard label="Paid" amount={totals.paid} settings={props.settings} rates={props.rates} />
      <MetricMoneyCard label="Outstanding" amount={totals.outstanding} settings={props.settings} rates={props.rates} />
      <MetricCard label="Expected views" value={totals.expectedViews.toLocaleString()} />
      <MetricCard label="Actual views" value={totals.actualViews.toLocaleString()} />
    </div>
  );
}

function SettingsTab(props: {
  channels: TelegramChannel[];
  supportedCurrencies: string[];
  workspaceTimezone: string;
  productsByChannelId: Record<string, TelegramAdProduct[]>;
  historyQueries: TelegramAdPriceSnapshot[][];
  policies: Array<Awaited<ReturnType<typeof telegramAdSalesApi.getPolicy>> | undefined>;
  onCreateProduct: (channelId: string, payload: Record<string, unknown>) => Promise<void>;
  onUpdateProduct: (productId: string, payload: Record<string, unknown>, channelId: string) => Promise<void>;
  onUpdatePolicy: (channelId: string, payload: Record<string, unknown>) => Promise<void>;
  onApplyPolicyToChannels: (channelIds: string[], payload: Record<string, unknown>) => Promise<void>;
  onRecalculate: (channelId: string, productId?: string | null) => Promise<void>;
  onRecommendPolicy: (channelId: string, payload: Record<string, unknown>) => Promise<void>;
}) {
  const [draftPolicyByChannel, setDraftPolicyByChannel] = useState<Record<string, Record<string, string>>>({});
  const [globalPolicyDraft, setGlobalPolicyDraft] = useState<Record<string, string>>({});
  const [editingProduct, setEditingProduct] = useState<{
    channelId: string;
    productId?: string;
    name: string;
    defaultPricingMode: "CPM" | "FIXED" | "MANUAL";
    minimumPrice: string;
    currency: string;
    isActive: boolean;
    position: string;
  } | null>(null);

  useEffect(() => {
    setDraftPolicyByChannel(
      Object.fromEntries(
        props.channels.map((channel, index) => {
          const policy = props.policies[index];
          return [
            channel.id,
            {
              expectedOrganicPostsPerDay: policy?.expectedOrganicPostsPerDay ?? "0",
              organicPostsPerAdSlot: String(policy?.organicPostsPerAdSlot ?? 3),
              maxAdsPerDay: String(policy?.maxAdsPerDay ?? 1),
              minDaysBetweenAds: String(policy?.minDaysBetweenAds ?? 3),
              minHoursBetweenAds: String(policy?.minHoursBetweenAds ?? 72),
              slotStrategy: policy?.slotStrategy ?? "BEFORE_ORGANIC_POST",
              fallbackSlotTimes: (policy?.fallbackSlotTimes ?? []).join(", "),
            },
          ];
        }),
      ),
    );
  }, [props.channels, props.policies]);

  useEffect(() => {
    const firstPolicy = props.policies[0];
    setGlobalPolicyDraft({
      expectedOrganicPostsPerDay: firstPolicy?.expectedOrganicPostsPerDay ?? "3",
      organicPostsPerAdSlot: String(firstPolicy?.organicPostsPerAdSlot ?? 3),
      maxAdsPerDay: String(firstPolicy?.maxAdsPerDay ?? 1),
      minDaysBetweenAds: String(firstPolicy?.minDaysBetweenAds ?? 3),
      minHoursBetweenAds: String(firstPolicy?.minHoursBetweenAds ?? 72),
      slotStrategy: firstPolicy?.slotStrategy ?? "BEFORE_ORGANIC_POST",
      fallbackSlotTimes: (firstPolicy?.fallbackSlotTimes ?? []).join(", "),
    });
  }, [props.policies]);

  if (!props.channels.length) {
    return <EmptyState text="Choose one or more channels in Calendar to manage products and schedule policies." />;
  }

  return (
    <div className="space-y-5">
      <Card>
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h3 className="text-lg font-semibold text-white">Default rule for selected channels</h3>
            <p className="text-sm text-neutral-400">
              Set one shared cadence first, then override only the channels that need it.
            </p>
          </div>
          <Button
            onClick={() =>
              void props.onApplyPolicyToChannels(props.channels.map((channel) => channel.id), {
                timezone: props.workspaceTimezone,
                expectedOrganicPostsPerDay: Number(globalPolicyDraft.expectedOrganicPostsPerDay || 0),
                organicPostsPerAdSlot: Number(globalPolicyDraft.organicPostsPerAdSlot || 3),
                maxAdsPerDay: Number(globalPolicyDraft.maxAdsPerDay || 1),
                minDaysBetweenAds: Number(globalPolicyDraft.minDaysBetweenAds || 3),
                minHoursBetweenAds: Number(globalPolicyDraft.minHoursBetweenAds || 72),
                slotStrategy: globalPolicyDraft.slotStrategy || "BEFORE_ORGANIC_POST",
                fallbackSlotTimes: (globalPolicyDraft.fallbackSlotTimes || "")
                  .split(",")
                  .map((item) => item.trim())
                  .filter(Boolean),
                autoFrequencyEnabled: true,
                allowManualSlots: false,
              })
            }
          >
            Apply to selected channels
          </Button>
        </div>
        <div className="mt-4 grid gap-4 md:grid-cols-2 xl:grid-cols-5">
          <FormField label="Expected organic posts/day">
            <Input
              value={globalPolicyDraft.expectedOrganicPostsPerDay || ""}
              onChange={(event) =>
                setGlobalPolicyDraft((current) => ({
                  ...current,
                  expectedOrganicPostsPerDay: event.target.value,
                }))
              }
            />
          </FormField>
          <FormField label="Organic posts per ad slot">
            <Input
              value={globalPolicyDraft.organicPostsPerAdSlot || ""}
              onChange={(event) =>
                setGlobalPolicyDraft((current) => ({
                  ...current,
                  organicPostsPerAdSlot: event.target.value,
                }))
              }
            />
          </FormField>
          <FormField label="Max ads/day">
            <Input
              value={globalPolicyDraft.maxAdsPerDay || ""}
              onChange={(event) =>
                setGlobalPolicyDraft((current) => ({
                  ...current,
                  maxAdsPerDay: event.target.value,
                }))
              }
            />
          </FormField>
          <FormField label="Min days between ads">
            <Input
              value={globalPolicyDraft.minDaysBetweenAds || ""}
              onChange={(event) =>
                setGlobalPolicyDraft((current) => ({
                  ...current,
                  minDaysBetweenAds: event.target.value,
                }))
              }
            />
          </FormField>
          <FormField label="Min hours between ads">
            <Input
              value={globalPolicyDraft.minHoursBetweenAds || ""}
              onChange={(event) =>
                setGlobalPolicyDraft((current) => ({
                  ...current,
                  minHoursBetweenAds: event.target.value,
                }))
              }
            />
          </FormField>
        </div>
      </Card>
      {props.channels.map((channel, index) => {
        const products = props.productsByChannelId[channel.id] ?? [];
        const history = props.historyQueries[index] ?? [];
        const latest = history[0];
        const previous = history[1];
        const latestRecommended = Number(latest?.recommendedPrice || 0);
        const previousRecommended = Number(previous?.recommendedPrice || 0);
        const delta = latest && previous ? latestRecommended - previousRecommended : 0;
        const policyDraft = draftPolicyByChannel[channel.id] ?? {};
        return (
          <Card key={channel.id}>
            <div className="flex items-center justify-between gap-3">
              <div>
                <h3 className="text-lg font-semibold text-white">{channel.title}</h3>
                <p className="text-sm text-neutral-400">{channel.username || "No username"}</p>
              </div>
              <Tooltip
                side="bottom"
                align="right"
                content={
                  <span className="block w-80">
                    Format = what we sell on a channel, for example a native post, 24h feed placement, or top placement. Policy = how organic posting cadence turns into available ad slots.
                  </span>
                }
              >
                <Button
                  onClick={() =>
                    setEditingProduct({
                      channelId: channel.id,
                      name: "",
                      defaultPricingMode: "CPM",
                      minimumPrice: "0",
                      currency: props.supportedCurrencies[0] ?? "USD",
                      isActive: true,
                      position: String(products.length),
                    })
                  }
                >
                  Add format
                </Button>
              </Tooltip>
            </div>

            <div className="mt-4 overflow-hidden rounded-xl border border-neutral-800">
              <table className="w-full text-left text-sm">
                <thead className="bg-neutral-900 text-xs uppercase text-neutral-400">
                  <tr>
                    <th className="px-3 py-2">Format</th>
                    <th className="px-3 py-2">Billing model</th>
                    <th className="px-3 py-2">Minimum</th>
                    <th className="px-3 py-2">Active</th>
                    <th className="px-3 py-2">Ordering</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-neutral-800">
                  {products.map((product) => (
                    <tr key={product.id} className="bg-neutral-950">
                      <td className="px-3 py-2">
                        <button
                          type="button"
                          className="font-medium text-white underline-offset-2 hover:underline"
                          onClick={() =>
                            setEditingProduct({
                              channelId: channel.id,
                              productId: product.id,
                              name: product.name,
                              defaultPricingMode: product.defaultPricingMode,
                              minimumPrice: product.minimumPrice || "0",
                              currency: product.currency,
                              isActive: product.isActive,
                              position: String(product.position),
                            })
                          }
                        >
                          {product.name}
                        </button>
                      </td>
                      <td className="px-3 py-2">{product.defaultPricingMode}</td>
                      <td className="px-3 py-2">{product.minimumPrice || "0"} {product.currency}</td>
                      <td className="px-3 py-2">{product.isActive ? "Yes" : "No"}</td>
                      <td className="px-3 py-2">{product.position}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="mt-5 flex flex-wrap items-start justify-between gap-4">
              <div>
                <h4 className="text-base font-semibold text-white">Audience baseline</h4>
                <p className="text-sm text-neutral-400">
                  Pricing uses this recent view baseline from real channel posts.
                </p>
              </div>
              <Button variant="secondary" onClick={() => void props.onRecalculate(channel.id)}>
                Refresh audience baseline
              </Button>
            </div>
            <div className="mt-4 grid gap-4 md:grid-cols-4">
              <MetricCard label="Expected views" value={String(latest?.expectedViews ?? 0)} />
              <MetricCard label="Target CPM" value={latest?.targetCpm ?? "0"} />
              <MetricCard label="Recommended" value={`${latest?.recommendedPrice ?? "0"} ${latest?.currency ?? ""}`} />
              <MetricCard label="Minimum" value={`${latest?.minimumPrice ?? "0"} ${latest?.currency ?? ""}`} />
            </div>
            <div className="mt-4 grid gap-4 md:grid-cols-3">
              <div className="rounded-xl border border-neutral-800 bg-neutral-950/60 p-4 text-sm text-neutral-300">
                <p className="text-neutral-400">Last refresh</p>
                <p className="mt-1 font-medium text-white">
                  {latest ? new Date(latest.calculatedAt).toLocaleString() : "No baseline yet"}
                </p>
              </div>
              <div className="rounded-xl border border-neutral-800 bg-neutral-950/60 p-4 text-sm text-neutral-300">
                <p className="text-neutral-400">Data quality</p>
                <p className="mt-1 font-medium text-white">
                  {String(latest?.metadata?.dataQuality ?? "unknown")}
                </p>
              </div>
              <div className="rounded-xl border border-neutral-800 bg-neutral-950/60 p-4 text-sm text-neutral-300">
                <p className="text-neutral-400">Change vs previous</p>
                <p className={`mt-1 font-medium ${delta >= 0 ? "text-emerald-300" : "text-rose-300"}`}>
                  {delta.toFixed(2)}
                </p>
              </div>
            </div>
            {history.length ? (
              <div className="mt-4 overflow-hidden rounded-xl border border-neutral-800">
                <table className="w-full text-left text-sm">
                  <thead className="bg-neutral-900 text-xs uppercase text-neutral-400">
                    <tr>
                      <th className="px-3 py-2">Date</th>
                      <th className="px-3 py-2">Views</th>
                      <th className="px-3 py-2">Recommended</th>
                      <th className="px-3 py-2">Minimum</th>
                      <th className="px-3 py-2">Target CPM</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-neutral-800">
                    {history.slice(0, 6).map((snapshot) => (
                      <tr key={snapshot.id} className="bg-neutral-950">
                        <td className="px-3 py-2">{new Date(snapshot.calculatedAt).toLocaleString()}</td>
                        <td className="px-3 py-2">{snapshot.expectedViews.toLocaleString()}</td>
                        <td className="px-3 py-2">{snapshot.recommendedPrice}</td>
                        <td className="px-3 py-2">{snapshot.minimumPrice}</td>
                        <td className="px-3 py-2">{snapshot.targetCpm}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : null}

            <div className="mt-5 grid gap-4 md:grid-cols-2 xl:grid-cols-5">
              <FormField label="Expected organic posts/day">
                <Input
                  value={policyDraft.expectedOrganicPostsPerDay || ""}
                  onChange={(event) =>
                    setDraftPolicyByChannel((current) => ({
                      ...current,
                      [channel.id]: { ...current[channel.id], expectedOrganicPostsPerDay: event.target.value },
                    }))
                  }
                />
              </FormField>
              <FormField label="Organic posts per ad slot">
                <Input
                  value={policyDraft.organicPostsPerAdSlot || ""}
                  onChange={(event) =>
                    setDraftPolicyByChannel((current) => ({
                      ...current,
                      [channel.id]: { ...current[channel.id], organicPostsPerAdSlot: event.target.value },
                    }))
                  }
                />
              </FormField>
              <FormField label="Max ads/day">
                <Input
                  value={policyDraft.maxAdsPerDay || ""}
                  onChange={(event) =>
                    setDraftPolicyByChannel((current) => ({
                      ...current,
                      [channel.id]: { ...current[channel.id], maxAdsPerDay: event.target.value },
                    }))
                  }
                />
              </FormField>
              <FormField label="Min hours between ads">
                <Input
                  value={policyDraft.minHoursBetweenAds || ""}
                  onChange={(event) =>
                    setDraftPolicyByChannel((current) => ({
                      ...current,
                      [channel.id]: { ...current[channel.id], minHoursBetweenAds: event.target.value },
                    }))
                  }
                />
              </FormField>
              <FormField label="Min days between ads">
                <Input
                  value={policyDraft.minDaysBetweenAds || ""}
                  onChange={(event) =>
                    setDraftPolicyByChannel((current) => ({
                      ...current,
                      [channel.id]: { ...current[channel.id], minDaysBetweenAds: event.target.value },
                    }))
                  }
                />
              </FormField>
            </div>
            <p className="mt-4 text-sm text-neutral-400">
              Workspace timezone: <span className="text-white">{props.workspaceTimezone}</span>
            </p>
            <div className="mt-4 rounded-xl border border-dashed border-neutral-700 bg-neutral-950/40 p-4 text-sm text-neutral-400">
              Rule preview: 1 ad slot for every {policyDraft.organicPostsPerAdSlot || "3"} organic posts,
              with max {policyDraft.maxAdsPerDay || "1"} ad/day and at least {policyDraft.minDaysBetweenAds || "3"} day gap.
            </div>
            <div className="mt-4 flex flex-wrap justify-end gap-2">
              <Button
                variant="secondary"
                onClick={() =>
                  void props.onRecommendPolicy(channel.id, {
                    timezone: props.workspaceTimezone,
                    expectedOrganicPostsPerDay: Number(policyDraft.expectedOrganicPostsPerDay || 0),
                    organicPostsPerAdSlot: Number(policyDraft.organicPostsPerAdSlot || 3),
                    maxAdsPerDay: Number(policyDraft.maxAdsPerDay || 1),
                    minDaysBetweenAds: Number(policyDraft.minDaysBetweenAds || 3),
                    minHoursBetweenAds: Number(policyDraft.minHoursBetweenAds || 72),
                    slotStrategy: policyDraft.slotStrategy || "BEFORE_ORGANIC_POST",
                    fallbackSlotTimes: (policyDraft.fallbackSlotTimes || "")
                      .split(",")
                      .map((item) => item.trim())
                      .filter(Boolean),
                    autoFrequencyEnabled: true,
                    allowManualSlots: false,
                  })
                }
              >
                Apply recommendation
              </Button>
              <Button
                onClick={() =>
                  void props.onUpdatePolicy(channel.id, {
                    timezone: props.workspaceTimezone,
                    expectedOrganicPostsPerDay: Number(policyDraft.expectedOrganicPostsPerDay || 0),
                    organicPostsPerAdSlot: Number(policyDraft.organicPostsPerAdSlot || 3),
                    maxAdsPerDay: Number(policyDraft.maxAdsPerDay || 1),
                    minDaysBetweenAds: Number(policyDraft.minDaysBetweenAds || 3),
                    minHoursBetweenAds: Number(policyDraft.minHoursBetweenAds || 72),
                    slotStrategy: policyDraft.slotStrategy || "BEFORE_ORGANIC_POST",
                    fallbackSlotTimes: (policyDraft.fallbackSlotTimes || "")
                      .split(",")
                      .map((item) => item.trim())
                      .filter(Boolean),
                    autoFrequencyEnabled: true,
                    allowManualSlots: false,
                  })
                }
              >
                Save policy
              </Button>
            </div>
          </Card>
        );
      })}
      <ProductEditorModal
        open={Boolean(editingProduct)}
        draft={editingProduct}
        supportedCurrencies={props.supportedCurrencies}
        onClose={() => setEditingProduct(null)}
        onSubmit={async (draft) => {
          if (draft.productId) {
            await props.onUpdateProduct(
              draft.productId,
              {
                name: draft.name.trim(),
                defaultPricingMode: draft.defaultPricingMode,
                minimumPrice: Number(draft.minimumPrice || 0),
                currency: draft.currency,
                isActive: draft.isActive,
                position: Number(draft.position || 0),
              },
              draft.channelId,
            );
          } else {
            await props.onCreateProduct(draft.channelId, {
              name: draft.name.trim(),
              defaultPricingMode: draft.defaultPricingMode,
              minimumPrice: Number(draft.minimumPrice || 0),
              currency: draft.currency,
              isActive: draft.isActive,
              position: Number(draft.position || 0),
            });
          }
          setEditingProduct(null);
        }}
      />
    </div>
  );
}

function ProductEditorModal(props: {
  open: boolean;
  draft: {
    channelId: string;
    productId?: string;
    name: string;
    defaultPricingMode: "CPM" | "FIXED" | "MANUAL";
    minimumPrice: string;
    currency: string;
    isActive: boolean;
    position: string;
  } | null;
  supportedCurrencies: string[];
  onClose: () => void;
  onSubmit: (draft: {
    channelId: string;
    productId?: string;
    name: string;
    defaultPricingMode: "CPM" | "FIXED" | "MANUAL";
    minimumPrice: string;
    currency: string;
    isActive: boolean;
    position: string;
  }) => Promise<void>;
}) {
  const [draft, setDraft] = useState(props.draft);

  useEffect(() => {
    setDraft(props.draft);
  }, [props.draft]);

  if (!draft) return null;

  return (
    <Modal open={props.open} onClose={props.onClose} title={draft.productId ? "Edit format" : "Add format"}>
      <div className="space-y-4">
        <FormField label="Format name" required>
          <Input
            value={draft.name}
            onChange={(event) =>
              setDraft((current) => (current ? { ...current, name: event.target.value } : current))
            }
          />
        </FormField>
        <div className="grid gap-4 md:grid-cols-2">
          <FormField label="Billing model">
            <Select
              value={draft.defaultPricingMode}
              onChange={(event) =>
                setDraft((current) =>
                  current
                    ? { ...current, defaultPricingMode: event.target.value as "CPM" | "FIXED" | "MANUAL" }
                    : current,
                )
              }
            >
              <option value="CPM">CPM</option>
              <option value="FIXED">Fixed</option>
              <option value="MANUAL">Manual</option>
            </Select>
          </FormField>
          <FormField label="Minimum price">
            <Input
              value={draft.minimumPrice}
              onChange={(event) =>
                setDraft((current) => (current ? { ...current, minimumPrice: event.target.value } : current))
              }
            />
          </FormField>
          <FormField label="Currency">
            <Select
              value={draft.currency}
              onChange={(event) =>
                setDraft((current) => (current ? { ...current, currency: event.target.value } : current))
              }
            >
              {props.supportedCurrencies.map((currency) => (
                <option key={currency} value={currency}>
                  {currency}
                </option>
              ))}
            </Select>
          </FormField>
          <FormField label="Ordering">
            <Input
              value={draft.position}
              onChange={(event) =>
                setDraft((current) => (current ? { ...current, position: event.target.value } : current))
              }
            />
          </FormField>
        </div>
        <label className="flex items-center gap-2 text-sm text-neutral-300">
          <input
            type="checkbox"
            checked={draft.isActive}
            onChange={(event) =>
              setDraft((current) => (current ? { ...current, isActive: event.target.checked } : current))
            }
          />
          Active
        </label>
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={props.onClose}>
            Cancel
          </Button>
          <Button onClick={() => void props.onSubmit(draft)} disabled={!draft.name.trim()}>
            Save
          </Button>
        </div>
      </div>
    </Modal>
  );
}

function SaleDetailsModal(props: {
  sale: TelegramAdSale | null;
  open: boolean;
  onClose: () => void;
  settings: Awaited<ReturnType<typeof currenciesApi.getSettings>> | undefined;
  rates: Awaited<ReturnType<typeof currenciesApi.listRates>> | undefined;
  onAction: (sale: TelegramAdSale, action: SaleActionKey, placement?: TelegramAdSale["placements"][number]) => Promise<void>;
}) {
  if (!props.sale) return null;

  return (
    <Modal open={props.open} onClose={props.onClose} title={props.sale.title || props.sale.advertiserName} size="xl">
      <div className="grid gap-5 xl:grid-cols-[0.9fr_1.1fr]">
        <div className="space-y-4">
          <Card>
            <h4 className="font-medium text-white">Summary</h4>
            <dl className="mt-3 space-y-2 text-sm">
              <div className="flex justify-between gap-3"><dt className="text-neutral-400">Advertiser</dt><dd>{props.sale.advertiserName}</dd></div>
              <div className="flex justify-between gap-3"><dt className="text-neutral-400">Status</dt><dd>{props.sale.status}</dd></div>
              <div className="flex justify-between gap-3"><dt className="text-neutral-400">Payment</dt><dd>{props.sale.paymentStatus || "UNPAID"}</dd></div>
              <div className="flex justify-between gap-3"><dt className="text-neutral-400">Total agreed</dt><dd>{props.sale.totalAgreedAmount} {props.sale.settlementCurrency}</dd></div>
              <div className="flex justify-between gap-3"><dt className="text-neutral-400">Total paid</dt><dd>{props.sale.totalPaidAmount} {props.sale.settlementCurrency}</dd></div>
              <div className="flex justify-between gap-3"><dt className="text-neutral-400">Outstanding</dt><dd>{props.sale.outstandingAmount} {props.sale.settlementCurrency}</dd></div>
            </dl>
          </Card>
          <Card>
            <h4 className="mb-3 font-medium text-white">Sale actions</h4>
            <SaleStatusActions sale={props.sale} onAction={(action) => void props.onAction(props.sale!, action)} />
          </Card>
          <Card>
            <h4 className="mb-3 font-medium text-white">Payments</h4>
            <div className="space-y-2">
              {(props.sale.payments ?? []).map((payment) => (
                <div key={payment.id} className="rounded-lg border border-neutral-800 bg-neutral-950/70 p-3 text-sm">
                  <div className="flex items-center justify-between gap-3">
                    <span className="font-medium text-white">{payment.amount} {payment.currency}</span>
                    <span className="text-neutral-400">{payment.status}</span>
                  </div>
                  <p className="mt-1 text-xs text-neutral-500">{new Date(payment.paidAt).toLocaleString()}</p>
                </div>
              ))}
              {!(props.sale.payments ?? []).length ? <EmptyState text="No payments yet." /> : null}
            </div>
          </Card>
        </div>

        <div className="space-y-4">
          <Card>
            <h4 className="mb-3 font-medium text-white">Placements</h4>
            <div className="space-y-3">
              {props.sale.placements.map((placement) => (
                <div key={placement.id} className="rounded-xl border border-neutral-800 bg-neutral-950/60 p-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <p className="font-medium text-white">{placement.telegramChannelId}</p>
                      <p className="text-xs text-neutral-500">
                        {new Date(placement.scheduledAt).toLocaleString()} · {placement.timezone}
                      </p>
                    </div>
                    <div className="text-right text-sm">
                      <p className="text-white">{placement.agreedPrice} {placement.currency}</p>
                      <p className="text-xs text-neutral-500">{placement.status}</p>
                    </div>
                  </div>
                  <div className="mt-3 grid gap-3 md:grid-cols-4 text-sm">
                    <div>Expected: {placement.expectedViews.toLocaleString()}</div>
                    <div>Paid allocation: {placement.paidAllocatedAmount || "0"}</div>
                    <div>Actual views: {placement.actualViewsFinal ?? "-"}</div>
                    <div>Actual CPM: {placement.actualCpm ?? "-"}</div>
                  </div>
                  {placement.managedPostId ? (
                    <p className="mt-2 text-xs text-neutral-500">
                      Managed post: {placement.managedPostId} · Deletion: {placement.plannedDeleteAt || "n/a"}
                    </p>
                  ) : null}
                  <div className="mt-4">
                    <SaleStatusActions
                      sale={props.sale!}
                      placement={placement}
                      onAction={(action) => void props.onAction(props.sale!, action, placement)}
                    />
                  </div>
                </div>
              ))}
            </div>
          </Card>
        </div>
      </div>
    </Modal>
  );
}

function MetricCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-neutral-800 bg-neutral-950/70 p-4">
      <p className="text-sm text-neutral-400">{label}</p>
      <p className="mt-2 text-2xl font-semibold text-white">{value}</p>
    </div>
  );
}

function MetricMoneyCard({
  label,
  amount,
  settings,
  rates,
}: {
  label: string;
  amount: number;
  settings: Awaited<ReturnType<typeof currenciesApi.getSettings>> | undefined;
  rates: Awaited<ReturnType<typeof currenciesApi.listRates>> | undefined;
}) {
  return (
    <div className="rounded-2xl border border-neutral-800 bg-neutral-950/70 p-4">
      <p className="text-sm text-neutral-400">{label}</p>
      <div className="mt-2">
        <MoneyStack amount={amount} currency={settings?.primaryCurrency || "USD"} settings={settings} rates={rates} />
      </div>
    </div>
  );
}
