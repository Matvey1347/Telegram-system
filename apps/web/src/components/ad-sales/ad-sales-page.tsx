"use client";

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import {
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
} from "lucide-react";
import type {
  TelegramAdAvailabilitySlot,
  TelegramAdChannelBaseline,
  TelegramAdProduct,
  TelegramAdSale,
} from "@telegram-system/shared";
import { AppShell } from "@/components/layout/app-shell";
import { PageTabHead } from "@/components/layout/page-tab-head";
import { MemberBadge } from "@/components/workspace/member-badge";
import { MemberSelect } from "@/components/workspace/member-select";
import { TelegramEntityAvatar } from "@/components/telegram/telegram-entity-avatar";
import { MoneyStack } from "@/components/ui/money-stack";
import { Pagination } from "@/components/ui/pagination";
import {
  Button,
  Card,
  ConfirmDeleteModal,
  CurrencySelect,
  CustomSelect,
  DateInput,
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
  TimeInput,
  ToggleRow,
  Tooltip,
} from "@/components/ui/primitives";
import { CalendarSlotCard } from "@/components/ad-sales/calendar-slot-card";
import {
  allowedSaleActions,
  SaleStatusActions,
  type SaleActionKey,
} from "@/components/ad-sales/sale-status-actions";
import { RegisterPaymentModal } from "@/components/ad-sales/register-payment-modal";
import { AdSaleModal } from "@/components/ad-sales/ad-sale-modal";
import { BulkAdSaleModal } from "@/components/ad-sales/bulk/bulk-ad-sale-modal";
import { AdSalesAnalyticsPanel } from "@/components/ad-sales/ad-sales-analytics-panel";
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
  channelLocalTime,
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
import { accountDisplayName } from "@/lib/account-display";

const tabs: Array<{
  id: TelegramAdSalesTab;
  label: string;
  icon: typeof CalendarRange;
}> = [
  { id: "calendar", label: "Slots", icon: CalendarRange },
  { id: "sales", label: "Deals", icon: CircleDollarSign },
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
];

const tabDescriptions: Record<TelegramAdSalesTab, string> = {
  calendar:
    "See ad opportunities here and switch between calendar and list layout for the selected period.",
  sales:
    "Track created deals here: reserved, confirmed, paid, published, and completed placements.",
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

function monthGridDays(value: Date) {
  const start = startOfWeek(startOfMonth(value));
  return Array.from({ length: 42 }, (_, index) => addDays(start, index));
}

function rangeForCalendarMode(view: "week" | "month", cursor: Date) {
  if (view === "month") {
    return {
      from: startOfMonth(cursor),
      to: endOfMonth(cursor),
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

function saleChannelCount(sale: TelegramAdSale) {
  return new Set(
    sale.placements.map((placement) => placement.telegramChannelId),
  ).size;
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

function saleStatusTone(status: TelegramAdSale["status"]) {
  if (status === "COMPLETED")
    return "bg-emerald-900/40 text-emerald-300 border-emerald-700";
  if (status === "CONFIRMED" || status === "IN_PROGRESS")
    return "bg-blue-900/40 text-blue-300 border-blue-700";
  if (status === "RESERVED")
    return "bg-amber-900/40 text-amber-300 border-amber-700";
  if (status === "CANCELLED")
    return "bg-red-900/40 text-red-300 border-red-700";
  return "bg-neutral-800 text-neutral-300 border-neutral-700";
}

function paymentStatusTone(status: string) {
  if (status === "PAID")
    return "bg-emerald-900/40 text-emerald-300 border-emerald-700";
  if (status === "PARTIALLY_PAID")
    return "bg-amber-900/40 text-amber-300 border-amber-700";
  if (status === "OVERPAID")
    return "bg-blue-900/40 text-blue-300 border-blue-700";
  return "bg-red-900/40 text-red-300 border-red-700";
}

function sameStringArray(left: string[], right: string[]) {
  return (
    left.length === right.length &&
    left.every((value, index) => value === right[index])
  );
}

type SlotsLayoutView = "calendar" | "list";

function EnumPill({ label, tone }: { label: string; tone: string }) {
  return (
    <span
      className={`inline-flex rounded-full border px-2 py-0.5 text-xs font-medium ${tone}`}
    >
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
  const [statusFilter, setStatusFilter] = useState("");
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
  const [availabilityCacheBust, setAvailabilityCacheBust] = useState(0);
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
    return listDaysInRange(from, to);
  }, [calendarCursor, calendarRangeMode, calendarRangeSelection, from, to]);
  const visibleCalendarRange = useMemo(() => {
    const start = calendarDays[0] ?? from;
    const end = calendarDays[calendarDays.length - 1] ?? to;
    return {
      from: new Date(
        start.getFullYear(),
        start.getMonth(),
        start.getDate(),
        0,
        0,
        0,
        0,
      ),
      to: new Date(
        end.getFullYear(),
        end.getMonth(),
        end.getDate(),
        23,
        59,
        59,
        999,
      ),
    };
  }, [calendarDays, from, to]);

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
    const normalizedView =
      preferences.initialized && preferences.calendarView === "month"
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
      calendarView: payload.calendarView ?? calendarRangeMode,
      ...payload,
      initialized: true,
    });
  };

  const handleCalendarRangeModeChange = (
    view: TelegramAdSalesCalendarRangeMode,
  ) => {
    writeAdSalesCalendarRangeMode(window.localStorage, view);
    setCalendarRangeMode(view);
    persistCalendarPreferences({ calendarView: view });
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

  const availabilityQueries = useQueries({
    queries: effectiveChannelIds.map((channelId) => ({
      queryKey: telegramAdSalesKeys.availability({
        from: visibleCalendarRange.from.toISOString(),
        to: visibleCalendarRange.to.toISOString(),
        channelIds: [channelId],
        cacheBust: availabilityCacheBust || undefined,
      }),
      queryFn: () =>
        telegramAdSalesApi.availability({
          from: visibleCalendarRange.from.toISOString(),
          to: visibleCalendarRange.to.toISOString(),
          channelIds: [channelId],
          ...(availabilityCacheBust
            ? { cacheBust: String(availabilityCacheBust) }
            : {}),
        }),
      enabled: tab === "calendar",
      staleTime: 30 * 1000,
    })),
  });

  const availabilitySlots = availabilityQueries.flatMap(
    (query) => query.data?.slots ?? [],
  );
  const availabilityDaySummaries = availabilityQueries.flatMap(
    (query) => query.data?.summaries ?? [],
  );
  const loadingAvailabilityChannelIds = effectiveChannelIds.filter(
    (_, index) => availabilityQueries[index]?.isFetching,
  );
  const failedAvailabilityChannelIds = effectiveChannelIds.filter(
    (_, index) => availabilityQueries[index]?.isError,
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
    let items = buildAdCalendarSlots(availabilitySlots);
    if (statusFilter) {
      items = items.filter(
        (slot) =>
          slot.existingPlacement?.status === statusFilter ||
          slot.state === statusFilter,
      );
    }
    if (slotVisibility === "free") {
      items = items.filter((slot) => slot.state === "AVAILABLE");
    }
    if (slotVisibility === "busy") {
      items = items.filter((slot) => slot.state !== "AVAILABLE");
    }
    return items;
  }, [availabilitySlots, slotVisibility, statusFilter]);

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
      if (tab === "calendar") {
        setAvailabilityCacheBust(Date.now());
      }
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

        if (tab === "sales") {
          refreshTasks.push(
            queryClient.refetchQueries({
              queryKey: telegramAdSalesKeys.sales({
                page: salesPage,
                pageSize: salesPageSize,
                status: statusFilter || undefined,
              }),
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
              className="hidden h-11 shrink-0 items-center rounded-xl px-5 whitespace-nowrap lg:inline-flex"
              onClick={() => void handleRefreshCurrentPage()}
              disabled={refreshingCurrentPage}
              title="Clear cached data and refresh this page"
            >
              <span className="inline-flex items-center gap-2">
                <RefreshCw
                  size={16}
                  className={refreshingCurrentPage ? "animate-spin" : ""}
                />
                Refresh
              </span>
            </Button>
            <Button
              variant="secondary"
              className="h-11 shrink-0 items-center rounded-xl px-5 whitespace-nowrap"
              onClick={() => setBulkAdSaleModalOpen(true)}
            >
              <span className="inline-flex items-center gap-2 leading-none">
                <Plus size={18} className="shrink-0" />
                Mass add ads
              </span>
            </Button>
            <Button
              className="h-11 shrink-0 items-center rounded-xl px-5 whitespace-nowrap"
              onClick={() => {
                setAdSaleSeedSlot(null);
                setAdSaleModalOpen(true);
              }}
            >
              <span className="inline-flex items-center gap-2 leading-none">
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
                  className={`inline-flex items-center gap-2 rounded-full border px-3 py-2 text-sm ${tabButtonClass(calendarRangeMode === view.id)}`}
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
          loadingChannelIds={loadingAvailabilityChannelIds}
          failedChannelIds={failedAvailabilityChannelIds}
          calendarView={calendarView}
          calendarRangeMode={calendarRangeMode}
          calendarCursor={calendarCursor}
          onCalendarViewChange={handleCalendarViewChange}
          calendarFrom={from}
          calendarTo={to}
          calendarDays={calendarDays}
          channels={saleableChannels}
          selectedChannelIds={selectedChannelIds}
          statusFilter={statusFilter}
          onStatusFilterChange={setStatusFilter}
          slotVisibility={slotVisibility}
          onSlotVisibilityChange={setSlotVisibility}
          filteredSlots={filteredSlots}
          sales={salesQuery.data?.items ?? []}
          daySummaries={availabilityDaySummaries}
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
          from={from}
          to={to}
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
          const from = zonedDateTimeToUtc(date, "00:00:00", timezone).toISOString();
          const to = zonedDateTimeToUtc(date, "23:59:59", timezone).toISOString();
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
          const from = zonedDateTimeToUtc(date, "00:00:00", timezone).toISOString();
          const to = zonedDateTimeToUtc(date, "23:59:59", timezone).toISOString();
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
          const targetCurrency = draft.payments[0]?.currency ?? sale.settlementCurrency;
          if (targetCurrency !== sale.settlementCurrency) {
            await telegramAdSalesApi.updateSale(sale.id, {
              settlementCurrency: targetCurrency,
            });
          }
          for (const placement of draft.placements) {
            await telegramAdSalesApi.updatePlacement(
              sale.id,
              placement.id,
              {
                scheduledAt: placement.scheduledAt,
                timezone: placement.timezone,
                agreedPrice: placement.agreedPrice,
                recommendedPrice: placement.recommendedPrice,
                minimumPrice: placement.minimumPrice,
                currency: placement.currency,
                manualPriceReason: placement.manualPriceReason || null,
              },
            );
          }
          for (const payment of draft.payments) {
            await telegramAdSalesApi.updatePayment(
              sale.id,
              payment.id,
              {
                accountId: payment.accountId,
                amount: payment.amount,
                currency: payment.currency,
                paidAt: payment.paidAt,
                notes: payment.notes || null,
                allocations: payment.allocations,
              },
            );
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

function CalendarTab(props: {
  loadingChannelIds: string[];
  failedChannelIds: string[];
  calendarView: SlotsLayoutView;
  onCalendarViewChange: (value: SlotsLayoutView) => void;
  calendarRangeMode: "week" | "month";
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
      props.calendarRangeMode === "month" ? (
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
                  day.getMonth() !== props.calendarCursor.getMonth();
                const daySlots = visibleChannels.flatMap((channel) =>
                  (
                    slotsByChannelDay.get(`${channel.id}:${dayDateKey}`) ?? []
                  ).map((slot) => ({
                    channel,
                    slot,
                  })),
                );
                return (
                  <div
                    key={day.toISOString()}
                    className={`min-h-28 border-b border-r border-slate-900/70 p-2 ${outsideMonth ? "bg-black/20 opacity-45" : "bg-[#111111]"}`}
                  >
                    <div className="mb-2 flex items-center justify-between">
                      <span className="text-sm font-semibold text-white">
                        {day.getDate()}
                      </span>
                      {dayDateKey === todayKey ? (
                        <span className="rounded-full bg-blue-600 px-1.5 py-0.5 text-[9px] font-semibold text-white">
                          Today
                        </span>
                      ) : null}
                    </div>
                    <div className="space-y-1">
                      {daySlots.map(({ channel, slot }) => (
                        <button
                          key={`${channel.id}:${slot.id}`}
                          type="button"
                          disabled={!slot.existingPlacement && !["AVAILABLE", "PAST"].includes(slot.state)}
                          onClick={() => {
                            if (slot.existingPlacement?.saleId) {
                              props.onOpenSale(slot.existingPlacement.saleId);
                              return;
                            }
                            props.onCreateFromSlot(slot);
                          }}
                          title={`${channel.title} · ${slot.state === "PAST" ? "Missed ad slot" : "Add Ad Slot"}`}
                          className={`flex w-full items-center gap-1.5 rounded-md border px-1.5 py-1 text-left text-[10px] font-medium transition ${
                            slot.state === "AVAILABLE"
                              ? "border-emerald-700/60 bg-emerald-950/30 text-emerald-200 hover:border-emerald-500"
                              : slot.state === "PAST"
                                ? "border-rose-700/60 bg-rose-950/25 text-rose-200 hover:border-rose-500"
                                : "border-slate-800 bg-[#0b1220] text-neutral-300"
                          }`}
                        >
                          <TelegramEntityAvatar
                            imageUrl={channel.photoUrl}
                            kind="channel"
                            alt={channel.title}
                            size="xs"
                          />
                          <span className="min-w-0 truncate">
                            {channel.title}
                          </span>
                          <span className="ml-auto shrink-0 text-[9px] opacity-80">
                            {slot.state === "PAST"
                              ? "Missed ad slot"
                              : slot.state === "AVAILABLE"
                                ? "Add Ad Slot"
                                : "Busy"}
                          </span>
                        </button>
                      ))}
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
      props.calendarRangeMode !== "month" ? (
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
                    const summary = daySummariesByChannelDay.get(dayKey);
                    const organicCount = summary?.organicPostsCountForDay ?? 0;
                    const adSlotsCount =
                      summary?.adsCountForDay ?? slots.length;
                    return (
                      <div
                        key={dayKey}
                        className="min-h-24 border-r border-slate-900/60 p-2"
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
                            <div className="mb-1.5 flex items-center justify-between text-[10px] uppercase tracking-wide text-neutral-500">
                              <span>{organicCount} organic</span>
                              <span>{adSlotsCount} ad slots</span>
                            </div>
                            <div className="space-y-1.5">
                              {slots.slice(0, 2).map(renderSlot)}
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
                        disabled={slot.state !== "AVAILABLE" && !slot.existingPlacement?.saleId}
                        onClick={() => {
                          if (slot.existingPlacement?.saleId) {
                            props.onOpenSale(slot.existingPlacement.saleId);
                            return;
                          }
                          if (slot.state === "AVAILABLE") props.onCreateFromSlot(slot);
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

function SalesTab(props: {
  sales: TelegramAdSale[];
  loading: boolean;
  error: unknown;
  page: number;
  pageSize: number;
  pagination?: {
    totalItems: number;
    totalPages: number;
    hasNextPage: boolean;
    hasPreviousPage: boolean;
    page: number;
    pageSize: number;
  };
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
      <Card className={adSalesPanelClass}>
        <div className="grid gap-4 xl:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)_minmax(0,1fr)_minmax(0,1fr)_auto_auto] xl:items-end">
          <FormField label="Search">
            <Input
              value={props.search}
              onChange={(event) => props.onSearchChange(event.target.value)}
            />
          </FormField>
          <FormField label="Status">
            <Select
              value={props.statusFilter}
              onChange={(event) =>
                props.onStatusFilterChange(event.target.value)
              }
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
              onChange={(event) =>
                props.onPaymentStatusFilterChange(event.target.value)
              }
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
          <label className="flex">
            <span className="inline-flex h-[38px] items-center gap-3 rounded-lg border border-neutral-700 bg-neutral-950/70 px-4 text-sm font-medium text-neutral-200">
              <span className="relative inline-flex h-5 w-5 items-center justify-center">
                <input
                  type="checkbox"
                  checked={props.underpricedOnly}
                  onChange={(event) =>
                    props.onUnderpricedOnlyChange(event.target.checked)
                  }
                  className="peer h-5 w-5 cursor-pointer appearance-none rounded border border-neutral-600 bg-neutral-900 checked:border-blue-500 checked:bg-blue-600"
                />
                <span className="pointer-events-none absolute text-xs font-bold text-white opacity-0 peer-checked:opacity-100">
                  ✓
                </span>
              </span>
              Underpriced only
            </span>
          </label>
          <label className="flex">
            <span className="inline-flex h-[38px] items-center gap-3 rounded-lg border border-neutral-700 bg-neutral-950/70 px-4 text-sm font-medium text-neutral-200">
              <span className="relative inline-flex h-5 w-5 items-center justify-center">
                <input
                  type="checkbox"
                  checked={props.unpaidOnly}
                  onChange={(event) =>
                    props.onUnpaidOnlyChange(event.target.checked)
                  }
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
        <div className={adSalesPanelClass}>
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
                  const nearestPlacement = [...sale.placements].sort(
                    (left, right) =>
                      left.scheduledAt.localeCompare(right.scheduledAt),
                  )[0];
                  return (
                    <tr
                      key={sale.id}
                      className="cursor-pointer bg-neutral-950 transition hover:bg-neutral-900/60"
                      onClick={() => props.onOpenSale(sale.id)}
                    >
                      <td className="px-4 py-4">
                        <p className="font-medium text-white">
                          {sale.title || "Untitled sale"}
                        </p>
                        <p className="text-xs text-neutral-500">
                          {new Date(sale.createdAt).toLocaleString()}
                        </p>
                      </td>
                      <td className="px-4 py-4">
                        <p className="text-white">{sale.advertiserName}</p>
                        <p className="text-xs text-neutral-500">
                          {sale.advertiserTelegram ||
                            sale.advertiserContact ||
                            "-"}
                        </p>
                      </td>
                      <td className="px-4 py-4">{saleChannelCount(sale)}</td>
                      <td className="px-4 py-4">
                        {nearestPlacement
                          ? new Date(
                              nearestPlacement.scheduledAt,
                            ).toLocaleString()
                          : "-"}
                      </td>
                      <td className="px-4 py-4">
                        <EnumPill
                          label={sale.status.replaceAll("_", " ")}
                          tone={saleStatusTone(sale.status)}
                        />
                      </td>
                      <td className="px-4 py-4">
                        <EnumPill
                          label={(sale.paymentStatus || "UNPAID").replaceAll(
                            "_",
                            " ",
                          )}
                          tone={paymentStatusTone(
                            sale.paymentStatus || "UNPAID",
                          )}
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
          {!props.sales.length ? (
            <div className="p-4">
              <EmptyState text="No sales matched the current filters." />
            </div>
          ) : null}
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
        acc.expectedViews += sale.placements.reduce(
          (sum, placement) => sum + placement.expectedViews,
          0,
        );
        acc.actualViews += sale.placements.reduce(
          (sum, placement) => sum + (placement.actualViewsFinal || 0),
          0,
        );
        acc.placements += sale.placements.length;
        return acc;
      },
      {
        revenue: 0,
        paid: 0,
        outstanding: 0,
        expectedViews: 0,
        actualViews: 0,
        placements: 0,
      },
    );
  }, [props.sales]);

  return (
    <div className="grid gap-4 lg:grid-cols-5">
      <MetricMoneyCard
        label="Revenue"
        amount={totals.revenue}
        settings={props.settings}
        rates={props.rates}
      />
      <MetricMoneyCard
        label="Paid"
        amount={totals.paid}
        settings={props.settings}
        rates={props.rates}
      />
      <MetricMoneyCard
        label="Outstanding"
        amount={totals.outstanding}
        settings={props.settings}
        rates={props.rates}
      />
      <MetricCard
        label="Expected views"
        value={totals.expectedViews.toLocaleString()}
      />
      <MetricCard
        label="Actual views"
        value={totals.actualViews.toLocaleString()}
      />
    </div>
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

type SalePlacementEditDraft = {
  id: string;
  date: string;
  time: string;
  timezone: string;
  agreedPrice: string;
  recommendedPrice: string;
  minimumPrice: string;
  manualPriceReason: string;
};

type SalePaymentEditDraft = {
  id: string;
  accountId: string;
  amount: string;
  currency: string;
  paidDate: string;
  paidTime: string;
  notes: string;
};

function allocatePaymentDraft(
  amount: number,
  placements: SalePlacementEditDraft[],
) {
  let remaining = amount;
  return placements.flatMap((placement) => {
    const agreedPrice = toNumber(placement.agreedPrice);
    const allocation = Math.max(0, Math.min(remaining, agreedPrice));
    remaining -= allocation;
    return allocation > 0 ? [{ placementId: placement.id, amount: allocation }] : [];
  });
}

function SaleDetailsModal(props: {
  sale: TelegramAdSale | null;
  open: boolean;
  onClose: () => void;
  accounts: Account[];
  settings: Awaited<ReturnType<typeof currenciesApi.getSettings>> | undefined;
  rates: Awaited<ReturnType<typeof currenciesApi.listRates>> | undefined;
  onSave: (
    sale: TelegramAdSale,
    draft: {
      placements: Array<{
        id: string;
        scheduledAt: string;
        timezone: string;
        agreedPrice: number;
        recommendedPrice: number;
        minimumPrice: number;
        currency: string;
        manualPriceReason: string | null;
      }>;
      payments: Array<{
        id: string;
        accountId: string;
        amount: number;
        currency: string;
        paidAt: string;
        notes: string | null;
        allocations: Array<{ placementId: string; amount: number }>;
      }>;
    },
  ) => Promise<void>;
  onAction: (
    sale: TelegramAdSale,
    action: SaleActionKey,
    placement?: TelegramAdSale["placements"][number],
  ) => Promise<void>;
}) {
  const [placementDrafts, setPlacementDrafts] = useState<SalePlacementEditDraft[]>([]);
  const [paymentDrafts, setPaymentDrafts] = useState<SalePaymentEditDraft[]>([]);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState("");

  useEffect(() => {
    if (!props.sale || !props.open) return;
    setPlacementDrafts(
      props.sale.placements.map((placement) => ({
        id: placement.id,
        date: channelLocalDateKey(placement.scheduledAt, placement.timezone),
        time: channelLocalTime(placement.scheduledAt, placement.timezone),
        timezone: placement.timezone,
        agreedPrice: placement.agreedPrice,
        recommendedPrice: placement.recommendedPrice,
        minimumPrice: placement.minimumPrice,
        manualPriceReason: placement.manualPriceReason ?? "",
      })),
    );
    setPaymentDrafts(
      (props.sale.payments ?? [])
        .filter((payment) => payment.status !== "VOIDED")
        .map((payment) => {
          const account = props.accounts.find((item) => item.id === payment.accountId);
          return {
            id: payment.id,
            accountId: payment.accountId,
            amount: payment.amount,
            currency: account?.currency ?? payment.currency,
            paidDate: payment.paidAt.slice(0, 10),
            paidTime: payment.paidAt.slice(11, 16),
            notes: payment.notes ?? "",
          };
        }),
    );
    setSaveError("");
  }, [props.accounts, props.open, props.sale]);

  if (!props.sale) return null;
  const editCurrency = paymentDrafts[0]?.currency ?? props.sale.settlementCurrency;

  const updatePlacementDraft = (id: string, patch: Partial<SalePlacementEditDraft>) => {
    setPlacementDrafts((current) =>
      current.map((item) => (item.id === id ? { ...item, ...patch } : item)),
    );
  };
  const updatePaymentDraft = (id: string, patch: Partial<SalePaymentEditDraft>) => {
    setPaymentDrafts((current) =>
      current.map((item) => (item.id === id ? { ...item, ...patch } : item)),
    );
  };
  const saveChanges = async () => {
    setSaveError("");
    setSaving(true);
    try {
      await props.onSave(props.sale!, {
        placements: placementDrafts.map((placement) => ({
          id: placement.id,
          scheduledAt: zonedDateTimeToUtc(
            placement.date,
            placement.time,
            placement.timezone,
          ).toISOString(),
          timezone: placement.timezone,
          agreedPrice: toNumber(placement.agreedPrice),
          recommendedPrice: toNumber(placement.recommendedPrice),
          minimumPrice: toNumber(placement.minimumPrice),
          currency: editCurrency,
          manualPriceReason: placement.manualPriceReason.trim() || null,
        })),
        payments: paymentDrafts.map((payment) => {
          const account = props.accounts.find((item) => item.id === payment.accountId);
          const amount = toNumber(payment.amount);
          return {
            id: payment.id,
            accountId: payment.accountId,
            amount,
            currency: account?.currency ?? payment.currency,
            paidAt: new Date(`${payment.paidDate}T${payment.paidTime || "00:00"}:00`).toISOString(),
            notes: payment.notes.trim() || null,
            allocations: allocatePaymentDraft(amount, placementDrafts),
          };
        }),
      });
    } catch (error) {
      setSaveError(error instanceof Error ? error.message : "Could not save changes.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      open={props.open}
      onClose={props.onClose}
      title={props.sale.title || props.sale.advertiserName}
      size="xl"
    >
      <div className="grid gap-5 xl:grid-cols-[0.9fr_1.1fr]">
        <div className="space-y-4">
          <Card>
            <h4 className="font-medium text-white">Summary</h4>
            <dl className="mt-3 space-y-2 text-sm">
              <div className="flex justify-between gap-3">
                <dt className="text-neutral-400">Advertiser</dt>
                <dd>{props.sale.advertiserName}</dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-neutral-400">Status</dt>
                <dd>{props.sale.status}</dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-neutral-400">Payment</dt>
                <dd>{props.sale.paymentStatus || "UNPAID"}</dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-neutral-400">Total agreed</dt>
                <dd>
                  {props.sale.totalAgreedAmount} {props.sale.settlementCurrency}
                </dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-neutral-400">Total paid</dt>
                <dd>
                  {props.sale.totalPaidAmount} {props.sale.settlementCurrency}
                </dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-neutral-400">Outstanding</dt>
                <dd>
                  {props.sale.outstandingAmount} {props.sale.settlementCurrency}
                </dd>
              </div>
            </dl>
          </Card>
          <Card>
            <h4 className="mb-3 font-medium text-white">Sale actions</h4>
            <SaleStatusActions
              sale={props.sale}
              onAction={(action) => void props.onAction(props.sale!, action)}
            />
          </Card>
          <Card>
            <div className="mb-3 flex items-center justify-between gap-3">
              <h4 className="font-medium text-white">Payments</h4>
              {paymentDrafts.length ? (
                <span className="text-xs text-neutral-500">Finance transaction updates too</span>
              ) : null}
            </div>
            <div className="space-y-2">
              {paymentDrafts.map((payment) => (
                <div
                  key={payment.id}
                  className="rounded-lg border border-neutral-800 bg-neutral-950/70 p-3 text-sm"
                >
                  <div className="grid gap-3 md:grid-cols-2">
                    <FormField label="Account">
                      <CustomSelect
                        value={payment.accountId}
                        onChange={(accountId) => {
                          const account = props.accounts.find((item) => item.id === accountId);
                          updatePaymentDraft(payment.id, {
                            accountId,
                            currency: account?.currency ?? payment.currency,
                          });
                        }}
                        options={props.accounts
                          .filter((account) => account.isActive)
                          .map((account) => ({
                            value: account.id,
                            label: `${accountDisplayName(account)} (${account.currency})`,
                            iconUrl: account.iconPresentation?.type === "image" ? account.iconPresentation.url : undefined,
                            iconEmoji: account.iconPresentation?.type === "unicode" ? account.iconPresentation.value : undefined,
                            iconFallback: account.name,
                          }))}
                      />
                    </FormField>
                    <FormField label={`Amount (${payment.currency})`}>
                      <Input
                        value={payment.amount}
                        inputMode="decimal"
                        onChange={(event) => updatePaymentDraft(payment.id, { amount: event.target.value })}
                      />
                    </FormField>
                    <FormField label="Paid date">
                      <DateInput
                        value={payment.paidDate}
                        onChange={(event) => updatePaymentDraft(payment.id, { paidDate: event.target.value })}
                      />
                    </FormField>
                    <FormField label="Paid time">
                      <TimeInput
                        value={payment.paidTime}
                        onChange={(event) => updatePaymentDraft(payment.id, { paidTime: event.target.value })}
                      />
                    </FormField>
                  </div>
                  <div className="mt-3">
                    <FormField label="Notes">
                      <Input
                        value={payment.notes}
                        onChange={(event) => updatePaymentDraft(payment.id, { notes: event.target.value })}
                      />
                    </FormField>
                  </div>
                </div>
              ))}
              {!paymentDrafts.length ? (
                <EmptyState text="No payments yet." />
              ) : null}
            </div>
          </Card>
        </div>

        <div className="space-y-4">
          <Card>
            <h4 className="mb-3 font-medium text-white">Placements</h4>
            <div className="space-y-3">
              {props.sale.placements.map((placement) => {
                const draft = placementDrafts.find((item) => item.id === placement.id);
                return (
                <div
                  key={placement.id}
                  className="rounded-xl border border-neutral-800 bg-neutral-950/60 p-4"
                >
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <p className="font-medium text-white">
                        {placement.telegramChannelId}
                      </p>
                      <p className="text-xs text-neutral-500">
                        {new Date(placement.scheduledAt).toLocaleString()} ·{" "}
                        {placement.timezone}
                      </p>
                    </div>
                    <div className="text-right text-sm">
                      <p className="text-white">
                        {placement.agreedPrice} {editCurrency}
                      </p>
                      <p className="text-xs text-neutral-500">
                        {placement.status}
                      </p>
                    </div>
                  </div>
                  <div className="mt-3 grid gap-3 md:grid-cols-4 text-sm">
                    <FormField label="Date">
                      <DateInput
                        value={draft?.date ?? ""}
                        onChange={(event) => updatePlacementDraft(placement.id, { date: event.target.value })}
                      />
                    </FormField>
                    <FormField label="Time">
                      <TimeInput
                        value={draft?.time ?? ""}
                        onChange={(event) => updatePlacementDraft(placement.id, { time: event.target.value })}
                      />
                    </FormField>
                    <FormField label={`Price (${editCurrency})`}>
                      <Input
                        value={draft?.agreedPrice ?? placement.agreedPrice}
                        inputMode="decimal"
                        onChange={(event) => updatePlacementDraft(placement.id, { agreedPrice: event.target.value })}
                      />
                    </FormField>
                    <FormField label="Recommended">
                      <Input
                        value={draft?.recommendedPrice ?? placement.recommendedPrice}
                        inputMode="decimal"
                        onChange={(event) => updatePlacementDraft(placement.id, { recommendedPrice: event.target.value })}
                      />
                    </FormField>
                    <div>Expected: {placement.expectedViews.toLocaleString()}</div>
                    <div>Paid allocation: {placement.paidAllocatedAmount || "0"}</div>
                    <div>Actual views: {placement.actualViewsFinal ?? "-"}</div>
                    <div>Actual CPM: {placement.actualCpm ?? "-"}</div>
                  </div>
                  {toNumber(draft?.agreedPrice ?? placement.agreedPrice) < toNumber(draft?.minimumPrice ?? placement.minimumPrice) ? (
                    <div className="mt-3">
                      <FormField label="Reason for low price">
                        <Input
                          value={draft?.manualPriceReason ?? ""}
                          onChange={(event) => updatePlacementDraft(placement.id, { manualPriceReason: event.target.value })}
                        />
                      </FormField>
                    </div>
                  ) : null}
                  {placement.managedPostId ? (
                    <p className="mt-2 text-xs text-neutral-500">
                      Managed post: {placement.managedPostId} · Deletion:{" "}
                      {placement.plannedDeleteAt || "n/a"}
                    </p>
                  ) : null}
                  <div className="mt-4">
                    <SaleStatusActions
                      sale={props.sale!}
                      placement={placement}
                      onAction={(action) =>
                        void props.onAction(props.sale!, action, placement)
                      }
                    />
                  </div>
                </div>
              );
              })}
            </div>
          </Card>
          {saveError ? (
            <div className="rounded-md border border-rose-800 bg-rose-950/40 px-3 py-2 text-sm text-rose-200">
              {saveError}
            </div>
          ) : null}
          <div className="flex justify-end">
            <Button onClick={() => void saveChanges()} disabled={saving}>
              {saving ? "Saving..." : "Save changes"}
            </Button>
          </div>
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
      <MetricPreviewLabel label={label} />
      <div className="mt-2">
        <MoneyStack
          amount={amount}
          currency={settings?.primaryCurrency || "USD"}
          settings={settings}
          rates={rates}
        />
      </div>
    </div>
  );
}
