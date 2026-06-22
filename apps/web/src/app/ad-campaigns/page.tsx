'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { AppShell } from '@/components/layout/app-shell';
import { accountsApi, adCampaignsApi, advertisingChannelsApi, getTelegramChannelInviteLinks, getTelegramChannelPromos, telegramChannelsApi, telegramSyncApi, workspacesApi, type Account } from '@/lib/api';
import { currenciesApi } from '@/lib/api';
import { formatMoney, getMoneyVariants } from '@/lib/money';
import { MoneyStack } from '@/components/ui/money-stack';
import { Button, Card, ConfirmDeleteModal, CustomSelect, DateInput, EmptyState, EntityCard, FormField, IconButton, Input, LoadingState, Modal, PageHeader, Select, Textarea } from '@/components/ui/primitives';
import { useAppToast } from '@/providers/toast-provider';

type CampaignValues = {
  telegramChannelId: string;
  promoId: string;
  telegramInviteLinkId: string;
  advertisingChannelIds: string[];
  price: number;
  accountId: string;
  date?: string;
  notes?: string;
};

function formatLocalDate(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function toInputDate(value?: string | Date | null) {
  if (!value) return '';
  if (typeof value === 'string') {
    const m = value.match(/^(\d{4}-\d{2}-\d{2})/);
    if (m) return m[1];
  }
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '';
  return formatLocalDate(d);
}

function accountSelectOption(account: Account) {
  return {
    value: account.id,
    label: `${account.name} (${account.currency})`,
    iconUrl: account.icon?.imageUrl ?? undefined,
    iconEmoji: account.icon?.emoji ?? undefined,
    iconFallback: account.name,
  };
}

export default function AdCampaignsPage() {
  const qc = useQueryClient();
  const { pushToast } = useAppToast();
  const [createOpen, setCreateOpen] = useState(false);
  const [editing, setEditing] = useState<any | null>(null);
  const [deleting, setDeleting] = useState<any | null>(null);
  const [channelFilter, setChannelFilter] = useState('');

  const { data: workspace } = useQuery({ queryKey: ['workspace-selected'], queryFn: workspacesApi.selected });
  const { data: currencySettings } = useQuery({ queryKey: ['currency-settings'], queryFn: currenciesApi.getSettings });
  const { data: rates } = useQuery({ queryKey: ['currency-rates'], queryFn: currenciesApi.listRates });
  const moneySettings = currencySettings ?? {
    primaryCurrency: workspace?.primaryCurrency || '',
    secondaryCurrency: workspace?.secondaryCurrency || '',
    currencyDisplayMode: workspace?.currencyDisplayMode || 'code',
  };
  const { data: channels } = useQuery({ queryKey: ['telegram-channels'], queryFn: telegramChannelsApi.list });
  const { data, isLoading, error } = useQuery({
    queryKey: ['ad-campaigns', channelFilter],
    queryFn: () => adCampaignsApi.list(channelFilter ? { telegramChannelId: channelFilter } : undefined),
  });
  const { data: performance } = useQuery({
    queryKey: ['ad-campaigns-performance', channelFilter],
    queryFn: () => adCampaignsApi.performanceSummary(channelFilter ? { channelId: channelFilter } : undefined),
  });
  const { data: syncRuns } = useQuery({
    queryKey: ['daily-analytics-runs'],
    queryFn: () => telegramSyncApi.dailyAnalyticsRuns(8),
  });

  const createMutation = useMutation({
    mutationFn: adCampaignsApi.create,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['ad-campaigns'] });
      setCreateOpen(false);
      pushToast('Campaign created.', 'success');
    },
    onError: (error) => pushToast(getErrorMessage(error, 'Failed to create campaign.'), 'error'),
  });
  const updateMutation = useMutation({
    mutationFn: ({ id, payload }: any) => adCampaignsApi.update(id, payload),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['ad-campaigns'] });
      setEditing(null);
      pushToast('Campaign updated.', 'success');
    },
    onError: (error) => pushToast(getErrorMessage(error, 'Failed to update campaign.'), 'error'),
  });
  const deleteMutation = useMutation({
    mutationFn: (id: string) => adCampaignsApi.remove(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['ad-campaigns'] });
      setDeleting(null);
      pushToast('Campaign archived.', 'success');
    },
    onError: (error) => pushToast(getErrorMessage(error, 'Failed to archive campaign.'), 'error'),
  });
  const syncMutation = useMutation({
    mutationFn: telegramSyncApi.runDailyAnalytics,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['ad-campaigns'] });
      qc.invalidateQueries({ queryKey: ['ad-campaigns-performance'] });
      qc.invalidateQueries({ queryKey: ['daily-analytics-runs'] });
      pushToast('Daily analytics sync finished.', 'success');
    },
    onError: (error) => pushToast(getErrorMessage(error, 'Daily analytics sync failed.'), 'error'),
  });
  const excludeMutation = useMutation({
    mutationFn: ({ id, excludeFromAnalytics }: { id: string; excludeFromAnalytics: boolean }) =>
      adCampaignsApi.updateAnalyticsInput(id, { excludeFromAnalytics }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['ad-campaigns'] });
      qc.invalidateQueries({ queryKey: ['ad-campaigns-performance'] });
    },
    onError: (error) => pushToast(getErrorMessage(error, 'Failed to update analytics flag.'), 'error'),
  });

  return <AppShell><PageHeader title="Ad Campaigns" subtitle="Track ad spend by own channel, promo link and external advertising channels" action={<div className="flex gap-2"><Link href="/ad-hypotheses" className="rounded-lg border border-slate-700 px-4 py-2 text-sm text-slate-200 hover:bg-slate-800">Hypotheses</Link><Button onClick={() => setCreateOpen(true)}>Create</Button></div>} />
    {(channels?.length ?? 0) > 1 ? <Card className="mb-4"><FormField label="Channel"><Select value={channelFilter} onChange={(e) => setChannelFilter(e.target.value)}><option value="">All channels</option>{channels?.map((channel: any) => <option key={channel.id} value={channel.id}>{channel.title}</option>)}</Select></FormField></Card> : null}
    <Card className="mb-4">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <h3 className="text-lg font-semibold">Performance summary</h3>
          <div className="mt-3 grid grid-cols-2 gap-3 text-sm md:grid-cols-4 xl:grid-cols-8">
            <SummaryItem label="Campaigns" value={formatMetric(performance?.campaignsCount)} />
            <SummaryItem label="Spend" value={formatMoney(performance?.totalSpend || 0, moneySettings.primaryCurrency || '', currencySettings?.currencyDisplayMode)} />
            <SummaryItem label="New subs" value={formatMetric(performance?.totalNewSubscribers)} />
            <SummaryItem label="Active from ads" value={formatMetric(performance?.totalActiveSubscribersFromAd)} />
            <SummaryItem label="Avg CPA" value={formatMetric(performance?.avgCpa, 2)} />
            <SummaryItem label="Active CPA" value={formatMetric(performance?.avgActiveCpa, 2)} />
            <SummaryItem label="Active rate" value={formatPercent(performance?.avgActiveRate)} />
            <SummaryItem label="Retention 7d" value={formatPercent(performance?.avgRetention7d)} />
            <SummaryItem label="Normal data" value={formatMetric(performance?.normalDataCount)} />
            <SummaryItem label="Suspicious" value={formatMetric(performance?.suspiciousCount)} />
            <SummaryItem label="Anomalous" value={formatMetric(performance?.anomalousCount)} />
            <SummaryItem label="Polluted" value={formatMetric(performance?.pollutedCount)} />
          </div>
        </div>
        <div className="min-w-56 rounded-lg border border-slate-800 bg-slate-950/40 p-3 text-sm">
          <p className="text-slate-400">Daily analytics sync</p>
          <p className="mt-1 font-medium">{performance?.lastDailyAnalyticsSync?.startedAt ? new Date(performance.lastDailyAnalyticsSync.startedAt).toLocaleString() : 'No runs yet'}</p>
          <p className="mt-1 text-xs text-slate-400">Status: {performance?.lastDailyAnalyticsSync?.status || '-'}</p>
          <Button className="mt-3 w-full" type="button" disabled={syncMutation.isPending} onClick={() => syncMutation.mutate()}>
            {syncMutation.isPending ? 'Syncing...' : 'Run sync'}
          </Button>
        </div>
      </div>
      {syncRuns?.length ? (
        <div className="mt-4 border-t border-slate-800 pt-3">
          <p className="mb-2 text-sm font-medium text-slate-200">Recent sync runs</p>
          <div className="grid grid-cols-[repeat(auto-fit,minmax(min(220px,100%),1fr))] gap-2 text-xs text-slate-300">
            {syncRuns.map((run) => (
              <div key={run.id} className="rounded-lg border border-slate-800 bg-slate-950/40 p-2">
                <p className="font-medium">{new Date(run.startedAt).toLocaleString()}</p>
                <p className="text-slate-400">{run.status} · {run.source}</p>
                <p className="text-slate-400">Channels {run.channelsProcessed} · Campaigns {run.campaignsProcessed}</p>
              </div>
            ))}
          </div>
        </div>
      ) : null}
    </Card>
    {isLoading ? <LoadingState /> : null}{error ? <div className="text-red-300">Failed to load campaigns</div> : null}
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">{data?.map((c: any) => {
      const net = (c.analytics?.netGrowth ?? c.netGrowthCount ?? 0);
      const joined = (c.analytics?.joinedCount ?? c.joinedCount ?? 0);
      const left = (c.analytics?.leftCount ?? c.leftCount ?? 0);
      const cost = Number(c.price || c.costAmount || 0);
      const primaryCost = Number(c.priceInPrimaryCurrency ?? 0);
      const costPerJoined = joined > 0 ? cost / joined : null;
      const primaryCostPerJoined = joined > 0 ? primaryCost / joined : null;
      const day = toInputDate(c?.placementDate || c?.startedAt || c?.createdAt) || '-';
      const costVariants = getMoneyVariants({ amount: cost, currency: c.currency, settings: moneySettings, rates, amountInPrimary: primaryCost });
      const costLabel = [formatMoney(cost, c.currency, currencySettings?.currencyDisplayMode), ...costVariants.map((variant) => variant.amount == null ? 'Rate missing' : variant.label)].join(' / ');
      const cardTitle = `${day} | ${costLabel} | ${joined} subscribers`;
      return <EntityCard key={c.id} title={cardTitle} actions={<div className="flex gap-2"><Link href={`/ad-campaigns/${c.id}`} className="rounded-lg border border-slate-700 px-3 py-2 text-sm text-slate-200 hover:bg-slate-800">Open</Link><IconButton onClick={() => setEditing(c)} /><IconButton kind="delete" onClick={() => setDeleting(c)} /></div>}>
        <div className="mb-1 inline-flex items-center gap-2 py-1 text-sm text-neutral-200">
          {c.telegramChannel?.photoUrl ? <img src={c.telegramChannel.photoUrl} alt="" className="h-5 w-5 rounded-full" /> : <span className="inline-block h-5 w-5 rounded-full border border-neutral-600" />}
          <span>{c.telegramChannel?.title || '-'}</span>
        </div>
        {(c.hypothesisLinks || []).length ? (
          <div className="mb-2 flex flex-wrap gap-2">
            {(c.hypothesisLinks || []).map((link: any) => (
              <Link
                key={link.hypothesis.id}
                href={`/ad-hypotheses/${link.hypothesis.id}`}
                className={`inline-flex rounded-full border px-2 py-0.5 text-xs ${hypothesisStatusClass(link.hypothesis.status)}`}
              >
                {link.hypothesis.name} · {link.hypothesis.status}
              </Link>
            ))}
          </div>
        ) : null}
        <div className="mb-2 ml-0 pl-0">
          <p className="mb-1 text-xs uppercase tracking-wide text-neutral-400">Advertising Sources</p>
          <div className="ml-0 flex flex-wrap gap-2 pl-0">
            {(c.advertisingChannels || []).length
              ? (c.advertisingChannels || []).map((ch: any) => (
                  <span key={ch.id} className="inline-flex items-center gap-1.5 rounded-full bg-neutral-900/70 px-2 py-1 text-xs text-neutral-200">
                    {ch.photoUrl || ch.imageUrl ? <img src={ch.photoUrl || ch.imageUrl} alt="" className="h-4 w-4 rounded-full" /> : <span className="inline-block h-4 w-4 rounded-full border border-neutral-600" />}
                    <span>{ch.title || ch.name}</span>
                  </span>
                ))
              : <span className="text-sm text-neutral-400">-</span>}
          </div>
        </div>
        <div className="mt-2">
          <p className="text-xs uppercase tracking-wide text-neutral-400">Cost</p>
          <MoneyStack amount={cost} currency={c.currency} settings={moneySettings} rates={rates} amountInPrimary={primaryCost} mainClassName="font-semibold text-white" subClassName="text-sm text-neutral-400" />
        </div>
        {left > 0 ? <p>Joined: {joined} | Left: {left} | Net: {net}</p> : <p className="text-emerald-300">Joined: {joined}</p>}
        <div className="mt-3 grid grid-cols-2 gap-2 text-sm md:grid-cols-4">
          <MiniMetric label="New subs" value={formatMetric(c.newSubscribers)} />
          <MiniMetric label="Active" value={formatMetric(c.cappedActiveSubscribersFromAd ?? c.activeSubscribersFromAd)} />
          <MiniMetric label="Raw uplift" value={formatMetric(c.rawActiveSubscribersFromAd)} />
          <MiniMetric label="Active CPA" value={formatMetric(c.cappedActiveCpa ?? c.activeCpa, 2)} />
          <MiniMetric label="Retention 7d" value={formatPercent(c.retention7d)} />
        </div>
        <div className="mt-3 flex items-center justify-between gap-3 rounded-lg border border-slate-800 bg-slate-950/30 px-3 py-2 text-sm">
          <div className="flex items-center gap-2">
            <span className={`rounded border px-2 py-0.5 text-xs ${campaignStatusClass(c.overallStatus)}`}>{c.overallStatus || 'unknown'}</span>
            {c.adDataQuality ? (
              <span className={`rounded border px-2 py-0.5 text-xs ${campaignQualityClass(c.adDataQuality)}`}>{c.adDataQuality}</span>
            ) : null}
          </div>
          <label className="flex cursor-pointer items-center gap-2 text-slate-300">
            <input
              type="checkbox"
              checked={Boolean(c.excludeFromAnalytics)}
              onChange={(event) => excludeMutation.mutate({ id: c.id, excludeFromAnalytics: event.target.checked })}
            />
            Exclude
          </label>
        </div>
        {c.adDataQualityWarning ? (
          <div className="mt-3 rounded-lg border border-amber-700 bg-amber-950/30 px-3 py-2 text-sm text-amber-100">
            {c.adDataQualityWarning}
          </div>
        ) : null}
        <div>
          <p className="text-xs uppercase tracking-wide text-neutral-400">Cost / subscriber</p>
          {costPerJoined !== null ? (
            <MoneyStack amount={costPerJoined} currency={c.currency} settings={moneySettings} rates={rates} amountInPrimary={primaryCostPerJoined} mainClassName="font-medium text-white" subClassName="text-sm text-neutral-400" />
          ) : (
            <p>-</p>
          )}
        </div>
      </EntityCard>;
    })}</div>
    {!isLoading && !data?.length ? <EmptyState text="No campaigns" /> : null}

    <CampaignModal open={createOpen} title="Create Campaign" channels={channels ?? []} onClose={() => setCreateOpen(false)} onSubmit={(v: any) => createMutation.mutate(v)} />
    <CampaignModal open={!!editing} title="Edit Campaign" channels={channels ?? []} initial={editing ?? undefined} onClose={() => setEditing(null)} onSubmit={(v: any) => editing && updateMutation.mutate({ id: editing.id, payload: v })} />
    <ConfirmDeleteModal open={!!deleting} entityName={deleting?.title ?? 'campaign'} onClose={() => setDeleting(null)} onConfirm={() => deleting && deleteMutation.mutate(deleting.id)} label="Archive" />
  </AppShell>;
}

function formatMetric(value: unknown, decimals = 0) {
  if (value == null || !Number.isFinite(Number(value))) return '-';
  return Number(value).toLocaleString(undefined, { maximumFractionDigits: decimals, minimumFractionDigits: decimals });
}

function formatPercent(value: unknown, decimals = 1) {
  if (value == null || !Number.isFinite(Number(value))) return '-';
  return `${formatMetric(value, decimals)}%`;
}

function SummaryItem({ label, value }: { label: string; value: string }) {
  return <div className="rounded-lg border border-slate-800 bg-slate-950/40 p-3"><p className="text-xs text-slate-400">{label}</p><p className="mt-1 font-semibold text-white">{value}</p></div>;
}

function MiniMetric({ label, value }: { label: string; value: string }) {
  return <div className="rounded-lg border border-slate-800 bg-slate-950/30 p-2"><p className="text-xs text-slate-400">{label}</p><p className="font-medium text-white">{value}</p></div>;
}

function campaignStatusClass(status?: string | null) {
  if (status === 'good') return 'border-emerald-700 text-emerald-200';
  if (status === 'acceptable') return 'border-yellow-700 text-yellow-200';
  if (status === 'bad') return 'border-rose-700 text-rose-200';
  return 'border-slate-700 text-slate-300';
}

function campaignQualityClass(status?: string | null) {
  if (status === 'normal') return 'border-emerald-700 text-emerald-200';
  if (status === 'borderline') return 'border-yellow-700 text-yellow-200';
  if (status === 'suspicious') return 'border-amber-700 text-amber-200';
  if (status === 'anomalous' || status === 'invalid') return 'border-rose-700 text-rose-200';
  return 'border-slate-700 text-slate-300';
}

function hypothesisStatusClass(status?: string) {
  if (status === 'winner') return 'border-emerald-700 text-emerald-200';
  if (status === 'loser') return 'border-rose-700 text-rose-200';
  if (status === 'paused') return 'border-yellow-700 text-yellow-200';
  if (status === 'archived') return 'border-slate-700 text-slate-400';
  return 'border-blue-700 text-blue-200';
}

function getErrorMessage(error: unknown, fallback: string) {
  const responseMessage = (error as any)?.response?.data?.message;
  if (Array.isArray(responseMessage)) return responseMessage.join(', ');
  if (typeof responseMessage === 'string' && responseMessage.trim()) return responseMessage;
  return fallback;
}

function MultiChannelSelect({ value, onChange, options }: { value: string[]; onChange: (v: string[]) => void; options: any[] }) {
  const [open, setOpen] = useState(false);
  const selected = options.filter((o) => value.includes(o.selectionId));

  const toggle = (selectionId: string) => {
    if (value.includes(selectionId)) onChange(value.filter((x) => x !== selectionId));
    else onChange([...value, selectionId]);
  };

  return (
    <div className="relative">
      <button type="button" onClick={() => setOpen((v) => !v)} className="flex min-h-11 w-full flex-wrap items-center gap-2 rounded-lg border border-neutral-700 bg-neutral-900 px-3 py-2 text-left text-sm text-white">
        {selected.length ? selected.map((s) => <span key={s.selectionId} className="inline-flex items-center gap-1 rounded-full border border-neutral-600 px-2 py-0.5 text-xs">{s.photoUrl || s.imageUrl ? <img src={s.photoUrl || s.imageUrl} className="h-4 w-4 rounded-full" alt="" /> : null}{s.title}</span>) : <span className="text-neutral-400">Select sources</span>}
      </button>
      {open ? <div className="absolute z-50 mt-1 max-h-56 w-full overflow-auto rounded-lg border border-neutral-700 bg-neutral-900 p-1">{options.map((o) => <button type="button" key={o.selectionId} onClick={() => toggle(o.selectionId)} className="flex w-full items-center gap-2 rounded px-2 py-2 text-left text-sm text-neutral-200 hover:bg-neutral-800">{o.photoUrl || o.imageUrl ? <img src={o.photoUrl || o.imageUrl} className="h-5 w-5 rounded-full" alt="" /> : <span className="inline-flex h-5 w-5 items-center justify-center rounded-full border border-neutral-600 text-[10px]">{String(o.title || '?').slice(0, 1).toUpperCase()}</span>}<span className="flex-1">{o.title}</span><span className="text-xs text-neutral-500">{o.label}</span><span>{value.includes(o.selectionId) ? '✓' : ''}</span></button>)}</div> : null}
    </div>
  );
}

function CampaignModal({ open, onClose, onSubmit, title, initial, channels }: any) {
  const mapInitialValues = (row?: any): CampaignValues => row
    ? {
        telegramChannelId: row.telegramChannelId ?? '',
        promoId: row.promoId ?? '',
        telegramInviteLinkId: row.telegramInviteLinkId ?? '',
        advertisingChannelIds: (row.advertisingChannels || []).map((x: any) => x.selectionId || (x.sourceKind === 'person' ? `source:${x.id}` : `channel:${x.id}`)),
        price: Number(row.price ?? row.costAmount ?? 0),
        accountId: row.accountId ?? '',
        date: toInputDate(row.placementDate || row.startedAt),
        notes: row.notes ?? '',
      }
    : { telegramChannelId: '', promoId: '', telegramInviteLinkId: '', advertisingChannelIds: [], price: 0, accountId: '', date: formatLocalDate(new Date()), notes: '' };

  const { register, handleSubmit, watch, setValue, reset, formState: { errors } } = useForm<CampaignValues>({ defaultValues: mapInitialValues(initial) });
  const selectedChannelId = watch('telegramChannelId');
  const selectedAdChannels = watch('advertisingChannelIds') || [];

  useEffect(() => {
    register('advertisingChannelIds');
  }, [register]);

  useEffect(() => {
    if (!open) return;
    reset(mapInitialValues(initial));
  }, [open, initial, reset]);

  useEffect(() => {
    if (!selectedChannelId) return;
    const ownChannelKeys = new Set([selectedChannelId, `channel:${selectedChannelId}`]);
    if (!selectedAdChannels.some((id) => ownChannelKeys.has(id))) return;
    setValue('advertisingChannelIds', selectedAdChannels.filter((id) => !ownChannelKeys.has(id)), { shouldValidate: true, shouldDirty: true });
  }, [selectedAdChannels, selectedChannelId, setValue]);

  const { data: promos } = useQuery({ queryKey: ['channel-promos', selectedChannelId], queryFn: () => getTelegramChannelPromos(selectedChannelId), enabled: !!selectedChannelId });
  const { data: inviteLinks } = useQuery({ queryKey: ['channel-invite-links', selectedChannelId], queryFn: () => getTelegramChannelInviteLinks(selectedChannelId), enabled: !!selectedChannelId });
  const { data: accounts } = useQuery({ queryKey: ['accounts'], queryFn: accountsApi.list });
  const { data: people } = useQuery({ queryKey: ['advertising-people'], queryFn: advertisingChannelsApi.list });

  const availablePromos = useMemo(() => promos ?? [], [promos]);
  const advertisingSources = useMemo(() => [
    ...(people || []).map((person: any) => ({
      ...person,
      selectionId: person.selectionId || `source:${person.id}`,
      label: 'Person',
    })),
    ...(channels || [])
      .filter((channel: any) => channel.id !== selectedChannelId)
      .map((channel: any) => {
        const isOwn = Array.isArray(channel.adminLinks) && channel.adminLinks.length > 0;
        return {
          ...channel,
          selectionId: `channel:${channel.id}`,
          label: isOwn ? 'Own channel' : 'External channel',
        };
      }),
  ], [channels, people, selectedChannelId]);

  return <Modal open={open} onClose={onClose} title={title}><form className="space-y-3" onSubmit={handleSubmit((v: any) => {
    onSubmit({ ...v, price: Number(v.price), advertisingChannelIds: v.advertisingChannelIds || [] });
  })}>
    <FormField label="Own Telegram Channel" required error={errors.telegramChannelId ? 'Required field' : undefined}>
      <CustomSelect
        value={watch('telegramChannelId')}
        onChange={(v) => { setValue('telegramChannelId', v, { shouldValidate: true, shouldDirty: true }); setValue('promoId', ''); setValue('telegramInviteLinkId', ''); }}
        placeholder="Select"
        options={channels.map((x: any) => ({ value: x.id, label: x.title, iconUrl: x.photoUrl }))}
      />
    </FormField>
    <FormField label="Promo / Invite Link" required error={errors.promoId ? 'Required field' : undefined}>
      <CustomSelect value={watch('promoId')} onChange={(v) => setValue('promoId', v, { shouldValidate: true, shouldDirty: true })} placeholder="Select promo" options={availablePromos.map((x: any) => ({ value: x.id, label: x.title }))} />
    </FormField>
    <FormField label="Invite Link" required error={errors.telegramInviteLinkId ? 'Required field' : undefined}>
      <CustomSelect value={watch('telegramInviteLinkId')} onChange={(v) => setValue('telegramInviteLinkId', v, { shouldValidate: true, shouldDirty: true })} placeholder="Select invite link" options={(inviteLinks || []).map((x: any) => ({ value: x.id, label: x.name }))} />
    </FormField>
    <FormField label="Advertising Sources" required error={errors.advertisingChannelIds ? 'Required field' : undefined}>
      <MultiChannelSelect value={selectedAdChannels.filter((id) => id !== `channel:${selectedChannelId}` && id !== selectedChannelId)} onChange={(next) => setValue('advertisingChannelIds', next, { shouldValidate: true, shouldDirty: true })} options={advertisingSources} />
    </FormField>
    <FormField label="Cost amount" required error={errors.price ? 'Required field' : undefined}><Input type="number" step="0.01" {...register('price', { valueAsNumber: true, required: true })} /></FormField>
    <FormField label="Account" required error={errors.accountId ? 'Required field' : undefined}>
      <CustomSelect value={watch('accountId')} onChange={(v) => setValue('accountId', v, { shouldValidate: true, shouldDirty: true })} placeholder="Select account" options={(accounts || []).map(accountSelectOption)} />
    </FormField>
    <FormField label="Date">
      <DateInput
        name="date"
        value={watch('date') || ''}
        onChange={(e) => setValue('date', e.target.value, { shouldDirty: true })}
      />
    </FormField>
    <FormField label="Notes"><Textarea {...register('notes')} /></FormField>
    <input type="hidden" {...register('telegramChannelId', { required: true })} />
    <input type="hidden" {...register('promoId', { required: true })} />
    <input type="hidden" {...register('telegramInviteLinkId', { required: true })} />
    <input type="hidden" {...register('accountId', { required: true })} />
    <div className="flex justify-end gap-2"><Button variant="secondary" type="button" onClick={onClose}>Cancel</Button><Button type="submit">Save</Button></div>
  </form></Modal>;
}
