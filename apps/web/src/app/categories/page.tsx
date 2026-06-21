'use client';

import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useForm, useWatch } from 'react-hook-form';
import { AppShell } from '@/components/layout/app-shell';
import { InlineIconPicker } from '@/components/icons/inline-icon-picker';
import { currenciesApi, transactionCategoriesApi, transactionsApi, type TransactionCategory, type TransactionType } from '@/lib/api';
import { formatMoney } from '@/lib/money';
import { Button, ConfirmDeleteModal, EmptyState, EntityCard, FormField, IconButton, Input, LoadingState, Modal, PageHeader, Select } from '@/components/ui/primitives';
import { IconPicker } from '@/components/icons/icon-picker';
import { CircleMinus, CirclePlus } from 'lucide-react';

type CategoryFormValues = { name: string; type: TransactionType; iconId?: string | null };
type CategoryStats = { count: number; totalPrimary: number; totalSecondary: number };

export default function CategoriesPage() {
  const qc = useQueryClient();
  const [activeType, setActiveType] = useState<TransactionType>('income');
  const [createOpen, setCreateOpen] = useState(false);
  const [editing, setEditing] = useState<TransactionCategory | null>(null);
  const [deleting, setDeleting] = useState<TransactionCategory | null>(null);

  const { data: settings } = useQuery({ queryKey: ['currency-settings'], queryFn: currenciesApi.getSettings });
  const { data: rates } = useQuery({ queryKey: ['currency-rates'], queryFn: currenciesApi.listRates });
  const { data, isLoading, error } = useQuery({
    queryKey: ['transaction-categories-admin', activeType],
    queryFn: () => transactionCategoriesApi.list(activeType),
  });
  const { data: transactions, isLoading: transactionsLoading } = useQuery({
    queryKey: ['transactions', 'categories-stats', activeType],
    queryFn: () => transactionsApi.list({ type: activeType, sort: 'date_desc' }),
  });

  const createMutation = useMutation({
    mutationFn: (payload: CategoryFormValues) => transactionCategoriesApi.create(payload),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['transaction-categories-admin', activeType] });
      qc.invalidateQueries({ queryKey: ['transaction-categories'] });
      setCreateOpen(false);
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, payload }: { id: string; payload: { name: string; iconId?: string | null } }) =>
      transactionCategoriesApi.update(id, payload),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['transaction-categories-admin', activeType] });
      qc.invalidateQueries({ queryKey: ['transaction-categories'] });
      setEditing(null);
    },
  });

  const updateIconMutation = useMutation({
    mutationFn: ({ id, iconId }: { id: string; iconId: string | null }) => transactionCategoriesApi.update(id, { iconId }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['transaction-categories-admin', activeType] });
      qc.invalidateQueries({ queryKey: ['transaction-categories'] });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => transactionCategoriesApi.remove(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['transaction-categories-admin', activeType] });
      qc.invalidateQueries({ queryKey: ['transaction-categories'] });
      setDeleting(null);
    },
  });

  const displayMode = settings?.currencyDisplayMode ?? 'code';
  const primaryCurrency = settings?.primaryCurrency ?? '';
  const secondaryCurrency = settings?.secondaryCurrency ?? '';

  const secondaryRate = useMemo(() => {
    if (!primaryCurrency || !secondaryCurrency || primaryCurrency === secondaryCurrency) return 1;
    const direct = rates?.find((rate) => rate.baseCurrency === primaryCurrency && rate.targetCurrency === secondaryCurrency);
    if (direct) return Number(direct.rate);
    const reverse = rates?.find((rate) => rate.baseCurrency === secondaryCurrency && rate.targetCurrency === primaryCurrency);
    if (reverse && Number(reverse.rate) > 0) return 1 / Number(reverse.rate);
    return null;
  }, [primaryCurrency, rates, secondaryCurrency]);

  const categoryStats = useMemo(() => {
    const map = new Map<string, CategoryStats>();
    for (const transaction of transactions ?? []) {
      const key = transaction.categoryId ?? transaction.category ?? 'uncategorized';
      const current = map.get(key) ?? { count: 0, totalPrimary: 0, totalSecondary: 0 };
      const amountPrimary = Number(transaction.amountInPrimaryCurrency ?? 0);
      current.count += 1;
      current.totalPrimary += amountPrimary;
      current.totalSecondary += secondaryRate == null ? 0 : amountPrimary * secondaryRate;
      map.set(key, current);
    }
    return map;
  }, [secondaryRate, transactions]);

  return <AppShell>
    <PageHeader
      title="Categories"
      subtitle="Manage income and expense categories"
      action={<Button onClick={() => setCreateOpen(true)}>Create</Button>}
    />

    <div className="mb-6 flex flex-wrap items-center gap-3">
      {([
        { value: 'expense', label: 'Expenses', icon: CircleMinus },
        { value: 'income', label: 'Income', icon: CirclePlus },
      ] as const).map((tab) => {
        const Icon = tab.icon;
        const active = activeType === tab.value;
        return (
          <button
            key={tab.value}
            type="button"
            onClick={() => setActiveType(tab.value)}
            className={`inline-flex items-center gap-2 rounded-full border px-5 py-3 text-lg font-semibold transition ${active ? 'border-neutral-600 bg-neutral-800 text-white' : tab.value === 'expense' ? 'border-transparent bg-transparent text-rose-300 hover:border-neutral-800 hover:bg-neutral-900 hover:text-rose-200' : 'border-transparent bg-transparent text-neutral-400 hover:border-neutral-800 hover:bg-neutral-900 hover:text-white'}`}
          >
            <Icon size={22} className={tab.value === 'income' ? 'text-emerald-300' : 'text-rose-300'} />
            <span>{tab.label}</span>
          </button>
        );
      })}
    </div>

    {isLoading || transactionsLoading ? <LoadingState /> : null}
    {error ? <div className="text-red-300">Failed to load categories</div> : null}

    <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
      {data?.map((c) => {
        const stats = categoryStats.get(c.id) ?? { count: 0, totalPrimary: 0, totalSecondary: 0 };
        const tone = c.type === 'income' ? 'text-emerald-300' : 'text-rose-300';
        return (
          <EntityCard
            key={c.id}
            title={<div className="flex items-center gap-2"><InlineIconPicker iconId={c.iconId ?? null} onChange={(iconId) => updateIconMutation.mutate({ id: c.id, iconId })} /><span>{c.name}</span></div>}
            actions={<div className="flex gap-2"><IconButton onClick={() => setEditing(c)} /><IconButton kind="delete" onClick={() => setDeleting(c)} disabled={Boolean(c.isSystem)} /></div>}
          >
            <div className="space-y-3">
              <div>
                <p className="text-sm text-neutral-400">{c.type === 'income' ? 'Received' : 'Spent'}</p>
                <p className={`text-2xl font-semibold ${tone}`}>{formatMoney(stats.totalPrimary, primaryCurrency, displayMode)}</p>
              </div>
              <div>
                <p className="text-base font-medium text-neutral-200">
                  {secondaryRate == null ? '≈ Add exchange rate' : `≈ ${formatMoney(stats.totalSecondary, secondaryCurrency, displayMode)}`}
                </p>
              </div>
              <p className="text-sm text-neutral-400">
                {stats.count} {stats.count === 1 ? 'transaction' : 'transactions'}
              </p>
            </div>
          </EntityCard>
        );
      })}
    </div>

    {!isLoading && !transactionsLoading && !data?.length ? <EmptyState text="No categories" /> : null}

    <CategoryModal
      open={createOpen}
      title="Create Category"
      onClose={() => setCreateOpen(false)}
      onSubmit={(v) => createMutation.mutate(v)}
      initial={{ type: activeType, name: '' }}
      disableType={false}
    />

      <CategoryModal
      open={!!editing}
      title="Edit Category"
      onClose={() => setEditing(null)}
      onSubmit={(v) => editing && updateMutation.mutate({ id: editing.id, payload: { name: v.name, iconId: v.iconId ?? null } })}
      initial={editing ? { name: editing.name, type: editing.type, iconId: editing.iconId ?? null } : undefined}
      disableType
      readOnlyName={Boolean(editing?.isSystem)}
    />

    <ConfirmDeleteModal
      open={!!deleting}
      entityName={deleting?.name ?? ''}
      description={deleting?.isSystem ? 'System category cannot be deleted.' : undefined}
      onClose={() => setDeleting(null)}
      onConfirm={() => deleting && !deleting.isSystem && deleteMutation.mutate(deleting.id)}
      label="Delete"
    />
  </AppShell>;
}

function CategoryModal({
  open,
  onClose,
  onSubmit,
  title,
  initial,
  disableType,
  readOnlyName,
}: {
  open: boolean;
  onClose: () => void;
  onSubmit: (v: CategoryFormValues) => void;
  title: string;
  initial?: CategoryFormValues;
  disableType?: boolean;
  readOnlyName?: boolean;
}) {
  const { control, register, handleSubmit, reset, setValue, formState: { errors } } = useForm<CategoryFormValues>({
    defaultValues: initial ?? { name: '', type: 'income', iconId: null },
  });
  const iconId = useWatch({ control, name: 'iconId' });

  useEffect(() => {
    if (!open) return;
    reset(initial ?? { name: '', type: 'income', iconId: null });
  }, [open, initial, reset]);

  return <Modal open={open} onClose={onClose} title={title}><form className="space-y-3" onSubmit={handleSubmit(onSubmit)}>
    <IconPicker iconId={iconId ?? null} onChange={(nextIconId) => setValue('iconId', nextIconId, { shouldDirty: true, shouldValidate: true })} />
    <FormField label="Name" required error={errors.name ? 'Required field' : undefined}>
      <Input {...register('name', { required: true })} disabled={readOnlyName} />
    </FormField>
    <FormField label="Type" required>
      <Select {...register('type')} disabled={disableType}>
        <option value="income">Income</option>
        <option value="expense">Expense</option>
      </Select>
    </FormField>
    <div className="flex justify-end gap-2"><Button variant="secondary" type="button" onClick={onClose}>Cancel</Button><Button type="submit" disabled={readOnlyName}>Save</Button></div>
  </form></Modal>;
}
