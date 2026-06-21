'use client';

import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { AppShell } from '@/components/layout/app-shell';
import { Account, accountsApi, currenciesApi } from '@/lib/api';
import { InlineIconPicker } from '@/components/icons/inline-icon-picker';
import { formatMoney } from '@/lib/money';
import { Button, ConfirmDeleteModal, EmptyState, EntityCard, FormField, Input, LoadingState, Modal, PageHeader, IconButton, Select } from '@/components/ui/primitives';
import { IconPicker } from '@/components/icons/icon-picker';

type Values = { name: string; currency: string; initialBalance: number; iconId?: string | null };

export default function AccountsPage() {
  const qc = useQueryClient();
  const [createOpen, setCreateOpen] = useState(false);
  const [editing, setEditing] = useState<Account | null>(null);
  const [deleting, setDeleting] = useState<Account | null>(null);
  const { data, isLoading, error } = useQuery({ queryKey: ['accounts'], queryFn: accountsApi.list });
  const { data: settings } = useQuery({ queryKey: ['currency-settings'], queryFn: currenciesApi.getSettings });

  const createMutation = useMutation({ mutationFn: accountsApi.create, onSuccess: () => { qc.invalidateQueries({ queryKey: ['accounts'] }); qc.invalidateQueries({ queryKey: ['currency-rates'] }); setCreateOpen(false); } });
  const updateMutation = useMutation({ mutationFn: ({ id, payload }: { id: string; payload: Record<string, unknown> }) => accountsApi.update(id, payload), onSuccess: () => { qc.invalidateQueries({ queryKey: ['accounts'] }); qc.invalidateQueries({ queryKey: ['currency-rates'] }); setEditing(null); } });
  const updateIconMutation = useMutation({ mutationFn: ({ id, iconId }: { id: string; iconId: string | null }) => accountsApi.update(id, { iconId }), onSuccess: () => { qc.invalidateQueries({ queryKey: ['accounts'] }); } });
  const deleteMutation = useMutation({ mutationFn: (id: string) => accountsApi.remove(id), onSuccess: () => { qc.invalidateQueries({ queryKey: ['accounts'] }); setDeleting(null); } });

  return <AppShell>
    <PageHeader title="Accounts" subtitle="Manage balances by currency" action={<Button onClick={() => setCreateOpen(true)}>Create</Button>} />
    {isLoading ? <LoadingState /> : null}
    {error ? <div className="text-red-300">Failed to load accounts</div> : null}
    <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
      {data?.map((a) => <EntityCard key={a.id} title={<div className="flex items-center gap-2"><InlineIconPicker iconId={a.iconId ?? null} onChange={(iconId) => updateIconMutation.mutate({ id: a.id, iconId })} /><span>{a.name}</span></div>} actions={<div className="flex gap-2"><IconButton onClick={() => setEditing(a)} /><IconButton kind="delete" onClick={() => setDeleting(a)} /></div>}>
        <div className="mb-2 flex items-center justify-between gap-2">
          <p className="text-2xl font-semibold text-white">{formatMoney(a.balance ?? a.calculatedBalance, a.currency, settings?.currencyDisplayMode)}</p>
          <span className="rounded-full border border-neutral-700 px-2 py-1 text-xs">{a.currency}</span>
        </div>
        <p className="text-neutral-400">≈ {a.convertedBalance == null ? 'Rate missing' : formatMoney(a.convertedBalance, a.convertedCurrency, settings?.currencyDisplayMode)}</p>
      </EntityCard>)}
    </div>
    {!isLoading && !data?.length ? <EmptyState text="No accounts yet" /> : null}

    <AccountModal open={createOpen} title="Create Account" currencies={settings?.supportedCurrencies ?? []} onClose={() => setCreateOpen(false)} onSubmit={(v) => createMutation.mutate({ ...v, currency: v.currency.toUpperCase(), initialBalance: Number(v.initialBalance), isActive: true })} />
    <AccountModal open={!!editing} title="Edit Account" currencies={settings?.supportedCurrencies ?? []} initial={editing ?? undefined} onClose={() => setEditing(null)} onSubmit={(v) => editing && updateMutation.mutate({ id: editing.id, payload: { ...v, currency: v.currency.toUpperCase(), initialBalance: Number(v.initialBalance) } })} />
    <ConfirmDeleteModal open={!!deleting} entityName={deleting?.name ?? ''} onClose={() => setDeleting(null)} onConfirm={() => deleting && deleteMutation.mutate(deleting.id)} label="Archive" />
  </AppShell>;
}

function AccountModal({ open, onClose, onSubmit, title, initial, currencies }: { open: boolean; onClose: () => void; onSubmit: (v: Values) => void; title: string; initial?: Account; currencies: string[] }) {
  const { register, handleSubmit, reset, watch, setValue, formState: { errors } } = useForm<Values>({ defaultValues: initial ? { name: initial.name, currency: initial.currency, initialBalance: Number(initial.initialBalance), iconId: initial.iconId ?? null } : { currency: 'USD', initialBalance: 0, name: '', iconId: null } });
  const currencyOptions = Array.from(new Set([watch('currency'), ...currencies].filter(Boolean))).sort();
  useEffect(() => {
    if (!open) return;
    reset(
      initial
        ? { name: initial.name, currency: initial.currency, initialBalance: Number(initial.initialBalance), iconId: initial.iconId ?? null }
        : { currency: 'USD', initialBalance: 0, name: '', iconId: null },
    );
  }, [open, initial, reset]);
  return <Modal open={open} onClose={onClose} title={title}><form className="space-y-3" onSubmit={handleSubmit((v) => { onSubmit(v); reset(); })}><IconPicker iconId={watch('iconId') ?? null} onChange={(iconId) => setValue('iconId', iconId, { shouldDirty: true, shouldValidate: true })} buttonLabel="Add icon" /><FormField label="Name" required error={errors.name ? 'Required field' : undefined}><Input {...register('name', { required: true })} /></FormField><FormField label="Currency"><Select {...register('currency', { required: true })} value={watch('currency')}>{currencyOptions.map((currency) => <option key={currency} value={currency}>{currency}</option>)}</Select></FormField><FormField label="Initial Balance"><Input type="number" step="0.01" {...register('initialBalance', { valueAsNumber: true })} /></FormField><div className="flex justify-end gap-2"><Button variant="secondary" type="button" onClick={onClose}>Cancel</Button><Button type="submit">Save</Button></div></form></Modal>;
}
