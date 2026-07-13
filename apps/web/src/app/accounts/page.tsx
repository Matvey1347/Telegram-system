'use client';

import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { AppShell } from '@/components/layout/app-shell';
import { Account, accountsApi, currenciesApi } from '@/lib/api';
import { InlineIconPicker } from '@/components/icons/inline-icon-picker';
import { MoneyStack } from '@/components/ui/money-stack';
import { Button, ConfirmDeleteModal, EmptyState, EntityCard, FormField, Input, LoadingState, MasonryGrid, Modal, PageHeader, IconButton, Select } from '@/components/ui/primitives';
import { IconPicker } from '@/components/icons/icon-picker';
import { formatMoney } from '@/lib/money';
import { MemberSelect } from '@/components/workspace/member-select';
import { AccountName } from '@/components/accounts/account-name';
import { useAppToast } from '@/providers/toast-provider';
import { pushFinanceMutationToast } from '@/lib/finance-mutation-toast';

type Values = { name: string; currency: string; initialBalance: number; iconId?: string | null; assignedMemberId?: string | null };

export default function AccountsPage() {
  const qc = useQueryClient();
  const { pushToast } = useAppToast();
  const [createOpen, setCreateOpen] = useState(false);
  const [editing, setEditing] = useState<Account | null>(null);
  const [deleting, setDeleting] = useState<Account | null>(null);
  const { data, isLoading, error } = useQuery({ queryKey: ['accounts'], queryFn: accountsApi.list });
  const { data: settings } = useQuery({ queryKey: ['currency-settings'], queryFn: currenciesApi.getSettings });
  const { data: rates } = useQuery({ queryKey: ['currency-rates'], queryFn: currenciesApi.listRates });

  const createMutation = useMutation({
    mutationFn: accountsApi.create,
    onSuccess: (created) => {
      qc.invalidateQueries({ queryKey: ['accounts'] });
      qc.invalidateQueries({ queryKey: ['currency-rates'] });
      pushFinanceMutationToast(pushToast, {
        action: 'created',
        entityLabel: 'Account',
        name: created.name,
        icon: created.icon,
      });
    },
  });
  const updateMutation = useMutation({
    mutationFn: ({ id, payload }: { id: string; payload: Record<string, unknown> }) => accountsApi.update(id, payload),
    onSuccess: (updated) => {
      qc.invalidateQueries({ queryKey: ['accounts'] });
      qc.invalidateQueries({ queryKey: ['currency-rates'] });
      pushFinanceMutationToast(pushToast, {
        action: 'updated',
        entityLabel: 'Account',
        name: updated.name,
        icon: updated.icon,
      });
    },
  });
  const updateIconMutation = useMutation({ mutationFn: ({ id, iconId }: { id: string; iconId: string | null }) => accountsApi.update(id, { iconId }), onSuccess: () => { qc.invalidateQueries({ queryKey: ['accounts'] }); } });
  const deleteMutation = useMutation({ mutationFn: (id: string) => accountsApi.remove(id), onSuccess: () => { qc.invalidateQueries({ queryKey: ['accounts'] }); setDeleting(null); } });

  return <AppShell>
    <PageHeader title="Accounts" subtitle="Manage balances by currency" action={<Button onClick={() => setCreateOpen(true)}>Create</Button>} />
    {isLoading ? <LoadingState /> : null}
    {error ? <div className="text-red-300">Failed to load accounts</div> : null}
    <MasonryGrid>
      {data?.map((a) => <EntityCard key={a.id} title={<div className="flex items-center gap-2"><InlineIconPicker iconId={a.iconId ?? null} onChange={(iconId) => updateIconMutation.mutate({ id: a.id, iconId })} /><AccountName account={a} /></div>} actions={<div className="flex gap-2"><IconButton onClick={() => setEditing(a)} /><IconButton kind="delete" onClick={() => setDeleting(a)} /></div>}>
        <div className="mb-2 flex items-center justify-between gap-2">
          <MoneyStack amount={a.balance ?? a.calculatedBalance} currency={a.currency} settings={settings} rates={rates} amountInPrimary={a.convertedCurrency === settings?.primaryCurrency ? a.convertedBalance : null} />
          <span className="rounded-full border border-neutral-700 px-2 py-1 text-xs">{a.currency}</span>
        </div>
        <AccountStatsSummary account={a} displayMode={settings?.currencyDisplayMode} />
      </EntityCard>)}
    </MasonryGrid>
    {!isLoading && !error && !data?.length ? <EmptyState text="No accounts yet" /> : null}

    <AccountModal open={createOpen} title="Create Account" currencies={settings?.supportedCurrencies ?? []} onClose={() => setCreateOpen(false)} onSubmit={(v) => { setCreateOpen(false); createMutation.mutate({ ...v, currency: v.currency.toUpperCase(), initialBalance: Number(v.initialBalance), isActive: true }); }} />
    <AccountModal open={!!editing} title="Edit Account" currencies={settings?.supportedCurrencies ?? []} initial={editing ?? undefined} onClose={() => setEditing(null)} onSubmit={(v) => { if (!editing) return; setEditing(null); updateMutation.mutate({ id: editing.id, payload: { ...v, currency: v.currency.toUpperCase(), initialBalance: Number(v.initialBalance) } }); }} />
    <ConfirmDeleteModal open={!!deleting} entityName={deleting?.name ?? ''} onClose={() => setDeleting(null)} onConfirm={() => deleting ? deleteMutation.mutateAsync(deleting.id) : undefined} label="Archive" />
  </AppShell>;
}

function AccountStatsSummary({ account, displayMode }: { account: Account; displayMode?: 'code' | 'symbol' }) {
  const stats = account.transactionStats;
  const count = stats?.count ?? 0;
  const received = Number(stats?.received ?? 0);
  const spent = Number(stats?.spent ?? 0);
  const transferredIn = Number(stats?.transferredIn ?? 0);
  const transferredOut = Number(stats?.transferredOut ?? 0);
  const delta = Number(stats?.delta ?? 0);

  return (
    <div className="mt-3 space-y-1.5 text-xs leading-snug text-neutral-500">
      <div>{count} {count === 1 ? 'transaction' : 'transactions'}</div>
      <div className="grid gap-1">
        <AccountStatLine label="Received" value={received} currency={account.currency} displayMode={displayMode} tone="positive" />
        <AccountStatLine label="Spent" value={spent} currency={account.currency} displayMode={displayMode} tone="negative" />
        <AccountStatLine label="Transferred in" value={transferredIn} currency={account.currency} displayMode={displayMode} tone="positive" />
        <AccountStatLine label="Transferred out" value={transferredOut} currency={account.currency} displayMode={displayMode} tone="negative" />
        {delta !== 0 ? (
          <AccountStatLine label="Delta" value={delta} currency={account.currency} displayMode={displayMode} tone={delta > 0 ? 'positive' : 'negative'} />
        ) : null}
      </div>
    </div>
  );
}

function AccountStatLine({ label, value, currency, displayMode, tone }: { label: string; value: number; currency: string; displayMode?: 'code' | 'symbol'; tone: 'positive' | 'negative' }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span>{label}</span>
      <span className={`font-medium ${tone === 'positive' ? 'text-emerald-300' : 'text-rose-300'}`}>
        {formatMoney(value, currency, displayMode)}
      </span>
    </div>
  );
}

function AccountModal({ open, onClose, onSubmit, title, initial, currencies }: { open: boolean; onClose: () => void; onSubmit: (v: Values) => void; title: string; initial?: Account; currencies: string[] }) {
  const { register, handleSubmit, reset, watch, setValue, formState: { errors } } = useForm<Values>({ defaultValues: initial ? { name: initial.name, currency: initial.currency, initialBalance: Number(initial.initialBalance), iconId: initial.iconId ?? null, assignedMemberId: initial.assignedMemberId } : { currency: 'USD', initialBalance: 0, name: '', iconId: null } });
  const currencyOptions = Array.from(new Set([watch('currency'), ...currencies].filter(Boolean))).sort();
  useEffect(() => {
    if (!open) return;
    reset(
      initial
        ? { name: initial.name, currency: initial.currency, initialBalance: Number(initial.initialBalance), iconId: initial.iconId ?? null, assignedMemberId: initial.assignedMemberId }
        : { currency: 'USD', initialBalance: 0, name: '', iconId: null },
    );
  }, [open, initial, reset]);
  return <Modal open={open} onClose={onClose} title={title}><form className="space-y-3" onSubmit={handleSubmit(onSubmit)}><IconPicker iconId={watch('iconId') ?? null} onChange={(iconId) => setValue('iconId', iconId, { shouldDirty: true, shouldValidate: true })} buttonLabel="Add icon" /><FormField label="Name" required error={errors.name ? 'Required field' : undefined}><Input {...register('name', { required: true })} /></FormField><FormField label="Member"><MemberSelect value={watch('assignedMemberId')} onChange={(assignedMemberId) => setValue('assignedMemberId', assignedMemberId || null)} defaultToCurrent={!initial} /></FormField><FormField label="Currency"><Select {...register('currency', { required: true })} value={watch('currency')}>{currencyOptions.map((currency) => <option key={currency} value={currency}>{currency}</option>)}</Select></FormField><FormField label="Initial Balance"><Input type="number" step="0.01" {...register('initialBalance', { valueAsNumber: true })} /></FormField><div className="flex justify-end gap-2"><Button variant="secondary" type="button" onClick={onClose}>Cancel</Button><Button type="submit">Save</Button></div></form></Modal>;
}
