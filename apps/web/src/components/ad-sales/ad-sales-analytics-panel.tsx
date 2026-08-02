"use client";

import Link from "next/link";
import { useMemo } from "react";
import { useQueries, useQuery } from "@tanstack/react-query";
import { ResponsiveContainer, AreaChart, Area, CartesianGrid, Tooltip, XAxis, YAxis, LineChart, Line } from "recharts";
import { Card, EmptyState, ErrorState, LoadingState } from "@/components/ui/primitives";
import { telegramAdSalesApi } from "@/lib/api";
import { telegramAdSalesKeys } from "@/lib/telegram-ad-sales-query";

type Props = {
  selectedChannelIds: string[];
  selectedNetworkId?: string | null;
};

function money(value: string | number | null | undefined) {
  return Number(value ?? 0).toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

export function AdSalesAnalyticsPanel({ selectedChannelIds, selectedNetworkId }: Props) {
  const scopedParams = useMemo(
    () => ({
      rangeDays: 30,
      ...(selectedChannelIds[0] ? { channelId: selectedChannelIds[0] } : {}),
      ...(selectedNetworkId ? { networkId: selectedNetworkId } : {}),
    }),
    [selectedChannelIds, selectedNetworkId],
  );
  const summaryParams = useMemo(
    () => ({
      rangeDays: 30,
      ...(selectedNetworkId ? { networkId: selectedNetworkId } : {}),
    }),
    [selectedNetworkId],
  );
  const summaryQuery = useQuery({
    queryKey: telegramAdSalesKeys.analyticsSummary(summaryParams),
    queryFn: () => telegramAdSalesApi.analyticsSummary(summaryParams),
  });
  const revenueSeriesQuery = useQuery({
    queryKey: telegramAdSalesKeys.revenueSeries(scopedParams),
    queryFn: () => telegramAdSalesApi.revenueSeries(scopedParams),
  });
  const inventoryQuery = useQuery({
    queryKey: telegramAdSalesKeys.inventory(scopedParams),
    queryFn: () => telegramAdSalesApi.inventoryAnalytics(scopedParams),
  });
  const alertsQuery = useQuery({
    queryKey: telegramAdSalesKeys.alerts(summaryParams),
    queryFn: () => telegramAdSalesApi.analyticsAlerts(summaryParams),
  });
  const channelQueries = useQueries({
    queries: selectedChannelIds.slice(0, 6).map((channelId) => ({
      queryKey: telegramAdSalesKeys.channelAnalytics(channelId, { rangeDays: 30 }),
      queryFn: () =>
        telegramAdSalesApi.channelAnalytics(channelId, {
          rangeDays: 30,
        }),
    })),
  });

  if (summaryQuery.isLoading) return <LoadingState text="Loading analytics…" />;
  if (summaryQuery.error) return <ErrorState text="Could not load ad-sales analytics." />;
  if (!summaryQuery.data) return <EmptyState text="No analytics data yet." />;

  const summary = summaryQuery.data;
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
    .filter((row): row is NonNullable<(typeof channelQueries)[number]["data"]> => Boolean(row));
  const alerts = alertsQuery.data?.items ?? [];

  return (
    <div className="space-y-5">
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-6">
        <AnalyticsKpi label="Paid revenue" value={money(summary.paidRevenue)} />
        <AnalyticsKpi label="Outstanding" value={money(summary.accountsReceivable)} />
        <AnalyticsKpi label="Upcoming placements" value={String(summary.upcomingPlacements)} />
        <AnalyticsKpi label="Fill rate" value={`${summary.slotFillRate}%`} />
        <AnalyticsKpi label="Average CPM" value={money(summary.averageCpm)} />
        <AnalyticsKpi label="Underpricing loss" value={money(summary.underpricingLoss)} />
      </div>

      <div className="grid gap-5 xl:grid-cols-2">
        <Card>
          <div className="mb-4 flex items-center justify-between">
            <div>
              <h3 className="font-semibold text-white">Revenue over time</h3>
              <p className="text-sm text-neutral-500">Agreed, paid, and outstanding revenue</p>
            </div>
          </div>
          {revenueSeries.length ? (
            <div className="h-72">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={revenueSeries}>
                  <CartesianGrid stroke="#262626" />
                  <XAxis dataKey="date" stroke="#737373" />
                  <YAxis stroke="#737373" />
                  <Tooltip />
                  <Area type="monotone" dataKey="agreed" stroke="#2563eb" fill="#2563eb33" />
                  <Area type="monotone" dataKey="paid" stroke="#10b981" fill="#10b98133" />
                  <Area type="monotone" dataKey="outstanding" stroke="#f97316" fill="#f9731633" />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <EmptyState text="No revenue data for the selected range." />
          )}
        </Card>

        <Card>
          <div className="mb-4 flex items-center justify-between">
            <div>
              <h3 className="font-semibold text-white">Inventory fill rate</h3>
              <p className="text-sm text-neutral-500">Booking vs published utilisation</p>
            </div>
          </div>
          {inventorySeries.length ? (
            <div className="h-72">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={inventorySeries}>
                  <CartesianGrid stroke="#262626" />
                  <XAxis dataKey="date" stroke="#737373" />
                  <YAxis stroke="#737373" />
                  <Tooltip />
                  <Line type="monotone" dataKey="bookingFillRate" stroke="#2563eb" strokeWidth={2} />
                  <Line type="monotone" dataKey="publishedFillRate" stroke="#10b981" strokeWidth={2} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <EmptyState text="No inventory data for the selected range." />
          )}
        </Card>
      </div>

      <div className="grid gap-5 xl:grid-cols-[1.3fr_1fr]">
        <Card>
          <div className="mb-4 flex items-center justify-between">
            <div>
              <h3 className="font-semibold text-white">Channel performance</h3>
              <p className="text-sm text-neutral-500">Backend aggregates by channel</p>
            </div>
            <Link href="/ad-sales?tab=analytics" className="text-sm text-blue-300 hover:text-blue-200">
              Open full analytics
            </Link>
          </div>
          <div className="overflow-hidden rounded-xl border border-neutral-800">
            <table className="w-full text-left text-sm">
              <thead className="bg-neutral-900 text-xs uppercase text-neutral-400">
                <tr>
                  <th className="px-3 py-2">Channel</th>
                  <th className="px-3 py-2">Revenue</th>
                  <th className="px-3 py-2">Paid</th>
                  <th className="px-3 py-2">Fill rate</th>
                  <th className="px-3 py-2">Actual CPM</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-800">
                {channelRows.map((row) => (
                  <tr key={row.channelId} className="bg-neutral-950">
                    <td className="px-3 py-2 text-white">{row.title}</td>
                    <td className="px-3 py-2">{money(row.revenue.totalAgreedRevenue)}</td>
                    <td className="px-3 py-2">{money(row.revenue.totalPaidRevenue)}</td>
                    <td className="px-3 py-2">{row.placements.slotFillRate}%</td>
                    <td className="px-3 py-2">{money(row.performance.actualCpm)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>

        <Card>
          <div className="mb-4">
            <h3 className="font-semibold text-white">Active alerts</h3>
            <p className="text-sm text-neutral-500">Overdue payments, deletions, and unused inventory</p>
          </div>
          <div className="space-y-3">
            {alerts.slice(0, 6).map((alert, index) => (
              <div key={`${alert.kind}-${alert.placementId ?? alert.channelId ?? index}`} className="rounded-xl border border-neutral-800 bg-neutral-950/60 p-3">
                <p className="font-medium text-white">{alert.title}</p>
                <p className="mt-1 text-sm text-neutral-400">{alert.details}</p>
              </div>
            ))}
            {!alerts.length ? <EmptyState text="No alerts in the selected range." /> : null}
          </div>
        </Card>
      </div>
    </div>
  );
}

function AnalyticsKpi({ label, value }: { label: string; value: string }) {
  return (
    <Card>
      <p className="text-sm text-neutral-400">{label}</p>
      <p className="mt-2 text-2xl font-semibold text-white">{value}</p>
    </Card>
  );
}
