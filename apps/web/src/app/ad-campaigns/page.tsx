'use client';

import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { AppShell } from '@/components/layout/app-shell';
import { accountsApi, adCampaignsApi, advertisingChannelsApi, getTelegramChannelInviteLinks, getTelegramChannelPromos, telegramChannelsApi } from '@/lib/api';
import { Button, Card, ConfirmDeleteModal, CustomSelect, DateInput, EmptyState, EntityCard, FormField, IconButton, Input, LoadingState, Modal, PageHeader, Select, Textarea } from '@/components/ui/primitives';

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

export default function AdCampaignsPage() {
  const qc = useQueryClient();
  const [createOpen, setCreateOpen] = useState(false);
  const [editing, setEditing] = useState<any | null>(null);
  const [deleting, setDeleting] = useState<any | null>(null);
  const [channelFilter, setChannelFilter] = useState('');

  const { data: channels } = useQuery({ queryKey: ['telegram-channels'], queryFn: telegramChannelsApi.list });
  const { data, isLoading, error } = useQuery({
    queryKey: ['ad-campaigns', channelFilter],
    queryFn: () => adCampaignsApi.list(channelFilter ? { telegramChannelId: channelFilter } : undefined),
  });

  const createMutation = useMutation({ mutationFn: adCampaignsApi.create, onSuccess: () => { qc.invalidateQueries({ queryKey: ['ad-campaigns'] }); setCreateOpen(false); } });
  const updateMutation = useMutation({ mutationFn: ({ id, payload }: any) => adCampaignsApi.update(id, payload), onSuccess: () => { qc.invalidateQueries({ queryKey: ['ad-campaigns'] }); setEditing(null); } });
  const deleteMutation = useMutation({ mutationFn: (id: string) => adCampaignsApi.remove(id), onSuccess: () => { qc.invalidateQueries({ queryKey: ['ad-campaigns'] }); setDeleting(null); } });

  return <AppShell><PageHeader title="Ad Campaigns" subtitle="Track ad spend by own channel, promo link and external advertising channels" action={<Button onClick={() => setCreateOpen(true)}>Create</Button>} />
    {(channels?.length ?? 0) > 1 ? <Card className="mb-4"><FormField label="Channel"><Select value={channelFilter} onChange={(e) => setChannelFilter(e.target.value)}><option value="">All channels</option>{channels?.map((channel: any) => <option key={channel.id} value={channel.id}>{channel.title}</option>)}</Select></FormField></Card> : null}
    {isLoading ? <LoadingState /> : null}{error ? <div className="text-red-300">Failed to load campaigns</div> : null}
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">{data?.map((c: any) => {
      const net = (c.analytics?.netGrowth ?? c.netGrowthCount ?? 0);
      const joined = (c.analytics?.joinedCount ?? c.joinedCount ?? 0);
      const left = (c.analytics?.leftCount ?? c.leftCount ?? 0);
      const cost = Number(c.price || c.costAmount || 0);
      const costPerJoined = joined > 0 ? cost / joined : null;
      const day = toInputDate(c?.placementDate || c?.startedAt || c?.createdAt) || '-';
      const cardTitle = `${day} | ${cost.toFixed(2)} ${c.currency} | ${joined} subscribers`;
      return <EntityCard key={c.id} title={cardTitle} actions={<div className="flex gap-2"><IconButton onClick={() => setEditing(c)} /><IconButton kind="delete" onClick={() => setDeleting(c)} /></div>}>
        <div className="mb-1 inline-flex items-center gap-2 py-1 text-sm text-neutral-200">
          {c.telegramChannel?.photoUrl ? <img src={c.telegramChannel.photoUrl} alt="" className="h-5 w-5 rounded-full" /> : <span className="inline-block h-5 w-5 rounded-full border border-neutral-600" />}
          <span>{c.telegramChannel?.title || '-'}</span>
        </div>
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
        <p>Cost: {Number(c.price || c.costAmount || 0).toFixed(2)} {c.currency}</p>
        {left > 0 ? <p>Joined: {joined} | Left: {left} | Net: {net}</p> : <p className="text-emerald-300">Joined: {joined}</p>}
        <p>Cost / subscriber: {costPerJoined !== null ? `${Number(costPerJoined).toFixed(2)} ${c.currency}` : '-'}</p>
      </EntityCard>;
    })}</div>
    {!isLoading && !data?.length ? <EmptyState text="No campaigns" /> : null}

    <CampaignModal open={createOpen} title="Create Campaign" channels={channels ?? []} onClose={() => setCreateOpen(false)} onSubmit={(v: any) => createMutation.mutate(v)} />
    <CampaignModal open={!!editing} title="Edit Campaign" channels={channels ?? []} initial={editing ?? undefined} onClose={() => setEditing(null)} onSubmit={(v: any) => editing && updateMutation.mutate({ id: editing.id, payload: v })} />
    <ConfirmDeleteModal open={!!deleting} entityName={deleting?.title ?? 'campaign'} onClose={() => setDeleting(null)} onConfirm={() => deleting && deleteMutation.mutate(deleting.id)} label="Archive" />
  </AppShell>;
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
      <CustomSelect value={watch('accountId')} onChange={(v) => setValue('accountId', v, { shouldValidate: true, shouldDirty: true })} placeholder="Select account" options={(accounts || []).map((a: any) => ({ value: a.id, label: `${a.name} (${a.currency})` }))} />
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
