'use client';

import { useQuery } from '@tanstack/react-query';
import { AppShell } from '@/components/layout/app-shell';
import { Card, EmptyState, LoadingState, PageHeader, Table } from '@/components/ui/primitives';
import { getDashboardSummary } from '@/lib/api';

const n = (v: number | string | null | undefined) => {
  const parsed = Number(v ?? 0);
  return Number.isFinite(parsed) ? parsed.toFixed(2) : '0.00';
};

export default function DashboardPage() {
  const { data, isLoading, error } = useQuery({ queryKey: ['dashboard-summary'], queryFn: getDashboardSummary });

  return (
    <AppShell>
      <PageHeader title="Dashboard" subtitle="Finance and ads summary" />
      {isLoading ? <LoadingState /> : null}
      {error ? <Card className="text-red-300">Failed to load dashboard.</Card> : null}
      {data ? (
        <>
          <div className="grid grid-cols-[repeat(auto-fit,minmax(min(220px,100%),1fr))] gap-4">
            <Card><p className="text-sm text-neutral-400">Total Balance Primary</p><p className="text-xl font-semibold">{n(data.totalBalancePrimary)} {data.primaryCurrency ?? ''}</p></Card>
            <Card><p className="text-sm text-neutral-400">Total Balance Secondary</p><p className="text-xl font-semibold">{n(data.totalBalanceSecondary)} {data.secondaryCurrency ?? ''}</p></Card>
            <Card><p className="text-sm text-neutral-400">Income</p><p className="text-xl font-semibold">{n(data.incomeForPeriod)}</p></Card>
            <Card><p className="text-sm text-neutral-400">Expenses</p><p className="text-xl font-semibold">{n(data.expensesForPeriod)}</p></Card>
            <Card><p className="text-sm text-neutral-400">Profit</p><p className="text-xl font-semibold">{n(data.profitForPeriod)}</p></Card>
            <Card><p className="text-sm text-neutral-400">Ad Spend</p><p className="text-xl font-semibold">{n(data.adSpendForPeriod)}</p></Card>
            <Card><p className="text-sm text-neutral-400">Total Joined</p><p className="text-xl font-semibold">{data.totalJoinedFromAds}</p></Card>
            <Card><p className="text-sm text-neutral-400">Average CPA</p><p className="text-xl font-semibold">{data.averageCPA ? n(data.averageCPA) : '-'}</p></Card>
          </div>

          <div className="mt-6 grid gap-4 lg:grid-cols-2">
            <Card>
              <h3 className="mb-3 text-lg font-semibold">Best Campaigns</h3>
              {data.bestCampaigns?.length ? <SimpleCampaignTable rows={data.bestCampaigns} /> : <EmptyState text="No campaigns" />}
            </Card>
            <Card>
              <h3 className="mb-3 text-lg font-semibold">Worst Campaigns</h3>
              {data.worstCampaigns?.length ? <SimpleCampaignTable rows={data.worstCampaigns} /> : <EmptyState text="No campaigns" />}
            </Card>
          </div>
        </>
      ) : null}
    </AppShell>
  );
}

function SimpleCampaignTable({ rows }: { rows: { id: string; title: string; cpa?: number | string | null; cpm?: number | string | null; joinedCount?: number | null }[] }) {
  return (
    <Table>
      <thead><tr className="text-neutral-400"><th>Title</th><th>Joined</th><th>CPA</th><th>CPM</th></tr></thead>
      <tbody>
        {rows.map((r) => <tr key={r.id} className="border-t border-neutral-800"><td className="py-2">{r.title}</td><td>{r.joinedCount ?? 0}</td><td>{r.cpa ? n(r.cpa) : '-'}</td><td>{r.cpm ? n(r.cpm) : '-'}</td></tr>)}
      </tbody>
    </Table>
  );
}
