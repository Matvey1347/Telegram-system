"use client";

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import {
  keepPreviousData,
  useMutation,
  useQueries,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { usePathname, useRouter } from "next/navigation";
import {
  BarChart3,
  CalendarDays,
  CalendarRange,
  ChevronLeft,
  ChevronRight,
  CircleDollarSign,
  Info,
  Pencil,
  Plus,
  RefreshCw,
  Settings2,
  Trash2,
  Users,
} from "lucide-react";
import type {
  TelegramAdAvailabilitySlot,
  TelegramAdChannelBaseline,
  TelegramAdProduct,
  TelegramAdSale,
} from "@telegram-system/shared";
import { AppShell } from "@/components/layout/app-shell";
import { PageTabHead } from "@/components/layout/page-tab-head";
import { TelegramEntityAvatar } from "@/components/telegram/telegram-entity-avatar";
import {
  Button,
  Card,
  ConfirmDeleteModal,
  CurrencySelect,
  DateRangeInput,
  EmptyState,
  ErrorState,
  FormField,
  Input,
  LoadingState,
  Modal,
  MultiSelect,
  PageHeader,
  Select,
  Skeleton,
  TableLoadingState,
  Textarea,
  ToggleRow,
  Tooltip,
} from "@/components/ui/primitives";
import {
  allowedSaleActions,
  type SaleActionKey,
} from "@/components/ad-sales/sale-status-actions";
import { RegisterPaymentModal } from "@/components/ad-sales/register-payment-modal";
import { AdSaleModal } from "@/components/ad-sales/ad-sale-modal";
import { BulkAdSaleModal } from "@/components/ad-sales/bulk/bulk-ad-sale-modal";
import { CalendarTab } from "@/components/ad-sales/ad-sales-calendar-tab";
import { AdSalesAnalyticsPanel } from "@/components/ad-sales/ad-sales-analytics-panel";
import { AdSalesClientsPanel } from "@/components/ad-sales/ad-sales-clients-panel";
import { SaleDetailsModal } from "@/components/ad-sales/ad-sales-sale-details-modal";
import { SalesTab } from "@/components/ad-sales/ad-sales-sales-tab";
import {
  accountsApi,
  authApi,
  currenciesApi,
  getTelegramChannelPosts,
  telegramAdSalesApi,
  telegramChannelsApi,
  telegramChannelNetworksApi,
  withFreshApiReads,
  type Account,
  type TelegramChannel,
  type TelegramChannelNetwork,
} from "@/lib/api";
import {
  autoAllocatePayment,
  buildAdCalendarSlots,
  buildUnderpricingSummary,
  channelLocalDateKey,
  expandNetworkChannelIds,
  getChannelOptionLabel,
  readAdSalesCalendarRangeMode,
  toNumber,
  writeAdSalesCalendarRangeMode,
  zonedDateTimeToUtc,
  type TelegramAdSalesCalendarRangeMode,
  type TelegramAdSalesTab,
} from "@/lib/telegram-ad-sales";
import { MetricPreviewLabel } from "@/lib/metric-preview-icons";
import {
  invalidateTelegramAdSalesQueries,
  telegramAdSalesKeys,
} from "@/lib/telegram-ad-sales-query";
import { useAppToast } from "@/providers/toast-provider";

const tabs: Array<{
  id: TelegramAdSalesTab;
  label: string;
  icon: typeof CalendarRange;
}> = [
  { id: "calendar", label: "Slots", icon: CalendarRange },
  { id: "sales", label: "Deals", icon: CircleDollarSign },
  { id: "clients", label: "Clients", icon: Users },
  { id: "analytics", label: "Analytics", icon: BarChart3 },
  { id: "settings", label: "Setup", icon: Settings2 },
];

const calendarRangeModes: Array<{
  id: TelegramAdSalesCalendarRangeMode;
  label: string;
  icon: typeof CalendarRange;
}> = [
  { id: "week", label: "Week", icon: CalendarRange },
  { id: "month", label: "Month", icon: CalendarDays },
  { id: "threeMonths", label: "3 months", icon: CalendarDays },
];

const tabDescriptions: Record<TelegramAdSalesTab, string> = {
  calendar:
    "See ad opportunities here and switch between calendar and list layout for the selected period.",
  sales:
    "Track created deals here: reserved, confirmed, paid, published, and completed placements.",
  clients:
    "Review CRM advertisers by revenue, RFM segment, owner, urgency, and next task.",
  analytics:
    "See revenue, fill rate, overdue payments, and channel performance for the current selection.",
  settings:
    "Configure formats, audience baseline, and the posting rule that turns organic posts into ad slots.",
};

const adSalesPanelClass =
  "rounded-[22px] border border-neutral-800 bg-[#171717]";
const adSalesSoftPanelClass =
  "rounded-[18px] border border-neutral-800 bg-[#111111]";
const adSalesTileClass =
  "rounded-[18px] border border-slate-800/80 bg-[#0b1220] p-4 shadow-[inset_0_1px_0_rgba(96,165,250,0.05)]";
const calendarSalesPageSize = 100;
const adSalesDataCacheOptions = {
  staleTime: 2 * 60 * 1000,
  gcTime: 15 * 60 * 1000,
  placeholderData: keepPreviousData,
  refetchOnWindowFocus: false,
} as const;

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
  return channelLocalDateKey(value);
}

function startOfMonth(value: Date) {
  return new Date(value.getFullYear(), value.getMonth(), 1);
}

function endOfMonth(value: Date) {
  return new Date(
    value.getFullYear(),
    value.getMonth() + 1,
    0,
    23,
    59,
    59,
    999,
  );
}

function addMonths(value: Date, months: number) {
  return new Date(value.getFullYear(), value.getMonth() + months, 1);
}

function monthGridDays(value: Date) {
  const start = startOfWeek(startOfMonth(value));
  return Array.from({ length: 42 }, (_, index) => addDays(start, index));
}

function monthGridDaysForRange(from: Date, to: Date) {
  const start = startOfWeek(startOfMonth(from));
  const lastVisibleWeekStart = startOfWeek(addDays(endOfMonth(to), 1));
  const end = addDays(lastVisibleWeekStart, 6);
  return listDaysInRange(start, end);
}

function rangeForCalendarMode(
  view: TelegramAdSalesCalendarRangeMode,
  cursor: Date,
) {
  if (view === "month") {
    return {
      from: startOfMonth(cursor),
      to: endOfMonth(cursor),
    };
  }
  if (view === "threeMonths") {
    return {
      from: startOfMonth(addMonths(cursor, -1)),
      to: endOfMonth(addMonths(cursor, 1)),
    };
  }
  return {
    from: startOfWeek(cursor),
    to: addDays(startOfWeek(cursor), 6),
  };
}

function listDaysInRange(from: Date, to: Date) {
  const days: Date[] = [];
  const start = new Date(from);
  start.setHours(0, 0, 0, 0);
  const end = new Date(to);
  end.setHours(0, 0, 0, 0);
  for (
    let cursor = new Date(start);
    cursor <= end;
    cursor = addDays(cursor, 1)
  ) {
    days.push(new Date(cursor));
  }
  return days;
}

const defaultPlacementFormatNames = new Set([
  "1/24",
  "2/48",
  "3/72",
  "1/permanent",
  "No auto-delete",
]);

function isDefaultPlacementFormat(product: TelegramAdProduct) {
  return defaultPlacementFormatNames.has(product.name.trim());
}

function placementFormatCanonicalKey(
  product: Pick<
    TelegramAdProduct,
    | "name"
    | "isPermanent"
    | "topDurationMinutes"
    | "feedDurationHours"
    | "deleteAfterHours"
  >,
) {
  const name = product.name.trim();
  if (
    product.isPermanent &&
    (name === "1/permanent" || name === "No auto-delete")
  ) {
    return "default:no-auto-delete";
  }
  if (name === "1/24") return "default:1/24";
  if (name === "2/48") return "default:2/48";
  if (name === "3/72") return "default:3/72";
  return `custom:${name}:${product.topDurationMinutes ?? "na"}:${product.feedDurationHours ?? "na"}:${product.deleteAfterHours ?? "na"}`;
}

function placementFormatName(
  product: Pick<TelegramAdProduct, "name" | "isPermanent">,
) {
  if (product.isPermanent && product.name.trim() === "1/permanent") {
    return "No auto-delete";
  }
  return product.name;
}

function placementDeliveryLabel(
  product: Pick<
    TelegramAdProduct,
    | "topDurationMinutes"
    | "feedDurationHours"
    | "isPermanent"
    | "deleteAfterHours"
  >,
) {
  const topHours = product.topDurationMinutes
    ? Math.round(product.topDurationMinutes / 60)
    : 0;
  if (product.isPermanent) {
    return "No auto-delete";
  }
  const feedHours =
    product.feedDurationHours ?? product.deleteAfterHours ?? null;
  if (topHours > 0 && feedHours) {
    return `${topHours}h first • ${feedHours}h in feed`;
  }
  if (feedHours) {
    return `${feedHours}h in feed`;
  }
  return "Custom placement";
}

function placementExpectedViews(
  product: TelegramAdProduct,
  baseline: TelegramAdChannelBaseline | undefined,
) {
  const canonicalKey = placementFormatCanonicalKey(product);
  if (!baseline) {
    return product.estimatedViews;
  }
  if (canonicalKey === "default:1/24") {
    return baseline.windows.h24.expectedViews;
  }
  if (canonicalKey === "default:2/48") {
    return baseline.windows.h48.expectedViews;
  }
  if (canonicalKey === "default:3/72") {
    return baseline.windows.h72.expectedViews;
  }
  if (canonicalKey === "default:no-auto-delete") {
    return baseline.windows.d7.expectedViews;
  }
  return product.estimatedViews;
}

function placementEstimatedPrice(
  product: TelegramAdProduct,
  baseline: TelegramAdChannelBaseline | undefined,
  baseCpm: string,
) {
  const expectedViews = placementExpectedViews(product, baseline);
  const parsedCpm = Number(baseCpm.trim());
  if (expectedViews != null && Number.isFinite(parsedCpm) && parsedCpm > 0) {
    const value = (expectedViews / 1000) * parsedCpm;
    return Number.isInteger(value)
      ? String(value)
      : String(Number(value.toFixed(2)));
  }
  return product.estimatedPrice ?? "—";
}

function monthLabel(value: Date) {
  return value.toLocaleDateString(undefined, {
    month: "long",
    year: "numeric",
  });
}

function tabButtonClass(active: boolean) {
  return active
    ? "border-blue-500 bg-blue-600 text-white shadow-[0_0_24px_rgba(37,99,235,0.22)]"
    : "border-slate-800/80 bg-[#0b1220] text-neutral-300 hover:border-slate-700 hover:text-white";
}

function isSaleUnderpriced(sale: TelegramAdSale) {
  return sale.placements.some(
    (placement) =>
      buildUnderpricingSummary({
        agreedPrice: placement.agreedPrice,
        recommendedPrice: placement.recommendedPrice,
        minimumPrice: placement.minimumPrice,
      }).isBelowMinimum,
  );
}

function sameStringArray(left: string[], right: string[]) {
  return (
    left.length === right.length &&
    left.every((value, index) => value === right[index])
  );
}

type SlotsLayoutView = "calendar" | "list";

const tabRouteMap: Record<TelegramAdSalesTab, string> = {
  calendar: "/ad-sales/calendar",
  sales: "/ad-sales/sales",
  clients: "/ad-sales/clients",
  analytics: "/ad-sales/analytics",
  settings: "/ad-sales/settings",
};

function routeTabFromPathname(pathname: string): TelegramAdSalesTab {
  if (pathname.startsWith("/ad-sales/pricing")) return "settings";
  if (pathname.startsWith("/ad-sales/analytics")) return "analytics";
  if (pathname.startsWith("/ad-sales/settings")) return "settings";
  if (pathname.startsWith("/ad-sales/clients")) return "clients";
  if (pathname.startsWith("/ad-sales/sales")) return "sales";
  return "calendar";
}

export function AdSalesPage() {
  const pathname = usePathname();
  const router = useRouter();
  const queryClient = useQueryClient();
  const { pushToast, startOperation } = useAppToast();
  const [tab, setTab] = useState<TelegramAdSalesTab>(() =>
    routeTabFromPathname(pathname),
  );
  const [calendarView, setCalendarView] = useState<SlotsLayoutView>("calendar");
  const [calendarRangeMode, setCalendarRangeMode] =
    useState<TelegramAdSalesCalendarRangeMode>("week");
  const [calendarCursor, setCalendarCursor] = useState(() => new Date());
  const [calendarRangeSelection, setCalendarRangeSelection] = useState<{
    from: string;
    to: string;
  } | null>(null);
  const [selectedNetworkId, setSelectedNetworkId] = useState("");
  const [selectedChannelIds, setSelectedChannelIds] = useState<string[]>([]);
  const [slotStatusFilter, setSlotStatusFilter] = useState("");
  const [saleStatusFilter, setSaleStatusFilter] = useState("");
  const [responsibleMemberId, setResponsibleMemberId] = useState("");
  const [slotVisibility, setSlotVisibility] = useState<"all" | "free" | "busy">(
    "all",
  );
  const [salesPage, setSalesPage] = useState(1);
  const [salesPageSize, setSalesPageSize] = useState(25);
  const [saleSearch, setSaleSearch] = useState("");
  const [paymentStatusFilter, setPaymentStatusFilter] = useState("");
  const [underpricedOnly, setUnderpricedOnly] = useState(false);
  const [unpaidOnly, setUnpaidOnly] = useState(false);
  const [selectedSaleId, setSelectedSaleId] = useState<string | null>(null);
  const [adSaleModalOpen, setAdSaleModalOpen] = useState(false);
  const [bulkAdSaleModalOpen, setBulkAdSaleModalOpen] = useState(false);
  const [adSaleSeedSlot, setAdSaleSeedSlot] =
    useState<TelegramAdAvailabilitySlot | null>(null);
  const [paymentSaleId, setPaymentSaleId] = useState<string | null>(null);
  const [postEditorPlacement, setPostEditorPlacement] = useState<{
    saleId: string;
    placementId: string;
  } | null>(null);
  const [pastSlotAssignment, setPastSlotAssignment] = useState<{
    saleId: string;
    placementId: string;
    channelTitle: string;
    slotDateLabel: string;
    posts: Array<{
      id: string;
      title: string;
      kind: "managed" | "telegram";
      status: string;
      dateValue: string;
    }>;
  } | null>(null);
  const [selectedPastPostId, setSelectedPastPostId] = useState("");
  const [postTitle, setPostTitle] = useState("");
  const [postText, setPostText] = useState("");
  const [postImages, setPostImages] = useState("");
  const [refreshingCurrentPage, setRefreshingCurrentPage] = useState(false);
  const appliedPreferencesSignatureRef = useRef<string | null>(null);

  useLayoutEffect(() => {
    const storedView = readAdSalesCalendarRangeMode(window.localStorage);
    if (!storedView) return;
    // Apply the stored visual mode before the browser paints the calendar.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setCalendarRangeMode(storedView);
  }, []);

  useEffect(() => {
    setTab(routeTabFromPathname(pathname));
  }, [pathname]);

  const { from, to } = useMemo(() => {
    if (calendarRangeSelection?.from) {
      return {
        from: new Date(`${calendarRangeSelection.from}T00:00:00`),
        to: new Date(
          `${calendarRangeSelection.to || calendarRangeSelection.from}T23:59:59.999`,
        ),
      };
    }
    return rangeForCalendarMode(calendarRangeMode, calendarCursor);
  }, [calendarCursor, calendarRangeMode, calendarRangeSelection]);

  const calendarDays = useMemo(() => {
    if (calendarRangeMode === "month" && !calendarRangeSelection?.from) {
      return monthGridDays(calendarCursor);
    }
    if (calendarRangeMode === "threeMonths" && !calendarRangeSelection?.from) {
      return monthGridDaysForRange(from, to);
    }
    return listDaysInRange(from, to);
  }, [calendarCursor, calendarRangeMode, calendarRangeSelection, from, to]);
  const { data: settings } = useQuery({
    queryKey: ["currency-settings"],
    queryFn: currenciesApi.getSettings,
    staleTime: 5 * 60 * 1000,
  });
  const { data: me } = useQuery({
    queryKey: ["auth", "me"],
    queryFn: authApi.me,
    staleTime: 5 * 60 * 1000,
  });
  const { data: rates } = useQuery({
    queryKey: ["currency-rates"],
    queryFn: currenciesApi.listRates,
    staleTime: 5 * 60 * 1000,
  });
  const { data: channels = [] } = useQuery({
    queryKey: ["telegram-channels"],
    queryFn: telegramChannelsApi.list,
    staleTime: 60 * 1000,
  });
  const { data: networks = [] } = useQuery({
    queryKey: ["telegram-channel-networks"],
    queryFn: telegramChannelNetworksApi.list,
    staleTime: 60 * 1000,
  });
  const { data: accounts = [] } = useQuery({
    queryKey: ["accounts"],
    queryFn: accountsApi.list,
    staleTime: 60 * 1000,
  });
  const workspaceTimezone = me?.workspace.timezone || "Europe/Warsaw";
  const preferencesQuery = useQuery({
    queryKey: telegramAdSalesKeys.preferences(),
    queryFn: telegramAdSalesApi.getPreferences,
    staleTime: 60 * 1000,
  });
  const adSalesWorkspaceSettingsQuery = useQuery({
    queryKey: telegramAdSalesKeys.workspaceSettings(),
    queryFn: telegramAdSalesApi.getWorkspaceSettings,
    enabled: tab === "settings",
    staleTime: 60 * 1000,
  });
  const savePreferencesMutation = useMutation({
    mutationFn: (payload: Record<string, unknown>) =>
      telegramAdSalesApi.updatePreferences(payload),
    onSuccess: (preferences) => {
      queryClient.setQueryData(telegramAdSalesKeys.preferences(), preferences);
    },
  });
  const salesQuery = useQuery({
    queryKey: telegramAdSalesKeys.sales({
      page: salesPage,
      pageSize: salesPageSize,
      status: saleStatusFilter || undefined,
    }),
    queryFn: () =>
      telegramAdSalesApi.listSalesPage({
        page: salesPage,
        pageSize: salesPageSize,
        ...(saleStatusFilter ? { status: saleStatusFilter } : {}),
      }),
    ...adSalesDataCacheOptions,
  });
  const calendarSalesQuery = useQuery({
    queryKey: telegramAdSalesKeys.sales({
      page: 1,
      pageSize: calendarSalesPageSize,
      scope: "calendar",
    }),
    queryFn: () =>
      telegramAdSalesApi.listSalesPage({
        page: 1,
        pageSize: calendarSalesPageSize,
      }),
    enabled: tab === "calendar",
    ...adSalesDataCacheOptions,
  });
  const selectedSaleQuery = useQuery({
    queryKey: selectedSaleId
      ? telegramAdSalesKeys.sale(selectedSaleId)
      : ["telegram-ad-sale", "none"],
    queryFn: () => telegramAdSalesApi.getSale(selectedSaleId!),
    enabled: Boolean(selectedSaleId),
  });

  const saleableChannels = useMemo(
    () => channels.filter((channel) => channel.preview?.canPostMessages),
    [channels],
  );
  const saleableChannelIdsList = useMemo(
    () => saleableChannels.map((channel) => channel.id),
    [saleableChannels],
  );
  const saleableChannelIds = useMemo(
    () => new Set(saleableChannelIdsList),
    [saleableChannelIdsList],
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
        allChannelIds: saleableChannelIdsList,
        selectedNetworkId: selectedNetworkId || null,
        networks: saleableNetworks as TelegramChannelNetwork[],
      }),
    [
      saleableChannelIdsList,
      saleableNetworks,
      selectedChannelIds,
      selectedNetworkId,
    ],
  );

  useEffect(() => {
    const preferences = preferencesQuery.data;
    if (!preferences) return;
    const allowedIds = new Set(saleableChannelIdsList);
    const filteredPreferenceIds = preferences.selectedChannelIds.filter(
      (channelId) => allowedIds.has(channelId),
    );
    const nextNetworkId = preferences.initialized
      ? (preferences.selectedNetworkId ?? "")
      : "";
    const networkChannelIds = nextNetworkId
      ? (
          saleableNetworks.find((network) => network.id === nextNetworkId)
            ?.channels ?? []
        ).map((channel) => channel.id)
      : [];
    const nextIds = preferences.initialized
      ? nextNetworkId
        ? networkChannelIds
        : filteredPreferenceIds.length
          ? filteredPreferenceIds
          : saleableChannelIdsList
      : saleableChannelIdsList;
    const storedRangeMode = readAdSalesCalendarRangeMode(window.localStorage);
    const normalizedView =
      storedRangeMode === "threeMonths"
        ? "threeMonths"
        : preferences.initialized && preferences.calendarView === "month"
          ? "month"
          : "week";
    const nextCalendarRangeMode = normalizedView;
    writeAdSalesCalendarRangeMode(window.localStorage, nextCalendarRangeMode);
    const nextPreferencesSignature = JSON.stringify({
      nextIds,
      nextNetworkId,
      nextCalendarRangeMode,
      saleableChannelIdsList,
    });

    if (appliedPreferencesSignatureRef.current === nextPreferencesSignature) {
      return;
    }
    appliedPreferencesSignatureRef.current = nextPreferencesSignature;

    setSelectedChannelIds((current) =>
      sameStringArray(current, nextIds) ? current : nextIds,
    );
    setSelectedNetworkId((current) =>
      current === nextNetworkId ? current : nextNetworkId,
    );
    setCalendarRangeMode((current) =>
      current === nextCalendarRangeMode ? current : nextCalendarRangeMode,
    );

    if (!preferences.initialized && nextIds.length) {
      savePreferencesMutation.mutate({
        selectedChannelIds: nextIds,
        selectedNetworkId: null,
        calendarView: nextCalendarRangeMode,
        initialized: true,
      });
      return;
    }

    if (
      preferences.initialized &&
      nextIds.length !== preferences.selectedChannelIds.length
    ) {
      savePreferencesMutation.mutate({
        selectedChannelIds: nextIds,
        selectedNetworkId: preferences.selectedNetworkId,
        calendarView: nextCalendarRangeMode,
        initialized: true,
      });
    }
  }, [preferencesQuery.data, saleableChannelIdsList, saleableNetworks]);

  const persistCalendarPreferences = (
    payload: Partial<{
      selectedChannelIds: string[];
      selectedNetworkId: string | null;
      calendarView: "week" | "month";
    }>,
  ) => {
    savePreferencesMutation.mutate({
      selectedChannelIds,
      selectedNetworkId: selectedNetworkId || null,
      calendarView:
        payload.calendarView ??
        (calendarRangeMode === "threeMonths" ? "month" : calendarRangeMode),
      ...payload,
      initialized: true,
    });
  };

  const handleCalendarRangeModeChange = (
    view: TelegramAdSalesCalendarRangeMode,
  ) => {
    writeAdSalesCalendarRangeMode(window.localStorage, view);
    setCalendarRangeMode(view);
    if (view !== "threeMonths") {
      persistCalendarPreferences({ calendarView: view });
    }
  };

  const handleCalendarViewChange = (view: SlotsLayoutView) => {
    setCalendarView(view);
  };

  const handleCalendarRangeChange = (range: { from: string; to: string }) => {
    setCalendarRangeSelection(range.from || range.to ? range : null);
    if (range.from) {
      setCalendarCursor(new Date(`${range.from}T12:00:00`));
    }
  };

  const shiftCalendarRange = (direction: -1 | 1) => {
    if (calendarRangeSelection?.from) {
      const currentFrom = new Date(`${calendarRangeSelection.from}T00:00:00`);
      const currentTo = new Date(
        `${calendarRangeSelection.to || calendarRangeSelection.from}T00:00:00`,
      );
      const span = Math.max(
        1,
        Math.round(
          (currentTo.getTime() - currentFrom.getTime()) / (24 * 60 * 60 * 1000),
        ) + 1,
      );
      const nextFrom = addDays(currentFrom, span * direction);
      const nextTo = addDays(currentTo, span * direction);
      setCalendarRangeSelection({
        from: dateKey(nextFrom),
        to: dateKey(nextTo),
      });
      setCalendarCursor(new Date(nextFrom));
      return;
    }
    setCalendarCursor((current) =>
      calendarRangeMode === "month"
        ? new Date(current.getFullYear(), current.getMonth() + direction, 1)
        : calendarRangeMode === "threeMonths"
          ? new Date(
              current.getFullYear(),
              current.getMonth() + direction * 3,
              1,
            )
        : addDays(current, direction * 7),
    );
  };

  const handleSelectedNetworkIdChange = (networkId: string) => {
    setSelectedNetworkId(networkId);
    if (!networkId) {
      persistCalendarPreferences({ selectedNetworkId: null });
      return;
    }
    const network = saleableNetworks.find((item) => item.id === networkId);
    const nextChannelIds = network?.channels.map((channel) => channel.id) ?? [];
    setSelectedChannelIds(nextChannelIds);
    persistCalendarPreferences({
      selectedNetworkId: networkId || null,
      selectedChannelIds: nextChannelIds,
    });
  };

  const handleSelectedChannelIdsChange = (channelIds: string[]) => {
    const sortedIds = [...channelIds].sort();
    const matchedNetwork =
      saleableNetworks.find((network) => {
        const networkIds = network.channels.map((channel) => channel.id).sort();
        return sameStringArray(networkIds, sortedIds);
      }) ?? null;
    setSelectedChannelIds(channelIds);
    setSelectedNetworkId(matchedNetwork?.id ?? "");
    persistCalendarPreferences({
      selectedChannelIds: channelIds,
      selectedNetworkId: matchedNetwork?.id ?? null,
    });
  };

  const productQueryChannelIds = bulkAdSaleModalOpen
    ? saleableChannelIdsList
    : effectiveChannelIds;
  const channelProductQueries = useQueries({
    queries: productQueryChannelIds.map((channelId) => ({
      queryKey: telegramAdSalesKeys.channelProducts(channelId),
      queryFn: () => telegramAdSalesApi.listChannelProducts(channelId),
      enabled: tab === "settings" || adSaleModalOpen || bulkAdSaleModalOpen,
      staleTime: 60 * 1000,
    })),
  });
  const productsByChannelId = useMemo<Record<string, TelegramAdProduct[]>>(
    () =>
      Object.fromEntries(
        productQueryChannelIds.map((channelId, index) => [
          channelId,
          (channelProductQueries[index]?.data ?? []) as TelegramAdProduct[],
        ]),
      ),
    [channelProductQueries, productQueryChannelIds],
  );

  const filteredSales = useMemo(() => {
    let items = salesQuery.data?.items ?? [];
    items = items.filter((sale) =>
      sale.placements.some((placement) => {
        const placementDate = new Date(placement.scheduledAt).getTime();
        return placementDate >= from.getTime() && placementDate <= to.getTime();
      }),
    );
    const search = saleSearch.trim().toLowerCase();
    if (search) {
      items = items.filter((sale) =>
        [
          sale.title,
          sale.advertiserName,
          sale.advertiserTelegram,
          sale.advertiserContact,
        ]
          .filter(Boolean)
          .some((value) => String(value).toLowerCase().includes(search)),
      );
    }
    if (paymentStatusFilter) {
      items = items.filter(
        (sale) => sale.paymentStatus === paymentStatusFilter,
      );
    }
    if (responsibleMemberId) {
      items = items.filter(
        (sale) => sale.assignedMemberId === responsibleMemberId,
      );
    }
    if (underpricedOnly) {
      items = items.filter(isSaleUnderpriced);
    }
    if (unpaidOnly) {
      items = items.filter((sale) => sale.paymentStatus !== "PAID");
    }
    if (selectedChannelIds.length) {
      items = items.filter((sale) =>
        sale.placements.some((placement) =>
          effectiveChannelIds.includes(placement.telegramChannelId),
        ),
      );
    }
    return items;
  }, [
    effectiveChannelIds,
    from,
    paymentStatusFilter,
    responsibleMemberId,
    saleSearch,
    salesQuery.data?.items,
    selectedChannelIds.length,
    to,
    underpricedOnly,
    unpaidOnly,
  ]);

  const filteredSlots = useMemo(() => {
    const channelIds = new Set(effectiveChannelIds);
    let items = buildAdCalendarSlots(
      (calendarSalesQuery.data?.items ?? []).flatMap((sale) =>
        sale.placements
          .filter((placement) => channelIds.has(placement.telegramChannelId))
          .map((placement): TelegramAdAvailabilitySlot => ({
            channelId: placement.telegramChannelId,
            date: channelLocalDateKey(
              placement.scheduledAt,
              placement.timezone,
            ),
            inventoryOpportunityKey: placement.inventoryOpportunityKey,
            scheduledAt: placement.scheduledAt,
            timezone: placement.timezone || workspaceTimezone,
            source: "sale",
            state: "SOLD",
            blockingReason: null,
            nextOrganicPostAt: null,
            productId: placement.telegramAdProductId,
            expectedViews: placement.expectedViews,
            recommendedPrice: placement.recommendedPrice,
            minimumPrice: placement.minimumPrice,
            currency: placement.currency,
            existingPlacement: {
              id: placement.id,
              saleId: sale.id,
              status: placement.status,
            },
            organicPostsCountForDay: 0,
            adsCountForDay: 1,
          })),
      ),
    );
    if (slotStatusFilter) {
      items = items.filter(
        (slot) =>
          slot.existingPlacement?.status === slotStatusFilter ||
          slot.state === slotStatusFilter,
      );
    }
    if (slotVisibility === "free") {
      items = [];
    }
    if (slotVisibility === "busy") {
      items = items.filter((slot) => slot.state !== "AVAILABLE");
    }
    return items;
  }, [
    effectiveChannelIds,
    calendarSalesQuery.data?.items,
    slotStatusFilter,
    slotVisibility,
    workspaceTimezone,
  ]);

  const pricingChannels = useMemo(
    () =>
      effectiveChannelIds
        .map((channelId) =>
          channels.find((channel) => channel.id === channelId),
        )
        .filter((channel): channel is TelegramChannel => Boolean(channel)),
    [channels, effectiveChannelIds],
  );

  const baselineQueries = useQueries({
    queries: pricingChannels.map((channel) => ({
      queryKey: telegramAdSalesKeys.baseline(channel.id),
      queryFn: () => telegramAdSalesApi.getChannelBaseline(channel.id),
      enabled: tab === "settings",
      staleTime: 60 * 1000,
    })),
  });

  const policyQueries = useQueries({
    queries: pricingChannels.map((channel) => ({
      queryKey: telegramAdSalesKeys.policy(channel.id),
      queryFn: () => telegramAdSalesApi.getPolicy(channel.id),
      enabled: tab === "settings",
      staleTime: 60 * 1000,
    })),
  });

  const handleRefreshCurrentPage = async () => {
    setRefreshingCurrentPage(true);
    try {
      await withFreshApiReads(async () => {
        const refreshTasks: Promise<unknown>[] = [
          queryClient.invalidateQueries({
            queryKey: telegramAdSalesKeys.preferences(),
          }),
          queryClient.refetchQueries({
            queryKey: ["telegram-channels"],
            type: "active",
          }),
          queryClient.refetchQueries({
            queryKey: ["telegram-channel-networks"],
            type: "active",
          }),
          queryClient.refetchQueries({
            queryKey: telegramAdSalesKeys.preferences(),
            type: "active",
          }),
        ];

        if (tab === "settings") {
          refreshTasks.push(
            queryClient.refetchQueries({
              queryKey: telegramAdSalesKeys.workspaceSettings(),
              type: "active",
            }),
          );
          for (const channelId of pricingChannels.map(
            (channel) => channel.id,
          )) {
            refreshTasks.push(
              queryClient.refetchQueries({
                queryKey: telegramAdSalesKeys.channelProducts(channelId),
                type: "active",
              }),
              queryClient.refetchQueries({
                queryKey: telegramAdSalesKeys.baseline(channelId),
                type: "active",
              }),
              queryClient.refetchQueries({
                queryKey: telegramAdSalesKeys.policy(channelId),
                type: "active",
              }),
            );
          }
        }

        if (tab === "calendar") {
          refreshTasks.push(
            queryClient.refetchQueries({
              queryKey: telegramAdSalesKeys.sales({
                page: 1,
                pageSize: calendarSalesPageSize,
                scope: "calendar",
              }),
              type: "active",
            }),
          );
        }

        if (tab === "sales") {
          refreshTasks.push(
            queryClient.refetchQueries({
              queryKey: telegramAdSalesKeys.sales({
                page: salesPage,
                pageSize: salesPageSize,
                status: saleStatusFilter || undefined,
              }),
              type: "active",
            }),
          );
        }

        if (tab === "clients") {
          refreshTasks.push(
            queryClient.refetchQueries({
              queryKey: telegramAdSalesKeys.crmAdvertisersRoot(),
              type: "active",
            }),
          );
        }

        if (tab === "analytics") {
          refreshTasks.push(
            queryClient.refetchQueries({
              queryKey: telegramAdSalesKeys.analytics(),
              type: "active",
            }),
            queryClient.refetchQueries({
              queryKey: ["dashboard-summary"],
              type: "active",
            }),
          );
        }

        await Promise.all(refreshTasks);
      });
    } finally {
      setRefreshingCurrentPage(false);
    }
  };

  async function handleCreateSale(
    payload: Parameters<
      NonNullable<React.ComponentProps<typeof AdSaleModal>["onSubmit"]>
    >[0],
  ) {
    const seedSlot = adSaleSeedSlot;
    const sale = await telegramAdSalesApi.createSale(
      {
        advertiserId: payload.advertiserId,
        createAdvertiser: payload.createAdvertiser,
        advertiserName: payload.advertiserName,
        advertiserTelegram: payload.advertiserTelegram,
        advertiserContact: payload.advertiserContact,
        settlementCurrency: payload.paymentCurrency,
        assignedMemberId: payload.assignedMemberId,
      },
      true,
    );

    for (const placement of payload.placements) {
      await telegramAdSalesApi.addPlacement(
        sale.id,
        {
          telegramChannelId: placement.channelId,
          telegramAdProductId: placement.productId,
          inventoryOpportunityKey: placement.inventoryOpportunityKey,
          scheduledAt: placement.scheduledAt,
          timezone: placement.timezone,
          agreedPrice: placement.agreedPrice,
          recommendedPrice: placement.recommendedPrice,
          minimumPrice: placement.minimumPrice,
          expectedViews: placement.expectedViews,
          pricingMode: placement.pricingMode,
          currency: payload.paymentCurrency,
          manualPriceReason: placement.manualPriceReason,
        },
        true,
      );
    }
    const refreshed = await telegramAdSalesApi.getSale(sale.id);
    try {
      const reserved = await telegramAdSalesApi.reserveSale(
        sale.id,
        {
          placements: refreshed.placements.map((placement) => ({
            placementId: placement.id,
            scheduledAt: placement.scheduledAt,
          })),
        },
        true,
      );
      const attachmentTasks = payload.placements.flatMap((draft) => {
        if (!draft.telegramPostId) return [];
        const placement = reserved.placements.find(
          (item) =>
            item.telegramChannelId === draft.channelId &&
            item.scheduledAt === draft.scheduledAt,
        );
        return placement
          ? [
              telegramAdSalesApi.attachManagedPost(
                reserved.id,
                placement.id,
                {
                  telegramPostId: draft.telegramPostId,
                },
                true,
              ),
            ]
          : [];
      });
      await Promise.all(attachmentTasks);
      if (attachmentTasks.length) {
        await telegramAdSalesApi.reconcileSale(reserved.id, true);
      }
      const autoAllocation = autoAllocatePayment({
        amount: payload.paymentAmount,
        placements: reserved.placements.map((placement) => ({
          id: placement.id,
          agreedPrice: placement.agreedPrice,
          paidAllocatedAmount: placement.paidAllocatedAmount,
        })),
      });
      await telegramAdSalesApi.createPayment(
        reserved.id,
        {
          accountId: payload.accountId,
          amount: payload.paymentAmount,
          currency: payload.paymentCurrency,
          paidAt: new Date().toISOString(),
          allocations: autoAllocation.allocations,
        },
        true,
      );
      await invalidateTelegramAdSalesQueries(queryClient, {
        saleId: reserved.id,
        channelIds: reserved.placements.map(
          (placement) => placement.telegramChannelId,
        ),
      });
      if (
        seedSlot?.state === "PAST" &&
        !payload.placements.some((placement) => placement.telegramPostId)
      ) {
        const placement =
          reserved.placements.find((item) =>
            seedSlot.inventoryOpportunityKey
              ? item.inventoryOpportunityKey ===
                seedSlot.inventoryOpportunityKey
              : item.telegramChannelId === seedSlot.channelId &&
                item.scheduledAt === seedSlot.scheduledAt,
          ) ??
          reserved.placements.find(
            (item) => item.telegramChannelId === seedSlot.channelId,
          );
        const slotTime = new Date(seedSlot.scheduledAt).getTime();
        const publishedPosts = await getTelegramChannelPosts(
          seedSlot.channelId,
          {
            page: 1,
            pageSize: 100,
            from: new Date(slotTime - 36 * 60 * 60 * 1000).toISOString(),
            to: new Date(slotTime + 36 * 60 * 60 * 1000).toISOString(),
          },
        );
        const candidates = publishedPosts.items
          .filter(
            (item) =>
              channelLocalDateKey(item.postDate, seedSlot.timezone) ===
              channelLocalDateKey(seedSlot.scheduledAt, seedSlot.timezone),
          )
          .map((item) => ({
            id: item.id,
            title:
              item.text?.trim()?.split("\n").find(Boolean)?.slice(0, 80) ||
              "Telegram post",
            kind: "telegram" as const,
            status: "PUBLISHED",
            dateValue: item.postDate,
          }));
        if (placement && candidates.length) {
          setPastSlotAssignment({
            saleId: reserved.id,
            placementId: placement.id,
            channelTitle:
              saleableChannels.find(
                (channel) => channel.id === seedSlot.channelId,
              )?.title || "Channel",
            slotDateLabel: new Date(seedSlot.scheduledAt).toLocaleDateString(),
            posts: candidates,
          });
          setSelectedPastPostId(candidates[0]?.id ?? "");
        } else {
          pushToast(
            "Sale was created, but no post from that day was found to link to the past slot.",
            "error",
          );
        }
      }
      return { sale: reserved };
    } catch (error) {
      await invalidateTelegramAdSalesQueries(queryClient, {
        saleId: refreshed.id,
        channelIds: refreshed.placements.map(
          (placement) => placement.telegramChannelId,
        ),
      });
      throw error;
    }
  }

  async function submitAdSale(
    payload: Parameters<
      NonNullable<React.ComponentProps<typeof AdSaleModal>["onSubmit"]>
    >[0],
  ) {
    const operation = startOperation({
      id: `ad-sale-create:${Date.now()}`,
      title: "Creating ad sale",
      message: "Saving the sale and reserving its placements...",
    });
    try {
      const result = await handleCreateSale(payload);
      operation.succeed({
        title: "Ad sale created",
        message: "The ad sale was created and reserved successfully.",
      });
      return result;
    } catch (error) {
      operation.fail({
        title: "Ad sale creation failed",
        message:
          error instanceof Error
            ? error.message
            : "Could not create the ad sale.",
      });
      throw error;
    }
  }

  async function submitBulkAdSale(
    payload: Parameters<typeof telegramAdSalesApi.bulkCreate>[0],
    options: { paymentAccountId: string },
  ) {
    const operation = startOperation({
      id: `ad-sale-bulk-create:${Date.now()}`,
      title: "Creating ad sales",
      message: "Saving and reserving the selected placements...",
    });
    try {
      const result = await telegramAdSalesApi.bulkCreate(payload, true);
      const paymentAccount = (accounts as Account[]).find(
        (account) => account.id === options.paymentAccountId,
      );
      if (!paymentAccount) {
        throw new Error("Payment account not found.");
      }
      for (const sale of result.sales) {
        const paymentAmount = sale.placements.reduce(
          (sum, placement) => sum + toNumber(placement.agreedPrice),
          0,
        );
        const autoAllocation = autoAllocatePayment({
          amount: paymentAmount,
          placements: sale.placements.map((placement) => ({
            id: placement.id,
            agreedPrice: placement.agreedPrice,
            paidAllocatedAmount: placement.paidAllocatedAmount,
          })),
        });
        if (autoAllocation.allocatedTotal <= 0) continue;
        await telegramAdSalesApi.createPayment(
          sale.id,
          {
            accountId: paymentAccount.id,
            amount: autoAllocation.allocatedTotal,
            currency: paymentAccount.currency,
            paidAt: new Date().toISOString(),
            allocations: autoAllocation.allocations,
          },
          true,
        );
      }
      await invalidateTelegramAdSalesQueries(queryClient, {
        channelIds: result.channelIds,
      });
      operation.succeed({
        title: "Ad sales created",
        message: `${result.createdPlacementCount} placements were created.`,
      });
    } catch (error) {
      operation.fail({
        title: "Bulk ad creation failed",
        message:
          error instanceof Error
            ? error.message
            : "Could not create bulk ad sales.",
      });
      throw error;
    }
  }

  async function refreshSaleAfterMutation(
    saleId: string,
    channelIds: string[],
  ) {
    await invalidateTelegramAdSalesQueries(queryClient, { saleId, channelIds });
    await queryClient.invalidateQueries({
      queryKey: telegramAdSalesKeys.sales({}),
    });
  }

  const selectedSale = selectedSaleQuery.data ?? null;
  const selectedPaymentSale =
    paymentSaleId != null
      ? selectedSale?.id === paymentSaleId
        ? selectedSale
        : (salesQuery.data?.items.find((sale) => sale.id === paymentSaleId) ??
          null)
      : null;

  return (
    <AppShell>
      <PageTabHead title="Ad Sales" emoji="💼" color="#0f766e" />
      <PageHeader
        title="Advertising sales"
        subtitle="Sell ad placements across your own Telegram channels and networks."
        action={
          <div className="flex w-full flex-col gap-3 xl:w-[760px] 2xl:w-auto 2xl:flex-row 2xl:items-end 2xl:gap-4">
            <div className="grid gap-3 md:grid-cols-[minmax(180px,260px)_minmax(260px,1fr)] 2xl:contents">
              <div className="min-w-0 2xl:min-w-[260px]">
                <FormField label="Network">
                  <Select
                    value={selectedNetworkId}
                    onChange={(event) =>
                      handleSelectedNetworkIdChange(event.target.value)
                    }
                  >
                    <option value="">All networks</option>
                    {saleableNetworks.map((network) => (
                      <option key={network.id} value={network.id}>
                        {network.name}
                      </option>
                    ))}
                  </Select>
                </FormField>
              </div>
              <div className="min-w-0 2xl:min-w-[360px]">
                <FormField label="Channels">
                  <MultiSelect
                    value={selectedChannelIds}
                    onChange={handleSelectedChannelIdsChange}
                    placeholder="Choose channels"
                    allSelectedLabel="All channels"
                    options={saleableChannels.map((channel) => ({
                      value: channel.id,
                      label: channel.title,
                      selectedLabel: channel.title,
                      iconUrl: channel.photoUrl,
                      iconFallback: channel.title,
                    }))}
                  />
                </FormField>
              </div>
            </div>
            <div className="flex flex-wrap items-end gap-2 2xl:flex-nowrap 2xl:self-end">
              <Button
                variant="secondary"
                className="hidden h-11 shrink-0 items-center justify-center rounded-xl px-5 leading-none whitespace-nowrap lg:inline-flex"
                onClick={() => void handleRefreshCurrentPage()}
                disabled={refreshingCurrentPage}
                title="Clear cached data and refresh this page"
              >
                <span className="inline-flex items-center justify-center gap-2 leading-none">
                  <RefreshCw
                    size={16}
                    className={refreshingCurrentPage ? "animate-spin" : ""}
                  />
                  Refresh
                </span>
              </Button>
              <Button
                variant="secondary"
                className="inline-flex h-11 shrink-0 items-center justify-center rounded-xl px-5 leading-none whitespace-nowrap"
                onClick={() => setBulkAdSaleModalOpen(true)}
              >
                <span className="inline-flex items-center justify-center gap-2 leading-none">
                  <Plus size={18} className="shrink-0" />
                  Mass add ads
                </span>
              </Button>
              <Button
                className="inline-flex h-11 shrink-0 items-center justify-center rounded-xl px-5 leading-none whitespace-nowrap"
                onClick={() => {
                  setAdSaleSeedSlot(null);
                  setAdSaleModalOpen(true);
                }}
              >
                <span className="inline-flex items-center justify-center gap-2 leading-none">
                  <Plus size={18} className="shrink-0" />
                  New sale
                </span>
              </Button>
            </div>
          </div>
        }
      />

      <Card className={`mb-5 ${adSalesPanelClass}`}>
        <div className="grid gap-4 xl:grid-cols-[minmax(0,1.5fr)_auto_auto_300px] xl:items-end">
          <div>
            <h2 className="text-3xl font-semibold tracking-tight text-white">
              {`${from.toLocaleDateString()} - ${to.toLocaleDateString()}`}
            </h2>
            <p className="mt-1 text-sm text-neutral-400">
              Shared reporting period and workspace scope for all ad-sales tabs.
            </p>
          </div>
          <div className="flex gap-2">
            {calendarRangeModes.map((view) => {
              const Icon = view.icon;
              return (
                <button
                  key={view.id}
                  type="button"
                  onClick={() => handleCalendarRangeModeChange(view.id)}
                  className={`inline-flex h-10 items-center justify-center gap-2 rounded-full border px-3 text-sm ${tabButtonClass(calendarRangeMode === view.id)}`}
                >
                  <Icon size={15} />
                  {view.label}
                </button>
              );
            })}
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => shiftCalendarRange(-1)}
              className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-slate-800/80 bg-[#0b1220] text-neutral-300 transition hover:border-slate-700 hover:bg-[#10192b] hover:text-white"
            >
              <ChevronLeft size={16} />
            </button>
            <button
              type="button"
              onClick={() => {
                setCalendarRangeSelection(null);
                setCalendarCursor(new Date());
              }}
              className="inline-flex h-10 items-center rounded-xl border border-slate-800/80 bg-[#0b1220] px-4 text-sm font-medium text-white transition hover:border-slate-700 hover:bg-[#10192b]"
            >
              Today
            </button>
            <button
              type="button"
              onClick={() => shiftCalendarRange(1)}
              className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-slate-800/80 bg-[#0b1220] text-neutral-300 transition hover:border-slate-700 hover:bg-[#10192b] hover:text-white"
            >
              <ChevronRight size={16} />
            </button>
          </div>
          <DateRangeInput
            from={calendarRangeSelection?.from || dateKey(from)}
            to={calendarRangeSelection?.to || dateKey(to)}
            onChange={handleCalendarRangeChange}
            className="w-full"
          />
        </div>
      </Card>

      <Card className={`mb-5 ${adSalesPanelClass}`}>
        <div className="flex flex-wrap gap-2">
          {tabs.map((item) => {
            const Icon = item.icon;
            return (
              <Tooltip
                key={item.id}
                side="top"
                align="center"
                content={
                  <span className="block w-72">{tabDescriptions[item.id]}</span>
                }
              >
                <button
                  type="button"
                  onClick={() => {
                    setTab(item.id);
                    router.replace(tabRouteMap[item.id]);
                  }}
                  className={`inline-flex items-center gap-2 rounded-full border px-4 py-2 text-sm font-medium ${tabButtonClass(tab === item.id)}`}
                >
                  <Icon size={16} />
                  {item.label}
                  <Info size={14} className="text-neutral-300" />
                </button>
              </Tooltip>
            );
          })}
        </div>
      </Card>

      {tab === "calendar" ? (
        <CalendarTab
          loadingChannelIds={[]}
          failedChannelIds={[]}
          calendarView={calendarView}
          calendarRangeMode={calendarRangeMode}
          calendarCursor={calendarCursor}
          onCalendarViewChange={handleCalendarViewChange}
          calendarFrom={from}
          calendarTo={to}
          calendarDays={calendarDays}
          channels={saleableChannels}
          selectedChannelIds={selectedChannelIds}
          statusFilter={slotStatusFilter}
          onStatusFilterChange={setSlotStatusFilter}
          slotVisibility={slotVisibility}
          onSlotVisibilityChange={setSlotVisibility}
          filteredSlots={filteredSlots}
          sales={calendarSalesQuery.data?.items ?? []}
          daySummaries={[]}
          settings={settings}
          rates={rates}
          workspaceTimezone={workspaceTimezone}
          onCreateFromSlot={(slot) => {
            setAdSaleSeedSlot(slot);
            setAdSaleModalOpen(true);
          }}
          onOpenSale={setSelectedSaleId}
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
          statusFilter={saleStatusFilter}
          onStatusFilterChange={setSaleStatusFilter}
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

      {tab === "clients" ? (
        <AdSalesClientsPanel
          settings={settings}
          rates={rates}
        />
      ) : null}

      {tab === "analytics" ? (
        <AdSalesAnalyticsPanel
          selectedChannelIds={effectiveChannelIds}
          selectedNetworkId={selectedNetworkId || null}
          from={from}
          to={to}
          settings={settings}
          rates={rates}
        />
      ) : null}

      {tab === "settings" ? (
        <SettingsTab
          channels={pricingChannels}
          supportedCurrencies={
            settings?.supportedCurrencies ?? ["USD", "EUR", "PLN", "UAH"]
          }
          workspaceTimezone={workspaceTimezone}
          workspaceSettings={adSalesWorkspaceSettingsQuery.data}
          productsByChannelId={productsByChannelId}
          baselineQueries={baselineQueries.map((query) => query.data)}
          baselineLoading={baselineQueries.map(
            (query) => query.isLoading || query.isFetching,
          )}
          policies={policyQueries.map((query) => query.data)}
          policyLoading={policyQueries.map(
            (query) => query.isLoading || query.isFetching,
          )}
          productLoading={pricingChannels.map((channel) => {
            const index = effectiveChannelIds.findIndex(
              (channelId) => channelId === channel.id,
            );
            const query = index >= 0 ? channelProductQueries[index] : undefined;
            return Boolean(query?.isLoading || query?.isFetching);
          })}
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
          onDeleteProduct={async (productId, channelId) => {
            await telegramAdSalesApi.deactivateProduct(productId);
            queryClient.setQueryData<TelegramAdProduct[]>(
              telegramAdSalesKeys.channelProducts(channelId),
              (current) =>
                (current ?? []).filter((product) => product.id !== productId),
            );
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
              channelIds.map((channelId) =>
                telegramAdSalesApi.updatePolicy(channelId, payload),
              ),
            );
            await Promise.all(
              channelIds.map((channelId) =>
                queryClient.invalidateQueries({
                  queryKey: telegramAdSalesKeys.policy(channelId),
                }),
              ),
            );
          }}
          onUpdateChannelPricing={async (channelId, payload) => {
            await telegramAdSalesApi.updateChannelPricing(channelId, payload);
            await queryClient.invalidateQueries({
              queryKey: telegramAdSalesKeys.baseline(channelId),
            });
            await queryClient.invalidateQueries({
              queryKey: telegramAdSalesKeys.channelProducts(channelId),
            });
          }}
          onRecommendPolicy={async (channelId, payload) => {
            await telegramAdSalesApi.recommendPolicy(channelId, {});
            await telegramAdSalesApi.updatePolicy(channelId, {
              useWorkspaceDefault: payload.useWorkspaceDefault,
              organicPostsPerAdSlot: payload.organicPostsPerAdSlot,
            });
            await queryClient.invalidateQueries({
              queryKey: telegramAdSalesKeys.policy(channelId),
            });
          }}
        />
      ) : null}

      <AdSaleModal
        open={adSaleModalOpen}
        onClose={() => setAdSaleModalOpen(false)}
        accounts={accounts as Account[]}
        channels={saleableChannels}
        networks={saleableNetworks as TelegramChannelNetwork[]}
        productsByChannelId={productsByChannelId}
        defaultCurrency={settings?.primaryCurrency || "USD"}
        workspaceTimezone={workspaceTimezone}
        initialChannelId={adSaleSeedSlot?.channelId ?? null}
        initialScheduledAt={adSaleSeedSlot?.scheduledAt ?? null}
        initialInventoryOpportunityKey={
          adSaleSeedSlot?.inventoryOpportunityKey ?? null
        }
        onSearchAdvertisers={(query) =>
          telegramAdSalesApi.searchAdvertisers({ q: query, limit: 5 })
        }
        onRequestQuote={async ({
          channelId,
          productId,
          pricingMode,
          currency,
          scheduledAt,
        }) =>
          telegramAdSalesApi.createQuote(
            {
              telegramChannelId: channelId,
              telegramAdProductId: productId,
              pricingMode,
              currency,
              scheduledAt,
            },
            true,
          )
        }
        onLoadAvailableSlots={async ({ channelId, productId, from, to }) => {
          const result = await telegramAdSalesApi.availability({
            from,
            to,
            channelIds: [channelId],
            ...(productId ? { productIds: [productId] } : {}),
          });
          return result.slots.filter(
            (slot) => slot.state === "AVAILABLE" || slot.state === "PAST",
          );
        }}
        onLoadPublishedPosts={async ({ channelId, date, timezone }) => {
          const from = zonedDateTimeToUtc(
            date,
            "00:00:00",
            timezone,
          ).toISOString();
          const to = zonedDateTimeToUtc(
            date,
            "23:59:59",
            timezone,
          ).toISOString();
          const result = await getTelegramChannelPosts(channelId, {
            page: 1,
            pageSize: 100,
            from,
            to,
          });
          return result.items.map((post) => ({
            id: post.id,
            title:
              post.text?.trim().split("\n").find(Boolean)?.slice(0, 90) ||
              "Telegram post",
            publishedAt: post.postDate,
          }));
        }}
        onSubmit={submitAdSale}
      />

      <BulkAdSaleModal
        open={bulkAdSaleModalOpen}
        onClose={() => setBulkAdSaleModalOpen(false)}
        accounts={accounts as Account[]}
        channels={saleableChannels}
        networks={saleableNetworks as TelegramChannelNetwork[]}
        productsByChannelId={productsByChannelId}
        defaultCurrency={settings?.primaryCurrency || "USD"}
        workspaceTimezone={workspaceTimezone}
        onLoadPublishedPosts={async ({ channelId, date, timezone }) => {
          const from = zonedDateTimeToUtc(
            date,
            "00:00:00",
            timezone,
          ).toISOString();
          const to = zonedDateTimeToUtc(
            date,
            "23:59:59",
            timezone,
          ).toISOString();
          const result = await getTelegramChannelPosts(channelId, {
            page: 1,
            pageSize: 100,
            from,
            to,
          });
          return result.items.map((post) => ({
            id: post.id,
            title:
              post.text?.trim().split("\n").find(Boolean)?.slice(0, 90) ||
              "Telegram post",
            publishedAt: post.postDate,
          }));
        }}
        onRequestQuote={async ({
          channelId,
          productId,
          pricingMode,
          currency,
          scheduledAt,
        }) =>
          telegramAdSalesApi.createQuote(
            {
              telegramChannelId: channelId,
              telegramAdProductId: productId,
              pricingMode,
              currency,
              scheduledAt,
            },
            true,
          )
        }
        onSubmit={submitBulkAdSale}
      />

      <RegisterPaymentModal
        open={Boolean(paymentSaleId)}
        onClose={() => setPaymentSaleId(null)}
        sale={selectedPaymentSale}
        accounts={accounts as Account[]}
        defaultCurrency={settings?.primaryCurrency || "USD"}
        onSubmit={async (payload) => {
          if (!selectedPaymentSale) return;
          await telegramAdSalesApi.createPayment(
            selectedPaymentSale.id,
            payload,
          );
          await refreshSaleAfterMutation(
            selectedPaymentSale.id,
            selectedPaymentSale.placements.map(
              (placement) => placement.telegramChannelId,
            ),
          );
          setPaymentSaleId(null);
        }}
      />

      <SaleDetailsModal
        sale={selectedSale}
        open={Boolean(selectedSaleId)}
        onClose={() => setSelectedSaleId(null)}
        accounts={accounts as Account[]}
        settings={settings}
        rates={rates}
        onSave={async (sale, draft) => {
          const targetCurrency =
            draft.payments[0]?.currency ?? sale.settlementCurrency;
          if (targetCurrency !== sale.settlementCurrency) {
            await telegramAdSalesApi.updateSale(sale.id, {
              settlementCurrency: targetCurrency,
            });
          }
          for (const placement of draft.placements) {
            await telegramAdSalesApi.updatePlacement(sale.id, placement.id, {
              scheduledAt: placement.scheduledAt,
              timezone: placement.timezone,
              agreedPrice: placement.agreedPrice,
              recommendedPrice: placement.recommendedPrice,
              minimumPrice: placement.minimumPrice,
              currency: placement.currency,
              manualPriceReason: placement.manualPriceReason || null,
            });
          }
          for (const payment of draft.payments) {
            await telegramAdSalesApi.updatePayment(sale.id, payment.id, {
              accountId: payment.accountId,
              amount: payment.amount,
              currency: payment.currency,
              paidAt: payment.paidAt,
              notes: payment.notes || null,
              allocations: payment.allocations,
            });
          }
          await refreshSaleAfterMutation(
            sale.id,
            sale.placements.map((item) => item.telegramChannelId),
          );
          await queryClient.invalidateQueries({
            queryKey: telegramAdSalesKeys.sale(sale.id),
          });
          await queryClient.invalidateQueries({ queryKey: ["transactions"] });
        }}
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
              ? await telegramAdSalesApi.cancelPlacement(
                  sale.id,
                  placementId,
                  {},
                )
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
            await telegramAdSalesApi.schedulePlacement(
              sale.id,
              placementId,
              {},
            );
          } else if (action === "publish" && placementId) {
            await telegramAdSalesApi.publishPlacement(sale.id, placementId, {});
          } else if (action === "reschedule" && placementId) {
            await telegramAdSalesApi.reschedulePlacement(sale.id, placementId, {
              scheduledAt: placement.scheduledAt,
            });
          } else if (action === "retry-deletion" && placementId) {
            await telegramAdSalesApi.retryDeletion(sale.id, placementId, {});
          } else if (action === "complete-permanent" && placementId) {
            await telegramAdSalesApi.completePermanentPlacement(
              sale.id,
              placementId,
              {},
            );
          } else if (action === "attach-post" && placementId) {
            const channelPosts = await telegramChannelsApi.managedPosts(
              placement.telegramChannelId,
            );
            const candidate = channelPosts.find(
              (post) => post.status === "DRAFT",
            );
            if (!candidate) {
              pushToast(
                "No draft managed post found for this channel.",
                "error",
              );
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
        open={Boolean(pastSlotAssignment)}
        onClose={() => {
          setPastSlotAssignment(null);
          setSelectedPastPostId("");
        }}
        title="Link sold post"
        size="md"
      >
        {pastSlotAssignment ? (
          <div className="space-y-4">
            <p className="text-sm text-neutral-400">
              Choose the real ad post for {pastSlotAssignment.channelTitle} on{" "}
              {pastSlotAssignment.slotDateLabel}.
            </p>
            <FormField label="Published post">
              <Select
                value={selectedPastPostId}
                onChange={(event) => setSelectedPastPostId(event.target.value)}
              >
                {pastSlotAssignment.posts.map((post) => {
                  const label = post.title?.trim() || "Untitled post";
                  return (
                    <option key={post.id} value={post.id}>
                      {post.dateValue
                        ? `${new Date(post.dateValue).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })} · `
                        : ""}
                      {post.kind === "telegram" ? "Post · " : "Managed · "}
                      {label}
                    </option>
                  );
                })}
              </Select>
            </FormField>
            <div className="flex justify-end gap-2">
              <Button
                variant="secondary"
                onClick={() => {
                  setPastSlotAssignment(null);
                  setSelectedPastPostId("");
                }}
              >
                Skip for now
              </Button>
              <Button
                disabled={!selectedPastPostId}
                onClick={async () => {
                  if (!pastSlotAssignment || !selectedPastPostId) return;
                  const current = pastSlotAssignment;
                  const selectedPost = current.posts.find(
                    (post) => post.id === selectedPastPostId,
                  );
                  setPastSlotAssignment(null);
                  setSelectedPastPostId("");
                  await telegramAdSalesApi.attachManagedPost(
                    current.saleId,
                    current.placementId,
                    {
                      ...(selectedPost?.kind === "telegram"
                        ? { telegramPostId: selectedPost.id }
                        : { managedPostId: selectedPost?.id }),
                    },
                  );
                  await telegramAdSalesApi.reconcileSale(current.saleId);
                  await invalidateTelegramAdSalesQueries(queryClient, {
                    saleId: current.saleId,
                  });
                }}
              >
                Save
              </Button>
            </div>
          </div>
        ) : null}
      </Modal>

      <Modal
        open={Boolean(postEditorPlacement)}
        onClose={() => setPostEditorPlacement(null)}
        title="Create advertising post"
        size="xl"
      >
        <div className="space-y-4">
          <FormField label="Title">
            <Input
              value={postTitle}
              onChange={(event) => setPostTitle(event.target.value)}
            />
          </FormField>
          <FormField label="Text">
            <Textarea
              rows={8}
              value={postText}
              onChange={(event) => setPostText(event.target.value)}
            />
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
            <Button
              variant="secondary"
              onClick={() => setPostEditorPlacement(null)}
            >
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
                await queryClient.invalidateQueries({
                  queryKey: telegramAdSalesKeys.root,
                });
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

function SettingsTab(props: {
  channels: TelegramChannel[];
  supportedCurrencies: string[];
  workspaceTimezone: string;
  workspaceSettings:
    | Awaited<ReturnType<typeof telegramAdSalesApi.getWorkspaceSettings>>
    | undefined;
  productsByChannelId: Record<string, TelegramAdProduct[]>;
  baselineQueries: Array<TelegramAdChannelBaseline | undefined>;
  baselineLoading: boolean[];
  policies: Array<
    Awaited<ReturnType<typeof telegramAdSalesApi.getPolicy>> | undefined
  >;
  policyLoading: boolean[];
  productLoading: boolean[];
  onCreateProduct: (
    channelId: string,
    payload: Record<string, unknown>,
  ) => Promise<void>;
  onUpdateProduct: (
    productId: string,
    payload: Record<string, unknown>,
    channelId: string,
  ) => Promise<void>;
  onDeleteProduct: (productId: string, channelId: string) => Promise<void>;
  onUpdatePolicy: (
    channelId: string,
    payload: Record<string, unknown>,
  ) => Promise<void>;
  onApplyPolicyToChannels: (
    channelIds: string[],
    payload: Record<string, unknown>,
  ) => Promise<void>;
  onUpdateChannelPricing: (
    channelId: string,
    payload: Record<string, unknown>,
  ) => Promise<void>;
  onRecommendPolicy: (
    channelId: string,
    payload: Record<string, unknown>,
  ) => Promise<void>;
}) {
  const [draftPolicyByChannel, setDraftPolicyByChannel] = useState<
    Record<string, Record<string, string>>
  >({});
  const [channelPricingDrafts, setChannelPricingDrafts] = useState<
    Record<string, { baseCpm: string; currency: string }>
  >({});
  const [editingChannelPricing, setEditingChannelPricing] = useState<{
    channelId: string;
    baseCpm: string;
    currency: string;
  } | null>(null);
  const [editingProduct, setEditingProduct] = useState<{
    channelId: string;
    productId?: string;
    name: string;
    topDurationHours: string;
    feedDurationHours: string;
    isPermanent: boolean;
    isActive: boolean;
    position: string;
  } | null>(null);
  const [deletingProduct, setDeletingProduct] = useState<{
    id: string;
    name: string;
    channelId: string;
  } | null>(null);
  const [activeChannelId, setActiveChannelId] = useState<string>(
    props.channels[0]?.id ?? "",
  );

  useEffect(() => {
    const workspaceDefault =
      props.workspaceSettings?.defaultOrganicPostsPerAdSlot ?? 3;
    setDraftPolicyByChannel(
      Object.fromEntries(
        props.channels.map((channel, index) => {
          const policy = props.policies[index];
          const organicPostsPerAdSlot =
            policy?.organicPostsPerAdSlot ?? workspaceDefault;
          const useWorkspaceDefault =
            policy?.useWorkspaceDefault === true ||
            organicPostsPerAdSlot === workspaceDefault;
          return [
            channel.id,
            {
              useWorkspaceDefault: useWorkspaceDefault ? "true" : "false",
              organicPostsPerAdSlot: String(organicPostsPerAdSlot),
            },
          ];
        }),
      ),
    );
  }, [
    props.channels,
    props.policies,
    props.workspaceSettings?.defaultOrganicPostsPerAdSlot,
  ]);

  useEffect(() => {
    setChannelPricingDrafts(
      Object.fromEntries(
        props.channels.map((channel, index) => {
          const baseline = props.baselineQueries[index];
          return [
            channel.id,
            {
              baseCpm: baseline?.pricing.baseCpm ?? "",
              currency:
                baseline?.pricing.currency ??
                props.supportedCurrencies[0] ??
                "USD",
            },
          ];
        }),
      ),
    );
  }, [props.channels, props.baselineQueries, props.supportedCurrencies]);

  useEffect(() => {
    if (!props.channels.length) {
      setActiveChannelId("");
      return;
    }
    setActiveChannelId((current) =>
      props.channels.some((channel) => channel.id === current)
        ? current
        : props.channels[0]!.id,
    );
  }, [props.channels]);

  if (!props.channels.length) {
    return (
      <EmptyState text="Choose one or more channels in Calendar to manage products and schedule policies." />
    );
  }

  const activeChannelIndex = Math.max(
    0,
    props.channels.findIndex((channel) => channel.id === activeChannelId),
  );
  const activeChannel = props.channels[activeChannelIndex] ?? props.channels[0];
  const products = props.productsByChannelId[activeChannel.id] ?? [];
  const visibleProducts = products.reduce<TelegramAdProduct[]>(
    (items, product) => {
      const semanticKey = placementFormatCanonicalKey(product);
      const existingIndex = items.findIndex(
        (item) => placementFormatCanonicalKey(item) === semanticKey,
      );
      if (existingIndex === -1) {
        items.push(product);
        return items;
      }
      const existing = items[existingIndex]!;
      if (
        existing.name.trim() === "1/permanent" &&
        product.name.trim() === "No auto-delete"
      ) {
        items[existingIndex] = product;
      }
      return items;
    },
    [],
  );
  const baseline = props.baselineQueries[activeChannelIndex];
  const baselineLoading = props.baselineLoading[activeChannelIndex] ?? false;
  const policyLoading = props.policyLoading[activeChannelIndex] ?? false;
  const productLoading = props.productLoading[activeChannelIndex] ?? false;
  const setupLoading = baselineLoading || policyLoading || productLoading;
  const policyDraft = draftPolicyByChannel[activeChannel.id] ?? {};
  const pricingDraft = channelPricingDrafts[activeChannel.id] ?? {
    baseCpm: baseline?.pricing.baseCpm ?? "",
    currency:
      baseline?.pricing.currency ?? props.supportedCurrencies[0] ?? "USD",
  };

  return (
    <div className="space-y-5">
      <Card className={adSalesPanelClass}>
        <div>
          <h3 className="text-lg font-semibold text-white">Channels</h3>
          <p className="text-sm text-neutral-400">
            Switch channels here instead of scrolling through all setup cards.
          </p>
        </div>
        <div className="mt-4 overflow-x-auto">
          <div className="flex min-w-max gap-2">
            {props.channels.map((channel) => {
              const selected = channel.id === activeChannel.id;
              return (
                <button
                  key={channel.id}
                  type="button"
                  onClick={() => setActiveChannelId(channel.id)}
                  className={`inline-flex items-center gap-2 rounded-full border px-4 py-2 text-sm font-medium transition ${
                    selected
                      ? "border-blue-500 bg-blue-600 text-white"
                      : "border-neutral-800 bg-neutral-950/70 text-neutral-300 hover:border-neutral-700 hover:text-white"
                  }`}
                >
                  <TelegramEntityAvatar
                    imageUrl={channel.photoUrl}
                    kind="channel"
                    alt={channel.title}
                    size="sm"
                  />
                  <span className="whitespace-nowrap">{channel.title}</span>
                </button>
              );
            })}
          </div>
        </div>
      </Card>
      <Card key={activeChannel.id} className={adSalesPanelClass}>
        <div className="mt-5 grid gap-3 xl:grid-cols-[minmax(280px,1.15fr)_repeat(4,minmax(150px,0.7fr))]">
          <div className="rounded-[18px] border border-slate-800/80 bg-[#0a0f18] p-4">
            {setupLoading ? (
              <div className="space-y-3">
                <Skeleton className="h-4 w-24" />
                <Skeleton className="h-9 w-40" />
                <Skeleton className="h-4 w-56" />
              </div>
            ) : (
              <>
                <div className="flex items-center gap-2">
                  <h4 className="text-sm font-medium uppercase tracking-wide text-neutral-400">
                    Post CPM
                  </h4>
                  <button
                    type="button"
                    onClick={() =>
                      setEditingChannelPricing({
                        channelId: activeChannel.id,
                        baseCpm: pricingDraft.baseCpm,
                        currency: pricingDraft.currency,
                      })
                    }
                    className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-slate-700/80 bg-[#0f172a] text-neutral-300 transition hover:border-slate-600 hover:text-white"
                    aria-label={`Edit CPM for ${activeChannel.title}`}
                  >
                    <Pencil size={14} />
                  </button>
                </div>
                <div className="mt-2 flex flex-wrap items-baseline gap-3">
                  <p className="text-2xl font-semibold text-white">
                    {pricingDraft.baseCpm.trim()
                      ? `${pricingDraft.baseCpm} ${pricingDraft.currency}`
                      : "CPM not set"}
                  </p>
                  <p className="text-sm text-neutral-500">
                    Price per 1,000 views for this channel.
                  </p>
                </div>
              </>
            )}
          </div>
          <MetricCard
            label="24h views"
            value={
              baseline?.windows.h24.expectedViews != null
                ? String(baseline.windows.h24.expectedViews)
                : "—"
            }
            loading={baselineLoading}
          />
          <MetricCard
            label="48h views"
            value={
              baseline?.windows.h48.expectedViews != null
                ? String(baseline.windows.h48.expectedViews)
                : "—"
            }
            loading={baselineLoading}
          />
          <MetricCard
            label="72h views"
            value={
              baseline?.windows.h72.expectedViews != null
                ? String(baseline.windows.h72.expectedViews)
                : "—"
            }
            loading={baselineLoading}
          />
          <MetricCard
            label="7d views"
            value={
              baseline?.windows.d7.expectedViews != null
                ? String(baseline.windows.d7.expectedViews)
                : "—"
            }
            loading={baselineLoading}
          />
        </div>

        <div className="mt-4">
          <div className="mb-3 flex items-center justify-between gap-3">
            <div>
              <h4 className="text-base font-semibold text-white">Formats</h4>
              <p className="text-sm text-neutral-400">
                Standard placements are generated automatically. Add only custom
                ones here.
              </p>
            </div>
            <Tooltip
              side="bottom"
              align="right"
              content={
                <span className="block w-80">
                  Format = what we sell on a channel, for example a native post,
                  24h feed placement, or top placement. Policy = how organic
                  posting cadence turns into available ad slots.
                </span>
              }
            >
              <Button
                onClick={() =>
                  setEditingProduct({
                    channelId: activeChannel.id,
                    name: "",
                    topDurationHours: "1",
                    feedDurationHours: "24",
                    isPermanent: false,
                    isActive: true,
                    position: String(visibleProducts.length),
                  })
                }
              >
                Add custom format
              </Button>
            </Tooltip>
          </div>
          <div className="overflow-hidden rounded-[18px] border border-slate-800/80 bg-[#0b1220]">
            {productLoading ? (
              <div className="p-4">
                <TableLoadingState columns={5} rows={4} />
              </div>
            ) : (
              <table className="w-full text-left text-sm">
                <thead className="bg-[#09111e] text-xs uppercase text-neutral-400">
                  <tr>
                    <th className="px-3 py-2">Format</th>
                    <th className="px-3 py-2">Expected views</th>
                    <th className="px-3 py-2">Auto price</th>
                    <th className="px-3 py-2">Active</th>
                    <th className="px-3 py-2 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/80">
                  {visibleProducts.map((product) => {
                    const expectedViews = placementExpectedViews(
                      product,
                      baseline,
                    );
                    const estimatedPrice = placementEstimatedPrice(
                      product,
                      baseline,
                      pricingDraft.baseCpm,
                    );
                    const priceCurrency =
                      baseline?.pricing.currency ?? product.currency;
                    return (
                      <tr key={product.id} className="bg-transparent">
                        <td className="px-3 py-2">
                          <Tooltip
                            side="top"
                            content={placementDeliveryLabel(product)}
                          >
                            {isDefaultPlacementFormat(product) ? (
                              <span className="font-medium text-white">
                                {placementFormatName(product)}
                              </span>
                            ) : (
                              <button
                                type="button"
                                className="font-medium text-white underline-offset-2 hover:underline"
                                onClick={() =>
                                  setEditingProduct({
                                    channelId: activeChannel.id,
                                    productId: product.id,
                                    name: product.name,
                                    topDurationHours: String(
                                      product.topDurationMinutes
                                        ? Math.max(
                                            1,
                                            Math.round(
                                              product.topDurationMinutes / 60,
                                            ),
                                          )
                                        : 1,
                                    ),
                                    feedDurationHours: String(
                                      product.feedDurationHours ??
                                        product.deleteAfterHours ??
                                        24,
                                    ),
                                    isPermanent: product.isPermanent,
                                    isActive: product.isActive,
                                    position: String(product.position),
                                  })
                                }
                              >
                                {placementFormatName(product)}
                              </button>
                            )}
                          </Tooltip>
                        </td>
                        <td className="px-3 py-2">
                          {expectedViews != null
                            ? expectedViews.toLocaleString()
                            : "—"}
                        </td>
                        <td className="px-3 py-2">
                          {estimatedPrice === "—"
                            ? "—"
                            : `${estimatedPrice} ${priceCurrency}`}
                        </td>
                        <td className="px-3 py-2">
                          <button
                            type="button"
                            onClick={() =>
                              void props.onUpdateProduct(
                                product.id,
                                { isActive: !product.isActive },
                                activeChannel.id,
                              )
                            }
                            className={`relative inline-flex h-8 w-14 items-center rounded-full border transition ${
                              product.isActive
                                ? "border-emerald-500/70 bg-emerald-500/20"
                                : "border-neutral-700 bg-neutral-900"
                            }`}
                            aria-label={`${product.isActive ? "Disable" : "Enable"} ${product.name}`}
                          >
                            <span
                              className={`absolute h-6 w-6 rounded-full bg-white transition ${
                                product.isActive ? "left-7" : "left-1"
                              }`}
                            />
                          </button>
                        </td>
                        <td className="px-3 py-2 text-right">
                          {!isDefaultPlacementFormat(product) ? (
                            <button
                              type="button"
                              onClick={() =>
                                setDeletingProduct({
                                  id: product.id,
                                  name: placementFormatName(product),
                                  channelId: activeChannel.id,
                                })
                              }
                              className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-red-900/70 bg-red-950/30 text-red-300 transition hover:border-red-700 hover:text-red-200"
                              aria-label={`Delete ${product.name}`}
                            >
                              <Trash2 size={15} />
                            </button>
                          ) : (
                            <span className="text-neutral-600">—</span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>
        </div>

        <div className="mt-5">
          <h4 className="text-base font-semibold text-white">
            Audience baseline
          </h4>
          <p className="text-sm text-neutral-400">
            Expected views come automatically from recent ordinary channel
            posts. This block updates from live data and does not need a manual
            refresh.
          </p>
        </div>
        <div className="mt-5 space-y-4">
          {policyLoading ? (
            <div className={adSalesTileClass + " space-y-3 p-4"}>
              <Skeleton className="h-5 w-44" />
              <Skeleton className="h-4 w-64" />
            </div>
          ) : (
            <ToggleRow
              checked={policyDraft.useWorkspaceDefault === "true"}
              onChange={(checked) =>
                setDraftPolicyByChannel((current) => ({
                  ...current,
                  [activeChannel.id]: {
                    ...current[activeChannel.id],
                    useWorkspaceDefault: checked ? "true" : "false",
                  },
                }))
              }
              label="Use workspace default"
              description={`1 ad opportunity after every ${props.workspaceSettings?.defaultOrganicPostsPerAdSlot ?? 3} organic posts.`}
            />
          )}
          {!policyLoading && policyDraft.useWorkspaceDefault === "false" ? (
            <div className="max-w-xl text-sm">
              <span className="mb-1 flex items-center gap-2 text-neutral-300">
                <span>Organic posts per ad opportunity</span>
                <Tooltip
                  side="top"
                  align="left"
                  content={`Effective rule = 1 ad opportunity after every ${policyDraft.organicPostsPerAdSlot || "3"} organic posts.`}
                >
                  <button
                    type="button"
                    className="inline-flex items-center justify-center text-neutral-400 transition hover:text-white"
                    aria-label="Explain organic posts per ad opportunity"
                  >
                    <Info size={14} />
                  </button>
                </Tooltip>
              </span>
              <Input
                value={policyDraft.organicPostsPerAdSlot || ""}
                onChange={(event) =>
                  setDraftPolicyByChannel((current) => ({
                    ...current,
                    [activeChannel.id]: {
                      ...current[activeChannel.id],
                      organicPostsPerAdSlot: event.target.value,
                    },
                  }))
                }
              />
            </div>
          ) : null}
        </div>
        <p className="mt-4 text-sm text-neutral-400">
          Workspace timezone:{" "}
          <span className="text-white">{props.workspaceTimezone}</span>
        </p>
        <div className="mt-4 flex flex-wrap justify-end gap-2">
          <Button
            disabled={policyLoading}
            onClick={() =>
              void props.onUpdatePolicy(activeChannel.id, {
                useWorkspaceDefault: policyDraft.useWorkspaceDefault === "true",
                organicPostsPerAdSlot: Number(
                  policyDraft.organicPostsPerAdSlot || 3,
                ),
              })
            }
          >
            Save
          </Button>
        </div>
      </Card>
      <ChannelPricingModal
        open={Boolean(editingChannelPricing)}
        draft={editingChannelPricing}
        supportedCurrencies={props.supportedCurrencies}
        onClose={() => setEditingChannelPricing(null)}
        onSubmit={async (draft) => {
          setEditingChannelPricing(null);
          setChannelPricingDrafts((current) => ({
            ...current,
            [draft.channelId]: {
              baseCpm: draft.baseCpm,
              currency: draft.currency,
            },
          }));
          await props.onUpdateChannelPricing(draft.channelId, {
            baseCpm: draft.baseCpm.trim() === "" ? null : Number(draft.baseCpm),
            currency: draft.currency,
          });
        }}
      />
      <ProductEditorModal
        open={Boolean(editingProduct)}
        draft={editingProduct}
        supportedCurrencies={props.supportedCurrencies}
        onClose={() => setEditingProduct(null)}
        onSubmit={async (draft) => {
          const topDurationHours = Math.max(
            1,
            Number(draft.topDurationHours || 1),
          );
          const feedDurationHours = Math.max(
            1,
            Number(draft.feedDurationHours || 24),
          );
          const formatConfig = {
            topDurationMinutes: topDurationHours * 60,
            feedDurationHours: draft.isPermanent ? null : feedDurationHours,
            deleteAfterHours: draft.isPermanent ? null : feedDurationHours,
            isPermanent: draft.isPermanent,
          };
          if (draft.productId) {
            await props.onUpdateProduct(
              draft.productId,
              {
                name: draft.name.trim(),
                defaultPricingMode: "CPM",
                minimumPrice: 0,
                currency:
                  channelPricingDrafts[draft.channelId]?.currency ||
                  props.supportedCurrencies[0] ||
                  "USD",
                isActive: draft.isActive,
                position: Number(draft.position || 0),
                ...formatConfig,
              },
              draft.channelId,
            );
          } else {
            await props.onCreateProduct(draft.channelId, {
              name: draft.name.trim(),
              defaultPricingMode: "CPM",
              minimumPrice: 0,
              currency:
                channelPricingDrafts[draft.channelId]?.currency ||
                props.supportedCurrencies[0] ||
                "USD",
              isActive: draft.isActive,
              position: Number(draft.position || 0),
              ...formatConfig,
            });
          }
          setEditingProduct(null);
        }}
      />
      <ConfirmDeleteModal
        open={Boolean(deletingProduct)}
        onClose={() => setDeletingProduct(null)}
        entityName={deletingProduct?.name ?? ""}
        description="This custom format will be removed from the channel setup and will stop appearing in new bookings."
        onConfirm={() =>
          deletingProduct
            ? props.onDeleteProduct(
                deletingProduct.id,
                deletingProduct.channelId,
              )
            : undefined
        }
      />
    </div>
  );
}

function ChannelPricingModal(props: {
  open: boolean;
  draft: {
    channelId: string;
    baseCpm: string;
    currency: string;
  } | null;
  supportedCurrencies: string[];
  onClose: () => void;
  onSubmit: (draft: {
    channelId: string;
    baseCpm: string;
    currency: string;
  }) => Promise<void>;
}) {
  const [draft, setDraft] = useState(props.draft);

  useEffect(() => {
    setDraft(props.draft);
  }, [props.draft]);

  if (!draft) return null;

  return (
    <Modal
      open={props.open}
      onClose={props.onClose}
      title="Edit CPM"
      allowOverflow
    >
      <div className="space-y-4">
        <div className="grid gap-4 md:grid-cols-2">
          <FormField label="Post CPM">
            <Input
              value={draft.baseCpm}
              onChange={(event) =>
                setDraft((current) =>
                  current
                    ? { ...current, baseCpm: event.target.value }
                    : current,
                )
              }
              placeholder="Leave empty to unset CPM"
            />
          </FormField>
          <FormField label="Currency">
            <CurrencySelect
              value={draft.currency}
              onChange={(currency) =>
                setDraft((current) =>
                  current ? { ...current, currency } : current,
                )
              }
              currencies={props.supportedCurrencies}
            />
          </FormField>
        </div>
        <p className="text-sm text-neutral-500">
          Format prices for this channel are calculated automatically from the
          CPM you set here.
        </p>
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={props.onClose}>
            Cancel
          </Button>
          <Button onClick={() => void props.onSubmit(draft)}>Save</Button>
        </div>
      </div>
    </Modal>
  );
}

function ProductEditorModal(props: {
  open: boolean;
  draft: {
    channelId: string;
    productId?: string;
    name: string;
    topDurationHours: string;
    feedDurationHours: string;
    isPermanent: boolean;
    isActive: boolean;
    position: string;
  } | null;
  supportedCurrencies: string[];
  onClose: () => void;
  onSubmit: (draft: {
    channelId: string;
    productId?: string;
    name: string;
    topDurationHours: string;
    feedDurationHours: string;
    isPermanent: boolean;
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
    <Modal
      open={props.open}
      onClose={props.onClose}
      title={draft.productId ? "Edit format" : "Add format"}
    >
      <div className="space-y-4">
        <FormField label="Format name" required>
          <Input
            value={draft.name}
            onChange={(event) =>
              setDraft((current) =>
                current ? { ...current, name: event.target.value } : current,
              )
            }
          />
        </FormField>
        <div className="grid gap-4 md:grid-cols-2">
          <FormField label="Hours first in feed">
            <Input
              value={draft.topDurationHours}
              onChange={(event) =>
                setDraft((current) =>
                  current
                    ? { ...current, topDurationHours: event.target.value }
                    : current,
                )
              }
            />
          </FormField>
          <FormField label="Hours kept in feed">
            <Input
              value={draft.feedDurationHours}
              onChange={(event) =>
                setDraft((current) =>
                  current
                    ? { ...current, feedDurationHours: event.target.value }
                    : current,
                )
              }
              disabled={draft.isPermanent}
            />
          </FormField>
          <div className="rounded-xl border border-neutral-800 bg-neutral-950/60 p-4 text-sm text-neutral-300">
            <p className="text-neutral-400">Delivery preview</p>
            <p className="mt-1 text-white">
              {draft.isPermanent
                ? `${draft.topDurationHours || "1"}h first, then stays without auto-delete`
                : `${draft.topDurationHours || "1"}h first, ${draft.feedDurationHours || "24"}h total in feed`}
            </p>
          </div>
        </div>
        <p className="text-sm text-neutral-500">
          Price is calculated automatically from channel CPM and the matching
          post-performance window.
        </p>
        <div className="hidden">
          <Select
            value={props.supportedCurrencies[0] ?? "USD"}
            onChange={() => undefined}
          >
            {props.supportedCurrencies.map((currency) => (
              <option key={currency} value={currency}>
                {currency}
              </option>
            ))}
          </Select>
        </div>
        <div className="grid gap-3">
          <ToggleRow
            checked={draft.isActive}
            onChange={(checked) =>
              setDraft((current) =>
                current ? { ...current, isActive: checked } : current,
              )
            }
            label="Active"
          />
          <ToggleRow
            checked={draft.isPermanent}
            onChange={(checked) =>
              setDraft((current) =>
                current ? { ...current, isPermanent: checked } : current,
              )
            }
            label="Keep without auto-delete"
          />
        </div>
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={props.onClose}>
            Cancel
          </Button>
          <Button
            onClick={() => void props.onSubmit(draft)}
            disabled={
              !draft.name.trim() ||
              !draft.topDurationHours.trim() ||
              (!draft.isPermanent && !draft.feedDurationHours.trim())
            }
          >
            Save
          </Button>
        </div>
      </div>
    </Modal>
  );
}

function MetricCard({
  label,
  value,
  loading = false,
}: {
  label: string;
  value: string;
  loading?: boolean;
}) {
  return (
    <div className="rounded-2xl border border-neutral-800 bg-neutral-950/70 p-4">
      {loading ? (
        <div className="space-y-3">
          <Skeleton className="h-4 w-24" />
          <Skeleton className="h-8 w-20" />
        </div>
      ) : (
        <>
          <MetricPreviewLabel label={label} />
          <p className="mt-2 text-2xl font-semibold text-white">{value}</p>
        </>
      )}
    </div>
  );
}
