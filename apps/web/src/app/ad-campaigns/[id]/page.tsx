'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useEffect } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { RotateCw, Save } from 'lucide-react';
import { AppShell } from '@/components/layout/app-shell';
import { Button, Card, FormField, Input, LoadingState, PageHeader, Textarea } from '@/components/ui/primitives';
import { adCampaignsApi, currenciesApi, type AdCampaignAnalyticsInput } from '@/lib/api';
import { formatMoney } from '@/lib/money';
import { useAppToast } from '@/providers/toast-provider';

function toNumber(value: unknown) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function formatNumber(value: unknown, decimals = 0) {
  const parsed = toNumber(value);
  if (parsed == null) return '-';
  return parsed.toLocaleString(undefined, { maximumFractionDigits: decimals, minimumFractionDigits: decimals });
}

function formatPercent(value: unknown) {
  const parsed = toNumber(value);
  if (parsed == null) return '-';
  return `${formatNumber(parsed, 1)}%`;
}

function formatDateTime(value?: string | null) {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '-';
  return date.toLocaleString();
}

function statusClass(status?: string | null) {
  if (status === 'good') return 'border-emerald-700 text-emerald-200';
  if (status === 'acceptable') return 'border-yellow-700 text-yellow-200';
  if (status === 'bad') return 'border-rose-700 text-rose-200';
  return 'border-slate-700 text-slate-300';
}

function errorMessage(error: unknown, fallback: string) {
  const message = (error as any)?.response?.data?.message;
  if (Array.isArray(message)) return message.join(', ');
  return typeof message === 'string' && message.trim() ? message : fallback;
}

const numberFields: Array<{ name: keyof AdCampaignAnalyticsInput; label: string }> = [
  { name: 'subscribersBefore', label: 'Subscribers before' },
  { name: 'avgViewsBefore', label: 'Avg views before' },
  { name: 'avgReactionsBefore', label: 'Avg reactions before' },
  { name: 'subscribersAfter24h', label: 'Subscribers after 24h' },
  { name: 'subscribersAfter48h', label: 'Subscribers after 48h' },
  { name: 'subscribersAfter72h', label: 'Subscribers after 72h' },
  { name: 'subscribersAfter7d', label: 'Subscribers after 7d' },
  { name: 'subscribersAfter30d', label: 'Subscribers after 30d' },
  { name: 'avgViewsAfter', label: 'Avg views after' },
  { name: 'avgReactionsAfter', label: 'Avg reactions after' },
  { name: 'clicksAfter', label: 'Clicks after' },
];

export default function AdCampaignDetailPage() {
  const params = useParams<{ id: string }>();
  const id = params.id;
  const queryClient = useQueryClient();
  const { pushToast } = useAppToast();
  const { register, handleSubmit, reset } = useForm<AdCampaignAnalyticsInput>();

  const { data: currencySettings } = useQuery({ queryKey: ['currency-settings'], queryFn: currenciesApi.getSettings });
  const { data: campaign, isLoading, error } = useQuery({
    queryKey: ['ad-campaign', id],
    queryFn: () => adCampaignsApi.get(id),
  });

  const resetForm = (row: any) => {
    reset({
      subscribersBefore: row.subscribersBefore ?? undefined,
      avgViewsBefore: row.avgViewsBefore ?? undefined,
      avgReactionsBefore: row.avgReactionsBefore ?? undefined,
      subscribersAfter24h: row.subscribersAfter24h ?? undefined,
      subscribersAfter48h: row.subscribersAfter48h ?? undefined,
      subscribersAfter72h: row.subscribersAfter72h ?? undefined,
      subscribersAfter7d: row.subscribersAfter7d ?? undefined,
      subscribersAfter30d: row.subscribersAfter30d ?? undefined,
      avgViewsAfter: row.avgViewsAfter ?? undefined,
      avgReactionsAfter: row.avgReactionsAfter ?? undefined,
      clicksAfter: row.clicksAfter ?? undefined,
      analyticsNotes: row.analyticsNotes ?? '',
      excludeFromAnalytics: Boolean(row.excludeFromAnalytics),
    });
  };

  useEffect(() => {
    if (campaign) resetForm(campaign);
  }, [campaign?.id]);

  const saveMutation = useMutation({
    mutationFn: (payload: AdCampaignAnalyticsInput) => adCampaignsApi.updateAnalyticsInput(id, payload),
    onSuccess: (next) => {
      queryClient.setQueryData(['ad-campaign', id], next);
      queryClient.invalidateQueries({ queryKey: ['ad-campaigns'] });
      queryClient.invalidateQueries({ queryKey: ['ad-campaigns-performance'] });
      resetForm(next);
      pushToast('Analytics input saved.', 'success');
    },
    onError: (err) => pushToast(errorMessage(err, 'Failed to save analytics input.'), 'error'),
  });
  const recalcMutation = useMutation({
    mutationFn: () => adCampaignsApi.recalculateAnalytics(id),
    onSuccess: (next) => {
      queryClient.setQueryData(['ad-campaign', id], next);
      queryClient.invalidateQueries({ queryKey: ['ad-campaigns'] });
      resetForm(next);
      pushToast('Campaign analytics recalculated.', 'success');
    },
    onError: (err) => pushToast(errorMessage(err, 'Failed to recalculate campaign.'), 'error'),
  });

  const submit = (values: AdCampaignAnalyticsInput) => {
    const payload: AdCampaignAnalyticsInput = {
      analyticsNotes: values.analyticsNotes || null,
      excludeFromAnalytics: Boolean(values.excludeFromAnalytics),
    };
    for (const field of numberFields) {
      const value = toNumber(values[field.name]);
      payload[field.name] = value as never;
    }
    saveMutation.mutate(payload);
  };

  return (
    <AppShell>
      <PageHeader
        title={campaign?.title || 'Ad Campaign'}
        subtitle={campaign?.telegramChannel?.title || 'Campaign analytics'}
        action={<Link href="/ad-campaigns" className="rounded-lg border border-slate-700 px-4 py-2 text-sm text-slate-200 hover:bg-slate-800">Back</Link>}
      />
      {isLoading ? <LoadingState /> : null}
      {error ? <div className="rounded-lg border border-rose-700 p-3 text-sm text-rose-200">Failed to load campaign.</div> : null}
      {campaign ? (
        <div className="space-y-4">
          <Card>
            <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
              <div>
                <div className="mb-2 flex flex-wrap items-center gap-2">
                  <span className={`rounded border px-2 py-0.5 text-xs ${statusClass(campaign.overallStatus)}`}>{campaign.overallStatus || 'unknown'}</span>
                  {campaign.excludeFromAnalytics ? <span className="rounded border border-slate-700 px-2 py-0.5 text-xs text-slate-300">Excluded</span> : null}
                </div>
                <p className="text-sm text-slate-300">{campaign.decisionText || 'Not enough data yet.'}</p>
              </div>
              <div className="text-sm text-slate-400">
                <p>Cost: {formatMoney(Number(campaign.price || 0), campaign.currency, currencySettings?.currencyDisplayMode)}</p>
                <p>Primary: {formatMoney(Number(campaign.priceInPrimaryCurrency || 0), currencySettings?.primaryCurrency || campaign.currency, currencySettings?.currencyDisplayMode)}</p>
              </div>
            </div>
          </Card>

          <section className="grid grid-cols-1 gap-4 xl:grid-cols-3">
            <MetricCard title="New subscribers" value={formatNumber(campaign.newSubscribers)} />
            <MetricCard title="Active subscribers from ad" value={formatNumber(campaign.activeSubscribersFromAd)} />
            <MetricCard title="CPA" value={formatMoneyValue((campaign as any).cpa ?? campaign.analytics?.costPerJoinedSubscriber, currencySettings?.primaryCurrency || campaign.currency)} />
            <MetricCard title="Active CPA" value={formatMoneyValue(campaign.activeCpa, currencySettings?.primaryCurrency || campaign.currency)} />
            <MetricCard title="Active rate" value={formatPercent(campaign.activeRate)} />
            <MetricCard title="Retention 7d" value={formatPercent(campaign.retention7d)} />
          </section>

          <Card>
            <h3 className="mb-3 text-lg font-semibold">Analytics input</h3>
            <form className="space-y-4" onSubmit={handleSubmit(submit)}>
              <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
                {numberFields.map((field) => (
                  <FormField key={field.name} label={field.label}>
                    <Input type="number" min={0} step="1" {...register(field.name, { valueAsNumber: true })} />
                  </FormField>
                ))}
              </div>
              <FormField label="Notes">
                <Textarea rows={3} {...register('analyticsNotes')} />
              </FormField>
              <label className="flex cursor-pointer items-center gap-2 text-sm text-slate-300">
                <input type="checkbox" {...register('excludeFromAnalytics')} />
                Exclude from analytics
              </label>
              <div className="flex flex-wrap justify-end gap-2">
                <Button type="button" variant="secondary" disabled={recalcMutation.isPending} onClick={() => recalcMutation.mutate()}>
                  <span className="inline-flex items-center gap-2"><RotateCw size={16} /> {recalcMutation.isPending ? 'Recalculating...' : 'Recalculate'}</span>
                </Button>
                <Button type="submit" disabled={saveMutation.isPending}>
                  <span className="inline-flex items-center gap-2"><Save size={16} /> {saveMutation.isPending ? 'Saving...' : 'Save input'}</span>
                </Button>
              </div>
            </form>
          </Card>

          <section className="grid grid-cols-1 gap-4 xl:grid-cols-2">
            <Card>
              <h3 className="mb-3 text-lg font-semibold">Statuses</h3>
              <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                <StatusItem label="CPA status" status={campaign.cpaStatus} />
                <StatusItem label="Active CPA status" status={campaign.activeCpaStatus} />
                <StatusItem label="Retention status" status={campaign.retentionStatus} />
                <StatusItem label="Overall status" status={campaign.overallStatus} />
              </div>
            </Card>
            <Card>
              <h3 className="mb-3 text-lg font-semibold">Sync metadata</h3>
              <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                <MetricCard title="Calculated" value={formatDateTime(campaign.analyticsLastCalculatedAt)} compact />
                <MetricCard title="Auto synced" value={formatDateTime(campaign.analyticsLastAutoSyncedAt)} compact />
                <MetricCard title="Manual synced" value={formatDateTime(campaign.analyticsLastManualSyncedAt)} compact />
                <MetricCard title="Clicks after" value={formatNumber(campaign.clicksAfter)} compact />
              </div>
            </Card>
          </section>

          <Card>
            <h3 className="mb-2 text-lg font-semibold">Formulas</h3>
            <div className="grid gap-2 text-sm text-slate-300 md:grid-cols-2">
              <p>New subscribers = subscribers after 24h - subscribers before.</p>
              <p>Active subscribers from ad = avg views after - avg views before.</p>
              <p>CPA = campaign cost / new subscribers.</p>
              <p>Active CPA = campaign cost / active subscribers from ad.</p>
              <p>Active rate = active subscribers from ad / new subscribers.</p>
              <p>Retention 7d = subscribers after 7d / subscribers after 24h.</p>
            </div>
          </Card>
        </div>
      ) : null}
    </AppShell>
  );
}

function formatMoneyValue(value: unknown, currency: string) {
  const parsed = toNumber(value);
  if (parsed == null) return '-';
  return `${formatNumber(parsed, 2)} ${currency}`;
}

function MetricCard({ title, value, compact = false }: { title: string; value: string; compact?: boolean }) {
  return (
    <Card>
      <p className="text-xs text-slate-400">{title}</p>
      <p className={compact ? 'mt-1 font-semibold' : 'mt-1 text-2xl font-semibold'}>{value}</p>
    </Card>
  );
}

function StatusItem({ label, status }: { label: string; status?: string | null }) {
  return (
    <div className="rounded-lg border border-slate-800 bg-slate-950/40 p-3">
      <p className="text-xs text-slate-400">{label}</p>
      <span className={`mt-2 inline-flex rounded border px-2 py-0.5 text-xs ${statusClass(status)}`}>{status || 'unknown'}</span>
    </div>
  );
}
