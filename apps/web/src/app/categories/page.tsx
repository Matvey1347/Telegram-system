'use client';

import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { AppShell } from '@/components/layout/app-shell';
import { InlineIconPicker } from '@/components/icons/inline-icon-picker';
import { transactionCategoriesApi, type TransactionCategory, type TransactionType } from '@/lib/api';
import { Button, ConfirmDeleteModal, EmptyState, EntityCard, FormField, IconButton, Input, LoadingState, Modal, PageHeader, Select } from '@/components/ui/primitives';
import { IconPicker } from '@/components/icons/icon-picker';

type CategoryFormValues = { name: string; type: TransactionType; iconId?: string | null };

function typeClass(type: TransactionType) {
  return type === 'income' ? 'text-emerald-300' : 'text-rose-300';
}

export default function CategoriesPage() {
  const qc = useQueryClient();
  const [activeType, setActiveType] = useState<TransactionType>('income');
  const [createOpen, setCreateOpen] = useState(false);
  const [editing, setEditing] = useState<TransactionCategory | null>(null);
  const [deleting, setDeleting] = useState<TransactionCategory | null>(null);

  const { data, isLoading, error } = useQuery({
    queryKey: ['transaction-categories-admin', activeType],
    queryFn: () => transactionCategoriesApi.list(activeType),
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

  return <AppShell>
    <PageHeader
      title="Categories"
      subtitle="Manage income and expense categories"
      action={<div className="flex items-center gap-2"><Select value={activeType} onChange={(e) => setActiveType((e.target.value as TransactionType) || 'income')}><option value="income">Income</option><option value="expense">Expense</option></Select><Button onClick={() => setCreateOpen(true)}>Create</Button></div>}
    />

    {isLoading ? <LoadingState /> : null}
    {error ? <div className="text-red-300">Failed to load categories</div> : null}

    <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
      {data?.map((c) => <EntityCard key={c.id} title={<div className="flex items-center gap-2"><InlineIconPicker iconId={c.iconId ?? null} onChange={(iconId) => updateIconMutation.mutate({ id: c.id, iconId })} /><span>{c.name}</span></div>} actions={<div className="flex gap-2"><IconButton onClick={() => setEditing(c)} /><IconButton kind="delete" onClick={() => setDeleting(c)} disabled={Boolean(c.isSystem)} /></div>}>
        <p>Type: <span className={`font-medium ${typeClass(c.type)}`}>{c.type}</span></p>
        <p>Key: {c.key || '-'}</p>
        <p>System: {c.isSystem ? 'yes' : 'no'}</p>
        {c.isSystem ? <p className="text-amber-300">System category is protected</p> : null}
      </EntityCard>)}
    </div>

    {!isLoading && !data?.length ? <EmptyState text="No categories" /> : null}

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
  const { register, handleSubmit, reset, watch, setValue, formState: { errors } } = useForm<CategoryFormValues>({
    defaultValues: initial ?? { name: '', type: 'income', iconId: null },
  });

  useEffect(() => {
    if (!open) return;
    reset(initial ?? { name: '', type: 'income', iconId: null });
  }, [open, initial, reset]);

  return <Modal open={open} onClose={onClose} title={title}><form className="space-y-3" onSubmit={handleSubmit(onSubmit)}>
    <IconPicker iconId={watch('iconId') ?? null} onChange={(iconId) => setValue('iconId', iconId, { shouldDirty: true, shouldValidate: true })} />
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
