'use client';

import type { ChangeEvent, ClipboardEvent, MouseEventHandler } from 'react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { AppShell } from '@/components/layout/app-shell';
import {
  accountsApi,
  adCampaignsApi,
  adHypothesesApi,
  advertisingChannelsApi,
  getTelegramChannelInviteLinks,
  getTelegramChannelPromos,
  promosApi,
  telegramChannelsApi,
  telegramSyncApi,
  workspacesApi,
  type Account,
  type AdCampaign,
  type AdCampaignKpiStatus,
  type AdHypothesis,
  type Promo,
  type TelegramChannel,
} from '@/lib/api';
import { currenciesApi } from '@/lib/api';
import { MoneyStack } from '@/components/ui/money-stack';
import { Button, Card, ConfirmDeleteModal, CustomSelect, DateInput, DateRangeInput, EmptyState, FormField, IconButton, Input, LoadingState, Modal, PageHeader, Select, Textarea } from '@/components/ui/primitives';
import { useAppToast } from '@/providers/toast-provider';
import { CircleHelp, RefreshCw } from 'lucide-react';
import { accountDisplayName } from '@/lib/account-display';

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

type AdCampaignsViewMode = 'campaigns' | 'promos' | 'hypotheses';

const AD_CAMPAIGNS_VIEW_MODE_STORAGE_KEY = 'ad-campaigns:view-mode';
const AD_CAMPAIGNS_VIEW_OPTIONS = [
  { value: 'campaigns', label: 'Campaigns', iconEmoji: '🎯' },
  { value: 'promos', label: 'Promos', iconEmoji: '📣' },
  { value: 'hypotheses', label: 'Hypotheses', iconEmoji: '🧪' },
];

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
    label: `${accountDisplayName(account)} (${account.currency})`,
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
  const [viewMode, setViewMode] = useState<AdCampaignsViewMode>('campaigns');
  const [search, setSearch] = useState('');
  const [sort, setSort] = useState('date_desc');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [syncDetailsOpen, setSyncDetailsOpen] = useState(false);
  const [hypothesisFormOpen, setHypothesisFormOpen] = useState(false);
  const [editingHypothesis, setEditingHypothesis] = useState<AdHypothesis | null>(null);
  const [deletingHypothesis, setDeletingHypothesis] = useState<AdHypothesis | null>(null);
  const [promoFormOpen, setPromoFormOpen] = useState(false);
  const [editingPromo, setEditingPromo] = useState<Promo | null>(null);
  const [deletingPromo, setDeletingPromo] = useState<Promo | null>(null);

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
  const { data: hypotheses = [], isLoading: hypothesesLoading, error: hypothesesError } = useQuery({
    queryKey: ['ad-hypotheses'],
    queryFn: adHypothesesApi.list,
  });
  const { data: promos = [], isLoading: promosLoading, error: promosError } = useQuery({
    queryKey: ['promos', channelFilter],
    queryFn: () => promosApi.list(channelFilter ? { telegramChannelId: channelFilter } : undefined),
  });

  useEffect(() => {
    const savedViewMode = window.localStorage.getItem(AD_CAMPAIGNS_VIEW_MODE_STORAGE_KEY);
    if (savedViewMode === 'campaigns' || savedViewMode === 'promos' || savedViewMode === 'hypotheses') {
      setViewMode(savedViewMode);
    }
  }, []);

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
    onSuccess: (run) => {
      qc.invalidateQueries({ queryKey: ['ad-campaigns'] });
      qc.invalidateQueries({ queryKey: ['ad-campaigns-performance'] });
      qc.invalidateQueries({ queryKey: ['daily-analytics-runs'] });
      const summary = describeSyncRun(run);
      pushToast(summary.short, run.status === 'success' ? 'success' : run.status === 'failed' ? 'error' : 'info');
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
  const createHypothesisMutation = useMutation({
    mutationFn: adHypothesesApi.create,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['ad-hypotheses'] });
      qc.invalidateQueries({ queryKey: ['ad-campaigns'] });
      setHypothesisFormOpen(false);
      pushToast('Hypothesis created.', 'success');
    },
    onError: (error) => pushToast(getErrorMessage(error, 'Failed to create hypothesis.'), 'error'),
  });
  const updateHypothesisMutation = useMutation({
    mutationFn: ({ id, payload }: any) => adHypothesesApi.update(id, payload),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['ad-hypotheses'] });
      qc.invalidateQueries({ queryKey: ['ad-campaigns'] });
      setEditingHypothesis(null);
      setHypothesisFormOpen(false);
      pushToast('Hypothesis updated.', 'success');
    },
    onError: (error) => pushToast(getErrorMessage(error, 'Failed to update hypothesis.'), 'error'),
  });
  const deleteHypothesisMutation = useMutation({
    mutationFn: (id: string) => adHypothesesApi.remove(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['ad-hypotheses'] });
      qc.invalidateQueries({ queryKey: ['ad-campaigns'] });
      setDeletingHypothesis(null);
      pushToast('Hypothesis deleted.', 'success');
    },
    onError: (error) => pushToast(getErrorMessage(error, 'Failed to delete hypothesis.'), 'error'),
  });
  const createPromoMutation = useMutation({
    mutationFn: promosApi.create,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['promos'] });
      qc.invalidateQueries({ queryKey: ['channel-promos'] });
      setPromoFormOpen(false);
      pushToast('Promo created.', 'success');
    },
    onError: (error) => pushToast(getErrorMessage(error, 'Failed to create promo.'), 'error'),
  });
  const updatePromoMutation = useMutation({
    mutationFn: ({ id, payload }: { id: string; payload: Partial<Promo> }) => promosApi.update(id, payload),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['promos'] });
      qc.invalidateQueries({ queryKey: ['channel-promos'] });
      setEditingPromo(null);
      setPromoFormOpen(false);
      pushToast('Promo updated.', 'success');
    },
    onError: (error) => pushToast(getErrorMessage(error, 'Failed to update promo.'), 'error'),
  });
  const deletePromoMutation = useMutation({
    mutationFn: (id: string) => promosApi.remove(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['promos'] });
      qc.invalidateQueries({ queryKey: ['channel-promos'] });
      setDeletingPromo(null);
      pushToast('Promo deleted.', 'success');
    },
    onError: (error) => pushToast(getErrorMessage(error, 'Failed to delete promo.'), 'error'),
  });

  const campaigns = data ?? [];
  const ownTelegramChannels = useMemo(
    () => (channels ?? []).filter(isOwnTelegramChannel),
    [channels],
  );
  const visibleCampaigns = useMemo(() => sortCampaigns(filterCampaigns(campaigns, search, dateFrom, dateTo), sort), [campaigns, search, dateFrom, dateTo, sort]);
  const visibleHypotheses = useMemo(() => filterHypotheses(hypotheses, search), [hypotheses, search]);
  const visiblePromos = useMemo(() => filterPromos(promos, search), [promos, search]);
  const handleViewModeChange = (nextViewMode: AdCampaignsViewMode) => {
    setViewMode(nextViewMode);
    window.localStorage.setItem(AD_CAMPAIGNS_VIEW_MODE_STORAGE_KEY, nextViewMode);
  };
  const openCreateForCurrentView = () => {
    if (viewMode === 'hypotheses') {
      setEditingHypothesis(null);
      setHypothesisFormOpen(true);
      return;
    }
    if (viewMode === 'promos') {
      setEditingPromo(null);
      setPromoFormOpen(true);
      return;
    }
    setCreateOpen(true);
  };

  return <AppShell><PageHeader title="Ads" subtitle="Promos, campaigns, hypotheses and performance" action={
    <div className="flex items-center gap-2">
      {viewMode === 'campaigns' ? (
        <>
          <Button
            type="button"
            variant="secondary"
            className="inline-flex items-center gap-2"
            disabled={syncMutation.isPending}
            onClick={() => syncMutation.mutate()}
          >
            <RefreshCw size={16} className={syncMutation.isPending ? "animate-spin" : ""} />
            {syncMutation.isPending ? 'Syncing...' : 'Sync'}
          </Button>
          <button
            type="button"
            title="Analytics details"
            aria-label="Analytics details"
            onClick={() => setSyncDetailsOpen(true)}
            className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-slate-700 bg-slate-900 text-slate-200 hover:bg-slate-800"
          >
            <CircleHelp size={22} />
          </button>
        </>
      ) : null}
      <Button onClick={openCreateForCurrentView}>{viewMode === 'hypotheses' ? 'Create hypothesis' : viewMode === 'promos' ? 'Create promo' : 'Create campaign'}</Button>
    </div>
  } />
    <Card className="mb-4">
      <div className="grid min-w-0 gap-3 md:grid-cols-2 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.2fr)_minmax(0,1.4fr)] 2xl:grid-cols-[minmax(0,0.8fr)_minmax(0,1.1fr)_minmax(0,1.25fr)_minmax(0,1.1fr)_minmax(0,0.9fr)] 2xl:items-end">
        <div className="min-w-0">
          <FormField label="View">
            <CustomSelect
              value={viewMode}
              onChange={(value) => handleViewModeChange(value as AdCampaignsViewMode)}
              options={AD_CAMPAIGNS_VIEW_OPTIONS}
            />
          </FormField>
        </div>
        <div className="min-w-0">
          <FormField label="Channel">
            <CustomSelect
              value={channelFilter}
              onChange={setChannelFilter}
              disabled={viewMode === 'hypotheses'}
              placeholder="All channels"
              options={[
                { value: '', label: 'All channels', iconFallback: 'All channels' },
                ...ownTelegramChannels.map((channel: any) => ({
                  value: channel.id,
                  label: channel.title,
                  iconUrl: channel.photoUrl,
                  iconFallback: channel.title,
                })),
              ]}
            />
          </FormField>
        </div>
        <div className="min-w-0">
          <FormField label="Search">
            <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder={viewMode === 'campaigns' ? 'Campaign, source, channel' : viewMode === 'promos' ? 'Promo, text, channel' : 'Hypothesis'} />
          </FormField>
        </div>
        {viewMode === 'campaigns' ? <div className="min-w-0">
          <FormField label="Period">
            <DateRangeInput
              from={dateFrom}
              to={dateTo}
              onChange={(range) => {
                setDateFrom(range.from);
                setDateTo(range.to);
              }}
            />
          </FormField>
        </div> : null}
        {viewMode === 'campaigns' ? <div className="min-w-0">
          <FormField label="Sort">
            <Select value={sort} onChange={(e) => setSort(e.target.value)}>
              <option value="date_desc">Newest</option>
              <option value="date_asc">Oldest</option>
              <option value="cost_desc">Highest spend</option>
              <option value="joined_desc">Most joined</option>
            </Select>
          </FormField>
        </div> : null}
      </div>
    </Card>

    {isLoading ? <LoadingState /> : null}
    {error ? <div className="mb-4 rounded-lg border border-rose-700 p-3 text-sm text-rose-200">Failed to load campaigns.</div> : null}
    {viewMode === 'campaigns' && !isLoading && visibleCampaigns.length ? (
      <CampaignsTable
        campaigns={visibleCampaigns}
        moneySettings={moneySettings}
        rates={rates}
        onEdit={setEditing}
        onDelete={setDeleting}
        onToggleExclude={(campaign, excludeFromAnalytics) => excludeMutation.mutate({ id: campaign.id, excludeFromAnalytics })}
      />
    ) : null}
    {viewMode === 'campaigns' && !isLoading && !error && !visibleCampaigns.length ? <EmptyState text="No campaigns" /> : null}

    {viewMode === 'hypotheses' ? (
      <HypothesesSection
        hypotheses={visibleHypotheses}
        loading={hypothesesLoading}
        error={hypothesesError}
        moneySettings={moneySettings}
        rates={rates}
        onEdit={(hypothesis) => {
          setEditingHypothesis(hypothesis);
          setHypothesisFormOpen(true);
        }}
        onDelete={setDeletingHypothesis}
      />
    ) : null}
    {viewMode === 'promos' ? (
      <PromosSection
        promos={visiblePromos}
        loading={promosLoading}
        error={promosError}
        onEdit={(promo) => {
          setEditingPromo(promo);
          setPromoFormOpen(true);
        }}
        onDelete={setDeletingPromo}
      />
    ) : null}

    <CampaignModal open={createOpen} title="Create Campaign" channels={channels ?? []} onClose={() => setCreateOpen(false)} onSubmit={(v: any) => createMutation.mutate(v)} />
    <CampaignModal open={!!editing} title="Edit Campaign" channels={channels ?? []} initial={editing ?? undefined} onClose={() => setEditing(null)} onSubmit={(v: any) => editing && updateMutation.mutate({ id: editing.id, payload: v })} />
    <PromoModal open={promoFormOpen} title={editingPromo ? 'Edit Promo' : 'Create Promo'} initial={editingPromo ?? undefined} onClose={() => { setPromoFormOpen(false); setEditingPromo(null); }} onSubmit={(payload) => editingPromo ? updatePromoMutation.mutate({ id: editingPromo.id, payload }) : createPromoMutation.mutate(payload)} channels={ownTelegramChannels} />
    <HypothesisFormModal
      open={hypothesisFormOpen}
      hypothesis={editingHypothesis}
      campaigns={campaigns}
      moneySettings={moneySettings}
      rates={rates}
      isSubmitting={createHypothesisMutation.isPending || updateHypothesisMutation.isPending}
      onClose={() => {
        setHypothesisFormOpen(false);
        setEditingHypothesis(null);
      }}
      onSubmit={(payload) => {
        if (editingHypothesis) updateHypothesisMutation.mutate({ id: editingHypothesis.id, payload });
        else createHypothesisMutation.mutate(payload);
      }}
    />
    <SyncDetailsModal open={syncDetailsOpen} onClose={() => setSyncDetailsOpen(false)} performance={performance} syncRuns={syncRuns || []} hasCampaigns={campaigns.length > 0} />
    <ConfirmDeleteModal open={!!deleting} entityName={deleting?.title ?? 'campaign'} onClose={() => setDeleting(null)} onConfirm={() => deleting ? deleteMutation.mutateAsync(deleting.id) : undefined} label="Archive" />
    <ConfirmDeleteModal open={!!deletingHypothesis} entityName={deletingHypothesis?.name ?? 'hypothesis'} description="This deletes only the hypothesis. Campaigns remain untouched." onClose={() => setDeletingHypothesis(null)} onConfirm={() => deletingHypothesis ? deleteHypothesisMutation.mutateAsync(deletingHypothesis.id) : undefined} label="Delete" />
    <ConfirmDeleteModal open={!!deletingPromo} entityName={deletingPromo?.title ?? 'promo'} onClose={() => setDeletingPromo(null)} onConfirm={() => deletingPromo ? deletePromoMutation.mutateAsync(deletingPromo.id) : undefined} label="Delete" />
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

function numberOrNull(value: unknown) {
  if (value == null) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function isInRange(value: number, from: number | null, to: number | null) {
  if (from == null && to == null) return false;
  if (from != null && value < from) return false;
  if (to != null && value > to) return false;
  return true;
}

function calculatedKpiStatus(value: number | null, channel?: AdCampaign['telegramChannel']): AdCampaignKpiStatus {
  if (value == null || !channel) return 'unknown';
  const targetFrom = numberOrNull(channel.targetCpaFrom);
  const target = numberOrNull(channel.targetCpa);
  const acceptableFrom = numberOrNull(channel.acceptableCpaFrom);
  const acceptable = numberOrNull(channel.acceptableCpa);
  const stopFrom = numberOrNull(channel.stopCpaFrom) ?? numberOrNull(channel.stopCpa);
  if (
    targetFrom == null &&
    target == null &&
    acceptableFrom == null &&
    acceptable == null &&
    stopFrom == null
  ) return 'unknown';
  if (isInRange(value, targetFrom, target)) return 'good';
  if (isInRange(value, acceptableFrom, acceptable)) return 'acceptable';
  if (isInRange(value, stopFrom, null)) return 'bad';
  return 'unknown';
}

function effectiveCampaignKpiStatus(campaign: AdCampaign, primaryCostPerJoined: number | null, costPerJoined: number | null): AdCampaignKpiStatus {
  return calculatedKpiStatus(primaryCostPerJoined ?? costPerJoined, campaign.telegramChannel);
}

function campaignDateValue(campaign: any) {
  const date = new Date(campaign?.placementDate || campaign?.startedAt || campaign?.createdAt || 0);
  return Number.isNaN(date.getTime()) ? 0 : date.getTime();
}

function campaignSearchText(campaign: any) {
  return [
    campaign?.title,
    campaign?.telegramChannel?.title,
    campaign?.promo?.title,
    ...(campaign?.advertisingChannels || []).map((source: any) => source.title || source.name),
    ...(campaign?.hypothesisLinks || []).map((link: any) => link.hypothesis?.name),
  ].filter(Boolean).join(' ').toLowerCase();
}

function campaignDateInputValue(campaign: any) {
  return toInputDate(campaign?.placementDate || campaign?.startedAt || campaign?.createdAt);
}

function filterCampaigns(campaigns: any[], search: string, dateFrom: string, dateTo: string) {
  const query = search.trim().toLowerCase();
  return campaigns.filter((campaign) => {
    const date = campaignDateInputValue(campaign);
    if (dateFrom && (!date || date < dateFrom)) return false;
    if (dateTo && (!date || date > dateTo)) return false;
    if (query && !campaignSearchText(campaign).includes(query)) return false;
    return true;
  });
}

function sortCampaigns(campaigns: any[], sort: string) {
  const rows = [...campaigns];
  if (sort === 'date_asc') return rows.sort((a, b) => campaignDateValue(a) - campaignDateValue(b));
  if (sort === 'cost_desc') return rows.sort((a, b) => Number(b.price || b.costAmount || 0) - Number(a.price || a.costAmount || 0));
  if (sort === 'joined_desc') return rows.sort((a, b) => Number(b.analytics?.joinedCount ?? b.joinedCount ?? 0) - Number(a.analytics?.joinedCount ?? a.joinedCount ?? 0));
  return rows.sort((a, b) => campaignDateValue(b) - campaignDateValue(a));
}

function filterHypotheses(hypotheses: AdHypothesis[], search: string) {
  const query = search.trim().toLowerCase();
  if (!query) return hypotheses;
  return hypotheses.filter((hypothesis) => [
    hypothesis.name,
    hypothesis.description,
    hypothesis.status,
    hypothesis.summary?.decision,
  ].filter(Boolean).join(' ').toLowerCase().includes(query));
}

function filterPromos(promos: Promo[], search: string) {
  const query = search.trim().toLowerCase();
  if (!query) return promos;
  return promos.filter((promo) => [
    promo.title,
    promo.text,
    promo.telegramChannel?.title,
    promo.status,
  ].filter(Boolean).join(' ').toLowerCase().includes(query));
}

function displayCampaignTitle(campaign: any) {
  const date = toInputDate(campaign?.placementDate || campaign?.startedAt || campaign?.createdAt);
  let title = String(campaign?.title || '').trim();
  title = title.replace(/^Telegram ad campaign:\s*/i, '').trim();
  if (date) {
    title = title
      .replace(new RegExp(`^${date}\\s*\\|\\s*`), '')
      .replace(new RegExp(`^${date}\\b\\s*[-|:]?\\s*`), '')
      .trim();
  }
  if (!title || /^Campaign\s+\d{4}-\d{2}-\d{2}$/i.test(title)) {
    return generatedCampaignDisplayTitle(campaign);
  }
  return title;
}

function displayCampaignTitleWithDate(campaign: any) {
  const date = campaignDateInputValue(campaign);
  return date ? `${date} | ${displayCampaignTitle(campaign)}` : displayCampaignTitle(campaign);
}

function generatedCampaignDisplayTitle(campaign: any) {
  const sources = (campaign?.advertisingChannels || [])
    .map((source: any) => source.title || source.name)
    .filter(Boolean);
  const promo = campaign?.promo?.title;
  const parts = [...sources.slice(0, 2), promo].filter(Boolean);
  if (parts.length) return [...new Set(parts)].join(' | ');
  return campaign?.telegramChannel?.title || 'Campaign';
}

function CampaignsTable({
  campaigns,
  moneySettings,
  rates,
  onEdit,
  onDelete,
  onToggleExclude,
}: {
  campaigns: any[];
  moneySettings: any;
  rates: any[] | undefined;
  onEdit: (campaign: any) => void;
  onDelete: (campaign: any) => void;
  onToggleExclude: (campaign: any, excludeFromAnalytics: boolean) => void;
}) {
  const [promoTooltip, setPromoTooltip] = useState<{
    promo: Promo;
    left: number;
    top: number;
  } | null>(null);
  const [kpiTooltip, setKpiTooltip] = useState<{
    channel: TelegramChannel;
    left: number;
    top: number;
  } | null>(null);

  const showPromoTooltip = (promo: Promo, element: HTMLElement) => {
    const rect = element.getBoundingClientRect();
    const width = 320;
    const left = Math.min(Math.max(16, rect.left), Math.max(16, window.innerWidth - width - 16));
    const top = Math.min(rect.bottom + 10, Math.max(16, window.innerHeight - 260));
    setPromoTooltip({ promo, left, top });
  };
  const showKpiTooltip = (channel: TelegramChannel | undefined, element: HTMLElement) => {
    if (!channel) return;
    const rect = element.getBoundingClientRect();
    const width = 430;
    const left = Math.min(Math.max(16, rect.left), Math.max(16, window.innerWidth - width - 16));
    const top = Math.min(rect.bottom + 10, Math.max(16, window.innerHeight - 96));
    setKpiTooltip({ channel, left, top });
  };

  return (
    <>
      <div className="table-scroll mb-5 w-full rounded-lg border border-neutral-800">
        <table className="w-full min-w-[1160px] table-fixed text-left text-sm">
          <colgroup>
            <col className="w-[390px]" />
            <col className="w-[280px]" />
            <col className="w-[160px]" />
            <col className="w-[190px]" />
            <col className="w-[140px]" />
          </colgroup>
          <thead className="bg-slate-950 text-xs uppercase text-neutral-400">
            <tr>
              <th className="px-4 py-3 font-medium">Campaign</th>
              <th className="px-4 py-3 font-medium">Performance</th>
              <th className="px-4 py-3 font-medium">Analytics</th>
              <th className="px-4 py-3 font-medium">Hypotheses</th>
              <th className="px-4 py-3 text-right font-medium">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-neutral-800">
            {campaigns.map((campaign, index) => {
              const joined = campaign.analytics?.joinedCount ?? campaign.joinedCount ?? 0;
              const net = campaign.analytics?.netGrowth ?? campaign.netGrowthCount ?? joined;
              const left = campaign.analytics?.leftCount ?? campaign.leftCount ?? 0;
              const cost = Number(campaign.price || campaign.costAmount || 0);
              const primaryCost = Number(campaign.priceInPrimaryCurrency ?? 0);
              const costPerJoined = joined > 0 ? cost / joined : null;
              const primaryCostPerJoined = joined > 0 ? primaryCost / joined : null;
              const metrics = campaignMetrics(campaign);
              const analyticsWarning = campaign.adDataQualityWarning || campaignMissingAnalyticsMessage(campaign);
              const kpiStatus = effectiveCampaignKpiStatus(campaign, primaryCostPerJoined, costPerJoined);
              return (
                <tr key={campaign.id} className={`align-top text-slate-200 transition-colors hover:bg-neutral-900 ${index % 2 ? 'bg-neutral-950' : 'bg-black'}`}>
                  <td className="px-4 py-4">
                    <div className="min-w-0 space-y-3">
                      <div className="truncate font-semibold text-white">
                        <CampaignTitleWithPromo
                          campaign={campaign}
                          onPromoEnter={showPromoTooltip}
                          onPromoLeave={() => setPromoTooltip(null)}
                        />
                      </div>
                      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-500">
                        <SourceChip source={campaign.telegramChannel} fallback="-" compact />
                      </div>
                      <SourceList sources={campaign.advertisingChannels || []} />
                    </div>
                  </td>
                  <td className="px-4 py-4">
                    <PerformanceCell
                      cost={cost}
                      currency={campaign.currency}
                      primaryCost={primaryCost}
                      costPerJoined={costPerJoined}
                      primaryCostPerJoined={primaryCostPerJoined}
                      joined={joined}
                      net={net}
                      left={left}
                      moneySettings={moneySettings}
                      rates={rates}
                      kpiStatus={kpiStatus}
                    />
                  </td>
                  <td className="px-4 py-4">
                    <div className="flex flex-wrap gap-1">
                      <KpiStatusBadge
                        status={kpiStatus}
                        onMouseEnter={(event) => showKpiTooltip(campaign.telegramChannel, event.currentTarget)}
                        onMouseLeave={() => setKpiTooltip(null)}
                      />
                      {metrics.length ? metrics.slice(0, 3).map((metric) => (
                        <span key={metric.label} className="rounded border border-slate-700 px-2 py-0.5 text-xs text-slate-300">{metric.label}: {metric.value}</span>
                      )) : (
                        <span className="rounded border border-amber-700 px-2 py-0.5 text-xs text-amber-200" title={analyticsWarning || undefined}>Missing</span>
                      )}
                    </div>
                  </td>
                  <td className="px-4 py-4">
                    <HypothesisLinks links={campaign.hypothesisLinks || []} />
                  </td>
                  <td className="px-4 py-4">
                    <div className="flex min-w-[108px] items-center justify-end gap-2 whitespace-nowrap">
                      <label className="flex items-center gap-1 text-xs text-slate-400" title="Exclude from performance summary">
                        <input type="checkbox" checked={Boolean(campaign.excludeFromAnalytics)} onChange={(event) => onToggleExclude(campaign, event.target.checked)} />
                      </label>
                      <IconButton onClick={() => onEdit(campaign)} />
                      <IconButton kind="delete" onClick={() => onDelete(campaign)} />
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {promoTooltip ? <PromoTooltip promo={promoTooltip.promo} left={promoTooltip.left} top={promoTooltip.top} /> : null}
      {kpiTooltip ? <KpiTooltip channel={kpiTooltip.channel} left={kpiTooltip.left} top={kpiTooltip.top} /> : null}
    </>
  );
}

function CampaignTitleWithPromo({
  campaign,
  onPromoEnter,
  onPromoLeave,
}: {
  campaign: AdCampaign;
  onPromoEnter: (promo: Promo, element: HTMLElement) => void;
  onPromoLeave: () => void;
}) {
  const title = displayCampaignTitleWithDate(campaign);
  const promo = campaign.promo;
  const promoTitle = String(promo?.title || '').trim();
  const canPreviewPromo = Boolean(promo && (promo.imageData || promo.text));

  if (!promo || !promoTitle || !canPreviewPromo) return <>{title}</>;

  const promoSegment = promoTitleSegment(title, promoTitle);
  const index = title.indexOf(promoSegment);
  if (index < 0) return <>{title}</>;

  const before = title.slice(0, index);
  const after = title.slice(index + promoSegment.length);

  return (
    <>
      {before}
      <span
        className="cursor-help text-sky-200 decoration-sky-400/70 decoration-dotted underline-offset-4 hover:underline"
        onMouseEnter={(event) => onPromoEnter(promo, event.currentTarget)}
        onMouseLeave={onPromoLeave}
      >
        {promoSegment}
      </span>
      {after}
    </>
  );
}

function promoTitleSegment(title: string, promoTitle: string) {
  if (title.includes(promoTitle)) return promoTitle;

  const parts = title.split('|').map((part) => part.trim());
  const startsWithDate = /^\d{4}-\d{2}-\d{2}$/.test(parts[0] || '');
  if (startsWithDate && parts.length >= 3) return parts[2];
  if (!startsWithDate && parts.length >= 2) return parts[1];

  return promoTitle;
}

function PromoTooltip({ promo, left, top }: { promo: Promo; left: number; top: number }) {
  return (
    <div
      className="fixed z-[80] w-[320px] overflow-hidden rounded-xl border border-neutral-700 bg-neutral-950 shadow-2xl"
      style={{ left, top }}
    >
      {promo.imageData ? (
        <div className="flex justify-center bg-neutral-900 p-2">
          <img src={promo.imageData} alt="" className="max-h-36 max-w-full rounded-lg object-contain" />
        </div>
      ) : null}
      <div className="space-y-2 p-3">
        <div className="font-semibold text-white">{promo.title}</div>
        {promo.text ? <p className="line-clamp-5 whitespace-pre-wrap text-sm leading-snug text-neutral-300">{promo.text}</p> : null}
      </div>
    </div>
  );
}

function PerformanceCell({
  cost,
  currency,
  primaryCost,
  costPerJoined,
  primaryCostPerJoined,
  joined,
  net,
  left,
  moneySettings,
  rates,
  kpiStatus,
}: {
  cost: number;
  currency: string;
  primaryCost: number;
  costPerJoined: number | null;
  primaryCostPerJoined: number | null;
  joined: number;
  net: number;
  left: number;
  moneySettings: any;
  rates: any[] | undefined;
  kpiStatus: AdCampaignKpiStatus;
}) {
  const kpiTextClass = kpiMetricTextClass(kpiStatus);
  return (
    <div className="grid grid-cols-[minmax(90px,1fr)_minmax(70px,0.7fr)_minmax(80px,0.8fr)] gap-3">
      <div>
        <p className="mb-1 text-[10px] uppercase tracking-wide text-slate-500">Spend</p>
        <MoneyStack amount={cost} currency={currency} settings={moneySettings} rates={rates} amountInPrimary={primaryCost} mainClassName="font-semibold leading-snug text-white" subClassName="text-xs leading-snug text-slate-500" />
      </div>
      <div>
        <p className="mb-1 text-[10px] uppercase tracking-wide text-slate-500">Joined</p>
        <p className={`font-semibold leading-snug ${kpiTextClass}`}>{formatMetric(joined)}</p>
        <p className="text-xs leading-snug text-slate-500">Net {formatMetric(net)}{left > 0 ? ` / left ${formatMetric(left)}` : ''}</p>
      </div>
      <div>
        <p className="mb-1 text-[10px] uppercase tracking-wide text-slate-500">CPA</p>
        {costPerJoined !== null ? (
          <MoneyStack amount={costPerJoined} currency={currency} settings={moneySettings} rates={rates} amountInPrimary={primaryCostPerJoined} mainClassName={`font-semibold leading-snug ${kpiTextClass}`} subClassName="text-xs leading-snug text-slate-500" />
        ) : <p className="text-slate-500">-</p>}
      </div>
    </div>
  );
}

function kpiMetricTextClass(status?: AdCampaignKpiStatus | null) {
  if (status === 'good') return 'text-emerald-300';
  if (status === 'acceptable') return 'text-yellow-200';
  if (status === 'bad') return 'text-rose-200';
  return 'text-white';
}

function SourceChip({ source, fallback, compact = false }: { source: any; fallback?: string; compact?: boolean }) {
  const label = source?.title || source?.name || fallback || '-';
  return (
    <span className={`inline-flex items-center gap-2 ${compact ? 'max-w-[200px]' : 'max-w-[220px]'}`}>
      {source?.photoUrl || source?.imageUrl ? <img src={source.photoUrl || source.imageUrl} alt="" className={`${compact ? 'h-4 w-4' : 'h-5 w-5'} shrink-0 rounded-full object-cover`} /> : <span className={`${compact ? 'h-4 w-4' : 'h-5 w-5'} inline-flex shrink-0 items-center justify-center rounded-full border border-slate-700 text-[10px] text-slate-400`}>{String(label).slice(0, 1).toUpperCase()}</span>}
      <span className="truncate">{label}</span>
    </span>
  );
}

function SourceList({ sources }: { sources: any[] }) {
  if (!sources.length) return <span className="text-slate-500">-</span>;
  const visible = sources.slice(0, 2);
  const hidden = sources.slice(2);
  return (
    <div className="flex max-w-full flex-wrap gap-1.5">
      {visible.map((source) => (
        <span key={source.selectionId || source.id} className="inline-flex max-w-[260px] items-center gap-1.5 rounded-full bg-slate-900 px-2 py-1 text-xs text-slate-200 ring-1 ring-slate-800">
          {source.photoUrl || source.imageUrl ? <img src={source.photoUrl || source.imageUrl} alt="" className="h-4 w-4 rounded-full object-cover" /> : null}
          <span className="truncate">{source.title || source.name}</span>
        </span>
      ))}
      {hidden.length ? <span className="rounded-full border border-slate-700 px-2 py-1 text-xs text-slate-400" title={hidden.map((source) => source.title || source.name).join(', ')}>+{hidden.length}</span> : null}
    </div>
  );
}

function HypothesisLinks({ links }: { links: any[] }) {
  if (!links.length) return <span className="text-slate-500">-</span>;
  return (
    <div className="flex min-w-0 max-w-full flex-wrap gap-1.5">
      {links.slice(0, 2).map((link) => (
        <span key={link.hypothesis.id} className={`inline-flex min-w-0 max-w-full rounded-full border px-2 py-0.5 text-xs ${hypothesisStatusClass(link.hypothesis.status)}`}>
          <span className="truncate">{link.hypothesis.name}</span>
        </span>
      ))}
      {links.length > 2 ? <span className="rounded-full border border-slate-700 px-2 py-0.5 text-xs text-slate-400">+{links.length - 2}</span> : null}
    </div>
  );
}

function hasValue(value: unknown) {
  return value != null && Number.isFinite(Number(value));
}

function hasUsefulPerformanceSummary(performance?: any) {
  if (!performance) return false;
  return [
    performance.totalNewSubscribers,
    performance.totalActiveSubscribersFromAd,
    performance.normalDataCount,
    performance.suspiciousCount,
    performance.anomalousCount,
    performance.pollutedCount,
  ].some((value) => Number(value || 0) > 0) ||
    [
      performance.avgCpa,
      performance.avgActiveCpa,
      performance.avgActiveRate,
      performance.avgRetention7d,
    ].some(hasValue);
}

function campaignPlacementAgeDays(campaign: any) {
  const value = campaign?.placementDate || campaign?.startedAt || campaign?.createdAt;
  if (!value) return null;
  const placedAt = new Date(value);
  if (Number.isNaN(placedAt.getTime())) return null;
  return Math.floor((Date.now() - placedAt.getTime()) / 86_400_000);
}

function campaignMetrics(campaign: any) {
  const metrics = [
    { label: 'New subs', value: campaign?.newSubscribers, format: (value: unknown) => formatMetric(value) },
    { label: 'Active', value: campaign?.cappedActiveSubscribersFromAd ?? campaign?.activeSubscribersFromAd, format: (value: unknown) => formatMetric(value) },
    { label: 'Raw uplift', value: campaign?.rawActiveSubscribersFromAd, format: (value: unknown) => formatMetric(value) },
    { label: 'Active CPA', value: campaign?.cappedActiveCpa ?? campaign?.activeCpa, format: (value: unknown) => formatMetric(value, 2) },
    { label: 'Retention 7d', value: campaign?.retention7d, format: (value: unknown) => formatPercent(value) },
  ];

  return metrics
    .filter((metric) => hasValue(metric.value))
    .map((metric) => ({ label: metric.label, value: metric.format(metric.value) }));
}

function campaignMissingAnalyticsMessage(campaign: any) {
  if (campaignMetrics(campaign).length > 0) return null;
  const ageDays = campaignPlacementAgeDays(campaign);
  if (ageDays != null && ageDays >= 7) {
    return 'Analytics snapshots were not captured when this older campaign ran, so 24h/7d subscriber and view changes cannot be reconstructed now.';
  }
  if (ageDays != null && ageDays >= 1) {
    return 'Analytics snapshots are missing for this campaign. Run sync after connecting the channel analytics account; some early-window metrics may already be unavailable.';
  }
  return 'Analytics will appear after the next daily sync captures enough channel data.';
}

function syncStatusClass(status?: string | null) {
  if (status === 'success') return 'border-emerald-700 bg-emerald-950/30 text-emerald-200';
  if (status === 'partial_failed') return 'border-amber-700 bg-amber-950/30 text-amber-200';
  if (status === 'failed') return 'border-rose-700 bg-rose-950/30 text-rose-200';
  if (status === 'running') return 'border-blue-700 bg-blue-950/30 text-blue-200';
  return 'border-slate-700 bg-slate-950/30 text-slate-300';
}

function syncStatusLabel(status?: string | null) {
  if (status === 'success') return 'Synced';
  if (status === 'partial_failed') return 'Partially synced';
  if (status === 'failed') return 'Failed';
  if (status === 'running') return 'Running';
  return 'Unknown';
}

function describeSyncRun(run: any) {
  if (!run) return { short: 'No sync has been run yet.', detail: '' };
  if (run.status === 'success') {
    return { short: 'Daily analytics synced.', detail: `Updated ${run.channelsProcessed} channels and ${run.campaignsProcessed} campaigns.` };
  }
  if (run.status === 'partial_failed') {
    const accountErrors = String(run.errorMessage || '').includes('No connected Telegram user account selected');
    return {
      short: 'Daily analytics partially synced.',
      detail: accountErrors
        ? 'Some channels were skipped because no connected Telegram account is linked for MTProto analytics.'
        : `${run.errorsCount} item(s) could not be synced. Processed data was still saved.`,
    };
  }
  if (run.status === 'failed') {
    return { short: 'Daily analytics sync failed.', detail: readableSyncError(run.errorMessage) };
  }
  if (run.status === 'running') {
    return { short: 'Daily analytics sync is running.', detail: 'Refresh shortly to see the result.' };
  }
  return { short: `Daily analytics status: ${run.status || 'unknown'}.`, detail: readableSyncError(run.errorMessage) };
}

function readableSyncError(message?: string | null) {
  if (!message) return 'No additional details.';
  if (message.includes('No connected Telegram user account selected')) {
    return 'Connect or link a Telegram user account to the affected channels, then run sync again.';
  }
  return message.split('\n')[0] || 'No additional details.';
}

function kpiStatusClass(status?: AdCampaignKpiStatus | null) {
  if (status === 'good') return 'border-emerald-700 bg-emerald-950/20 text-emerald-200';
  if (status === 'acceptable') return 'border-yellow-700 bg-yellow-950/20 text-yellow-200';
  if (status === 'bad') return 'border-rose-700 bg-rose-950/20 text-rose-200';
  return 'border-slate-700 bg-slate-950/30 text-slate-300';
}

function kpiStatusLabel(status?: AdCampaignKpiStatus | null) {
  if (status === 'good') return 'KPI hit';
  if (status === 'acceptable') return 'KPI ok';
  if (status === 'bad') return 'KPI missed';
  return 'KPI unknown';
}

function kpiStatusTitle(status?: AdCampaignKpiStatus | null) {
  if (status === 'good') return 'CPA is inside target KPI range.';
  if (status === 'acceptable') return 'CPA is inside acceptable KPI range.';
  if (status === 'bad') return 'CPA is inside stop KPI range.';
  return 'KPI range or enough CPA data is missing.';
}

function KpiStatusBadge({
  status,
  onMouseEnter,
  onMouseLeave,
}: {
  status?: AdCampaignKpiStatus | null;
  onMouseEnter?: MouseEventHandler<HTMLSpanElement>;
  onMouseLeave?: MouseEventHandler<HTMLSpanElement>;
}) {
  return (
    <span
      className={`inline-flex rounded border px-2 py-0.5 text-xs ${kpiStatusClass(status)} ${onMouseEnter ? 'cursor-help' : ''}`}
      title={kpiStatusTitle(status)}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
    >
      {kpiStatusLabel(status)}
    </span>
  );
}

function KpiTooltip({ channel, left, top }: { channel: TelegramChannel; left: number; top: number }) {
  return (
    <div
      className="fixed z-[80] rounded-lg border border-slate-700 bg-neutral-950 px-3 py-2 shadow-2xl"
      style={{ left, top, width: 430 }}
    >
      <div className="flex flex-wrap items-center gap-2 text-sm font-semibold">
        <span className="text-white">KPI $:</span>
        <KpiRangeChip tone="target" label={`target ${formatKpiRange(channel.targetCpaFrom, channel.targetCpa)}`} />
        <KpiRangeChip tone="ok" label={`ok ${formatKpiRange(channel.acceptableCpaFrom, channel.acceptableCpa)}`} />
        <KpiRangeChip tone="stop" label={`stop ${formatKpiRange(channel.stopCpaFrom ?? channel.stopCpa, null, true)}`} />
      </div>
    </div>
  );
}

function KpiRangeChip({ tone, label }: { tone: 'target' | 'ok' | 'stop'; label: string }) {
  const className = {
    target: 'border-emerald-700 bg-emerald-950/50 text-emerald-200',
    ok: 'border-yellow-700 bg-yellow-950/50 text-yellow-200',
    stop: 'border-rose-700 bg-rose-950/50 text-rose-200',
  }[tone];
  return <span className={`rounded border px-2 py-1 ${className}`}>{label}</span>;
}

function formatKpiRange(from?: number | string | null, to?: number | string | null, openEnded = false) {
  const fromValue = numberOrNull(from);
  const toValue = numberOrNull(to);
  if (openEnded && fromValue != null) return `${formatMetric(fromValue, 2)}+`;
  if (fromValue != null && toValue != null) return `${formatMetric(fromValue, 2)}-${formatMetric(toValue, 2)}`;
  if (fromValue != null) return `${formatMetric(fromValue, 2)}+`;
  if (toValue != null) return `≤${formatMetric(toValue, 2)}`;
  return '-';
}

function SyncRunSummary({ run, compact = false, inline = false }: { run: any; compact?: boolean; inline?: boolean }) {
  const summary = describeSyncRun(run);
  if (inline) {
    return (
      <>
        <span className={`inline-flex rounded border px-2 py-0.5 text-xs ${syncStatusClass(run.status)}`}>{syncStatusLabel(run.status)}</span>
        <span className="text-slate-400">{summary.detail}</span>
        <span className="text-slate-500">{run.source}</span>
      </>
    );
  }
  return (
    <div className={compact ? 'mt-2' : 'mt-1'}>
      <span className={`inline-flex rounded border px-2 py-0.5 text-xs ${syncStatusClass(run.status)}`}>{syncStatusLabel(run.status)}</span>
      <p className={`${compact ? 'mt-2' : 'mt-1'} text-xs text-slate-400`}>{summary.detail}</p>
      {!compact ? <p className="mt-1 text-xs text-slate-500">{run.source}</p> : null}
    </div>
  );
}

function hypothesisStatusClass(status?: string) {
  if (status === 'winner') return 'border-emerald-700 text-emerald-200';
  if (status === 'loser') return 'border-rose-700 text-rose-200';
  if (status === 'paused') return 'border-yellow-700 text-yellow-200';
  if (status === 'archived') return 'border-slate-700 text-slate-400';
  return 'border-blue-700 text-blue-200';
}

function MiniPerformance({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <p className="text-[10px] uppercase tracking-wide text-slate-500">{label}</p>
      {typeof value === 'string' ? <p className="font-semibold leading-snug text-white">{value}</p> : value}
    </div>
  );
}

function PromosSection({
  promos,
  loading,
  error,
  onEdit,
  onDelete,
}: {
  promos: Promo[];
  loading: boolean;
  error: unknown;
  onEdit: (promo: Promo) => void;
  onDelete: (promo: Promo) => void;
}) {
  return (
    <>
      {loading ? <LoadingState /> : null}
      {error ? <div className="mb-4 rounded-lg border border-rose-700 p-3 text-sm text-rose-200">Failed to load promos.</div> : null}
      {!loading && !error && !promos.length ? <EmptyState text="No promos yet." /> : null}
      {promos.length ? (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
          {promos.map((promo) => (
            <Card key={promo.id} className="min-h-[260px]">
              <div className="mb-3 flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <h3 className="truncate text-lg font-semibold text-white">{promo.title}</h3>
                  {promo.telegramChannel ? <SourceChip source={promo.telegramChannel} compact /> : null}
                </div>
                <div className="flex shrink-0 gap-2">
                  <IconButton onClick={() => onEdit(promo)} />
                  <IconButton kind="delete" onClick={() => onDelete(promo)} />
                </div>
              </div>
              {promo.imageData ? (
                <div className="mb-3 flex h-36 items-center justify-center overflow-hidden rounded-lg border border-neutral-800 bg-neutral-950">
                  <img src={promo.imageData} alt="" className="max-h-full max-w-full object-contain" />
                </div>
              ) : null}
              {promo.text ? <p className="line-clamp-5 whitespace-pre-wrap text-sm leading-relaxed text-neutral-300">{promo.text}</p> : <p className="text-sm text-neutral-500">No description.</p>}
            </Card>
          ))}
        </div>
      ) : null}
    </>
  );
}

function HypothesesSection({
  hypotheses,
  loading,
  error,
  moneySettings,
  rates,
  onEdit,
  onDelete,
}: {
  hypotheses: AdHypothesis[];
  loading: boolean;
  error: unknown;
  moneySettings: any;
  rates: any[] | undefined;
  onEdit: (hypothesis: AdHypothesis) => void;
  onDelete: (hypothesis: AdHypothesis) => void;
}) {
  return (
    <>
      {loading ? <LoadingState /> : null}
      {error ? <div className="mb-4 rounded-lg border border-rose-700 p-3 text-sm text-rose-200">Failed to load hypotheses.</div> : null}
      {!loading && !error && !hypotheses.length ? <EmptyState text="No hypotheses yet." /> : null}
      {hypotheses.length ? (
        <div className="table-scroll mb-5 w-full rounded-lg border border-neutral-800">
          <table className="w-full min-w-[900px] table-fixed text-left text-sm">
            <thead className="bg-slate-950 text-xs uppercase text-neutral-400">
              <tr>
                <th className="w-[40%] px-4 py-3 font-medium">Hypothesis</th>
                <th className="w-[24%] px-4 py-3 font-medium">Performance</th>
                <th className="w-[26%] px-4 py-3 font-medium">Decision</th>
                <th className="w-[10%] px-4 py-3 text-right font-medium">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-800">
              {hypotheses.map((hypothesis, index) => (
                <tr key={hypothesis.id} className={`align-top text-slate-200 transition-colors hover:bg-neutral-900 ${index % 2 ? 'bg-neutral-950' : 'bg-black'}`}>
                  <td className="px-4 py-4">
                    <p className="font-semibold text-white">{hypothesis.name}</p>
                    {hypothesis.description ? <p className="mt-1 line-clamp-2 text-xs text-slate-500">{hypothesis.description}</p> : null}
                  </td>
                  <td className="px-4 py-4">
                    <div className="grid grid-cols-3 gap-2">
                      <MiniPerformance label="Campaigns" value={formatMetric(hypothesis.summary?.campaignsCount ?? hypothesis.campaignsCount)} />
                      <MiniPerformance label="Joined" value={formatMetric(hypothesis.summary?.totalJoinedSubscribers)} />
                      <MiniPerformance
                        label="CPA"
                        value={
                          <MoneyStack
                            amount={hypothesis.summary?.avgCpa}
                            currency={moneySettings.primaryCurrency}
                            settings={moneySettings}
                            rates={rates}
                            mainClassName="font-semibold leading-snug text-white"
                            subClassName="text-xs leading-snug text-slate-500"
                          />
                        }
                      />
                    </div>
                  </td>
                  <td className="px-4 py-4">
                    <div className="space-y-2">
                      <KpiStatusBadge status={hypothesis.summary?.kpiStatus} />
                      <p className="text-slate-400">{hypothesis.summary?.decision || '-'}</p>
                    </div>
                  </td>
                  <td className="px-4 py-4">
                    <div className="flex justify-end gap-2">
                      <IconButton onClick={() => onEdit(hypothesis)} />
                      <IconButton kind="delete" onClick={() => onDelete(hypothesis)} />
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
    </>
  );
}

function PromoModal({
  open,
  onClose,
  onSubmit,
  title,
  initial,
  channels,
}: {
  open: boolean;
  onClose: () => void;
  onSubmit: (payload: { telegramChannelId: string; title: string; imageData?: string; text?: string }) => void;
  title: string;
  initial?: Promo;
  channels: TelegramChannel[];
}) {
  const channelOptions = useMemo(
    () => channels.map((channel) => ({ value: channel.id, label: channel.title, iconUrl: channel.photoUrl, iconFallback: channel.title })),
    [channels],
  );
  const { register, handleSubmit, setValue, watch, reset, formState: { errors } } = useForm({
    defaultValues: {
      telegramChannelId: initial?.telegramChannelId ?? '',
      title: initial?.title ?? '',
      imageData: initial?.imageData ?? '',
      notes: initial?.text ?? '',
    },
  });
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [uploadingImage, setUploadingImage] = useState(false);
  const imageData = watch('imageData') as string | undefined;
  const selectedChannelId = watch('telegramChannelId') as string;

  useEffect(() => {
    if (!open) return;
    reset({
      telegramChannelId: initial?.telegramChannelId ?? '',
      title: initial?.title ?? '',
      imageData: initial?.imageData ?? '',
      notes: initial?.text ?? '',
    });
  }, [initial, open, reset]);

  useEffect(() => {
    if (!open || selectedChannelId || channels.length !== 1) return;
    setValue('telegramChannelId', channels[0].id);
  }, [channels, open, selectedChannelId, setValue]);

  const applyImageFile = (file?: File) => {
    if (!file) return;
    setUploadingImage(true);
    promosApi
      .uploadImage(file)
      .then((res) => setValue('imageData', String(res.imageUrl || '')))
      .finally(() => setUploadingImage(false));
  };

  const submit = (values: any) => {
    const notes = String(values.notes ?? '').trim();
    onSubmit({
      telegramChannelId: values.telegramChannelId,
      title: String(values.title || '').trim(),
      imageData: values.imageData || undefined,
      text: notes || undefined,
    });
  };

  return (
    <Modal open={open} onClose={onClose} title={title}>
      <form className="space-y-3" onSubmit={handleSubmit(submit)}>
        <FormField label="Channel" required error={errors.telegramChannelId ? 'Required field' : undefined}>
          <CustomSelect
            value={selectedChannelId}
            onChange={(value) => setValue('telegramChannelId', value)}
            placeholder="Select channel"
            options={channelOptions}
          />
        </FormField>
        <FormField label="Title" required error={errors.title ? 'Required field' : undefined}>
          <Input {...register('title', { required: true })} />
        </FormField>
        <div className="block text-sm">
          <span className="mb-1 block text-neutral-300">Promo image</span>
          {!imageData ? (
            <div
              tabIndex={0}
              onPaste={(event: ClipboardEvent<HTMLDivElement>) => {
                const imageItem = Array.from(event.clipboardData.items).find((item) => item.type.startsWith('image/'));
                if (!imageItem) return;
                const file = imageItem.getAsFile();
                if (!file) return;
                event.preventDefault();
                applyImageFile(file);
              }}
              onClick={() => fileInputRef.current?.click()}
              className="cursor-pointer rounded-xl border border-dashed border-neutral-600 bg-neutral-900/70 p-4 transition hover:border-neutral-400 focus:border-blue-500 focus:outline-none"
            >
              <p className="text-sm text-neutral-200">Click to choose image or paste with Ctrl+V</p>
              <p className="mt-1 text-xs text-neutral-400">Supports screenshots and copied image files</p>
              {uploadingImage ? <p className="mt-1 text-xs text-blue-300">Uploading image...</p> : null}
            </div>
          ) : null}
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            onChange={(event: ChangeEvent<HTMLInputElement>) => applyImageFile(event.target.files?.[0])}
            className="hidden"
          />
          {imageData ? (
            <div className="mt-2 flex h-40 items-center justify-center overflow-hidden rounded-lg border border-neutral-700 bg-neutral-900">
              <img src={imageData} alt="" className="max-h-full max-w-full object-contain" />
            </div>
          ) : null}
          {imageData ? <div className="mt-2"><Button variant="secondary" type="button" onClick={() => setValue('imageData', '')}>Remove image</Button></div> : null}
        </div>
        <input type="hidden" {...register('telegramChannelId', { required: true })} />
        <input type="hidden" {...register('imageData')} />
        <FormField label="Description">
          <Textarea {...register('notes')} />
        </FormField>
        <div className="flex justify-end gap-2">
          <Button variant="secondary" type="button" onClick={onClose}>Cancel</Button>
          <Button type="submit">Save</Button>
        </div>
      </form>
    </Modal>
  );
}

function HypothesisFormModal({
  open,
  hypothesis,
  campaigns,
  moneySettings,
  rates,
  isSubmitting,
  onClose,
  onSubmit,
}: {
  open: boolean;
  hypothesis: AdHypothesis | null;
  campaigns: AdCampaign[];
  moneySettings: any;
  rates: any[] | undefined;
  isSubmitting: boolean;
  onClose: () => void;
  onSubmit: (payload: { name: string; description?: string | null; adCampaignIds: string[] }) => void;
}) {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!open) return;
    setName(hypothesis?.name || '');
    setDescription(hypothesis?.description || '');
    setSelectedIds([]);
    setError('');
  }, [hypothesis, open]);

  useEffect(() => {
    if (!open || !hypothesis) return;
    adHypothesesApi.get(hypothesis.id).then((detail) => {
      setSelectedIds(detail.campaigns.map((campaign) => campaign.id));
    }).catch(() => setError('Failed to load linked campaigns.'));
  }, [hypothesis, open]);

  const selectedSet = useMemo(() => new Set(selectedIds), [selectedIds]);
  const toggleCampaign = (id: string) => {
    setSelectedIds((prev) => prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]);
  };
  const submit = () => {
    const trimmedName = name.trim();
    if (!trimmedName) {
      setError('Name is required.');
      return;
    }
    if (!selectedIds.length) {
      setError('Hypothesis must contain at least 1 campaign.');
      return;
    }
    onSubmit({ name: trimmedName, description: description.trim() || null, adCampaignIds: selectedIds });
  };

  return (
    <Modal open={open} onClose={onClose} title={hypothesis ? 'Edit hypothesis' : 'Create hypothesis'}>
      <div className="space-y-4">
        <FormField label="Name" required>
          <Input value={name} onChange={(event) => setName(event.target.value)} />
        </FormField>
        <FormField label="Description">
          <Textarea value={description} onChange={(event) => setDescription(event.target.value)} />
        </FormField>
        <div>
          <p className="mb-2 text-sm font-medium text-slate-200">Campaigns</p>
          <div className="max-h-72 space-y-2 overflow-auto rounded-lg border border-slate-800 p-2">
            {campaigns.map((campaign) => (
              <CampaignSelectRow
                key={campaign.id}
                campaign={campaign}
                checked={selectedSet.has(campaign.id)}
                moneySettings={moneySettings}
                rates={rates}
                onToggle={() => toggleCampaign(campaign.id)}
              />
            ))}
            {!campaigns.length ? <p className="p-2 text-sm text-slate-400">No campaigns available.</p> : null}
          </div>
          {error ? <p className="mt-2 text-sm text-rose-300">{error}</p> : null}
        </div>
        <div className="flex justify-end gap-2">
          <Button type="button" variant="secondary" onClick={onClose}>Cancel</Button>
          <Button type="button" disabled={isSubmitting} onClick={submit}>{isSubmitting ? 'Saving...' : 'Save'}</Button>
        </div>
      </div>
    </Modal>
  );
}

function CampaignSelectRow({
  campaign,
  checked,
  moneySettings,
  rates,
  onToggle,
}: {
  campaign: AdCampaign;
  checked: boolean;
  moneySettings: any;
  rates: any[] | undefined;
  onToggle: () => void;
}) {
  const joined = campaign.analytics?.joinedCount ?? campaign.joinedCount ?? 0;
  const price = Number(campaign.price ?? campaign.costAmount ?? 0);
  const primaryPrice = Number(campaign.priceInPrimaryCurrency ?? 0);
  return (
    <label className={`flex cursor-pointer items-center gap-3 rounded-md border p-2 text-sm ${checked ? 'border-blue-700 bg-slate-900' : 'border-slate-800 bg-slate-900/30 hover:border-slate-700'}`}>
      <input type="checkbox" checked={checked} onChange={onToggle} className="h-4 w-4 shrink-0" />
      <div className="min-w-0 flex-1">
        <p className="truncate font-semibold text-slate-100">{displayCampaignTitleWithDate(campaign)}</p>
        <MoneyStack amount={price} currency={campaign.currency} settings={moneySettings} rates={rates} amountInPrimary={primaryPrice} mainClassName="mt-0.5 truncate text-xs text-slate-400" subClassName="text-xs text-slate-500" />
        <p className="mt-0.5 text-xs text-slate-400">{formatMetric(joined)} joined</p>
      </div>
    </label>
  );
}

function SyncDetailsModal({ open, onClose, performance, syncRuns, hasCampaigns }: { open: boolean; onClose: () => void; performance: any; syncRuns: any[]; hasCampaigns: boolean }) {
  const latestSync = performance?.lastDailyAnalyticsSync || syncRuns?.[0];
  return (
    <Modal open={open} onClose={onClose} title="Analytics sync details">
      <div className="space-y-4">
        {hasCampaigns && !hasUsefulPerformanceSummary(performance) ? (
          <div className="rounded-lg border border-amber-700 bg-amber-950/30 px-3 py-2 text-sm text-amber-100">
            Performance metrics are hidden because these campaigns do not have captured analytics snapshots yet. For older placements, 24h and 7d subscriber/view changes cannot be reconstructed retroactively.
          </div>
        ) : null}
        <div className="rounded-lg border border-slate-800 bg-slate-950/30 p-3">
          <p className="text-sm font-medium text-slate-200">Latest run</p>
          {latestSync ? (
            <div className="mt-2 space-y-2 text-sm">
              <p className="text-slate-400">{new Date(latestSync.startedAt).toLocaleString()}</p>
              <SyncRunSummary run={latestSync} />
              <p className="text-xs text-slate-500">Channels {latestSync.channelsProcessed} · Campaigns {latestSync.campaignsProcessed} · Snapshots {latestSync.snapshotsCreated ?? 0}</p>
            </div>
          ) : <p className="mt-2 text-sm text-slate-400">No sync has been run yet.</p>}
        </div>
        {syncRuns.length ? (
          <div>
            <p className="mb-2 text-sm font-medium text-slate-200">Recent runs</p>
            <div className="space-y-2">
              {syncRuns.map((run) => (
                <div key={run.id} className="rounded-lg border border-slate-800 bg-slate-950/30 px-3 py-2 text-sm">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-medium text-slate-200">{new Date(run.startedAt).toLocaleString()}</span>
                    <span className={`rounded border px-2 py-0.5 text-xs ${syncStatusClass(run.status)}`}>{syncStatusLabel(run.status)}</span>
                    <span className="text-xs text-slate-500">{run.source}</span>
                  </div>
                  <p className="mt-1 text-xs text-slate-400">{describeSyncRun(run).detail}</p>
                </div>
              ))}
            </div>
          </div>
        ) : null}
      </div>
    </Modal>
  );
}

function getErrorMessage(error: unknown, fallback: string) {
  const responseMessage = (error as any)?.response?.data?.message;
  if (Array.isArray(responseMessage)) return responseMessage.join(', ');
  if (typeof responseMessage === 'string' && responseMessage.trim()) return responseMessage;
  return fallback;
}

function normalizeAdvertisingSelectionValue(value: unknown): string {
  if (typeof value !== 'string') return advertisingSelectionId(value);
  const raw = value.trim();
  if (!raw) return '';
  if (raw.startsWith('source:') || raw.startsWith('person:')) {
    return `source:${raw.replace(/^(source|person):/, '')}`;
  }
  if (raw.startsWith('channel:')) return raw;
  return `channel:${raw}`;
}

function MultiChannelSelect({ value, onChange, options }: { value: string[]; onChange: (v: string[]) => void; options: any[] }) {
  const [open, setOpen] = useState(false);
  const selectedIds = new Set((value || []).map(normalizeAdvertisingSelectionValue).filter(Boolean));
  const selected = options.filter((o) => selectedIds.has(o.selectionId));

  const toggle = (selectionId: string) => {
    if (selectedIds.has(selectionId)) onChange(value.filter((x) => normalizeAdvertisingSelectionValue(x) !== selectionId));
    else onChange([...value, selectionId]);
  };

  return (
    <div className="relative">
      <button type="button" onClick={() => setOpen((v) => !v)} className="flex min-h-11 w-full flex-wrap items-center gap-2 rounded-lg border border-neutral-700 bg-neutral-900 px-3 py-2 text-left text-sm text-white">
        {selected.length ? selected.map((s) => <span key={s.selectionId} className="inline-flex items-center gap-1 rounded-full border border-neutral-600 px-2 py-0.5 text-xs">{s.photoUrl || s.imageUrl ? <img src={s.photoUrl || s.imageUrl} className="h-4 w-4 rounded-full" alt="" /> : null}{s.title || s.name}</span>) : <span className="text-neutral-400">Select sources</span>}
      </button>
      {open ? <div className="absolute z-50 mt-1 max-h-56 w-full overflow-auto rounded-lg border border-neutral-700 bg-neutral-900 p-1">{options.map((o) => <button type="button" key={o.selectionId} onClick={() => toggle(o.selectionId)} className="flex w-full items-center gap-2 rounded px-2 py-2 text-left text-sm text-neutral-200 hover:bg-neutral-800">{o.photoUrl || o.imageUrl ? <img src={o.photoUrl || o.imageUrl} className="h-5 w-5 rounded-full" alt="" /> : <span className="inline-flex h-5 w-5 items-center justify-center rounded-full border border-neutral-600 text-[10px]">{String(o.title || o.name || '?').slice(0, 1).toUpperCase()}</span>}<span className="flex-1">{o.title || o.name}</span><span className="text-xs text-neutral-500">{o.label}</span><span>{selectedIds.has(o.selectionId) ? '✓' : ''}</span></button>)}</div> : null}
    </div>
  );
}

function isOwnTelegramChannel(channel: any) {
  return Array.isArray(channel?.adminLinks) && channel.adminLinks.length > 0;
}

function advertisingSelectionId(source: any): string {
  if (!source) return '';
  if (typeof source === 'string') return normalizeAdvertisingSelectionValue(source);
  if (source?.selectionId) return source.selectionId;
  if (source?.advertisingSourceId) return `source:${source.advertisingSourceId}`;
  if (source?.telegramChannelId) return `channel:${source.telegramChannelId}`;
  const kind = String(source?.sourceKind || source?.kind || source?.type || '').toLowerCase();
  if (kind === 'person' || kind === 'advertising_source' || source?.telegramUsername || source?.contactInfo) {
    return `source:${source.id}`;
  }
  return `channel:${source.id}`;
}

function campaignAdvertisingSources(row: any) {
  if (Array.isArray(row?.advertisingChannels)) return row.advertisingChannels;
  if (Array.isArray(row?.advertisingSources)) return row.advertisingSources;
  if (Array.isArray(row?.advertisingChannelIds)) return row.advertisingChannelIds;
  return [];
}

function CampaignModal({ open, onClose, onSubmit, title, initial, channels }: any) {
  const mapInitialValues = (row?: any): CampaignValues => row
    ? {
        telegramChannelId: row.telegramChannelId ?? '',
        promoId: row.promoId ?? '',
        telegramInviteLinkId: row.telegramInviteLinkId ?? '',
        advertisingChannelIds: campaignAdvertisingSources(row).map(advertisingSelectionId).filter(Boolean),
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
  const ownTelegramChannels = useMemo(() => (channels || []).filter(isOwnTelegramChannel), [channels]);
  const advertisingSources = useMemo(() => [
    ...(people || []).map((person: any) => ({
      ...person,
      selectionId: person.selectionId || `source:${person.id}`,
      title: person.title || person.name,
      label: 'Person',
    })),
    ...(channels || [])
      .filter((channel: any) => channel.id !== selectedChannelId)
      .map((channel: any) => {
        const isOwn = isOwnTelegramChannel(channel);
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
        options={ownTelegramChannels.map((x: any) => ({ value: x.id, label: x.title, iconUrl: x.photoUrl }))}
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
