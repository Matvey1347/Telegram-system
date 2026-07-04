'use client';

import axios from 'axios';
import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { AppShell } from '@/components/layout/app-shell';
import { accountDisplayName } from '@/lib/account-display';
import { Account, Transfer, TransferQuery, accountsApi, currenciesApi, transfersApi } from '@/lib/api';
import { InlineIconPicker } from '@/components/icons/inline-icon-picker';
import { MoneyStack } from '@/components/ui/money-stack';
import { Button, Card, ConfirmDeleteModal, DateInput, DateRangeInput, EmptyState, FormField, IconButton, Input, LoadingState, Modal, PageHeader, Select } from '@/components/ui/primitives';
import { formatRate } from '@/lib/money';

type Values = { fromAccountId: string; toAccountId: string; fromAmount: number; toAmount: number; date: string; description?: string };

function getErrorMessage(error: unknown, fallback: string) {
  if (axios.isAxiosError(error)) {
    const message = error.response?.data?.message;
    if (Array.isArray(message)) return message.join(', ');
    if (typeof message === 'string') return message;
    if (typeof error.response?.data?.error === 'string') return error.response.data.error;
  }
  return fallback;
}

function formatLocalDate(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function iconOptionProps(item: { name: string; icon?: { imageUrl?: string | null; emoji?: string | null } | null }) {
  return {
    'data-icon-url': item.icon?.imageUrl ?? undefined,
    'data-icon-emoji': item.icon?.emoji ?? undefined,
    'data-icon-fallback': item.name,
  };
}

export default function TransfersPage() {
  const qc = useQueryClient();
  const [createOpen, setCreateOpen] = useState(false);
  const [editing, setEditing] = useState<Transfer | null>(null);
  const [deleting, setDeleting] = useState<Transfer | null>(null);
  const [filters, setFilters] = useState({ dateFrom: '', dateTo: '', accountId: '', sort: 'date_desc' });
  const { data: accounts } = useQuery({ queryKey: ['accounts'], queryFn: accountsApi.list });
  const { data: settings } = useQuery({ queryKey: ['currency-settings'], queryFn: currenciesApi.getSettings });
  const { data: rates } = useQuery({ queryKey: ['currency-rates'], queryFn: currenciesApi.listRates });
  const { data, isLoading, error } = useQuery({
    queryKey: ['transfers', filters],
    queryFn: () => transfersApi.list(Object.fromEntries(Object.entries(filters).filter(([, value]) => value)) as TransferQuery),
  });
  const createMutation = useMutation({ mutationFn: transfersApi.create, onSuccess: () => { qc.invalidateQueries({ queryKey: ['transfers'] }); qc.invalidateQueries({ queryKey: ['accounts'] }); setCreateOpen(false); } });
  const updateMutation = useMutation({ mutationFn: ({ id, payload }: { id: string; payload: Record<string, unknown> }) => transfersApi.update(id, payload), onSuccess: () => { qc.invalidateQueries({ queryKey: ['transfers'] }); qc.invalidateQueries({ queryKey: ['accounts'] }); setEditing(null); } });
  const updateAccountIconMutation = useMutation({ mutationFn: ({ id, iconId }: { id: string; iconId: string | null }) => accountsApi.update(id, { iconId }), onSuccess: () => { qc.invalidateQueries({ queryKey: ['accounts'] }); qc.invalidateQueries({ queryKey: ['transfers'] }); qc.invalidateQueries({ queryKey: ['transactions'] }); } });
  const deleteMutation = useMutation({ mutationFn: (id: string) => transfersApi.remove(id), onSuccess: () => { qc.invalidateQueries({ queryKey: ['transfers'] }); qc.invalidateQueries({ queryKey: ['accounts'] }); setDeleting(null); } });
  const nameOf = (id: string) => accounts?.find((a) => a.id === id)?.name ?? id;
  const accountOf = (id: string) => accounts?.find((a) => a.id === id);
  const setFilter = (key: keyof typeof filters, value: string) => setFilters((prev) => ({ ...prev, [key]: value }));
  return <AppShell><PageHeader title="Transfers" subtitle="Move funds between accounts" action={<Button onClick={() => setCreateOpen(true)}>Create</Button>} />
    <Card className="mb-4">
      <div className="grid gap-3 md:grid-cols-4">
        <FormField label="Period"><DateRangeInput from={filters.dateFrom} to={filters.dateTo} onChange={(range) => setFilters((prev) => ({ ...prev, dateFrom: range.from, dateTo: range.to }))} /></FormField>
        <FormField label="Account"><Select value={filters.accountId} onChange={(e) => setFilter('accountId', e.target.value)}><option value="">All</option>{accounts?.map((a) => <option key={a.id} value={a.id} {...iconOptionProps(a)}>{accountDisplayName(a)}</option>)}</Select></FormField>
        <FormField label="Sort"><Select value={filters.sort} onChange={(e) => setFilter('sort', e.target.value)}><option value="date_desc">Newest</option><option value="date_asc">Oldest</option></Select></FormField>
      </div>
    </Card>
    {isLoading ? <LoadingState /> : null}{error ? <div className="text-red-300">Failed to load transfers</div> : null}
    <div className="table-scroll w-full rounded-lg border border-neutral-800">
      <table className="w-full min-w-[980px] text-left text-sm">
        <thead className="bg-neutral-900 text-xs uppercase text-neutral-400">
          <tr><th className="px-3 py-2">Date</th><th className="px-3 py-2">From</th><th className="px-3 py-2">From amount</th><th className="px-3 py-2">To</th><th className="px-3 py-2">To amount</th><th className="px-3 py-2">Exchange rate</th><th className="px-3 py-2">Loss</th><th className="px-3 py-2">Description</th><th className="px-3 py-2">Actions</th></tr>
        </thead>
        <tbody className="divide-y divide-neutral-800">
          {data?.map((t) => (
            <tr key={t.id} className="bg-neutral-950">
              <td className="px-3 py-2">{new Date(t.date).toLocaleDateString()}</td>
              <td className="px-3 py-2"><TransferAccountCell account={accountOf(t.fromAccountId) ?? t.fromAccount} fallback={nameOf(t.fromAccountId)} onIconChange={(iconId) => updateAccountIconMutation.mutate({ id: t.fromAccountId, iconId })} /></td>
              <td className="px-3 py-2"><MoneyStack amount={t.fromAmount} currency={t.fromCurrency} settings={settings} rates={rates} mainClassName="font-medium text-white" subClassName="text-xs text-neutral-400" /></td>
              <td className="px-3 py-2"><TransferAccountCell account={accountOf(t.toAccountId) ?? t.toAccount} fallback={nameOf(t.toAccountId)} onIconChange={(iconId) => updateAccountIconMutation.mutate({ id: t.toAccountId, iconId })} /></td>
              <td className="px-3 py-2"><MoneyStack amount={t.toAmount} currency={t.toCurrency} settings={settings} rates={rates} mainClassName="font-medium text-white" subClassName="text-xs text-neutral-400" /></td>
              <td className="px-3 py-2">{formatRate(t.exchangeRate, 1)}</td>
              <td className="px-3 py-2">{t.transferLossAmount != null ? <MoneyStack amount={t.transferLossAmount} currency={t.toCurrency} settings={settings} rates={rates} mainClassName="font-medium text-white" subClassName="text-xs text-neutral-400" /> : '-'}</td>
              <td className="max-w-[240px] truncate px-3 py-2">{t.description || '-'}</td>
              <td className="px-3 py-2"><div className="flex gap-2"><IconButton onClick={() => setEditing(t)} /><IconButton kind="delete" onClick={() => setDeleting(t)} /></div></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
    {!isLoading && !data?.length ? <EmptyState text="No transfers" /> : null}
    <TransferModal open={createOpen} title="Create Transfer" onClose={() => { createMutation.reset(); setCreateOpen(false); }} accounts={accounts ?? []} error={createMutation.error} onSubmit={(v) => createMutation.mutate(v)} />
    <TransferModal open={!!editing} title="Edit Transfer" onClose={() => { updateMutation.reset(); setEditing(null); }} accounts={accounts ?? []} initial={editing ?? undefined} error={updateMutation.error} onSubmit={(v) => editing && updateMutation.mutate({ id: editing.id, payload: v })} />
    <ConfirmDeleteModal open={!!deleting} entityName={deleting ? `${nameOf(deleting.fromAccountId)} -> ${nameOf(deleting.toAccountId)}` : ''} onClose={() => setDeleting(null)} onConfirm={() => deleting ? deleteMutation.mutateAsync(deleting.id) : undefined} />
  </AppShell>;
}

function transferDefaults(initial?: Transfer): Values {
  return initial
    ? {
        fromAccountId: initial.fromAccountId,
        toAccountId: initial.toAccountId,
        fromAmount: Number(initial.fromAmount),
        toAmount: Number(initial.toAmount),
        date: formatLocalDate(new Date(initial.date)),
        description: initial.description ?? '',
      }
    : { fromAccountId: '', toAccountId: '', fromAmount: 0, toAmount: 0, date: formatLocalDate(new Date()), description: '' };
}

function TransferAccountCell({ account, fallback, onIconChange }: { account?: Pick<Account, 'name' | 'iconId'> | null; fallback: string; onIconChange: (iconId: string | null) => void }) {
  return (
    <div className="flex items-center gap-2">
      <InlineIconPicker iconId={account?.iconId ?? null} onChange={onIconChange} className="shrink-0" />
      <span className="min-w-0 truncate">{account?.name ?? fallback}</span>
    </div>
  );
}

function TransferModal({ open, onClose, onSubmit, title, accounts, initial, error }: { open: boolean; onClose: () => void; onSubmit: (v: Values) => void; title: string; accounts: Account[]; initial?: Transfer; error?: unknown }) {
  const { register, handleSubmit, reset, watch, setValue, formState: { errors } } = useForm<Values>({ defaultValues: transferDefaults(initial) });
  const fromAccountId = watch('fromAccountId');
  const toAccountId = watch('toAccountId');
  useEffect(() => {
    if (!open) return;
    reset(transferDefaults(initial));
  }, [open, initial, reset]);
  return (
    <Modal open={open} onClose={onClose} title={title}>
      <form className="space-y-3" onSubmit={handleSubmit(onSubmit)}>
        <FormField label="From Account" required error={errors.fromAccountId ? 'Required field' : undefined}>
          <Select
            {...register('fromAccountId', { required: true })}
            value={fromAccountId}
            onChange={(event) => setValue('fromAccountId', event.target.value, { shouldDirty: true, shouldValidate: true })}
          >
            <option value="" disabled hidden>Select</option>
            {accounts.map((a) => <option key={a.id} value={a.id} {...iconOptionProps(a)}>{accountDisplayName(a)}</option>)}
          </Select>
        </FormField>
        <FormField label="To Account" required error={errors.toAccountId ? 'Required field' : undefined}>
          <Select
            {...register('toAccountId', { required: true })}
            value={toAccountId}
            onChange={(event) => setValue('toAccountId', event.target.value, { shouldDirty: true, shouldValidate: true })}
          >
            <option value="" disabled hidden>Select</option>
            {accounts.map((a) => <option key={a.id} value={a.id} {...iconOptionProps(a)}>{accountDisplayName(a)}</option>)}
          </Select>
        </FormField>
        <FormField label="From Amount"><Input type="number" step="0.01" {...register('fromAmount', { valueAsNumber: true })} /></FormField>
        <FormField label="To Amount"><Input type="number" step="0.01" {...register('toAmount', { valueAsNumber: true })} /></FormField>
        <FormField label="Date" required error={errors.date ? 'Required field' : undefined}><DateInput {...register('date', { required: true })} value={watch('date')} /></FormField>
        <FormField label="Description"><Input {...register('description')} /></FormField>
        {error ? (
          <div className="rounded-md border border-red-900/70 bg-red-950/30 px-3 py-2 text-sm text-red-200">
            {getErrorMessage(error, 'Failed to save transfer')}
          </div>
        ) : null}
        <div className="flex justify-end gap-2">
          <Button variant="secondary" type="button" onClick={onClose}>Cancel</Button>
          <Button type="submit">Save</Button>
        </div>
      </form>
    </Modal>
  );
}
