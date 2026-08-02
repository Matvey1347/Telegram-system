"use client";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { Card, EmptyState, ErrorState, LoadingState } from "@/components/ui/primitives";
import { telegramAdSalesApi } from "@/lib/api";
import { telegramAdSalesKeys } from "@/lib/telegram-ad-sales-query";

function money(value: string | number | null | undefined) {
  return Number(value ?? 0).toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

export function TelegramChannelAdSalesSection({ channelId }: { channelId: string }) {
  const query = useQuery({
    queryKey: telegramAdSalesKeys.channelAnalytics(channelId, { rangeDays: 30 }),
    queryFn: () =>
      telegramAdSalesApi.channelAnalytics(channelId, {
        rangeDays: 30,
      }),
  });

  if (query.isLoading) return <LoadingState text="Loading ad-sales metrics…" />;
  if (query.error) return <ErrorState text="Could not load channel ad-sales analytics." />;
  if (!query.data) return <EmptyState text="No ad-sales analytics for this channel yet." />;

  const analytics = query.data;

  return (
    <Card>
      <div className="mb-4 flex items-start justify-between gap-4">
        <div>
          <h2 className="text-lg font-semibold text-white">Ad sales</h2>
          <p className="text-sm text-neutral-500">Current pricing, revenue, and inventory snapshot</p>
        </div>
        <Link href={`/ad-sales?tab=analytics&channelId=${channelId}`} className="text-sm text-blue-300 hover:text-blue-200">
          Open full module
        </Link>
      </div>

      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        <SectionStat label="Recommended price" value={money(analytics.pricing.currentRecommendedPrice)} />
        <SectionStat label="Paid revenue" value={money(analytics.revenue.totalPaidRevenue)} />
        <SectionStat label="Placements" value={String(analytics.placements.sold)} />
        <SectionStat label="Fill rate" value={`${analytics.placements.slotFillRate}%`} />
        <SectionStat label="Actual CPM" value={money(analytics.performance.actualCpm)} />
        <SectionStat label="Underpricing" value={money(analytics.pricing.underpricingAmount)} />
        <SectionStat label="Upcoming" value={String(analytics.operations.upcomingPlacements)} />
        <SectionStat label="Free slots" value={String(analytics.placements.slotsAvailable)} />
      </div>

      <div className="mt-5 grid gap-5 xl:grid-cols-[1.2fr_1fr]">
        <div>
          <h3 className="mb-3 font-medium text-white">Recent sales</h3>
          <div className="overflow-hidden rounded-xl border border-neutral-800">
            <table className="w-full text-left text-sm">
              <thead className="bg-neutral-900 text-xs uppercase text-neutral-400">
                <tr>
                  <th className="px-3 py-2">Advertiser</th>
                  <th className="px-3 py-2">Scheduled</th>
                  <th className="px-3 py-2">Agreed</th>
                  <th className="px-3 py-2">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-800">
                {analytics.recentSales.map((sale) => (
                  <tr key={sale.placementId} className="bg-neutral-950">
                    <td className="px-3 py-2 text-white">{sale.advertiserName}</td>
                    <td className="px-3 py-2">{new Date(sale.scheduledAt).toLocaleString()}</td>
                    <td className="px-3 py-2">
                      {money(sale.agreedPrice)} {sale.currency}
                    </td>
                    <td className="px-3 py-2">{sale.status}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <div className="space-y-3">
          <div className="rounded-xl border border-neutral-800 bg-neutral-950/60 p-4">
            <p className="text-sm text-neutral-400">Expected vs actual views</p>
            <p className="mt-2 text-lg font-semibold text-white">
              {analytics.performance.expectedViews.toLocaleString()} expected
            </p>
            <p className="text-sm text-neutral-300">
              {analytics.performance.actualViewsFinal.toLocaleString()} actual final
            </p>
          </div>
          <div className="rounded-xl border border-neutral-800 bg-neutral-950/60 p-4">
            <p className="text-sm text-neutral-400">Outstanding revenue</p>
            <p className="mt-2 text-lg font-semibold text-white">
              {money(analytics.revenue.outstandingRevenue)}
            </p>
          </div>
        </div>
      </div>
    </Card>
  );
}

function SectionStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-neutral-800 bg-neutral-950/60 p-4">
      <p className="text-sm text-neutral-400">{label}</p>
      <p className="mt-2 text-xl font-semibold text-white">{value}</p>
    </div>
  );
}
