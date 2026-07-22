'use client';

import type { MouseEventHandler } from 'react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useSearchParams } from 'next/navigation';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { AdCampaignsTable } from '@/components/ad-campaigns/campaigns-table';
import { PromoPreviewModal } from '@/components/ad-campaigns/promo-preview-modal';
import { IconAvatar } from '@/components/icons/icon-avatar';
import { IconPicker } from '@/components/icons/icon-picker';
import { AppShell } from '@/components/layout/app-shell';
import { MemberSelect } from '@/components/workspace/member-select';
import { TelegramImageUpload } from '@/components/telegram/telegram-image-upload';
import { TelegramPostPreview } from '@/components/telegram/telegram-post-preview';
import { TelegramTextEditor } from '@/components/telegram/telegram-text-editor';
import {
  accountsApi,
  adCampaignsApi,
  adHypothesesApi,
  advertisingChannelsApi,
  getTelegramChannelInviteLinks,
  getTelegramChannelPromos,
  iconsApi,
  promosApi,
  telegramChannelsApi,
  workspacesApi,
  type Account,
  type AdCampaign,
  type AdCampaignKpiStatus,
  type AdHypothesis,
  type Promo,
  type TelegramChannel,
  type TelegramInviteLink,
} from '@/lib/api';
import { currenciesApi } from '@/lib/api';
import { MoneyStack } from '@/components/ui/money-stack';
import { Button, Card, ConfirmDeleteModal, CustomSelect, DateInput, DateRangeInput, EmptyState, FormField, IconButton, Input, LoadingState, Modal, PageHeader, Select, Textarea } from '@/components/ui/primitives';
import { useAppToast } from '@/providers/toast-provider';
import { CircleHelp } from 'lucide-react';
import { accountDisplayName } from '@/lib/account-display';

type CampaignValues = {
  telegramChannelId: string;
  assignedMemberId?: string | null;
  promoIds: string[];
  inviteLinkIds: string[];
  advertisingChannelIds: string[];
  price: number;
  accountId: string;
  date?: string;
  notes?: string;
};

type CampaignSelectOption = {
  value: string;
  label: string;
  iconUrl?: string;
  iconEmoji?: string;
  iconFallback?: string;
  description?: string;
  searchText?: string;
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
  const searchParams = useSearchParams();
  const { pushToast, startOperation } = useAppToast();
  const [createOpen, setCreateOpen] = useState(false);
  const [editing, setEditing] = useState<any | null>(null);
  const [deleting, setDeleting] = useState<any | null>(null);
  const [channelFilter, setChannelFilter] = useState('');
  const [viewMode, setViewMode] = useState<AdCampaignsViewMode>('campaigns');
  const [search, setSearch] = useState('');
  const [sort, setSort] = useState('date_desc');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [hypothesisFormOpen, setHypothesisFormOpen] = useState(false);
  const [editingHypothesis, setEditingHypothesis] = useState<AdHypothesis | null>(null);
  const [deletingHypothesis, setDeletingHypothesis] = useState<AdHypothesis | null>(null);
  const [promoFormOpen, setPromoFormOpen] = useState(false);
  const [editingPromo, setEditingPromo] = useState<Promo | null>(null);
  const [deletingPromo, setDeletingPromo] = useState<Promo | null>(null);
  const [previewPromo, setPreviewPromo] = useState<Promo | null>(null);

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
    enabled: viewMode === 'campaigns',
  });
  const { data: performance } = useQuery({
    queryKey: ['ad-campaigns-performance', channelFilter],
    queryFn: () => adCampaignsApi.performanceSummary(channelFilter ? { channelId: channelFilter } : undefined),
    enabled: viewMode === 'campaigns',
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
    const requestedViewMode = searchParams.get('view');
    if (requestedViewMode === 'campaigns' || requestedViewMode === 'promos' || requestedViewMode === 'hypotheses') {
      setViewMode(requestedViewMode);
      return;
    }
    const savedViewMode = window.localStorage.getItem(AD_CAMPAIGNS_VIEW_MODE_STORAGE_KEY);
    if (savedViewMode === 'campaigns' || savedViewMode === 'promos' || savedViewMode === 'hypotheses') {
      setViewMode(savedViewMode);
    }
  }, [searchParams]);

  useEffect(() => {
    const requestedPromoId = searchParams.get('promoId');
    if (viewMode !== 'promos' || !requestedPromoId || !promos?.length) return;
    const requestedPromo = promos.find((promo) => promo.id === requestedPromoId);
    if (!requestedPromo) return;
    setPreviewPromo((current) => current?.id === requestedPromo.id ? current : requestedPromo);
  }, [promos, searchParams, viewMode]);

  const createMutation = useMutation({
    mutationFn: adCampaignsApi.create,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['ad-campaigns'] });
    },
  });
  const updateMutation = useMutation({
    mutationFn: ({ id, payload }: any) => adCampaignsApi.update(id, payload),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['ad-campaigns'] });
    },
  });
  const deleteMutation = useMutation({
    mutationFn: (id: string) => adCampaignsApi.remove(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['ad-campaigns'] });
    },
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
    },
  });
  const updatePromoMutation = useMutation({
    mutationFn: ({ id, payload }: { id: string; payload: Partial<Promo> }) => promosApi.update(id, payload),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['promos'] });
      qc.invalidateQueries({ queryKey: ['channel-promos'] });
    },
  });
  const deletePromoMutation = useMutation({
    mutationFn: (id: string) => promosApi.remove(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['promos'] });
      qc.invalidateQueries({ queryKey: ['channel-promos'] });
    },
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

    {viewMode === 'campaigns' && isLoading ? <LoadingState /> : null}
    {viewMode === 'campaigns' && error ? <div className="mb-4 rounded-lg border border-rose-700 p-3 text-sm text-rose-200">Failed to load campaigns.</div> : null}
    {viewMode === 'campaigns' && !isLoading && visibleCampaigns.length ? (
      <AdCampaignsTable
        campaigns={visibleCampaigns}
        moneySettings={moneySettings}
        rates={rates}
        onEdit={setEditing}
        onDelete={setDeleting}
        onToggleExclude={(campaign, excludeFromAnalytics) => excludeMutation.mutate({ id: campaign.id, excludeFromAnalytics })}
        onOpenPromo={setPreviewPromo}
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

    <CampaignModal
      open={createOpen}
      title="Create Campaign"
      channels={channels ?? []}
      onClose={() => setCreateOpen(false)}
      onSubmit={async (v: any) => {
        setCreateOpen(false);
        const operation = startOperation({
          id: `campaign-create:${Date.now()}`,
          title: 'Processing',
          message: 'Creating campaign...',
        });
        try {
          await createMutation.mutateAsync(v);
          operation.succeed({ title: 'Success', message: 'Campaign created.' });
        } catch (error) {
          operation.fail({
            title: 'Error',
            message: getErrorMessage(error, 'Failed to create campaign.'),
          });
        }
      }}
    />
    <CampaignModal
      open={!!editing}
      title="Edit Campaign"
      channels={channels ?? []}
      initial={editing ?? undefined}
      onClose={() => setEditing(null)}
      onSubmit={async (v: any) => {
        if (!editing) return;
        const campaignId = editing.id;
        setEditing(null);
        const operation = startOperation({
          id: `campaign-update:${campaignId}:${Date.now()}`,
          title: 'Processing',
          message: 'Saving campaign...',
        });
        try {
          await updateMutation.mutateAsync({ id: campaignId, payload: v });
          operation.succeed({ title: 'Success', message: 'Campaign updated.' });
        } catch (error) {
          operation.fail({
            title: 'Error',
            message: getErrorMessage(error, 'Failed to update campaign.'),
          });
        }
      }}
    />
    <PromoModal
      open={promoFormOpen}
      title={editingPromo ? 'Edit Promo' : 'Create Promo'}
      initial={editingPromo ?? undefined}
      onClose={() => { setPromoFormOpen(false); setEditingPromo(null); }}
      onSubmit={async (payload) => {
        const currentPromo = editingPromo;
        setPromoFormOpen(false);
        setEditingPromo(null);
        const operation = startOperation({
          id: `promo-${currentPromo ? `update:${currentPromo.id}` : 'create'}:${Date.now()}`,
          title: 'Processing',
          message: currentPromo ? 'Saving promo...' : 'Creating promo...',
        });
        try {
          if (currentPromo) {
            await updatePromoMutation.mutateAsync({ id: currentPromo.id, payload });
            operation.succeed({ title: 'Success', message: 'Promo updated.' });
          } else {
            await createPromoMutation.mutateAsync(payload);
            operation.succeed({ title: 'Success', message: 'Promo created.' });
          }
        } catch (error) {
          operation.fail({
            title: 'Error',
            message: getErrorMessage(error, currentPromo ? 'Failed to update promo.' : 'Failed to create promo.'),
          });
        }
      }}
      channels={ownTelegramChannels}
    />
    <PromoPreviewModal promo={previewPromo} onClose={() => setPreviewPromo(null)} />
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
    <ConfirmDeleteModal
      open={!!deleting}
      entityName={deleting?.title ?? 'campaign'}
      onClose={() => setDeleting(null)}
      onConfirm={async () => {
        if (!deleting) return;
        const deletingId = deleting.id;
        setDeleting(null);
        const operation = startOperation({
          id: `campaign-delete:${deletingId}:${Date.now()}`,
          title: 'Processing',
          message: 'Archiving campaign...',
        });
        try {
          await deleteMutation.mutateAsync(deletingId);
          operation.succeed({ title: 'Success', message: 'Campaign archived.' });
        } catch (error) {
          operation.fail({
            title: 'Error',
            message: getErrorMessage(error, 'Failed to archive campaign.'),
          });
        }
      }}
      label="Archive"
    />
    <ConfirmDeleteModal open={!!deletingHypothesis} entityName={deletingHypothesis?.name ?? 'hypothesis'} description="This deletes only the hypothesis. Campaigns remain untouched." onClose={() => setDeletingHypothesis(null)} onConfirm={() => deletingHypothesis ? deleteHypothesisMutation.mutateAsync(deletingHypothesis.id) : undefined} label="Delete" />
    <ConfirmDeleteModal
      open={!!deletingPromo}
      entityName={deletingPromo?.title ?? 'promo'}
      onClose={() => setDeletingPromo(null)}
      onConfirm={async () => {
        if (!deletingPromo) return;
        const promoId = deletingPromo.id;
        setDeletingPromo(null);
        const operation = startOperation({
          id: `promo-delete:${promoId}:${Date.now()}`,
          title: 'Processing',
          message: 'Deleting promo...',
        });
        try {
          await deletePromoMutation.mutateAsync(promoId);
          operation.succeed({ title: 'Success', message: 'Promo deleted.' });
        } catch (error) {
          operation.fail({
            title: 'Error',
            message: getErrorMessage(error, 'Failed to delete promo.'),
          });
        }
      }}
      label="Delete"
    />
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
  onOpenPromo,
}: {
  campaigns: any[];
  moneySettings: any;
  rates: any[] | undefined;
  onEdit: (campaign: any) => void;
  onDelete: (campaign: any) => void;
  onToggleExclude: (campaign: any, excludeFromAnalytics: boolean) => void;
  onOpenPromo: (promo: Promo) => void;
}) {
  const [kpiTooltip, setKpiTooltip] = useState<{
    channel: TelegramChannel;
    left: number;
    top: number;
  } | null>(null);

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
        <table className="w-full min-w-[1120px] table-fixed text-left text-sm">
          <colgroup>
            <col className="w-[420px]" />
            <col className="w-[360px]" />
            <col className="w-[180px]" />
            <col className="w-[140px]" />
          </colgroup>
          <thead className="bg-slate-950 text-xs uppercase text-neutral-400">
            <tr>
              <th className="px-4 py-3 font-medium">Campaign</th>
              <th className="px-4 py-3 font-medium" title="Hover a campaign performance card to see this channel's KPI ranges.">
                <span className="inline-flex items-center gap-1">
                  Performance
                  <CircleHelp size={13} className="text-slate-500" />
                </span>
              </th>
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
              const kpiStatus = effectiveCampaignKpiStatus(campaign, primaryCostPerJoined, costPerJoined);
              return (
                <tr key={campaign.id} className={`align-top text-slate-200 transition-colors hover:bg-neutral-900 ${index % 2 ? 'bg-neutral-950' : 'bg-black'}`}>
                  <td className="px-4 py-4">
                    <div className="min-w-0 space-y-3">
                      <div className="truncate font-semibold text-white">{displayCampaignTitleWithDate(campaign)}</div>
                      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-500">
                        <SourceChip source={campaign.telegramChannel} fallback="-" compact href={campaign.telegramChannel?.id ? `/telegram/channels/${campaign.telegramChannel.id}` : undefined} title={campaign.telegramChannel?.title ? `Own Telegram channel: ${campaign.telegramChannel.title}\nClick to open this channel.\nCtrl/Cmd + click opens it in a new tab.` : undefined} />
                        {campaign.assignedMember ? <MemberChip member={campaign.assignedMember} /> : null}
                      </div>
                      <div className="flex max-w-full flex-wrap items-center gap-1.5">
                        <PromoList promos={campaign.promos || (campaign.promo ? [campaign.promo] : [])} onOpenPromo={onOpenPromo} inline />
                        <InviteLinkList inviteLinks={campaign.inviteLinks || []} inline />
                      </div>
                      <SourceList sources={campaign.advertisingChannels || []} />
                    </div>
                  </td>
                  <td className="px-4 py-4">
                    <PerformanceCell
                      campaign={campaign}
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
                      metrics={metrics}
                      onShowKpiTooltip={showKpiTooltip}
                      onHideKpiTooltip={() => setKpiTooltip(null)}
                    />
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
      {kpiTooltip ? <KpiTooltip channel={kpiTooltip.channel} left={kpiTooltip.left} top={kpiTooltip.top} /> : null}
    </>
  );
}

function PerformanceCell({
  campaign,
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
  metrics,
  onShowKpiTooltip,
  onHideKpiTooltip,
}: {
  campaign: AdCampaign;
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
  metrics: Array<{ label: string; value: string }>;
  onShowKpiTooltip: (channel: TelegramChannel | undefined, element: HTMLElement) => void;
  onHideKpiTooltip: () => void;
}) {
  const kpiTextClass = kpiMetricTextClass(kpiStatus);
  const cardClass = performanceCardClass(kpiStatus);
  const shouldShowKpiTooltip = kpiStatus === 'good' || kpiStatus === 'acceptable' || kpiStatus === 'bad';
  return (
    <div className={`rounded-xl border p-3 ${cardClass}`}>
      <div className="mb-3 flex flex-wrap items-start justify-between gap-2">
        <KpiStatusBadge
          status={kpiStatus}
          onMouseEnter={(event) => {
            if (!shouldShowKpiTooltip) return;
            onShowKpiTooltip(campaign.telegramChannel, event.currentTarget);
          }}
          onMouseLeave={() => {
            if (!shouldShowKpiTooltip) return;
            onHideKpiTooltip();
          }}
        />
      </div>
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
      {metrics.length ? (
        <div className="mt-3 flex flex-wrap gap-1.5">
          {metrics.slice(0, 4).map((metric) => (
            <span key={metric.label} className="rounded border border-slate-700/80 bg-black/20 px-2 py-0.5 text-xs text-slate-200">
              {metric.label}: {metric.value}
            </span>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function kpiMetricTextClass(status?: AdCampaignKpiStatus | null) {
  if (status === 'good') return 'text-emerald-300';
  if (status === 'acceptable') return 'text-yellow-200';
  if (status === 'bad') return 'text-rose-200';
  return 'text-white';
}

function performanceCardClass(status?: AdCampaignKpiStatus | null) {
  if (status === 'good') return 'border-emerald-700/70 bg-emerald-950/20';
  if (status === 'acceptable') return 'border-yellow-700/70 bg-yellow-950/20';
  if (status === 'bad') return 'border-rose-700/70 bg-rose-950/20';
  return 'border-slate-800 bg-slate-950/40';
}

function PromoList({ promos, onOpenPromo, inline = false }: { promos: Promo[]; onOpenPromo: (promo: Promo) => void; inline?: boolean }) {
  const [expanded, setExpanded] = useState(false);
  if (!promos.length) return null;
  const visible = expanded ? promos : promos.slice(0, 3);
  const hiddenCount = Math.max(0, promos.length - visible.length);
  const content = (
    <>
      {visible.map((promo) => (
        <button
          key={promo.id}
          type="button"
          onClick={(event) => {
            if (event.metaKey || event.ctrlKey) {
              window.open(`/ad-campaigns?view=promos&promoId=${promo.id}`, '_blank', 'noopener,noreferrer');
              return;
            }
            onOpenPromo(promo);
          }}
          title={`Promo: ${promo.title}\nClick to open its preview modal.\nCtrl/Cmd + click opens it in a new tab.`}
          className="inline-flex max-w-[240px] items-center gap-1.5 rounded-full border border-blue-800 bg-blue-950/30 px-2.5 py-1 text-xs text-blue-100 transition-colors hover:bg-blue-950/50"
        >
          <PromoVisual promo={promo} />
          <span className="truncate">{promo.title}</span>
        </button>
      ))}
      {hiddenCount ? (
        <button
          type="button"
          onClick={() => setExpanded(true)}
          className="rounded-full border border-slate-700 px-2 py-1 text-xs text-slate-300 transition-colors hover:border-slate-500 hover:text-white"
          title={`Show ${hiddenCount} more promos`}
        >
          +{hiddenCount}
        </button>
      ) : null}
    </>
  );
  if (inline) return content;
  return <div className="flex max-w-full flex-wrap gap-1.5">{content}</div>;
}

function PromoVisual({ promo }: { promo: Promo }) {
  if (promo.icon?.imageUrl) {
    return <img src={promo.icon.imageUrl} alt="" className="h-4 w-4 rounded-full object-cover" />;
  }
  if (promo.icon?.emoji) {
    return <span className="inline-flex h-4 w-4 items-center justify-center text-[13px] leading-none">{promo.icon.emoji}</span>;
  }
  return null;
}

function InviteLinkList({ inviteLinks, inline = false }: { inviteLinks: TelegramInviteLink[]; inline?: boolean }) {
  const [expanded, setExpanded] = useState(false);
  if (!inviteLinks.length) return null;
  const visible = expanded ? inviteLinks : inviteLinks.slice(0, 3);
  const hiddenCount = Math.max(0, inviteLinks.length - visible.length);
  const content = (
    <>
      {visible.map((inviteLink) => (
        <a
          key={inviteLink.id}
          href={inviteLink.url}
          title={`Invite link: ${inviteLink.name}\nClick to open the invite link.\nCtrl/Cmd + click opens it in a new tab.`}
          className="inline-flex max-w-[240px] items-center gap-1 rounded-full border border-amber-800 bg-amber-950/20 px-2 py-1 text-xs text-amber-100 transition-colors hover:bg-amber-950/35"
        >
          <span className="truncate">{inviteLink.name}</span>
        </a>
      ))}
      {hiddenCount ? (
        <button
          type="button"
          onClick={() => setExpanded(true)}
          className="rounded-full border border-slate-700 px-2 py-1 text-xs text-slate-300 transition-colors hover:border-slate-500 hover:text-white"
          title={`Show ${hiddenCount} more invite links`}
        >
          +{hiddenCount}
        </button>
      ) : null}
    </>
  );
  if (inline) return content;
  return <div className="flex max-w-full flex-wrap gap-1.5">{content}</div>;
}

function SourceChip({ source, fallback, compact = false, href, title }: { source: any; fallback?: string; compact?: boolean; href?: string; title?: string }) {
  const label = source?.title || source?.name || fallback || '-';
  const content = (
    <>
      {source?.photoUrl || source?.imageUrl ? <img src={source.photoUrl || source.imageUrl} alt="" className={`${compact ? 'h-4 w-4' : 'h-5 w-5'} shrink-0 rounded-full object-cover`} /> : <span className={`${compact ? 'h-4 w-4' : 'h-5 w-5'} inline-flex shrink-0 items-center justify-center rounded-full border border-slate-700 text-[10px] text-slate-400`}>{String(label).slice(0, 1).toUpperCase()}</span>}
      <span className="truncate">{label}</span>
    </>
  );
  if (!href) {
    return (
      <span className={`inline-flex items-center gap-2 ${compact ? 'max-w-[200px]' : 'max-w-[220px]'}`} title={title}>
        {content}
      </span>
    );
  }
  return (
    <a
      href={href}
      title={title}
      className={`inline-flex items-center gap-2 transition-colors hover:text-white ${compact ? 'max-w-[200px]' : 'max-w-[220px]'}`}
    >
      {content}
    </a>
  );
}

function SourceList({ sources }: { sources: any[] }) {
  const [expanded, setExpanded] = useState(false);
  if (!sources.length) return null;
  const visible = expanded ? sources : sources.slice(0, 3);
  const hiddenCount = Math.max(0, sources.length - visible.length);
  return (
    <div className="flex max-w-full flex-wrap gap-1.5">
      {visible.map((source) => (
        <a
          key={source.selectionId || source.id}
          href={source.selectionId?.startsWith('source:') ? '/advertising-channels' : source.id ? `/telegram/channels/${source.id}` : '/advertising-channels'}
          title={`${source.selectionId?.startsWith('source:') ? 'Advertising source' : 'Telegram channel source'}: ${source.title || source.name}\nClick to open it.\nCtrl/Cmd + click opens it in a new tab.`}
          className="inline-flex max-w-[260px] items-center gap-1.5 rounded-full bg-slate-900 px-2 py-1 text-xs text-slate-200 ring-1 ring-slate-800 transition-colors hover:bg-slate-800"
        >
          {source.photoUrl || source.imageUrl ? <img src={source.photoUrl || source.imageUrl} alt="" className="h-4 w-4 rounded-full object-cover" /> : null}
          <span className="truncate">{source.title || source.name}</span>
        </a>
      ))}
      {hiddenCount ? (
        <button
          type="button"
          onClick={() => setExpanded(true)}
          className="rounded-full border border-slate-700 px-2 py-1 text-xs text-slate-300 transition-colors hover:border-slate-500 hover:text-white"
          title={`Show ${hiddenCount} more sources`}
        >
          +{hiddenCount}
        </button>
      ) : null}
    </div>
  );
}

function HypothesisLinks({ links }: { links: any[] }) {
  const [expanded, setExpanded] = useState(false);
  if (!links.length) return <span className="text-slate-500">-</span>;
  const visible = expanded ? links : links.slice(0, 2);
  const hiddenCount = Math.max(0, links.length - visible.length);
  return (
    <div className="flex min-w-0 max-w-full flex-wrap gap-1.5">
      {visible.map((link) => (
        <span key={link.hypothesis.id} className={`inline-flex min-w-0 max-w-full rounded-full border px-2 py-0.5 text-xs ${hypothesisStatusClass(link.hypothesis.status)}`}>
          <span className="truncate">{link.hypothesis.name}</span>
        </span>
      ))}
      {hiddenCount ? (
        <button
          type="button"
          onClick={() => setExpanded(true)}
          className="rounded-full border border-slate-700 px-2 py-0.5 text-xs text-slate-300 transition-colors hover:border-slate-500 hover:text-white"
          title={`Show ${hiddenCount} more hypotheses`}
        >
          +{hiddenCount}
        </button>
      ) : null}
    </div>
  );
}

function MemberChip({ member }: { member: NonNullable<AdCampaign['assignedMember']> }) {
  const label = member.user?.name || 'Member';
  const avatarImageUrl = member.avatarIcon?.imageUrl ?? undefined;
  const avatarEmoji = member.avatarIcon?.emoji ?? undefined;
  return (
    <a
      href="/workspace-members"
      title={`Assigned member: ${label}\nClick to open workspace members.\nCtrl/Cmd + click opens it in a new tab.`}
      className="inline-flex max-w-[220px] items-center gap-1.5 rounded-full border border-slate-700/80 bg-slate-900/70 px-2 py-1 text-xs text-slate-200 transition-colors hover:border-slate-500 hover:text-white"
    >
      {avatarImageUrl ? <img src={avatarImageUrl} alt="" className="h-4 w-4 shrink-0 rounded-full object-cover" /> : null}
      {!avatarImageUrl && avatarEmoji ? <span className="inline-flex h-4 w-4 shrink-0 items-center justify-center text-[12px] leading-none">{avatarEmoji}</span> : null}
      {!avatarImageUrl && !avatarEmoji ? <span className="inline-flex h-4 w-4 shrink-0 items-center justify-center rounded-full border border-slate-600 text-[10px] text-slate-400">{label.slice(0, 1).toUpperCase()}</span> : null}
      <span className="truncate">{label}</span>
    </a>
  );
}

function hasValue(value: unknown) {
  return value != null && Number.isFinite(Number(value));
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
      className={`inline-flex rounded border px-2 py-0.5 text-xs ${kpiStatusClass(status)} ${status && status !== 'unknown' && onMouseEnter ? 'cursor-help' : ''}`}
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
            <Card key={promo.id}>
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <PromoIcon iconId={promo.iconId} icon={promo.icon} title={promo.title} />
                    <h3 className="truncate text-lg font-semibold text-white">{promo.title}</h3>
                  </div>
                  <div className="mt-1 flex flex-wrap items-center gap-2">
                    {promo.telegramChannel ? <SourceChip source={promo.telegramChannel} compact /> : null}
                    {promo.assignedMember ? <PromoAssignedMemberChip member={promo.assignedMember} /> : null}
                  </div>
                </div>
                <div className="flex shrink-0 gap-2">
                  <IconButton onClick={() => onEdit(promo)} />
                  <IconButton kind="delete" onClick={() => onDelete(promo)} />
                </div>
              </div>
            </Card>
          ))}
        </div>
      ) : null}
    </>
  );
}

function PromoIcon({
  iconId,
  icon,
  title,
}: {
  iconId?: string | null;
  icon?: Promo['icon'];
  title: string;
}) {
  const iconQuery = useQuery({
    queryKey: ['icon', iconId],
    queryFn: () => iconsApi.get(iconId as string),
    enabled: Boolean(iconId) && !icon,
  });
  const resolvedIcon = icon || iconQuery.data;
  if (!resolvedIcon) return null;
  return (
    <IconAvatar
      icon={resolvedIcon}
      label={title}
      size="xs"
      bordered={false}
      className="!bg-transparent"
    />
  );
}

function PromoAssignedMemberChip({ member }: { member: NonNullable<Promo['assignedMember']> }) {
  const label = member.user?.name || 'Member';
  const avatarImageUrl = member.avatarIcon?.imageUrl ?? undefined;
  const avatarEmoji = member.avatarIcon?.emoji ?? undefined;
  return (
    <a
      href="/workspace-members"
      title={`Assigned member: ${label}\nClick to open workspace members.\nCtrl/Cmd + click opens it in a new tab.`}
      className="inline-flex max-w-[220px] items-center gap-1.5 rounded-full border border-slate-700/80 bg-slate-900/70 px-2 py-1 text-xs text-slate-200 transition-colors hover:border-slate-500 hover:text-white"
    >
      {avatarImageUrl ? <img src={avatarImageUrl} alt="" className="h-4 w-4 shrink-0 rounded-full object-cover" /> : null}
      {!avatarImageUrl && avatarEmoji ? <span className="inline-flex h-4 w-4 shrink-0 items-center justify-center text-[12px] leading-none">{avatarEmoji}</span> : null}
      {!avatarImageUrl && !avatarEmoji ? <span className="inline-flex h-4 w-4 shrink-0 items-center justify-center rounded-full border border-slate-600 text-[10px] text-slate-400">{label.slice(0, 1).toUpperCase()}</span> : null}
      <span className="truncate">{label}</span>
    </a>
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
  onSubmit: (payload: { telegramChannelId: string; assignedMemberId?: string | null; iconId?: string | null; title: string; imageData?: string; text?: string }) => void;
  title: string;
  initial?: Promo;
  channels: TelegramChannel[];
}) {
  const channelOptions = useMemo(
    () => channels.map((channel) => ({ value: channel.id, label: channel.title, iconUrl: channel.photoUrl, iconFallback: channel.title })),
    [channels],
  );
  const [iconId, setIconId] = useState<string | null>(initial?.iconId || null);
  const [assignedMemberId, setAssignedMemberId] = useState<string | null>(initial?.assignedMemberId ?? initial?.assignedMember?.id ?? null);
  const [selectedChannelId, setSelectedChannelId] = useState(initial?.telegramChannelId ?? '');
  const [titleValue, setTitleValue] = useState(initial?.title ?? '');
  const [textValue, setTextValue] = useState(initial?.text ?? '');
  const [imageUrls, setImageUrls] = useState<string[]>(initial?.imageData ? [initial.imageData] : []);
  const [uploadingImages, setUploadingImages] = useState(false);

  useEffect(() => {
    if (!open) return;
    setIconId(initial?.iconId || null);
    setAssignedMemberId(initial?.assignedMemberId ?? initial?.assignedMember?.id ?? null);
    setSelectedChannelId(initial?.telegramChannelId ?? '');
    setTitleValue(initial?.title ?? '');
    setTextValue(initial?.text ?? '');
    setImageUrls(initial?.imageData ? [initial.imageData] : []);
    setUploadingImages(false);
  }, [initial, open]);

  useEffect(() => {
    if (!open || selectedChannelId || channels.length !== 1) return;
    setSelectedChannelId(channels[0].id);
  }, [channels, open, selectedChannelId]);

  const selectedChannel = channels.find((channel) => channel.id === selectedChannelId);
  const submit = () => {
    const trimmedTitle = titleValue.trim();
    const trimmedText = textValue.trim();
    onSubmit({
      telegramChannelId: selectedChannelId,
      assignedMemberId,
      iconId,
      title: trimmedTitle,
      imageData: imageUrls[0] || undefined,
      text: trimmedText || undefined,
    });
  };
  const canSubmit = Boolean(selectedChannelId && titleValue.trim() && !uploadingImages);

  return (
    <Modal open={open} onClose={onClose} title={title} size="xl">
      <div className="grid items-start gap-4 xl:grid-cols-[minmax(270px,0.72fr)_minmax(0,1.28fr)]">
        <TelegramPostPreview
          channelTitle={selectedChannel?.title || 'Telegram channel'}
          channelPhotoUrl={selectedChannel?.photoUrl}
          text={textValue}
          imageUrls={imageUrls}
        />
        <Card className="space-y-3">
          <div className="grid gap-3 md:grid-cols-[auto_minmax(0,1.15fr)_minmax(220px,0.85fr)]">
            <FormField label="Emoji">
              <IconPicker
                compact
                iconId={iconId}
                onChange={setIconId}
                buttonLabel="Add emoji"
              />
            </FormField>
            <FormField label="Internal title" required>
              <Input value={titleValue} onChange={(event) => setTitleValue(event.target.value)} placeholder="Promo title" />
            </FormField>
            <FormField label="Channel" required>
              <CustomSelect
                value={selectedChannelId}
                onChange={setSelectedChannelId}
                placeholder="Select channel"
                options={channelOptions}
              />
            </FormField>
          </div>
          <FormField label="Member">
            <MemberSelect
              value={assignedMemberId}
              onChange={(value) => setAssignedMemberId(value || null)}
              defaultToCurrent={!initial}
            />
          </FormField>
          <FormField label="Telegram text">
            <TelegramTextEditor
              value={textValue}
              onChange={setTextValue}
              rows={8}
              channelId={selectedChannelId || undefined}
            />
          </FormField>
          <TelegramImageUpload
            value={imageUrls}
            onChange={(urls) => setImageUrls(urls.slice(0, 1))}
            onUploadingChange={setUploadingImages}
          />
          {imageUrls.length > 1 ? (
            <p className="text-xs text-amber-300">
              Promo keeps only one image. The first uploaded image will be saved.
            </p>
          ) : null}
          <div className="flex justify-end gap-2">
            <Button variant="secondary" type="button" onClick={onClose}>Cancel</Button>
            <Button type="button" disabled={!canSubmit} onClick={submit}>
              {initial ? 'Save promo' : 'Create promo'}
            </Button>
          </div>
        </Card>
      </div>
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

function MultiValueSelect({
  value,
  onChange,
  options,
  placeholder,
}: {
  value: string[];
  onChange: (v: string[]) => void;
  options: CampaignSelectOption[];
  placeholder: string;
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const rootRef = useRef<HTMLDivElement | null>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const [menuStyle, setMenuStyle] = useState<{
    top: number;
    left: number;
    width: number;
  } | null>(null);
  const selectedIds = new Set(value || []);
  const selected = options.filter((option) => selectedIds.has(option.value));
  const filteredOptions = options.filter((option) =>
    `${option.label} ${option.description || ''} ${option.searchText || ''}`
      .toLocaleLowerCase()
      .includes(search.trim().toLocaleLowerCase()),
  );

  useEffect(() => {
    if (!open) return;

    const updatePosition = () => {
      const rect = triggerRef.current?.getBoundingClientRect();
      if (!rect) return;
      const viewportPadding = 16;
      const width = Math.min(
        Math.max(rect.width, 280),
        window.innerWidth - viewportPadding * 2,
      );
      const left = Math.min(
        Math.max(viewportPadding, rect.left),
        window.innerWidth - width - viewportPadding,
      );
      const estimatedHeight = 360;
      const spaceBelow = window.innerHeight - rect.bottom - viewportPadding;
      const showAbove =
        spaceBelow < 220 && rect.top > estimatedHeight + viewportPadding;
      setMenuStyle({
        left,
        width,
        top: showAbove
          ? Math.max(viewportPadding, rect.top - estimatedHeight - 8)
          : Math.min(window.innerHeight - estimatedHeight - viewportPadding, rect.bottom + 8),
      });
    };

    updatePosition();
    window.addEventListener('resize', updatePosition);
    window.addEventListener('scroll', updatePosition, true);
    return () => {
      window.removeEventListener('resize', updatePosition);
      window.removeEventListener('scroll', updatePosition, true);
    };
  }, [open]);

  const toggle = (optionValue: string) => {
    if (selectedIds.has(optionValue)) onChange(value.filter((item) => item !== optionValue));
    else onChange([...value, optionValue]);
  };

  return (
    <div ref={rootRef} className="relative">
      <button
        ref={triggerRef}
        type="button"
        onClick={() => {
          setOpen((current) => {
            if (current) setSearch('');
            return !current;
          });
        }}
        className="flex min-h-11 w-full flex-wrap items-center gap-2 rounded-lg border border-neutral-700 bg-neutral-900 px-3 py-2 text-left text-sm text-white"
      >
        {selected.length ? selected.map((option) => (
          <span key={option.value} className="inline-flex max-w-[220px] items-center gap-1.5 rounded-full border border-neutral-600 px-2 py-0.5 text-xs">
            <SelectOptionVisual option={option} />
            <span className="truncate">{option.label}</span>
          </span>
        )) : <span className="text-neutral-400">{placeholder}</span>}
      </button>
      {open && menuStyle
        ? createPortal(
            <div className="fixed inset-0 z-[180]">
              <button
                type="button"
                aria-label="Close select"
                className="absolute inset-0 cursor-default bg-transparent"
                onClick={() => {
                  setOpen(false);
                  setSearch('');
                }}
              />
              <div
                className="absolute overflow-hidden rounded-xl border border-neutral-700 bg-neutral-900 shadow-2xl"
                style={{
                  top: menuStyle.top,
                  left: menuStyle.left,
                  width: menuStyle.width,
                  maxHeight: 360,
                }}
                onClick={(event) => event.stopPropagation()}
              >
                <div className="border-b border-neutral-800 p-2">
                  <Input
                    autoFocus
                    value={search}
                    onChange={(event) => setSearch(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key === 'Escape') {
                        event.preventDefault();
                        setOpen(false);
                        setSearch('');
                      }
                    }}
                    placeholder="Search..."
                    className="bg-neutral-950"
                  />
                </div>
                <div className="max-h-[300px] overflow-auto p-1">
                  {filteredOptions.map((option) => (
                    <button type="button" key={option.value} onClick={() => toggle(option.value)} className="flex w-full items-center gap-2 rounded-lg px-2 py-2 text-left text-sm text-neutral-200 hover:bg-neutral-800">
                      <SelectOptionVisual option={option} />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate">{option.label}</span>
                        {option.description ? <span className="block truncate text-xs text-neutral-500">{option.description}</span> : null}
                      </span>
                      <span className="text-blue-300">{selectedIds.has(option.value) ? '✓' : ''}</span>
                    </button>
                  ))}
                  {!filteredOptions.length ? <p className="px-3 py-3 text-center text-sm text-neutral-500">No options found</p> : null}
                </div>
              </div>
            </div>,
            document.body,
          )
        : null}
    </div>
  );
}

function SelectOptionVisual({ option }: { option: CampaignSelectOption }) {
  if (option.iconUrl) {
    return <img src={option.iconUrl} className="h-5 w-5 shrink-0 rounded-full object-cover" alt="" />;
  }
  if (option.iconEmoji) {
    return <span className="inline-flex h-5 w-5 shrink-0 items-center justify-center text-[15px] leading-none">{option.iconEmoji}</span>;
  }
  return null;
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

function mergeCampaignSelectOptions(
  primary: CampaignSelectOption[],
  fallback: CampaignSelectOption[],
) {
  const byId = new Map<string, CampaignSelectOption>();
  [...fallback, ...primary].forEach((option) => {
    if (!option?.value) return;
    byId.set(option.value, option);
  });
  return [...byId.values()];
}

function CampaignModal({ open, onClose, onSubmit, title, initial, channels }: any) {
  const mapInitialValues = (row?: any): CampaignValues => row
    ? {
        telegramChannelId: row.telegramChannelId ?? '',
        assignedMemberId: row.assignedMemberId ?? row.assignedMember?.id ?? null,
        promoIds: Array.isArray(row.promoIds) ? row.promoIds : row.promoId ? [row.promoId] : [],
        inviteLinkIds: Array.isArray(row.inviteLinkIds) ? row.inviteLinkIds : row.telegramInviteLinkId ? [row.telegramInviteLinkId] : [],
        advertisingChannelIds: campaignAdvertisingSources(row).map(advertisingSelectionId).filter(Boolean),
        price: Number(row.price ?? row.costAmount ?? 0),
        accountId: row.accountId ?? '',
        date: toInputDate(row.placementDate || row.startedAt),
        notes: row.notes ?? '',
      }
    : { telegramChannelId: '', assignedMemberId: null, promoIds: [], inviteLinkIds: [], advertisingChannelIds: [], price: 0, accountId: '', date: formatLocalDate(new Date()), notes: '' };

  const { register, handleSubmit, watch, setValue, reset, formState: { errors } } = useForm<CampaignValues>({ defaultValues: mapInitialValues(initial) });
  const selectedChannelId = watch('telegramChannelId');
  const selectedPromoIds = watch('promoIds') || [];
  const selectedInviteLinkIds = watch('inviteLinkIds') || [];
  const selectedAdChannels = watch('advertisingChannelIds') || [];

  useEffect(() => {
    register('advertisingChannelIds');
    register('promoIds');
    register('inviteLinkIds');
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
  const promoOptions = useMemo(() => {
    const liveOptions = availablePromos.map((promo: Promo) => ({
      value: promo.id,
      label: promo.title,
      iconUrl: promo.icon?.imageUrl ?? undefined,
      iconEmoji: promo.icon?.emoji ?? undefined,
      iconFallback: promo.title,
      description: promo.telegramChannel?.title,
      searchText: promo.text,
    }));
    const initialOptions = (initial?.promos || (initial?.promo ? [initial.promo] : [])).map((promo: Promo) => ({
      value: promo.id,
      label: promo.title,
      iconUrl: promo.icon?.imageUrl ?? undefined,
      iconEmoji: promo.icon?.emoji ?? undefined,
      iconFallback: promo.title,
      description: promo.telegramChannel?.title,
      searchText: promo.text,
    }));
    return mergeCampaignSelectOptions(liveOptions, initialOptions);
  }, [availablePromos, initial]);
  const inviteLinkOptions = useMemo(() => {
    const liveOptions = (inviteLinks?.items || []).map((inviteLink: TelegramInviteLink) => ({
      value: inviteLink.id,
      label: inviteLink.name,
      iconUrl:
        inviteLink.creatorMember?.avatarIcon?.imageUrl ??
        inviteLink.creatorPhotoUrl ??
        undefined,
      iconEmoji: inviteLink.creatorMember?.avatarIcon?.emoji ?? undefined,
      iconFallback:
        inviteLink.creatorMember?.user?.name ??
        inviteLink.creatorFirstName ??
        inviteLink.creatorUsername ??
        inviteLink.name,
      description:
        inviteLink.creatorMember?.user?.name || inviteLink.creatorUsername
          ? `${inviteLink.creatorMember?.user?.name || inviteLink.creatorUsername} · ${inviteLink.url}`
          : inviteLink.url,
    }));
    const initialOptions = (initial?.inviteLinks || (initial?.telegramInviteLink ? [initial.telegramInviteLink] : [])).map((inviteLink: TelegramInviteLink) => ({
      value: inviteLink.id,
      label: inviteLink.name,
      iconUrl:
        inviteLink.creatorMember?.avatarIcon?.imageUrl ??
        inviteLink.creatorPhotoUrl ??
        undefined,
      iconEmoji: inviteLink.creatorMember?.avatarIcon?.emoji ?? undefined,
      iconFallback:
        inviteLink.creatorMember?.user?.name ??
        inviteLink.creatorFirstName ??
        inviteLink.creatorUsername ??
        inviteLink.name,
      description:
        inviteLink.creatorMember?.user?.name || inviteLink.creatorUsername
          ? `${inviteLink.creatorMember?.user?.name || inviteLink.creatorUsername} · ${inviteLink.url}`
          : inviteLink.url,
    }));
    return mergeCampaignSelectOptions(liveOptions, initialOptions);
  }, [initial, inviteLinks]);
  const advertisingSources = useMemo(() => {
    const liveOptions = [
    ...(people || []).map((person: any) => ({
      value: person.selectionId || `source:${person.id}`,
      label: person.title || person.name,
      iconUrl: person.imageUrl ?? undefined,
      iconFallback: person.title || person.name,
      description: 'Person',
      searchText: `${person.telegramUsername || ''} ${person.contactInfo || ''}`,
    })),
    ...(channels || [])
      .filter((channel: any) => channel.id !== selectedChannelId)
      .map((channel: any) => {
        const isOwn = isOwnTelegramChannel(channel);
        return {
          value: `channel:${channel.id}`,
          label: channel.title,
          iconUrl: channel.photoUrl ?? undefined,
          iconFallback: channel.title,
          description: isOwn ? 'Own channel' : 'External channel',
          searchText: channel.username || '',
        };
      }),
    ];
    const initialOptions = campaignAdvertisingSources(initial).map((source: any) => ({
      value: advertisingSelectionId(source),
      label: source.title || source.name,
      iconUrl: source.photoUrl || source.imageUrl || undefined,
      iconFallback: source.title || source.name,
      description:
        source.selectionId?.startsWith('source:') ||
        source.sourceKind === 'person' ||
        source.kind === 'person'
          ? 'Person'
          : 'External channel',
      searchText: `${source.username || source.telegramUsername || ''} ${source.contactInfo || ''}`,
    }));
    return mergeCampaignSelectOptions(liveOptions, initialOptions);
  }, [channels, initial, people, selectedChannelId]);

  return <Modal open={open} onClose={onClose} title={title}><form className="space-y-3" onSubmit={handleSubmit((v: any) => {
    onSubmit({
      ...v,
      assignedMemberId: v.assignedMemberId || null,
      promoIds: v.promoIds || [],
      inviteLinkIds: v.inviteLinkIds || [],
      price: Number(v.price),
      advertisingChannelIds: v.advertisingChannelIds || [],
    });
  })}>
    <FormField label="Own Telegram Channel" required error={errors.telegramChannelId ? 'Required field' : undefined}>
      <CustomSelect
        value={watch('telegramChannelId')}
        onChange={(v) => {
          setValue('telegramChannelId', v, { shouldValidate: true, shouldDirty: true });
          setValue('promoIds', [], { shouldDirty: true, shouldValidate: true });
          setValue('inviteLinkIds', [], { shouldDirty: true, shouldValidate: true });
        }}
        placeholder="Select"
        options={ownTelegramChannels.map((x: any) => ({ value: x.id, label: x.title, iconUrl: x.photoUrl, iconFallback: x.title }))}
      />
    </FormField>
    <FormField label="Member">
      <MemberSelect
        value={watch('assignedMemberId') ?? null}
        onChange={(assignedMemberId) => setValue('assignedMemberId', assignedMemberId || null, { shouldDirty: true })}
        defaultToCurrent={!initial}
      />
    </FormField>
    <FormField label="Promos">
      <MultiValueSelect value={selectedPromoIds} onChange={(next) => setValue('promoIds', next, { shouldValidate: true, shouldDirty: true })} options={promoOptions} placeholder="Select promos" />
    </FormField>
    <FormField label="Invite Links">
      <MultiValueSelect value={selectedInviteLinkIds} onChange={(next) => setValue('inviteLinkIds', next, { shouldValidate: true, shouldDirty: true })} options={inviteLinkOptions} placeholder="Select invite links" />
    </FormField>
    <FormField label="Advertising Sources">
      <MultiValueSelect value={selectedAdChannels.filter((id) => id !== `channel:${selectedChannelId}` && id !== selectedChannelId)} onChange={(next) => setValue('advertisingChannelIds', next, { shouldValidate: true, shouldDirty: true })} options={advertisingSources} placeholder="Select sources" />
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
    <input type="hidden" {...register('accountId', { required: true })} />
    <div className="flex justify-end gap-2"><Button variant="secondary" type="button" onClick={onClose}>Cancel</Button><Button type="submit">Save</Button></div>
  </form></Modal>;
}
