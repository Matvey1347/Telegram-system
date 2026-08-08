"use client";

import { useMemo } from "react";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { Info } from "lucide-react";
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  CartesianGrid,
  Tooltip,
  XAxis,
  YAxis,
  LineChart,
  Line,
} from "recharts";
import {
  Card,
  EmptyState,
  ErrorState,
  Skeleton,
  Tooltip as UiTooltip,
} from "@/components/ui/primitives";
import { IconAvatar } from "@/components/icons/icon-avatar";
import { MoneyStack } from "@/components/ui/money-stack";
import type { CurrencySettings, ExchangeRate } from "@/lib/api";
import { telegramAdSalesApi } from "@/lib/api";
import { MetricPreviewLabel } from "@/lib/metric-preview-icons";
import { telegramAdSalesKeys } from "@/lib/telegram-ad-sales-query";

type Props = {
  selectedChannelIds: string[];
  selectedNetworkId?: string | null;
  from: Date;
  to: Date;
  settings?: CurrencySettings;
  rates?: ExchangeRate[];
};

const analyticsPanelClass =
  "rounded-[22px] border border-slate-800/80 bg-[#070c16] shadow-[inset_0_1px_0_rgba(96,165,250,0.06)]";
const analyticsTileClass =
  "rounded-[14px] border border-slate-800/80 bg-[#0b1220] p-2.5 shadow-[inset_0_1px_0_rgba(96,165,250,0.05)]";
const analyticsCacheOptions = {
  staleTime: 2 * 60 * 1000,
  gcTime: 15 * 60 * 1000,
  placeholderData: keepPreviousData,
  refetchOnWindowFocus: false,
} as const;

const analyticsMetricTips: Record<string, string> = {
  "Paid revenue":
    "Active payment allocations for placements in the selected period, summed across the selected channels.",
  Outstanding:
    "Agreed placement revenue minus active payment allocations, summed across the selected channels.",
  "Upcoming placements":
    "Placements in the selected period with scheduledAt later than now. This is a total count, not a per-channel average.",
  "Fill rate":
    "Booked eligible slots divided by eligible slots across all selected channels. This is a combined rate, not an average of channel rates.",
  "Average CPM":
    "Agreed revenue divided by final actual views, multiplied by 1,000. Channels with no sales/views do not add a separate averaged value.",
  "Underpricing loss":
    "Sum of minimum price minus agreed price when a placement was sold below its minimum price.",
};

export function AdSalesAnalyticsPanel({
  selectedChannelIds,
  selectedNetworkId,
  from,
  to,
  settings,
  rates,
}: Props) {
  const scopedParams = useMemo(
    () => ({
      dateFrom: from.toISOString(),
      dateTo: to.toISOString(),
      ...(selectedChannelIds.length
        ? { channelIds: selectedChannelIds.slice(0, 6).join(",") }
        : {}),
      ...(!selectedChannelIds.length && selectedNetworkId
        ? { networkId: selectedNetworkId }
        : {}),
    }),
    [from, selectedChannelIds, selectedNetworkId, to],
  );
  const overviewQuery = useQuery({
    queryKey: telegramAdSalesKeys.analyticsOverview(scopedParams),
    queryFn: () => telegramAdSalesApi.analyticsOverview(scopedParams),
    ...analyticsCacheOptions,
  });

  const summary = overviewQuery.data?.summary;
  const moneySettings = settings ?? {
    primaryCurrency: "USD",
    secondaryCurrency: "PLN",
    tertiaryCurrency: "UAH",
    currencyDisplayMode: "code" as const,
  };
  const moneyPreview = (value: string | number | null | undefined) => (
    <MoneyStack
      amount={value}
      currency={summary?.currency ?? moneySettings.primaryCurrency}
      settings={moneySettings}
      rates={rates}
      mainClassName="whitespace-nowrap text-lg font-semibold leading-tight text-white"
      subClassName="mt-1 text-xs text-neutral-500"
    />
  );
  const tableMoney = (
    value: string | number | null | undefined,
    currency?: string | null,
  ) => (
    <MoneyStack
      amount={value}
      currency={currency ?? moneySettings.primaryCurrency}
      settings={moneySettings}
      rates={rates}
      mainClassName="font-medium text-white"
      subClassName="text-xs text-neutral-500"
    />
  );
  const tableMoneyCompact = (
    value: string | number | null | undefined,
    currency?: string | null,
  ) => (Number(value ?? 0) === 0 ? <ZeroMoney /> : tableMoney(value, currency));
  const revenueSeries =
    overviewQuery.data?.revenueSeries.points.map((point) => ({
      date: point.date.slice(5),
      agreed: Number(point.agreedRevenue || 0),
      paid: Number(point.paidRevenue || 0),
      outstanding: Number(point.outstandingRevenue || 0),
    })) ?? [];
  const inventorySeries =
    overviewQuery.data?.inventory.points.map((point) => ({
      date: point.date.slice(5),
      bookingFillRate: point.bookingFillRate,
      publishedFillRate: point.publishedFillRate,
    })) ?? [];
  const channelRows = overviewQuery.data?.channels ?? [];
  const alerts = overviewQuery.data?.alerts.items ?? [];
  const loadingValue = <MetricValueSkeleton />;
  const showInventoryPanel = overviewQuery.isLoading || Boolean(overviewQuery.error) || inventorySeries.length > 0;
  const showAlertsPanel = overviewQuery.isLoading || Boolean(overviewQuery.error) || alerts.length > 0;

  return (
    <div className="space-y-5">
      {overviewQuery.error ? (
        <ErrorState text="Could not load ad-sales analytics." />
      ) : null}
      <div className="grid gap-3 md:grid-cols-3 xl:grid-cols-6">
        <AnalyticsKpi
          label="Paid revenue"
          tip={analyticsMetricTips["Paid revenue"]}
          value={summary ? moneyPreview(summary.paidRevenue) : loadingValue}
        />
        <AnalyticsKpi
          label="Outstanding"
          tip={analyticsMetricTips.Outstanding}
          value={
            summary ? moneyPreview(summary.accountsReceivable) : loadingValue
          }
        />
        <AnalyticsKpi
          label="Upcoming placements"
          tip={analyticsMetricTips["Upcoming placements"]}
          value={
            summary ? (
              <MetricNumberValue value={summary.upcomingPlacements} />
            ) : loadingValue
          }
        />
        <AnalyticsKpi
          label="Fill rate"
          tip={analyticsMetricTips["Fill rate"]}
          value={
            summary ? (
              <MetricNumberValue value={`${summary.slotFillRate}%`} />
            ) : loadingValue
          }
        />
        <AnalyticsKpi
          label="Average CPM"
          tip={analyticsMetricTips["Average CPM"]}
          value={summary ? moneyPreview(summary.averageCpm) : loadingValue}
        />
        <AnalyticsKpi
          label="Underpricing loss"
          tip={analyticsMetricTips["Underpricing loss"]}
          value={summary ? moneyPreview(summary.underpricingLoss) : loadingValue}
        />
      </div>

      <div className={`grid gap-5 ${showInventoryPanel ? "xl:grid-cols-2" : ""}`}>
        <Card className={analyticsPanelClass}>
          <div className="mb-4 flex items-center justify-between">
            <div>
              <h3 className="font-semibold text-white">Revenue over time</h3>
              <p className="text-sm text-neutral-500">
                Agreed, paid, and outstanding revenue
              </p>
            </div>
          </div>
          {overviewQuery.error ? (
            <RecoverableBlock text="Revenue series is unavailable for this range." />
          ) : overviewQuery.isLoading ? (
            <ChartSkeleton />
          ) : revenueSeries.length ? (
            <div className="h-72">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={revenueSeries}>
                  <CartesianGrid stroke="#262626" />
                  <XAxis dataKey="date" stroke="#737373" />
                  <YAxis stroke="#737373" />
                  <Tooltip />
                  <Area
                    type="monotone"
                    dataKey="agreed"
                    stroke="#2563eb"
                    fill="#2563eb33"
                  />
                  <Area
                    type="monotone"
                    dataKey="paid"
                    stroke="#10b981"
                    fill="#10b98133"
                  />
                  <Area
                    type="monotone"
                    dataKey="outstanding"
                    stroke="#f97316"
                    fill="#f9731633"
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <EmptyState text="No revenue data for the selected range." />
          )}
        </Card>

        {showInventoryPanel ? (
          <Card className={analyticsPanelClass}>
            <div className="mb-4 flex items-center justify-between">
              <div>
                <h3 className="font-semibold text-white">Inventory fill rate</h3>
                <p className="text-sm text-neutral-500">
                  Booking vs published utilisation
                </p>
              </div>
            </div>
            {overviewQuery.error ? (
              <RecoverableBlock text="Inventory analytics are unavailable for this range." />
            ) : overviewQuery.isLoading ? (
              <ChartSkeleton />
            ) : (
              <div className="h-72">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={inventorySeries}>
                    <CartesianGrid stroke="#262626" />
                    <XAxis dataKey="date" stroke="#737373" />
                    <YAxis stroke="#737373" />
                    <Tooltip />
                    <Line
                      type="monotone"
                      dataKey="bookingFillRate"
                      stroke="#2563eb"
                      strokeWidth={2}
                    />
                    <Line
                      type="monotone"
                      dataKey="publishedFillRate"
                      stroke="#10b981"
                      strokeWidth={2}
                    />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            )}
          </Card>
        ) : null}
      </div>

      <div className={`grid gap-5 ${showAlertsPanel ? "xl:grid-cols-[1.3fr_1fr]" : ""}`}>
        <Card className={analyticsPanelClass}>
          <div className="mb-4">
            <div>
              <h3 className="font-semibold text-white">Channel performance</h3>
              <p className="text-sm text-neutral-500">
                Backend aggregates by channel
              </p>
            </div>
          </div>
          {overviewQuery.error ? (
            <RecoverableBlock text="Some channel analytics could not be loaded." />
          ) : null}
          <div className="overflow-hidden rounded-[18px] border border-slate-800/80 bg-[#0b1220]">
            <table className="w-full text-left text-sm">
              <thead className="bg-[#09111e] text-xs uppercase text-neutral-400">
                <tr>
                  <th className="px-3 py-2">Channel</th>
                  <th className="px-3 py-2">Revenue</th>
                  <th className="px-3 py-2">Paid</th>
                  <th className="px-3 py-2">
                    <TableHeaderWithTooltip
                      label="Fill rate"
                      tip="Sold eligible slots divided by total eligible slots in the selected period."
                    />
                  </th>
                  <th className="px-3 py-2">
                    <TableHeaderWithTooltip
                      label="Plan / sold"
                      tip="Plan uses minimum price only for elapsed placements in the selected period. Sold is the agreed revenue for those same elapsed placements."
                    />
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/80">
                {channelRows.map((row) => (
                  <tr key={row.channelId} className="bg-transparent">
                    <td className="px-3 py-2 text-white">
                      <div className="flex items-center gap-2">
                        <IconAvatar
                          icon={row.iconPresentation}
                          label={row.title}
                          size="xs"
                        />
                        <span>{row.title}</span>
                      </div>
                    </td>
                    <td className="px-3 py-2">
                      {tableMoneyCompact(row.revenue.totalAgreedRevenue, row.revenue.currency)}
                    </td>
                    <td className="px-3 py-2">
                      {tableMoneyCompact(row.revenue.totalPaidRevenue, row.revenue.currency)}
                    </td>
                    <td className="px-3 py-2">
                      <FillRateCell
                        sold={row.placements.sold}
                        eligible={row.placements.slotsEligible}
                        percent={row.placements.slotFillRate}
                      />
                    </td>
                    <td className="px-3 py-2">
                      <PlanSoldMoney
                        planned={row.revenue.elapsedMinimumRevenue}
                        sold={row.revenue.elapsedSoldRevenue}
                        currency={row.revenue.currency}
                        renderMoney={tableMoneyCompact}
                      />
                    </td>
                  </tr>
                ))}
                {!channelRows.length ? (
                  <tr>
                    <td colSpan={5} className="px-3 py-6">
                      {overviewQuery.isLoading ? (
                        <ChannelRowsSkeleton />
                      ) : (
                        <EmptyState text="No channel analytics for the selected channels." />
                      )}
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </Card>

        {showAlertsPanel ? (
          <Card className={analyticsPanelClass}>
            <div className="mb-4">
              <h3 className="font-semibold text-white">Active alerts</h3>
              <p className="text-sm text-neutral-500">
                Overdue payments, deletions, and unused inventory
              </p>
            </div>
            <div className="space-y-3">
              {overviewQuery.error ? (
                <RecoverableBlock text="Alerts are unavailable for this range." />
              ) : overviewQuery.isLoading ? (
                <AlertsSkeleton />
              ) : (
                alerts.slice(0, 6).map((alert, index) => (
                  <div
                    key={`${alert.kind}-${alert.placementId ?? alert.channelId ?? index}`}
                    className={analyticsTileClass}
                  >
                    <p className="font-medium text-white">{alert.title}</p>
                    <p className="mt-1 text-sm text-neutral-400">
                      {alert.details}
                    </p>
                  </div>
                ))
              )}
            </div>
          </Card>
        ) : null}
      </div>
    </div>
  );
}

function AnalyticsKpi({
  label,
  tip,
  value,
}: {
  label: string;
  tip: string;
  value: ReactNode;
}) {
  return (
    <Card className={analyticsTileClass}>
      <div className="flex items-start justify-between gap-2">
        <MetricPreviewLabel
          label={label}
          className="min-w-0 flex-1 text-xs text-neutral-400 [&>span]:truncate [&>svg]:shrink-0"
        />
        <UiTooltip
          side="bottom"
          align="center"
          content={<span className="block max-w-56 text-xs leading-relaxed">{tip}</span>}
          className="relative z-10"
        >
          <button
            type="button"
            className="inline-flex h-4 w-4 shrink-0 items-center justify-center rounded-full border border-slate-700 text-slate-400 transition hover:border-slate-500 hover:text-slate-200"
            aria-label={`Explain ${label}`}
          >
            <Info size={10} />
          </button>
        </UiTooltip>
      </div>
      <div className="mt-1.5 min-h-10">{value}</div>
    </Card>
  );
}

function TableHeaderWithTooltip({
  label,
  tip,
}: {
  label: string;
  tip: string;
}) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span>{label}</span>
      <UiTooltip
        side="bottom"
        align="center"
        content={<span className="block max-w-56 normal-case leading-relaxed">{tip}</span>}
      >
        <button
          type="button"
          className="inline-flex h-4 w-4 items-center justify-center rounded-full border border-slate-700 text-slate-400 transition hover:border-slate-500 hover:text-slate-200"
          aria-label={`Explain ${label}`}
        >
          <Info size={10} />
        </button>
      </UiTooltip>
    </span>
  );
}

function MetricNumberValue({ value }: { value: ReactNode }) {
  return (
    <div className="text-xl font-semibold leading-tight text-white">
      {value}
    </div>
  );
}

function ZeroMoney() {
  return <span className="font-medium text-white">0</span>;
}

function FillRateCell({
  sold,
  eligible,
  percent,
}: {
  sold: number;
  eligible: number;
  percent: number;
}) {
  return (
    <div>
      <div className="font-medium text-white">{percent}%</div>
      <div className="mt-1 text-xs text-neutral-500">
        {sold} / {eligible} slots
      </div>
    </div>
  );
}

function PlanSoldMoney({
  planned,
  sold,
  currency,
  renderMoney,
}: {
  planned: string | number | null | undefined;
  sold: string | number | null | undefined;
  currency?: string | null;
  renderMoney: (
    value: string | number | null | undefined,
    currency?: string | null,
  ) => ReactNode;
}) {
  return (
    <div className="space-y-2">
      <div>
        <div className="text-[10px] font-semibold uppercase text-neutral-500">
          Plan
        </div>
        {renderMoney(planned, currency)}
      </div>
      <div>
        <div className="text-[10px] font-semibold uppercase text-neutral-500">
          Sold
        </div>
        {renderMoney(sold, currency)}
      </div>
    </div>
  );
}

function MetricValueSkeleton() {
  return (
    <div className="mt-3 space-y-2" role="status" aria-label="Loading metric">
      <Skeleton className="h-7 w-28" />
      <Skeleton className="h-4 w-20" />
    </div>
  );
}

function ChartSkeleton() {
  return (
    <div className="h-72 space-y-4" role="status" aria-label="Loading chart">
      <Skeleton className="h-full w-full rounded-[18px]" />
    </div>
  );
}

function ChannelRowsSkeleton() {
  return (
    <div className="space-y-3" role="status" aria-label="Loading channel rows">
      {Array.from({ length: 2 }, (_, index) => (
        <div key={index} className="grid grid-cols-5 gap-4">
          <Skeleton className="h-5 w-full" />
          <Skeleton className="h-5 w-24" />
          <Skeleton className="h-5 w-24" />
          <Skeleton className="h-5 w-12" />
          <Skeleton className="h-5 w-24" />
        </div>
      ))}
    </div>
  );
}

function AlertsSkeleton() {
  return (
    <div className="space-y-3" role="status" aria-label="Loading alerts">
      {Array.from({ length: 2 }, (_, index) => (
        <div key={index} className={analyticsTileClass}>
          <Skeleton className="h-5 w-40" />
          <Skeleton className="mt-2 h-4 w-64 max-w-full" />
        </div>
      ))}
    </div>
  );
}

function RecoverableBlock({ text }: { text: string }) {
  return (
    <div className="rounded-[18px] border border-amber-800/60 bg-amber-950/20 p-4 text-sm text-amber-100">
      {text}
    </div>
  );
}
