'use client';

import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { AppShell } from '@/components/layout/app-shell';
import { Account, Transaction, TransactionQuery, WorkspaceMember, accountsApi, currenciesApi, transactionCategoriesApi, transactionsApi, workspaceMembersApi } from '@/lib/api';
import { formatMoney } from '@/lib/money';
import { Button, Card, ConfirmDeleteModal, DateInput, EmptyState, FormField, IconButton, Input, LoadingState, Modal, PageHeader, Select } from '@/components/ui/primitives';
import { IconPicker } from '@/components/icons/icon-picker';
import { InlineIconPicker } from '@/components/icons/inline-icon-picker';

type Values = { accountId: string; type: 'income' | 'expense'; amount: number; categoryId: string; memberId?: string; description?: string; date: string; iconId?: string | null };

function formatLocalDate(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export default function TransactionsPage() {
  const qc = useQueryClient();
  const [createOpen, setCreateOpen] = useState(false);
  const [editing, setEditing] = useState<Transaction | null>(null);
  const [deleting, setDeleting] = useState<Transaction | null>(null);
  const [filters, setFilters] = useState({ type: 'all', sort: 'date_desc', dateFrom: '', dateTo: '', categoryId: '', accountId: '', search: '' });
  const { data: accounts } = useQuery({ queryKey: ['accounts'], queryFn: accountsApi.list });
  const { data: settings } = useQuery({ queryKey: ['currency-settings'], queryFn: currenciesApi.getSettings });
  const { data, isLoading, error } = useQuery({
    queryKey: ['transactions', filters],
    queryFn: () => transactionsApi.list(Object.fromEntries(Object.entries(filters).filter(([, value]) => value)) as TransactionQuery),
  });
  const { data: members } = useQuery({ queryKey: ['workspace-members'], queryFn: workspaceMembersApi.list });
  const { data: filterCategories } = useQuery({ queryKey: ['transaction-categories', filters.type], queryFn: () => transactionCategoriesApi.list(filters.type === 'income' ? 'income' : 'expense'), enabled: filters.type === 'income' || filters.type === 'expense' });
  const createMutation = useMutation({ mutationFn: transactionsApi.create, onSuccess: () => { qc.invalidateQueries({ queryKey: ['transactions'] }); setCreateOpen(false); } });
  const updateMutation = useMutation({ mutationFn: ({ id, payload }: { id: string; payload: Record<string, unknown> }) => transactionsApi.update(id, payload), onSuccess: () => { qc.invalidateQueries({ queryKey: ['transactions'] }); setEditing(null); } });
  const updateTransactionIconMutation = useMutation({ mutationFn: ({ id, iconId }: { id: string; iconId: string | null }) => transactionsApi.update(id, { iconId }), onSuccess: () => qc.invalidateQueries({ queryKey: ['transactions'] }) });
  const updateAccountIconMutation = useMutation({ mutationFn: ({ id, iconId }: { id: string; iconId: string | null }) => accountsApi.update(id, { iconId }), onSuccess: () => { qc.invalidateQueries({ queryKey: ['accounts'] }); qc.invalidateQueries({ queryKey: ['transactions'] }); } });
  const updateCategoryIconMutation = useMutation({ mutationFn: ({ id, iconId }: { id: string; iconId: string | null }) => transactionCategoriesApi.update(id, { iconId }), onSuccess: () => { qc.invalidateQueries({ queryKey: ['transaction-categories'] }); qc.invalidateQueries({ queryKey: ['transaction-categories-admin'] }); qc.invalidateQueries({ queryKey: ['transactions'] }); } });
  const deleteMutation = useMutation({ mutationFn: (id: string) => transactionsApi.remove(id), onSuccess: () => { qc.invalidateQueries({ queryKey: ['transactions'] }); setDeleting(null); } });

  const setFilter = (key: keyof typeof filters, value: string) => setFilters((prev) => ({ ...prev, [key]: value, ...(key === 'type' ? { categoryId: '' } : {}) }));
  const displayMode = settings?.currencyDisplayMode ?? 'code';
  const primaryCurrency = settings?.primaryCurrency ?? '';

  return <AppShell><PageHeader title="Transactions" subtitle="Track income and expenses" action={<Button onClick={() => setCreateOpen(true)}>Create</Button>} />
    <Card className="mb-4">
      <div className="grid gap-3 md:grid-cols-4 xl:grid-cols-7">
        <FormField label="From"><DateInput value={filters.dateFrom} onChange={(e) => setFilter('dateFrom', e.target.value)} /></FormField>
        <FormField label="To"><DateInput value={filters.dateTo} onChange={(e) => setFilter('dateTo', e.target.value)} /></FormField>
        <FormField label="Type"><Select value={filters.type} onChange={(e) => setFilter('type', e.target.value)}><option value="all">All</option><option value="income">Income</option><option value="expense">Expense</option></Select></FormField>
        <FormField label="Category"><Select value={filters.categoryId} onChange={(e) => setFilter('categoryId', e.target.value)} disabled={filters.type === 'all'}><option value="">All</option>{filterCategories?.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</Select></FormField>
        <FormField label="Account"><Select value={filters.accountId} onChange={(e) => setFilter('accountId', e.target.value)}><option value="">All</option>{accounts?.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}</Select></FormField>
        <FormField label="Sort"><Select value={filters.sort} onChange={(e) => setFilter('sort', e.target.value)}><option value="date_desc">Newest</option><option value="date_asc">Oldest</option></Select></FormField>
        <FormField label="Search"><Input value={filters.search} onChange={(e) => setFilter('search', e.target.value)} placeholder="Description" /></FormField>
      </div>
    </Card>
    {isLoading ? <LoadingState /> : null}{error ? <div className="text-red-300">Failed to load transactions</div> : null}
    <div className="overflow-x-auto rounded-lg border border-neutral-800">
      <table className="min-w-[760px] w-full text-left text-sm">
        <thead className="bg-neutral-900 text-xs uppercase text-neutral-400">
          <tr><th className="px-3 py-2">Name</th><th className="px-3 py-2">Price</th><th className="px-3 py-2">Category</th><th className="px-3 py-2">Account</th><th className="px-3 py-2">Actions</th></tr>
        </thead>
        <tbody className="divide-y divide-neutral-800">
          {data?.map((t) => (
            <tr key={t.id} className="bg-neutral-950">
              <td className="px-3 py-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <InlineIconPicker
                      iconId={t.iconId ?? null}
                      onChange={(iconId) => updateTransactionIconMutation.mutate({ id: t.id, iconId })}
                      className="shrink-0"
                    />
                    <div className="truncate font-medium text-white">{getTransactionTitle(t)}</div>
                  </div>
                  <div className={`mt-1 text-xs ${t.type === 'income' ? 'text-emerald-300' : 'text-rose-300'}`}>
                    {t.type} • {new Date(t.date).toLocaleDateString()}
                  </div>
                </div>
              </td>
              <td className="whitespace-nowrap px-3 py-3">
                <div className={`font-semibold ${t.type === 'income' ? 'text-emerald-300' : 'text-rose-300'}`}>{formatMoney(t.amount, t.currency, displayMode)}</div>
                <div className="text-xs text-neutral-400">{formatMoney(t.amountInPrimaryCurrency, primaryCurrency, displayMode)}</div>
              </td>
              <td className="px-3 py-3">
                <div className="flex items-center gap-2">
                  <InlineIconPicker
                    iconId={t.categoryRef?.iconId ?? null}
                    onChange={(iconId) => t.categoryRef?.id && updateCategoryIconMutation.mutate({ id: t.categoryRef.id, iconId })}
                    className="shrink-0"
                  />
                  <span>{t.categoryRef?.name ?? t.category}</span>
                </div>
              </td>
              <td className="px-3 py-3">
                <div className="flex items-center gap-2">
                  <InlineIconPicker
                    iconId={t.account?.iconId ?? null}
                    onChange={(iconId) => t.account?.id && updateAccountIconMutation.mutate({ id: t.account.id, iconId })}
                    className="shrink-0"
                  />
                  <span>{t.account?.name ?? '-'}</span>
                </div>
              </td>
              <td className="px-3 py-2"><div className="flex gap-2"><IconButton onClick={() => setEditing(t)} /><IconButton kind="delete" onClick={() => setDeleting(t)} /></div></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
    {!isLoading && !data?.length ? <EmptyState text="No transactions" /> : null}
    <TransactionModal open={createOpen} title="Create Transaction" onClose={() => setCreateOpen(false)} members={members ?? []} accounts={accounts ?? []} onSubmit={(v) => createMutation.mutate({ ...v, amount: Number(v.amount), memberId: v.memberId || undefined })} />
    <TransactionModal open={!!editing} title="Edit Transaction" onClose={() => setEditing(null)} members={members ?? []} accounts={accounts ?? []} initial={editing ?? undefined} onSubmit={(v) => editing && updateMutation.mutate({ id: editing.id, payload: { ...v, amount: Number(v.amount), memberId: v.memberId || undefined } })} />
    <ConfirmDeleteModal open={!!deleting} entityName={deleting ? `${deleting.type} ${Number(deleting.amount).toFixed(2)}` : ''} onClose={() => setDeleting(null)} onConfirm={() => deleting && deleteMutation.mutate(deleting.id)} />
  </AppShell>;
}

function getTransactionTitle(transaction: Transaction) {
  return transaction.description?.trim()
    || transaction.adCampaign?.title?.trim()
    || transaction.investment?.notes?.trim()
    || transaction.member?.user?.name?.trim()
    || transaction.categoryRef?.name
    || transaction.category
    || 'Transaction';
}

function transactionDefaults(initial?: Transaction): Values {
  return initial
    ? {
        accountId: initial.accountId,
        type: initial.type,
        amount: Number(initial.amount),
        categoryId: initial.categoryId ?? initial.categoryRef?.id ?? '',
        memberId: initial.memberId ?? '',
        description: initial.description ?? '',
        date: formatLocalDate(new Date(initial.date)),
        iconId: initial.iconId ?? null,
      }
    : { accountId: '', type: 'expense', amount: 0, categoryId: '', memberId: '', description: '', date: formatLocalDate(new Date()), iconId: null };
}

function TransactionModal({ open, onClose, onSubmit, title, accounts, members, initial }: { open: boolean; onClose: () => void; onSubmit: (v: Values) => void; title: string; accounts: Account[]; members: WorkspaceMember[]; initial?: Transaction }) {
  const { register, handleSubmit, reset, watch, setValue, getValues, formState: { errors } } = useForm<Values>({ defaultValues: transactionDefaults(initial) });
  const type = watch('type');
  const categoryId = watch('categoryId');
  const { data: categories } = useQuery({ queryKey: ['transaction-categories', type], queryFn: () => transactionCategoriesApi.list(type), enabled: open && !!type });
  const selectedCategory = useMemo(() => categories?.find((c) => c.id === categoryId), [categories, categoryId]);
  const isInvestment = type === 'income' && selectedCategory?.key === 'investment';

  useEffect(() => {
    if (!open) return;
    reset(transactionDefaults(initial));
  }, [open, initial, reset]);

  useEffect(() => {
    if (!isInvestment) setValue('memberId', '');
  }, [isInvestment, setValue]);

  useEffect(() => {
    const selected = getValues('categoryId');
    if (!selected) return;
    if (!categories?.some((c) => c.id === selected)) {
      setValue('categoryId', '');
      setValue('memberId', '');
    }
  }, [categories, getValues, setValue, type]);

  return <Modal open={open} onClose={onClose} title={title}><form className="space-y-3" onSubmit={handleSubmit(onSubmit)}><IconPicker iconId={watch('iconId') ?? null} onChange={(iconId) => setValue('iconId', iconId, { shouldDirty: true, shouldValidate: true })} /><FormField label="Type"><Select {...register('type')}><option value="income">income</option><option value="expense">expense</option></Select></FormField><FormField label="Account" required error={errors.accountId ? 'Required field' : undefined}><Select {...register('accountId', { required: true })}><option value="">Select account</option>{accounts.map((a) => <option key={a.id} value={a.id}>{a.name} ({a.currency})</option>)}</Select></FormField><FormField label="Amount"><Input type="number" step="0.01" {...register('amount', { valueAsNumber: true })} /></FormField><FormField label="Category" required error={errors.categoryId ? 'Required field' : undefined}><Select {...register('categoryId', { required: true })}><option value="">Select category</option>{categories?.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</Select></FormField>{isInvestment ? <FormField label="Member" required error={errors.memberId ? 'Required field' : undefined}><Select {...register('memberId', { required: true })}><option value="">Select member</option>{members.map((m) => <option key={m.id} value={m.id}>{m.user.name}</option>)}</Select></FormField> : null}<FormField label="Description"><Input {...register('description')} /></FormField><FormField label="Date" required error={errors.date ? 'Required field' : undefined}><DateInput {...register('date', { required: true })} value={watch('date')} /></FormField><div className="flex justify-end gap-2"><Button variant="secondary" type="button" onClick={onClose}>Cancel</Button><Button type="submit">Save</Button></div></form></Modal>;
}
