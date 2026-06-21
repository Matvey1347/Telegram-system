'use client';

import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { AppShell } from '@/components/layout/app-shell';
import { Transfer, TransferQuery, accountsApi, currenciesApi, transfersApi } from '@/lib/api';
import { MoneyStack } from '@/components/ui/money-stack';
import { Button, Card, ConfirmDeleteModal, DateInput, EmptyState, FormField, IconButton, Input, LoadingState, Modal, PageHeader, Select } from '@/components/ui/primitives';

type Values = { fromAccountId: string; toAccountId: string; fromAmount: number; toAmount: number; date: string; description?: string };

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
  const createMutation = useMutation({ mutationFn: transfersApi.create, onSuccess: () => { qc.invalidateQueries({ queryKey: ['transfers'] }); setCreateOpen(false); } });
  const updateMutation = useMutation({ mutationFn: ({ id, payload }: { id: string; payload: Record<string, unknown> }) => transfersApi.update(id, payload), onSuccess: () => { qc.invalidateQueries({ queryKey: ['transfers'] }); setEditing(null); } });
  const deleteMutation = useMutation({ mutationFn: (id: string) => transfersApi.remove(id), onSuccess: () => { qc.invalidateQueries({ queryKey: ['transfers'] }); setDeleting(null); } });
  const nameOf = (id: string) => accounts?.find((a) => a.id === id)?.name ?? id;
  const setFilter = (key: keyof typeof filters, value: string) => setFilters((prev) => ({ ...prev, [key]: value }));
  return <AppShell><PageHeader title="Transfers" subtitle="Move funds between accounts" action={<Button onClick={() => setCreateOpen(true)}>Create</Button>} />
    <Card className="mb-4">
      <div className="grid gap-3 md:grid-cols-4">
        <FormField label="From"><DateInput value={filters.dateFrom} onChange={(e) => setFilter('dateFrom', e.target.value)} /></FormField>
        <FormField label="To"><DateInput value={filters.dateTo} onChange={(e) => setFilter('dateTo', e.target.value)} /></FormField>
        <FormField label="Account"><Select value={filters.accountId} onChange={(e) => setFilter('accountId', e.target.value)}><option value="">All</option>{accounts?.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}</Select></FormField>
        <FormField label="Sort"><Select value={filters.sort} onChange={(e) => setFilter('sort', e.target.value)}><option value="date_desc">Newest</option><option value="date_asc">Oldest</option></Select></FormField>
      </div>
    </Card>
    {isLoading ? <LoadingState /> : null}{error ? <div className="text-red-300">Failed to load transfers</div> : null}
    <div className="overflow-x-auto rounded-lg border border-neutral-800">
      <table className="min-w-[980px] w-full text-left text-sm">
        <thead className="bg-neutral-900 text-xs uppercase text-neutral-400">
          <tr><th className="px-3 py-2">Date</th><th className="px-3 py-2">From account</th><th className="px-3 py-2">From amount</th><th className="px-3 py-2">To account</th><th className="px-3 py-2">To amount</th><th className="px-3 py-2">Exchange rate</th><th className="px-3 py-2">Transfer loss</th><th className="px-3 py-2">Description</th><th className="px-3 py-2">Actions</th></tr>
        </thead>
        <tbody className="divide-y divide-neutral-800">
          {data?.map((t) => (
            <tr key={t.id} className="bg-neutral-950">
              <td className="px-3 py-2">{new Date(t.date).toLocaleDateString()}</td>
              <td className="px-3 py-2">{t.fromAccount?.name ?? nameOf(t.fromAccountId)}</td>
              <td className="px-3 py-2"><MoneyStack amount={t.fromAmount} currency={t.fromCurrency} settings={settings} rates={rates} mainClassName="font-medium text-white" subClassName="text-xs text-neutral-400" /></td>
              <td className="px-3 py-2">{t.toAccount?.name ?? nameOf(t.toAccountId)}</td>
              <td className="px-3 py-2"><MoneyStack amount={t.toAmount} currency={t.toCurrency} settings={settings} rates={rates} mainClassName="font-medium text-white" subClassName="text-xs text-neutral-400" /></td>
              <td className="px-3 py-2">{t.exchangeRate ? Number(t.exchangeRate).toFixed(6) : '-'}</td>
              <td className="px-3 py-2">{t.transferLossAmount ? <MoneyStack amount={t.transferLossAmount} currency={t.toCurrency} settings={settings} rates={rates} mainClassName="font-medium text-white" subClassName="text-xs text-neutral-400" /> : '-'}</td>
              <td className="max-w-[240px] truncate px-3 py-2">{t.description || '-'}</td>
              <td className="px-3 py-2"><div className="flex gap-2"><IconButton onClick={() => setEditing(t)} /><IconButton kind="delete" onClick={() => setDeleting(t)} /></div></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
    {!isLoading && !data?.length ? <EmptyState text="No transfers" /> : null}
    <TransferModal open={createOpen} title="Create Transfer" onClose={() => setCreateOpen(false)} accounts={accounts ?? []} onSubmit={(v) => createMutation.mutate(v)} />
    <TransferModal open={!!editing} title="Edit Transfer" onClose={() => setEditing(null)} accounts={accounts ?? []} initial={editing ?? undefined} onSubmit={(v) => editing && updateMutation.mutate({ id: editing.id, payload: v })} />
    <ConfirmDeleteModal open={!!deleting} entityName={deleting ? `${nameOf(deleting.fromAccountId)} -> ${nameOf(deleting.toAccountId)}` : ''} onClose={() => setDeleting(null)} onConfirm={() => deleting && deleteMutation.mutate(deleting.id)} />
  </AppShell>;
}

function transferDefaults(initial?: Transfer): Values {
  return initial
    ? {
        fromAccountId: initial.fromAccountId,
        toAccountId: initial.toAccountId,
        fromAmount: Number(initial.fromAmount),
        toAmount: Number(initial.toAmount),
        date: new Date(initial.date).toISOString().slice(0, 10),
        description: initial.description ?? '',
      }
    : { fromAccountId: '', toAccountId: '', fromAmount: 0, toAmount: 0, date: new Date().toISOString().slice(0, 10), description: '' };
}

function TransferModal({ open, onClose, onSubmit, title, accounts, initial }: { open: boolean; onClose: () => void; onSubmit: (v: Values) => void; title: string; accounts: { id: string; name: string }[]; initial?: Transfer }) {
  const { register, handleSubmit, reset, formState: { errors } } = useForm<Values>({ defaultValues: transferDefaults(initial) });
  useEffect(() => {
    if (!open) return;
    reset(transferDefaults(initial));
  }, [open, initial, reset]);
  return <Modal open={open} onClose={onClose} title={title}><form className="space-y-3" onSubmit={handleSubmit(onSubmit)}><FormField label="From Account" required error={errors.fromAccountId ? 'Required field' : undefined}><Select {...register('fromAccountId', { required: true })}><option value="">Select</option>{accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}</Select></FormField><FormField label="To Account" required error={errors.toAccountId ? 'Required field' : undefined}><Select {...register('toAccountId', { required: true })}><option value="">Select</option>{accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}</Select></FormField><FormField label="From Amount"><Input type="number" step="0.01" {...register('fromAmount', { valueAsNumber: true })} /></FormField><FormField label="To Amount"><Input type="number" step="0.01" {...register('toAmount', { valueAsNumber: true })} /></FormField><FormField label="Date" required error={errors.date ? 'Required field' : undefined}><DateInput {...register('date', { required: true })} /></FormField><FormField label="Description"><Input {...register('description')} /></FormField><div className="flex justify-end gap-2"><Button variant="secondary" type="button" onClick={onClose}>Cancel</Button><Button type="submit">Save</Button></div></form></Modal>;
}
