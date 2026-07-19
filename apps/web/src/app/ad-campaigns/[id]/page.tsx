'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { RotateCw } from 'lucide-react';
import { AppShell } from '@/components/layout/app-shell';
import { Button, Card, LoadingState, PageHeader } from '@/components/ui/primitives';
import { TelegramEntityAvatar } from '@/components/telegram/telegram-entity-avatar';
import { adCampaignsApi, currenciesApi } from '@/lib/api';
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

function dataQualityClass(status?: string | null) {
  if (status === 'normal') return 'border-emerald-700 text-emerald-200';
  if (status === 'borderline') return 'border-yellow-700 text-yellow-200';
  if (status === 'suspicious') return 'border-amber-700 text-amber-200';
  if (status === 'anomalous' || status === 'invalid') return 'border-rose-700 text-rose-200';
  return 'border-slate-700 text-slate-300';
}

function errorMessage(error: unknown, fallback: string) {
  const message = (error as any)?.response?.data?.message;
  if (Array.isArray(message)) return message.join(', ');
  return typeof message === 'string' && message.trim() ? message : fallback;
}

export default function AdCampaignDetailPage() {
  const params = useParams<{ id: string }>();
  const id = params.id;
  const queryClient = useQueryClient();
  const { pushToast } = useAppToast();

  const { data: currencySettings } = useQuery({ queryKey: ['currency-settings'], queryFn: currenciesApi.getSettings });
  const { data: campaign, isLoading, error } = useQuery({
    queryKey: ['ad-campaign', id],
    queryFn: () => adCampaignsApi.get(id),
  });
  const recalcMutation = useMutation({
    mutationFn: () => adCampaignsApi.recalculateAnalytics(id),
    onSuccess: (next) => {
      queryClient.setQueryData(['ad-campaign', id], next);
      queryClient.invalidateQueries({ queryKey: ['ad-campaigns'] });
      pushToast('Campaign analytics recalculated.', 'success');
    },
    onError: (err) => pushToast(errorMessage(err, 'Failed to recalculate campaign.'), 'error'),
  });

  return (
    <AppShell>
      <PageHeader
        title={campaign ? displayCampaignTitle(campaign) : 'Ad Campaign'}
        subtitle={campaign?.telegramChannel?.title || 'Campaign analytics'}
        action={<Link href="/ad-campaigns" className="rounded-lg border border-slate-700 px-4 py-2 text-sm text-slate-200 hover:bg-slate-800">Back</Link>}
      />
      {isLoading ? <LoadingState /> : null}
      {error ? <div className="rounded-lg border border-rose-700 p-3 text-sm text-rose-200">Failed to load campaign.</div> : null}
      {campaign ? (
        <div className="mx-auto max-w-6xl space-y-3">
          <Card>
            <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
              <div className="min-w-0">
                <div className="mb-2 flex flex-wrap items-center gap-2">
                  <span className={`rounded border px-2 py-0.5 text-xs ${statusClass(campaign.overallStatus)}`}>{campaign.overallStatus || 'unknown'}</span>
                  {campaign.adDataQuality ? <span className={`rounded border px-2 py-0.5 text-xs ${dataQualityClass(campaign.adDataQuality)}`}>{campaign.adDataQuality}</span> : null}
                  {campaign.excludeFromAnalytics ? <span className="rounded border border-slate-700 px-2 py-0.5 text-xs text-slate-300">Excluded</span> : null}
                </div>
                <p className="text-sm text-slate-300">{campaign.decisionText || 'Not enough data yet.'}</p>
              </div>
              <div className="grid grid-cols-2 gap-2 text-sm md:w-[360px]">
                <InfoPill label="Cost" value={formatMoney(Number(campaign.price || 0), campaign.currency, currencySettings?.currencyDisplayMode)} />
                <InfoPill label="Primary" value={formatMoney(Number(campaign.priceInPrimaryCurrency || 0), currencySettings?.primaryCurrency || campaign.currency, currencySettings?.currencyDisplayMode)} />
              </div>
            </div>
          </Card>

          <AnalyticsPanel campaign={campaign} currency={currencySettings?.primaryCurrency || campaign.currency} />

          <section className="grid gap-3 lg:grid-cols-[minmax(0,1.15fr)_minmax(320px,0.85fr)]">
            <Card>
              <h3 className="mb-3 text-lg font-semibold">Attribution</h3>
              <div className="space-y-3">
                <div>
                  <p className="mb-2 text-xs uppercase tracking-wide text-slate-500">Own channel</p>
                  <AttributionPreview item={campaign.telegramChannel} kind="channel" fallback="-" />
                </div>
                <div>
                  <p className="mb-2 text-xs uppercase tracking-wide text-slate-500">Advertising sources</p>
                  <div className="grid gap-2">
                    {(campaign.advertisingChannels || []).length
                      ? (campaign.advertisingChannels || []).map((source: any) => (
                          <AttributionPreview key={source.selectionId || source.id} item={source} kind={source.sourceKind === 'person' || source.kind === 'person' ? 'person' : 'channel'} fallback="Advertising source" />
                        ))
                      : <p className="rounded-lg border border-slate-800 bg-slate-950/30 px-3 py-2 text-sm text-slate-500">No advertising sources</p>}
                  </div>
                </div>
                <div className="grid gap-2 sm:grid-cols-2">
                  <InfoRow label="Promos" value={campaign.promos?.length ? campaign.promos.map((promo) => promo.title).join(', ') : campaign.promo?.title || '-'} />
                  <InfoRow label="Invite links" value={campaign.inviteLinks?.length ? campaign.inviteLinks.map((inviteLink) => inviteLink.name).join(', ') : (campaign as any).telegramInviteLink?.name || campaign.telegramInviteLinkId || '-'} />
                  <InfoRow label="Attribution" value={campaign.isMixedAttribution ? 'Mixed' : 'Clean'} />
                </div>
              </div>
            </Card>
            <div className="space-y-3">
              <Card>
                <h3 className="mb-3 text-lg font-semibold">Data quality</h3>
                <div className="rounded-lg border border-slate-800 bg-slate-950/40 p-3">
                  <div className="flex items-center justify-between gap-3">
                    <p className="text-xs text-slate-400">Quality</p>
                    <span className={`inline-flex rounded border px-2 py-0.5 text-xs ${dataQualityClass(campaign.adDataQuality)}`}>{campaign.adDataQuality || 'normal'}</span>
                  </div>
                  {campaign.adDataQualityReason ? <p className="mt-2 text-sm text-slate-300">{campaign.adDataQualityReason}</p> : null}
                  {campaign.adDataQualityWarning ? <p className="mt-2 text-sm text-amber-100">{campaign.adDataQualityWarning}</p> : null}
                </div>
              </Card>
              <Card>
                <div className="mb-3 flex items-center justify-between gap-3">
                  <h3 className="text-lg font-semibold">Sync metadata</h3>
                  <Button type="button" variant="secondary" disabled={recalcMutation.isPending} onClick={() => recalcMutation.mutate()}>
                    <span className="inline-flex items-center gap-2"><RotateCw size={16} /> {recalcMutation.isPending ? 'Recalculating...' : 'Recalculate'}</span>
                  </Button>
                </div>
                <div className="space-y-2 text-sm">
                  <InfoRow label="Calculated" value={formatDateTime(campaign.analyticsLastCalculatedAt)} />
                  <InfoRow label="Auto synced" value={formatDateTime(campaign.analyticsLastAutoSyncedAt)} />
                  <InfoRow label="Manual synced" value={formatDateTime(campaign.analyticsLastManualSyncedAt)} />
                  <InfoRow label="Clicks after" value={formatNumber(campaign.clicksAfter)} />
                </div>
              </Card>
            </div>
          </section>
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

function displayCampaignTitle(campaign: any) {
  const date = campaign?.placementDate || campaign?.startedAt || campaign?.createdAt
    ? new Date(campaign.placementDate || campaign.startedAt || campaign.createdAt).toISOString().slice(0, 10)
    : '';
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

function generatedCampaignDisplayTitle(campaign: any) {
  const sources = (campaign?.advertisingChannels || [])
    .map((source: any) => source.title || source.name)
    .filter(Boolean);
  const promo = campaign?.promo?.title;
  const parts = [...sources.slice(0, 2), promo].filter(Boolean);
  if (parts.length) return [...new Set(parts)].join(' | ');
  return campaign?.telegramChannel?.title || 'Campaign';
}

function hasMetricValue(value: unknown) {
  const parsed = toNumber(value);
  return parsed != null && parsed !== 0;
}

function analyticsMetrics(campaign: any, currency: string) {
  const rows = [
    { label: 'New subscribers', value: campaign.newSubscribers, display: formatNumber(campaign.newSubscribers) },
    { label: 'Active subscribers from ad', value: campaign.activeSubscribersFromAd ?? campaign.cappedActiveSubscribersFromAd, display: formatNumber(campaign.activeSubscribersFromAd ?? campaign.cappedActiveSubscribersFromAd) },
    { label: 'Raw active uplift', value: campaign.rawActiveSubscribersFromAd, display: formatNumber(campaign.rawActiveSubscribersFromAd) },
    { label: 'CPA', value: (campaign as any).cpa ?? campaign.analytics?.costPerJoinedSubscriber, display: formatMoneyValue((campaign as any).cpa ?? campaign.analytics?.costPerJoinedSubscriber, currency) },
    { label: 'Active CPA', value: campaign.cappedActiveCpa ?? campaign.activeCpa, display: formatMoneyValue(campaign.cappedActiveCpa ?? campaign.activeCpa, currency) },
    { label: 'Active rate', value: campaign.cappedActiveRate ?? campaign.activeRate, display: formatPercent(campaign.cappedActiveRate ?? campaign.activeRate) },
    { label: 'Retention 7d', value: campaign.retention7d, display: formatPercent(campaign.retention7d) },
    { label: 'View rate after', value: campaign.cappedViewRateAfter ?? campaign.rawViewRateAfter, display: formatPercent(campaign.cappedViewRateAfter ?? campaign.rawViewRateAfter) },
  ];
  return rows.filter((row) => hasMetricValue(row.value));
}

function AnalyticsPanel({ campaign, currency }: { campaign: any; currency: string }) {
  const metrics = analyticsMetrics(campaign, currency);
  if (!metrics.length) {
    return (
      <Card>
        <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
          <div>
            <h3 className="text-lg font-semibold">Analytics</h3>
            <p className="mt-2 max-w-3xl text-sm text-slate-300">
              Analytics is collected automatically from Telegram snapshots and invite-link data. No manual input is required here.
            </p>
            <p className="mt-2 max-w-3xl text-sm text-amber-200">
              There is not enough captured data for this campaign yet. If the placement is old and snapshots were not captured at the time, early-window metrics cannot be reconstructed retroactively.
            </p>
          </div>
          <span className={`inline-flex rounded border px-2 py-0.5 text-xs ${dataQualityClass(campaign.adDataQuality)}`}>{campaign.adDataQuality || 'no data'}</span>
        </div>
      </Card>
    );
  }
  return (
    <Card>
      <h3 className="mb-3 text-lg font-semibold">Analytics</h3>
      <div className="grid grid-cols-[repeat(auto-fit,minmax(180px,1fr))] gap-3">
        {metrics.map((metric) => <MetricCard key={metric.label} title={metric.label} value={metric.display} />)}
      </div>
    </Card>
  );
}

function MetricCard({ title, value }: { title: string; value: string }) {
  return (
    <div className="rounded-lg border border-slate-800 bg-slate-950/40 p-3">
      <p className="text-xs text-slate-400">{title}</p>
      <p className="mt-1 text-xl font-semibold text-white">{value}</p>
    </div>
  );
}

function InfoPill({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-slate-800 bg-slate-950/30 px-3 py-2">
      <p className="text-xs text-slate-500">{label}</p>
      <p className="mt-0.5 truncate font-semibold text-slate-100">{value}</p>
    </div>
  );
}

function AttributionPreview({ item, kind, fallback }: { item: any; kind: 'channel' | 'person'; fallback: string }) {
  const title = item?.title || item?.name || fallback;
  const subtitle = attributionSubtitle(item, kind);
  const imageUrl = item?.photoUrl || item?.imageUrl;
  return (
    <div className="flex min-w-0 items-center gap-3 rounded-lg border border-slate-800 bg-slate-950/40 px-3 py-2">
      <TelegramEntityAvatar imageUrl={imageUrl} kind={kind} alt={title} size="lg" />
      <div className="min-w-0">
        <p className="truncate font-semibold text-white">{title}</p>
        {subtitle ? <p className="mt-1 truncate text-sm text-slate-400">{subtitle}</p> : null}
      </div>
    </div>
  );
}

function attributionSubtitle(item: any, kind: 'channel' | 'person') {
  if (!item) return '';
  const username = item.username || item.telegramUsername;
  if (username) return `@${String(username).replace(/^@/, '')}`;
  const subscribers = item.currentSubscribersCount ?? item.subscribersCount;
  if (subscribers != null && Number.isFinite(Number(subscribers))) {
    return `${Number(subscribers).toLocaleString()} subscribers`;
  }
  if (item.telegramChatId) return `ID ${item.telegramChatId}`;
  if (item.label) return item.label;
  return kind === 'person' ? 'Person' : item.sourceKind === 'own_channel' ? 'Own channel' : 'Telegram channel';
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex gap-3 rounded-lg border border-slate-800 bg-slate-950/30 px-3 py-1.5">
      <span className="w-32 shrink-0 text-slate-500">{label}</span>
      <span className="min-w-0 break-words text-slate-200">{value}</span>
    </div>
  );
}
