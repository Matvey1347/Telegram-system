"use client";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { Card, EmptyState, LoadingState } from "@/components/ui/primitives";
import { telegramAdSalesApi } from "@/lib/api";
import { telegramAdSalesKeys } from "@/lib/telegram-ad-sales-query";

function money(value: string | number | null | undefined) {
  return Number(value ?? 0).toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

export function AdSalesDashboardCard() {
  const query = useQuery({
    queryKey: telegramAdSalesKeys.analyticsSummary({ rangeDays: 30 }),
    queryFn: () => telegramAdSalesApi.analyticsSummary({ rangeDays: 30 }),
  });

  if (query.isLoading) return <LoadingState text="Loading ad-sales summary…" />;
  if (!query.data) return <EmptyState text="No ad-sales analytics yet." />;

  const summary = query.data;

  return (
    <Card>
      <div className="mb-4 flex items-start justify-between gap-4">
        <div>
          <h2 className="text-lg font-semibold text-white">Ad Sales</h2>
          <p className="text-sm text-neutral-500">Business summary for the last 30 days</p>
        </div>
        <Link href="/ad-sales?tab=analytics" className="text-sm text-blue-300 hover:text-blue-200">
          Open analytics
        </Link>
      </div>
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        <DashboardStat label="Revenue this month" value={money(summary.revenueThisMonth)} />
        <DashboardStat label="Paid revenue" value={money(summary.paidRevenue)} />
        <DashboardStat label="Receivable" value={money(summary.accountsReceivable)} />
        <DashboardStat label="Fill rate" value={`${summary.slotFillRate}%`} />
        <DashboardStat label="Average CPM" value={money(summary.averageCpm)} />
        <DashboardStat label="Upcoming placements" value={String(summary.upcomingPlacements)} />
        <DashboardStat label="Available next 7 days" value={String(summary.availableSlotsNext7Days)} />
        <DashboardStat label="Deletion failures" value={String(summary.deletionFailuresCount)} />
      </div>
    </Card>
  );
}

function DashboardStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-neutral-800 bg-neutral-950/60 p-4">
      <p className="text-sm text-neutral-400">{label}</p>
      <p className="mt-2 text-xl font-semibold text-white">{value}</p>
    </div>
  );
}
