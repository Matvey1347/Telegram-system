"use client";

import Link from "next/link";
import { useMemo } from "react";
import { keepPreviousData, useQueries, useQuery } from "@tanstack/react-query";
import type { ReactNode } from "react";
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
  LoadingState,
} from "@/components/ui/primitives";
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
  "rounded-[18px] border border-slate-800/80 bg-[#0b1220] p-4 shadow-[inset_0_1px_0_rgba(96,165,250,0.05)]";
const analyticsCacheOptions = {
  staleTime: 2 * 60 * 1000,
  gcTime: 15 * 60 * 1000,
  placeholderData: keepPreviousData,
  refetchOnWindowFocus: false,
} as const;

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
      ...(selectedChannelIds[0] ? { channelId: selectedChannelIds[0] } : {}),
      ...(selectedNetworkId ? { networkId: selectedNetworkId } : {}),
    }),
    [from, selectedChannelIds, selectedNetworkId, to],
  );
  const summaryParams = useMemo(
    () => ({
      dateFrom: from.toISOString(),
      dateTo: to.toISOString(),
      ...(selectedNetworkId ? { networkId: selectedNetworkId } : {}),
    }),
    [from, selectedNetworkId, to],
  );
  const summaryQuery = useQuery({
    queryKey: telegramAdSalesKeys.analyticsSummary(summaryParams),
    queryFn: () => telegramAdSalesApi.analyticsSummary(summaryParams),
    ...analyticsCacheOptions,
  });
  const revenueSeriesQuery = useQuery({
    queryKey: telegramAdSalesKeys.revenueSeries(scopedParams),
    queryFn: () => telegramAdSalesApi.revenueSeries(scopedParams),
    ...analyticsCacheOptions,
  });
  const inventoryQuery = useQuery({
    queryKey: telegramAdSalesKeys.inventory(scopedParams),
    queryFn: () => telegramAdSalesApi.inventoryAnalytics(scopedParams),
    ...analyticsCacheOptions,
  });
  const alertsQuery = useQuery({
    queryKey: telegramAdSalesKeys.alerts(summaryParams),
    queryFn: () => telegramAdSalesApi.analyticsAlerts(summaryParams),
    enabled: Boolean(summaryQuery.data),
    ...analyticsCacheOptions,
  });
  const channelQueries = useQueries({
    queries: selectedChannelIds.slice(0, 6).map((channelId) => ({
      queryKey: telegramAdSalesKeys.channelAnalytics(channelId, {
        dateFrom: from.toISOString(),
        dateTo: to.toISOString(),
      }),
      queryFn: () =>
        telegramAdSalesApi.channelAnalytics(channelId, {
          dateFrom: from.toISOString(),
          dateTo: to.toISOString(),
        }),
      ...analyticsCacheOptions,
    })),
  });

  const summary = summaryQuery.data;
  const moneySettings = settings ?? {
    primaryCurrency: "USD",
    secondaryCurrency: "UAH",
    tertiaryCurrency: "UAH",
    currencyDisplayMode: "code" as const,
  };
  const moneyPreview = (value: string | number | null | undefined) => (
    <MoneyStack
      amount={value}
      currency={moneySettings.primaryCurrency}
      settings={moneySettings}
      rates={rates}
      mainClassName="text-2xl font-semibold text-white"
      subClassName="text-sm text-neutral-500"
    />
  );
  const tableMoney = (value: string | number | null | undefined) => (
    <MoneyStack
      amount={value}
      currency={moneySettings.primaryCurrency}
      settings={moneySettings}
      rates={rates}
      mainClassName="font-medium text-white"
      subClassName="text-xs text-neutral-500"
    />
  );
  const revenueSeries =
    revenueSeriesQuery.data?.points.map((point) => ({
      date: point.date.slice(5),
      agreed: Number(point.agreedRevenue || 0),
      paid: Number(point.paidRevenue || 0),
      outstanding: Number(point.outstandingRevenue || 0),
    })) ?? [];
  const inventorySeries =
    inventoryQuery.data?.points.map((point) => ({
      date: point.date.slice(5),
      bookingFillRate: point.bookingFillRate,
      publishedFillRate: point.publishedFillRate,
    })) ?? [];
  const channelRows = channelQueries
    .map((query) => query.data)
    .filter(
      (row): row is NonNullable<(typeof channelQueries)[number]["data"]> =>
        Boolean(row),
    );
  const channelRowsLoading = channelQueries.some((query) => query.isLoading);
  const channelRowsError = channelQueries.some((query) => query.error);
  const alerts = alertsQuery.data?.items ?? [];
  const loadingValue = (
    <span className="text-sm font-medium text-neutral-500">Loading…</span>
  );

  return (
    <div className="space-y-5">
      {summaryQuery.error ? (
        <ErrorState text="Could not load ad-sales summary. Cached analytics blocks remain available where possible." />
      ) : null}
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-6">
        <AnalyticsKpi
          label="Paid revenue"
          value={summary ? moneyPreview(summary.paidRevenue) : loadingValue}
        />
        <AnalyticsKpi
          label="Outstanding"
          value={
            summary ? moneyPreview(summary.accountsReceivable) : loadingValue
          }
        />
        <AnalyticsKpi
          label="Upcoming placements"
          value={summary ? String(summary.upcomingPlacements) : loadingValue}
        />
        <AnalyticsKpi
          label="Fill rate"
          value={summary ? `${summary.slotFillRate}%` : loadingValue}
        />
        <AnalyticsKpi
          label="Average CPM"
          value={summary ? moneyPreview(summary.averageCpm) : loadingValue}
        />
        <AnalyticsKpi
          label="Underpricing loss"
          value={summary ? moneyPreview(summary.underpricingLoss) : loadingValue}
        />
      </div>

      <div className="grid gap-5 xl:grid-cols-2">
        <Card className={analyticsPanelClass}>
          <div className="mb-4 flex items-center justify-between">
            <div>
              <h3 className="font-semibold text-white">Revenue over time</h3>
              <p className="text-sm text-neutral-500">
                Agreed, paid, and outstanding revenue
              </p>
            </div>
          </div>
          {revenueSeriesQuery.error ? (
            <RecoverableBlock text="Revenue series is unavailable for this range." />
          ) : revenueSeriesQuery.isLoading ? (
            <LoadingState text="Loading revenue series…" />
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

        <Card className={analyticsPanelClass}>
          <div className="mb-4 flex items-center justify-between">
            <div>
              <h3 className="font-semibold text-white">Inventory fill rate</h3>
              <p className="text-sm text-neutral-500">
                Booking vs published utilisation
              </p>
            </div>
          </div>
          {inventoryQuery.error ? (
            <RecoverableBlock text="Inventory analytics are unavailable for this range." />
          ) : inventoryQuery.isLoading ? (
            <LoadingState text="Loading inventory analytics…" />
          ) : inventorySeries.length ? (
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
          ) : (
            <EmptyState text="No inventory data for the selected range." />
          )}
        </Card>
      </div>

      <div className="grid gap-5 xl:grid-cols-[1.3fr_1fr]">
        <Card className={analyticsPanelClass}>
          <div className="mb-4 flex items-center justify-between">
            <div>
              <h3 className="font-semibold text-white">Channel performance</h3>
              <p className="text-sm text-neutral-500">
                Backend aggregates by channel
              </p>
            </div>
            <Link
              href="/ad-sales?tab=analytics"
              className="text-sm text-blue-300 hover:text-blue-200"
            >
              Open full analytics
            </Link>
          </div>
          {channelRowsError ? (
            <RecoverableBlock text="Some channel analytics could not be loaded." />
          ) : null}
          <div className="overflow-hidden rounded-[18px] border border-slate-800/80 bg-[#0b1220]">
            <table className="w-full text-left text-sm">
              <thead className="bg-[#09111e] text-xs uppercase text-neutral-400">
                <tr>
                  <th className="px-3 py-2">Channel</th>
                  <th className="px-3 py-2">Revenue</th>
                  <th className="px-3 py-2">Paid</th>
                  <th className="px-3 py-2">Fill rate</th>
                  <th className="px-3 py-2">Actual CPM</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/80">
                {channelRows.map((row) => (
                  <tr key={row.channelId} className="bg-transparent">
                    <td className="px-3 py-2 text-white">{row.title}</td>
                    <td className="px-3 py-2">
                      {tableMoney(row.revenue.totalAgreedRevenue)}
                    </td>
                    <td className="px-3 py-2">
                      {tableMoney(row.revenue.totalPaidRevenue)}
                    </td>
                    <td className="px-3 py-2">
                      {row.placements.slotFillRate}%
                    </td>
                    <td className="px-3 py-2">
                      {tableMoney(row.performance.actualCpm)}
                    </td>
                  </tr>
                ))}
                {!channelRows.length ? (
                  <tr>
                    <td colSpan={5} className="px-3 py-6">
                      {channelRowsLoading ? (
                        <LoadingState text="Loading channel rows…" />
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

        <Card className={analyticsPanelClass}>
          <div className="mb-4">
            <h3 className="font-semibold text-white">Active alerts</h3>
            <p className="text-sm text-neutral-500">
              Overdue payments, deletions, and unused inventory
            </p>
          </div>
          <div className="space-y-3">
            {alertsQuery.error ? (
              <RecoverableBlock text="Alerts are unavailable for this range." />
            ) : alertsQuery.isLoading ? (
              <LoadingState text="Loading alerts…" />
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
            {!alertsQuery.error && !alertsQuery.isLoading && !alerts.length ? (
              <EmptyState text="No alerts in the selected range." />
            ) : null}
          </div>
        </Card>
      </div>
    </div>
  );
}

function AnalyticsKpi({ label, value }: { label: string; value: ReactNode }) {
  return (
    <Card className={analyticsTileClass}>
      <MetricPreviewLabel label={label} />
      <div className="mt-2">{value}</div>
    </Card>
  );
}

function RecoverableBlock({ text }: { text: string }) {
  return (
    <div className="rounded-[18px] border border-amber-800/60 bg-amber-950/20 p-4 text-sm text-amber-100">
      {text}
    </div>
  );
}
