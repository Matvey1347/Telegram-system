'use client';

import type { ReactNode } from 'react';
import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Line,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { Activity, Banknote, Megaphone, RadioTower, Target, TrendingUp, Users } from 'lucide-react';
import { IconPicker } from '@/components/icons/icon-picker';
import { AppShell } from '@/components/layout/app-shell';
import { accountDisplayName } from '@/lib/account-display';
import { Button, Card, DateRangeInput, EmptyState, FormField, PageHeader, Skeleton, Table } from '@/components/ui/primitives';
import { accountsApi, type AdCampaign, type AdCampaignKpiStatus, getDashboardSummary, transactionCategoriesApi } from '@/lib/api';
import { formatMoney } from '@/lib/money';

const COLORS = ['#2563eb', '#10b981', '#f97316', '#f43f5e', '#8b5cf6', '#14b8a6', '#eab308', '#94a3b8'];

function formatLocalDate(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function defaultPeriod() {
  const to = new Date();
  const from = new Date();
  from.setDate(to.getDate() - 29);
  return { dateFrom: formatLocalDate(from), dateTo: formatLocalDate(to) };
}

const n = (value: number | string | null | undefined, digits = 0) => {
  const parsed = Number(value ?? 0);
  if (!Number.isFinite(parsed)) return '0';
  return new Intl.NumberFormat(undefined, { maximumFractionDigits: digits, minimumFractionDigits: digits }).format(parsed);
};

const percent = (value: number | string | null | undefined, digits = 1) => {
  if (value == null) return '-';
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return '-';
  return `${n(parsed > 0 && parsed <= 1 ? parsed * 100 : parsed, digits)}%`;
};

const shortDate = (value: string) => {
  const [, month, day] = value.split('-');
  return `${day}.${month}`;
};

function nullableNumber(value: unknown) {
  if (value === null || value === undefined || value === '') return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function valueInRange(value: number, from: number | null, to: number | null) {
  if (from == null && to == null) return false;
  if (from != null && value < from) return false;
  if (to != null && value > to) return false;
  return true;
}

type ChartTooltipItem = {
  dataKey: string;
  name?: string;
  value: number | string;
  color?: string;
};

type ChartTooltipProps = {
  active?: boolean;
  payload?: ChartTooltipItem[];
  label?: string;
  money: (value: number | string | null | undefined) => string;
};

export default function DashboardPage() {
  const qc = useQueryClient();
  const defaultCustomPeriod = useMemo(defaultPeriod, []);
  const [rangeMode, setRangeMode] = useState<'30d' | 'all' | 'custom'>('all');
  const [customPeriod, setCustomPeriod] = useState(defaultCustomPeriod);
  const period = useMemo(
    () =>
      rangeMode === '30d'
        ? defaultPeriod()
        : rangeMode === 'custom'
          ? customPeriod
          : undefined,
    [customPeriod, rangeMode],
  );
  const { data, isLoading, error } = useQuery({
    queryKey: ['dashboard-summary', rangeMode, period?.dateFrom ?? null, period?.dateTo ?? null],
    queryFn: () => getDashboardSummary(period),
  });
  const updateCategoryIconMutation = useMutation({
    mutationFn: ({ id, iconId }: { id: string; iconId: string | null }) =>
      transactionCategoriesApi.update(id, { iconId }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['dashboard-summary'] });
      qc.invalidateQueries({ queryKey: ['transaction-categories'] });
      qc.invalidateQueries({ queryKey: ['transaction-categories-admin'] });
    },
  });
  const updateAccountIconMutation = useMutation({
    mutationFn: ({ id, iconId }: { id: string; iconId: string | null }) =>
      accountsApi.update(id, { iconId }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['dashboard-summary'] });
      qc.invalidateQueries({ queryKey: ['accounts'] });
    },
  });

  const money = (value: number | string | null | undefined) =>
    formatMoney(value, data?.primaryCurrency ?? '', 'symbol');

  const expenseBreakdown = useMemo(
    () => (data?.categoryBreakdown ?? []).filter((item) => item.type === 'expense'),
    [data],
  );
  const incomeBreakdown = useMemo(
    () => (data?.categoryBreakdown ?? []).filter((item) => item.type === 'income'),
    [data],
  );
  const statusRows = useMemo(
    () => Object.entries(data?.adQualityCounts ?? {}).map(([name, value]) => ({ name, value })),
    [data],
  );
  const categoryCardsCount = (expenseBreakdown.length ? 1 : 0) + (incomeBreakdown.length ? 1 : 0);
  const categoryGridClass =
    categoryCardsCount >= 2
      ? 'grid gap-6 xl:grid-cols-3'
      : categoryCardsCount === 1
        ? 'grid gap-6 xl:grid-cols-2'
        : 'grid gap-6 xl:grid-cols-1';
  const netMargin = data && data.incomeForPeriod > 0 ? (data.profitForPeriod / data.incomeForPeriod) * 100 : null;
  const activeRate = data && data.totalSubscribers > 0 ? (data.activeSubscribersEstimate / data.totalSubscribers) * 100 : null;
  const hasAdKpiStatus = statusRows.length > 0;
  const hasAccounts = (data?.accountBalances.length ?? 0) > 0;
  const hasChannelPerformance = (data?.channelPerformance.length ?? 0) > 0;
  const hasBestCampaigns = (data?.bestCampaigns.length ?? 0) > 0;
  const hasWorstCampaigns = (data?.worstCampaigns.length ?? 0) > 0;
  const hasCampaignTables = hasBestCampaigns || hasWorstCampaigns;
  const hasOwnChannels = (data?.topOwnChannels.length ?? 0) > 0;

  return (
    <AppShell>
      <PageHeader title="Dashboard" subtitle="Business health, finance, ads and channel performance" />

      <Card className="mb-6">
        <section className="flex flex-wrap items-end gap-2">
          <Button
            variant={rangeMode === '30d' ? 'primary' : 'secondary'}
            type="button"
            onClick={() => setRangeMode('30d')}
          >
            30d
          </Button>
          <Button
            variant={rangeMode === 'all' ? 'primary' : 'secondary'}
            type="button"
            onClick={() => setRangeMode('all')}
          >
            All
          </Button>
          <Button
            variant={rangeMode === 'custom' ? 'primary' : 'secondary'}
            type="button"
            onClick={() => setRangeMode('custom')}
          >
            Custom
          </Button>
          {rangeMode === 'custom' ? (
            <div className="w-full max-w-[420px]">
              <FormField label="Period">
                <DateRangeInput
                  from={customPeriod.dateFrom}
                  to={customPeriod.dateTo}
                  onChange={(range) =>
                    setCustomPeriod({ dateFrom: range.from, dateTo: range.to })
                  }
                />
              </FormField>
            </div>
          ) : null}
        </section>
      </Card>

      {isLoading && !data ? <DashboardSkeleton /> : null}
      {error ? <Card className="text-red-300">Failed to load dashboard.</Card> : null}

      {data ? (
        <div className="space-y-6">
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
            <MetricCard icon={Banknote} label="Current balance" value={money(data.totalBalancePrimary)} detail={formatMoney(data.totalBalanceSecondary, data.secondaryCurrency ?? '', 'symbol')} tone="blue" />
            <MetricCard icon={TrendingUp} label="Net profit" value={money(data.profitForPeriod)} detail={`${money(data.incomeForPeriod)} income · ${money(data.expensesForPeriod)} expenses`} tone={data.profitForPeriod >= 0 ? 'green' : 'red'} />
            <MetricCard icon={Megaphone} label="Ad spend" value={money(data.adSpendForPeriod)} detail={`${data.periodCampaignsCount} campaigns in period`} tone="amber" />
            <MetricCard icon={Target} label="Average CPA" value={data.averageCPA ? money(data.averageCPA) : '-'} detail={`${n(data.totalJoinedFromAds)} joined from ads`} tone="violet" />
            <MetricCard icon={RadioTower} label="Own channels" value={n(data.ownChannelsCount)} detail={`${n(data.totalSubscribers)} subscribers total`} tone="teal" />
            <MetricCard icon={Activity} label="Active audience" value={activeRate == null ? '-' : `${n(activeRate, 1)}%`} detail={`${n(data.activeSubscribersEstimate)} estimated active`} tone="green" />
            <MetricCard icon={Users} label="Workspace members" value={n(data.workspaceMembersCount)} detail={`${n(data.telegramChannelsCount)} total channels`} tone="blue" />
            <MetricCard icon={Activity} label="Attention needed" value={n(data.anomalousChannelsCount)} detail="channels with traffic anomaly" tone={data.anomalousChannelsCount ? 'red' : 'green'} />
          </div>

          <div className="grid gap-6 xl:grid-cols-[minmax(0,1.45fr)_minmax(360px,0.85fr)]">
            <Card>
              <SectionHeader title="Cashflow" meta={netMargin == null ? 'No income in period' : `${n(netMargin, 1)}% margin`} />
              <div className="h-[320px]">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={data.dailyTrend} margin={{ top: 12, right: 12, bottom: 0, left: 0 }}>
                    <CartesianGrid stroke="#262626" vertical={false} />
                    <XAxis dataKey="date" tickFormatter={shortDate} stroke="#737373" tickLine={false} axisLine={false} />
                    <YAxis stroke="#737373" tickLine={false} axisLine={false} tickFormatter={(value) => n(value)} width={54} />
                    <Tooltip content={<ChartTooltip money={money} />} />
                    <Area type="monotone" dataKey="income" stackId="cash" stroke="#10b981" fill="#10b981" fillOpacity={0.22} />
                    <Area type="monotone" dataKey="expenses" stackId="cash" stroke="#f43f5e" fill="#f43f5e" fillOpacity={0.2} />
                    <Line type="monotone" dataKey="profit" stroke="#60a5fa" strokeWidth={2} dot={false} />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </Card>

            <Card>
              <SectionHeader title="Ad Pulse" meta={`${n(data.totalJoinedFromAds)} joined`} />
              <div className="h-[320px]">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={data.dailyTrend} margin={{ top: 12, right: 8, bottom: 0, left: 0 }}>
                    <CartesianGrid stroke="#262626" vertical={false} />
                    <XAxis dataKey="date" tickFormatter={shortDate} stroke="#737373" tickLine={false} axisLine={false} />
                    <YAxis stroke="#737373" tickLine={false} axisLine={false} width={40} />
                    <Tooltip content={<ChartTooltip money={money} />} />
                    <Bar dataKey="adSpend" fill="#f97316" radius={[5, 5, 0, 0]} />
                    <Line type="monotone" dataKey="joined" stroke="#38bdf8" strokeWidth={2} dot={false} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </Card>
          </div>

          <div className={categoryGridClass}>
            {expenseBreakdown.length ? (
              <BreakdownCard title="Expenses by category" rows={expenseBreakdown} money={money} onIconChange={(id, iconId) => updateCategoryIconMutation.mutate({ id, iconId })} />
            ) : null}
            {incomeBreakdown.length ? (
              <BreakdownCard title="Income by category" rows={incomeBreakdown} money={money} onIconChange={(id, iconId) => updateCategoryIconMutation.mutate({ id, iconId })} />
            ) : null}
            {hasAdKpiStatus ? (
              <Card>
                <SectionHeader title="Ad KPI Status" meta={`${n(data.periodCampaignsCount)} campaigns`} />
                <div className="grid gap-4 md:grid-cols-[170px_1fr] xl:grid-cols-1">
                  <div className="h-[180px]">
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie data={statusRows} dataKey="value" nameKey="name" innerRadius={52} outerRadius={78} paddingAngle={3}>
                          {statusRows.map((_, index) => <Cell key={index} fill={COLORS[index % COLORS.length]} />)}
                        </Pie>
                        <Tooltip />
                      </PieChart>
                    </ResponsiveContainer>
                  </div>
                  <div className="space-y-2">
                    {statusRows.map((row, index) => (
                      <div key={row.name} className="flex items-center justify-between gap-3 rounded-lg border border-neutral-800 bg-neutral-950 px-3 py-2">
                        <span className="flex items-center gap-2 text-sm text-neutral-300"><span className="h-2.5 w-2.5 rounded-full" style={{ background: COLORS[index % COLORS.length] }} />{row.name}</span>
                        <span className="font-semibold text-white">{row.value}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </Card>
            ) : null}
          </div>

          {hasAccounts || hasChannelPerformance ? (
            <div className="grid gap-6 xl:grid-cols-2">
              {hasAccounts ? (
                <Card>
                  <SectionHeader title="Accounts" meta="Current balance by account" />
                  <div className="space-y-3">
                    {data.accountBalances.map((account) => (
                      <ProgressRow
                        key={account.id}
                        label={
                          <span className="flex min-w-0 items-center gap-1.5">
                            <IconPicker
                              bare
                              compact
                              iconId={account.iconId ?? null}
                              onChange={(iconId) => updateAccountIconMutation.mutate({ id: account.id, iconId })}
                              className="h-6 w-6 shrink-0 rounded-none border-0 bg-transparent hover:bg-transparent"
                              iconClassName="!h-6 !w-6 !rounded-none !border-0 !bg-transparent !text-xl"
                            />
                            <span className="truncate">{accountDisplayName(account)}</span>
                          </span>
                        }
                        value={formatMoney(account.balance, account.currency, 'symbol')}
                        subValue={money(account.primary)}
                        amount={Math.max(0, account.primary)}
                        max={Math.max(...data.accountBalances.map((item) => Math.max(0, item.primary)), 1)}
                        color="#2563eb"
                      />
                    ))}
                  </div>
                </Card>
              ) : null}

              {hasChannelPerformance ? (
                <Card>
                  <SectionHeader title="Best Ad Channels" meta="CPA by target channel" />
                  <div className="space-y-3">
                    {data.channelPerformance.map((channel) => (
                      <ProgressRow
                        key={channel.id}
                        label={
                          <span className="flex min-w-0 items-center gap-2">
                            <AvatarBadge imageUrl={channel.photoUrl} label={channel.title} />
                            <span className="truncate">{channel.title}</span>
                          </span>
                        }
                        value={channel.cpa == null ? '-' : money(channel.cpa)}
                        subValue={`${n(channel.joined)} joined · ${money(channel.spend)}`}
                        amount={channel.joined}
                        max={Math.max(...data.channelPerformance.map((item) => item.joined), 1)}
                        color="#10b981"
                      />
                    ))}
                  </div>
                </Card>
              ) : null}
            </div>
          ) : null}

          {hasCampaignTables ? (
            <div className="grid gap-6 xl:grid-cols-2">
              {hasBestCampaigns ? (
                <CampaignTable title="Best Campaigns" rows={data.bestCampaigns} money={money} />
              ) : null}
              {hasWorstCampaigns ? (
                <CampaignTable title="Worst Campaigns" rows={data.worstCampaigns} money={money} />
              ) : null}
            </div>
          ) : null}

          {hasOwnChannels ? (
            <Card>
              <SectionHeader title="Channel Health" meta={`${n(data.ownChannelsCount)} own channels`} />
              <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
                {data.topOwnChannels.map((channel) => (
                  <div key={channel.id} className="rounded-lg border border-neutral-800 bg-neutral-950 p-4">
                    <div className="flex items-center gap-3">
                      {channel.photoUrl ? <img src={channel.photoUrl} alt="" className="h-11 w-11 rounded-lg object-cover" /> : <div className="flex h-11 w-11 items-center justify-center rounded-lg bg-neutral-900 text-lg font-semibold text-neutral-200">{channel.title.slice(0, 1)}</div>}
                      <div className="min-w-0">
                        <div className="truncate font-semibold text-white">{channel.title}</div>
                        <div className="truncate text-sm text-neutral-500">{channel.username ? `@${channel.username}` : 'no username'}</div>
                      </div>
                    </div>
                    <div className="mt-4 grid grid-cols-3 gap-2 text-sm">
                      <MiniStat label="Subs" value={n(channel.subscribers)} />
                      <MiniStat label="Active" value={n(channel.activeSubscribers)} />
                      <MiniStat label="View" value={percent(channel.viewRate)} />
                    </div>
                  </div>
                ))}
              </div>
            </Card>
          ) : null}
        </div>
      ) : null}
    </AppShell>
  );
}

function DashboardSkeleton() {
  return (
    <div className="space-y-6" aria-label="Loading dashboard" role="status">
      <span className="sr-only">Loading dashboard</span>
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 8 }, (_, index) => <Card key={index}><Skeleton className="h-4 w-24" /><Skeleton className="mt-4 h-8 w-32" /><Skeleton className="mt-3 h-3 w-40" /></Card>)}
      </div>
      <div className="grid gap-6 xl:grid-cols-2">
        <Card><Skeleton className="h-5 w-32" /><Skeleton className="mt-5 h-[290px] w-full" /></Card>
        <Card><Skeleton className="h-5 w-28" /><Skeleton className="mt-5 h-[290px] w-full" /></Card>
      </div>
    </div>
  );
}

function SectionHeader({ title, meta }: { title: string; meta?: string }) {
  return (
    <div className="mb-4 flex items-start justify-between gap-3">
      <h2 className="text-lg font-semibold text-white">{title}</h2>
      {meta ? <span className="text-sm text-neutral-500">{meta}</span> : null}
    </div>
  );
}

function MetricCard({ icon: Icon, label, value, detail, tone }: { icon: typeof Banknote; label: string; value: string; detail: string; tone: 'blue' | 'green' | 'red' | 'amber' | 'violet' | 'teal' }) {
  const toneClass = {
    blue: 'border-blue-900/70 bg-blue-950/20 text-blue-300',
    green: 'border-emerald-900/70 bg-emerald-950/20 text-emerald-300',
    red: 'border-rose-900/70 bg-rose-950/20 text-rose-300',
    amber: 'border-amber-900/70 bg-amber-950/20 text-amber-300',
    violet: 'border-violet-900/70 bg-violet-950/20 text-violet-300',
    teal: 'border-teal-900/70 bg-teal-950/20 text-teal-300',
  }[tone];
  return (
    <Card className="min-h-[132px]">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm text-neutral-400">{label}</p>
          <p className="mt-2 text-2xl font-semibold text-white">{value}</p>
        </div>
        <div className={`rounded-lg border p-2 ${toneClass}`}><Icon size={20} /></div>
      </div>
      <p className="mt-3 text-sm text-neutral-500">{detail}</p>
    </Card>
  );
}

function BreakdownCard({
  title,
  rows,
  money,
  onIconChange,
}: {
  title: string;
  rows: Array<{ id?: string | null; name: string; amount: number; count: number; iconId?: string | null }>;
  money: (value: number) => string;
  onIconChange: (id: string, iconId: string | null) => void;
}) {
  const total = rows.reduce((sum, row) => sum + row.amount, 0);
  return (
    <Card>
      <SectionHeader title={title} meta={money(total)} />
      {rows.length ? (
        <div className="space-y-3">
          {rows.map((row, index) => (
            <ProgressRow
              key={`${row.name}-${index}`}
              label={
                <span className="flex min-w-0 items-center gap-1.5">
                  {row.id ? (
                    <IconPicker
                      bare
                      compact
                      iconId={row.iconId ?? null}
                      onChange={(iconId) => onIconChange(row.id as string, iconId)}
                      className="h-6 w-6 shrink-0 rounded-none border-0 bg-transparent hover:bg-transparent"
                      iconClassName="!h-6 !w-6 !rounded-none !border-0 !bg-transparent !text-xl"
                    />
                  ) : (
                    <span className="flex h-6 w-6 shrink-0 items-center justify-center text-xs text-neutral-500">
                      {row.name.slice(0, 1).toUpperCase()}
                    </span>
                  )}
                  <span className="truncate">{row.name}</span>
                </span>
              }
              value={money(row.amount)}
              subValue={`${row.count} ${row.count === 1 ? 'transaction' : 'transactions'}`}
              amount={row.amount}
              max={Math.max(...rows.map((item) => item.amount), 1)}
              color={COLORS[index % COLORS.length]}
            />
          ))}
        </div>
      ) : <EmptyState text="No data in period" />}
    </Card>
  );
}

function ProgressRow({ label, value, subValue, amount, max, color }: { label: ReactNode; value: string; subValue: string; amount: number; max: number; color: string }) {
  const width = max > 0 ? Math.max(4, Math.min(100, (amount / max) * 100)) : 0;
  return (
    <div className="rounded-lg border border-neutral-800 bg-neutral-950 px-3 py-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="min-w-0 font-medium text-white">{label}</div>
          <div className="mt-0.5 text-sm text-neutral-500">{subValue}</div>
        </div>
        <div className="shrink-0 font-semibold text-neutral-100">{value}</div>
      </div>
      <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-neutral-800">
        <div className="h-full rounded-full" style={{ width: `${width}%`, backgroundColor: color }} />
      </div>
    </div>
  );
}

function campaignKpiStatus(campaign: AdCampaign): AdCampaignKpiStatus {
  const cpa = nullableNumber(campaign.cpa);
  const channel = campaign.telegramChannel;
  if (cpa == null || !channel) return 'unknown';

  const targetFrom = nullableNumber(channel.targetCpaFrom);
  const targetTo = nullableNumber(channel.targetCpa);
  const acceptableFrom = nullableNumber(channel.acceptableCpaFrom);
  const acceptableTo = nullableNumber(channel.acceptableCpa);
  const stopFrom = nullableNumber(channel.stopCpaFrom) ?? nullableNumber(channel.stopCpa);

  if (
    targetFrom == null &&
    targetTo == null &&
    acceptableFrom == null &&
    acceptableTo == null &&
    stopFrom == null
  ) {
    return 'unknown';
  }

  if (valueInRange(cpa, targetFrom, targetTo)) return 'good';
  if (valueInRange(cpa, acceptableFrom, acceptableTo)) return 'acceptable';
  if (valueInRange(cpa, stopFrom, null)) return 'bad';
  return 'unknown';
}

function campaignKpiRowClass(status?: AdCampaignKpiStatus | null) {
  if (status === 'good') return 'bg-emerald-950/10';
  if (status === 'acceptable') return 'bg-yellow-950/10';
  if (status === 'bad') return 'bg-rose-950/15';
  return '';
}

function campaignCpaBadgeClass(status?: AdCampaignKpiStatus | null) {
  if (status === 'good') return 'border-emerald-700/80 bg-emerald-950/40 text-emerald-200';
  if (status === 'acceptable') return 'border-yellow-700/80 bg-yellow-950/40 text-yellow-200';
  if (status === 'bad') return 'border-rose-700/80 bg-rose-950/40 text-rose-200';
  return 'border-neutral-700 bg-neutral-900/40 text-neutral-200';
}

function CampaignTable({ title, rows, money }: { title: string; rows: AdCampaign[]; money: (value: number | string | null | undefined) => string }) {
  return (
    <Card>
      <SectionHeader title={title} />
      {rows.length ? (
        <div className="table-scroll w-full">
          <Table>
            <thead>
              <tr className="text-neutral-400"><th>Campaign</th><th>Joined</th><th>CPA</th><th>Spend</th></tr>
            </thead>
            <tbody>
              {rows.map((row) => {
                const kpiStatus = campaignKpiStatus(row);
                return (
                  <tr key={row.id} className={`border-t border-neutral-800 ${campaignKpiRowClass(kpiStatus)}`}>
                    <td className="max-w-[280px] py-2 pr-3">
                      <div className="flex min-w-0 items-center gap-2">
                        <AvatarBadge imageUrl={row.telegramChannel?.photoUrl} label={row.telegramChannel?.title ?? row.title} />
                        <div className="min-w-0">
                          <div className="truncate font-medium text-white">{row.title}</div>
                          <div className="truncate text-xs text-neutral-500">{row.telegramChannel?.title ?? row.status}</div>
                        </div>
                      </div>
                    </td>
                    <td>{n(row.joinedCount)}</td>
                    <td>
                      {row.cpa == null ? '-' : (
                        <span className={`inline-flex min-w-[72px] justify-center rounded border px-2 py-1 ${campaignCpaBadgeClass(kpiStatus)}`}>
                          {money(row.cpa)}
                        </span>
                      )}
                    </td>
                    <td>{money(row.priceInPrimaryCurrency)}</td>
                  </tr>
                );
              })}
            </tbody>
          </Table>
        </div>
      ) : <EmptyState text="No campaigns" />}
    </Card>
  );
}

function AvatarBadge({ imageUrl, label }: { imageUrl?: string | null; label: string }) {
  if (imageUrl) {
    return <img src={imageUrl} alt="" className="h-7 w-7 shrink-0 rounded-md object-cover" />;
  }

  return (
    <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-neutral-900 text-xs font-semibold text-neutral-300">
      {label.trim().slice(0, 1).toUpperCase() || '?'}
    </span>
  );
}

function MiniStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-neutral-800 bg-neutral-900 px-3 py-2">
      <div className="text-xs text-neutral-500">{label}</div>
      <div className="mt-1 font-semibold text-white">{value}</div>
    </div>
  );
}

function ChartTooltip({ active, payload, label, money }: ChartTooltipProps) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-lg border border-neutral-700 bg-neutral-950 px-3 py-2 text-sm shadow-xl">
      <div className="mb-1 font-semibold text-white">{label}</div>
      {payload.map((item) => (
        <div key={item.dataKey} className="flex items-center justify-between gap-5 text-neutral-300">
          <span style={{ color: item.color }}>{item.name || item.dataKey}</span>
          <span>{['income', 'expenses', 'profit', 'adSpend'].includes(item.dataKey) ? money(item.value) : n(item.value)}</span>
        </div>
      ))}
    </div>
  );
}
