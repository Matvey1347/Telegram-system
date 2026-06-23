'use client';

import { useMemo, useState } from 'react';
import { Camera, ShieldCheck } from 'lucide-react';
import { useForm } from 'react-hook-form';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AppShell } from '@/components/layout/app-shell';
import { useAuth } from '@/hooks/use-auth';
import { currenciesApi, workspaceMembersApi, type WorkspaceMember, type WorkspaceRole } from '@/lib/api';
import { IconPicker } from '@/components/icons/icon-picker';
import { MoneyStack } from '@/components/ui/money-stack';
import { Button, Card, CustomSelect, EmptyState, FormError, FormField, Input, LoadingState, Modal, PageHeader, Select } from '@/components/ui/primitives';

type CreateValues = { email: string; name?: string; password?: string; role: WorkspaceRole; avatarIconId?: string | null };

const WORKSPACE_ROLE_OPTIONS: Array<{ value: WorkspaceRole; label: string }> = [
  { value: 'owner', label: 'owner' },
  { value: 'admin', label: 'admin' },
  { value: 'member', label: 'member' },
];

export default function WorkspaceMembersPage() {
  const qc = useQueryClient();
  const { workspace } = useAuth();
  const [open, setOpen] = useState(false);
  const [tempPassword, setTempPassword] = useState<string>('');
  const [error, setError] = useState('');
  const { data, isLoading } = useQuery({ queryKey: ['workspace-members'], queryFn: workspaceMembersApi.list });
  const { data: settings } = useQuery({ queryKey: ['currency-settings'], queryFn: currenciesApi.getSettings });
  const { data: rates } = useQuery({ queryKey: ['currency-rates'], queryFn: currenciesApi.listRates });

  const currentRole = workspace?.role;
  const ownersCount = useMemo(() => (data || []).filter((m) => m.role === 'owner').length, [data]);
  const canAdd = currentRole === 'owner' || currentRole === 'admin';
  const primaryCurrency = settings?.primaryCurrency ?? '';

  const createMutation = useMutation({
    mutationFn: workspaceMembersApi.create,
    onSuccess: (res: any) => {
      setError('');
      qc.invalidateQueries({ queryKey: ['workspace-members'] });
      setOpen(false);
      setTempPassword(res?.temporaryPassword || '');
    },
    onError: (e: any) => setError(e?.response?.data?.message || 'Failed to add member'),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, payload }: { id: string; payload: { role?: WorkspaceRole; avatarIconId?: string | null } }) => workspaceMembersApi.update(id, payload),
    onSuccess: () => { setError(''); qc.invalidateQueries({ queryKey: ['workspace-members'] }); },
    onError: (e: any) => setError(e?.response?.data?.message || 'Failed to update member'),
  });

  const removeMutation = useMutation({
    mutationFn: (id: string) => workspaceMembersApi.remove(id),
    onSuccess: () => { setError(''); qc.invalidateQueries({ queryKey: ['workspace-members'] }); },
    onError: (e: any) => setError(e?.response?.data?.message || 'Failed to remove member'),
  });

  const canEditRole = (member: WorkspaceMember) => {
    if (currentRole === 'owner') return !(member.role === 'owner' && ownersCount <= 1);
    if (currentRole === 'admin') return member.role === 'member';
    return false;
  };

  const canRemove = (member: WorkspaceMember) => {
    if (currentRole === 'owner') {
      if (member.role === 'owner' && ownersCount <= 1) return false;
      if (member.isCurrentUser && member.role === 'owner' && ownersCount <= 1) return false;
      return true;
    }
    if (currentRole === 'admin') return member.role === 'member';
    return false;
  };

  return <AppShell>
    <PageHeader
      title={`${workspace?.name || 'Workspace'} Members`}
      subtitle="Manage your team"
      action={canAdd ? <Button onClick={() => setOpen(true)}>Add Member</Button> : null}
    />

    {tempPassword ? <div className="mb-4 rounded border border-amber-500/40 bg-amber-500/10 p-3 text-amber-200">Temporary password (show once): <span className="font-mono">{tempPassword}</span></div> : null}
    <FormError message={error} />
    {isLoading ? <LoadingState /> : null}

    <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
      {data?.map((m: WorkspaceMember) => {
        const hasInvestments = Number(m.investmentSummary?.totalInvestedPrimary ?? 0) > 0;
        const canManageMember = currentRole === 'owner' && !m.isCurrentUser;
        return <Card key={m.id} className="relative overflow-visible border-neutral-800/80 bg-[linear-gradient(145deg,rgba(38,38,38,0.95),rgba(18,18,18,0.98))] p-0 shadow-[0_18px_45px_rgba(0,0,0,0.22)]">
          <div className="p-5">
            <div className="flex items-start gap-4">
              <div className="relative shrink-0">
                <IconPicker
                  compact
                  iconId={m.avatarIconId ?? null}
                  onChange={(avatarIconId) => updateMutation.mutate({ id: m.id, payload: { avatarIconId } })}
                  buttonLabel="Upload avatar"
                  className={`!h-16 !w-16 !overflow-hidden !rounded-2xl !border-neutral-700/80 !bg-neutral-950 text-xl shadow-inner ${!m.avatarIconId ? '[&>svg]:hidden' : ''}`}
                  iconClassName="!h-full !w-full !rounded-2xl !border-0 !bg-transparent !text-4xl"
                />
                {!m.avatarIconId ? (
                  <div className="pointer-events-none absolute inset-0 flex items-center justify-center rounded-2xl text-2xl font-semibold text-neutral-300">
                    {(m.user.name?.trim()?.[0] || '?').toUpperCase()}
                  </div>
                ) : null}
                <span className="pointer-events-none absolute -bottom-1 -right-1 flex h-6 w-6 items-center justify-center rounded-lg border border-neutral-800 bg-neutral-900 text-blue-300 shadow-lg">
                  <Camera size={13} />
                </span>
              </div>

              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <h3 className="truncate text-lg font-semibold text-white">{m.user.name}</h3>
                  {m.isCurrentUser ? <span className="rounded-full border border-blue-400/20 bg-blue-500/15 px-2 py-0.5 text-xs font-medium text-blue-200">You</span> : null}
                  {m.role === 'owner' ? <span className="inline-flex items-center gap-1 rounded-full border border-amber-400/20 bg-amber-500/15 px-2 py-0.5 text-xs font-medium text-amber-200"><ShieldCheck size={12} />Owner</span> : null}
                </div>
                <p className="mt-1 truncate text-sm text-neutral-400">{m.user.email}</p>
              </div>
            </div>

            <div className="mt-5 grid grid-cols-2 gap-3">
              <div className="rounded-xl border border-neutral-800 bg-neutral-950/60 p-3">
                <p className="text-xs text-neutral-500">Total Invested</p>
                {hasInvestments ? (
                  <MoneyStack amount={m.investmentSummary?.totalInvestedPrimary ?? 0} currency={primaryCurrency} settings={settings} rates={rates} mainClassName="font-semibold text-white" />
                ) : (
                  <p className="mt-1 text-sm font-semibold text-neutral-300">$ 0.00</p>
                )}
              </div>
              <div className="rounded-xl border border-neutral-800 bg-neutral-950/60 p-3">
                <p className="text-xs text-neutral-500">Investment Share</p>
                <p className="mt-1 text-sm font-semibold text-white">{Number(m.investmentSummary?.investmentSharePercent ?? 0).toFixed(2)}%</p>
              </div>
            </div>

            {m.isCurrentUser ? <p className="mt-4 rounded-lg border border-neutral-800 bg-neutral-950/40 px-3 py-2 text-xs text-neutral-400">Manage your personal info in My Profile.</p> : null}

            {canManageMember ? <div className="mt-4 flex gap-2">
              <div className="min-w-0 flex-1">
                <CustomSelect
                  value={m.role}
                  disabled={!canEditRole(m)}
                  options={WORKSPACE_ROLE_OPTIONS}
                  onChange={(role) => updateMutation.mutate({ id: m.id, payload: { role: role as WorkspaceRole } })}
                />
              </div>
              {canRemove(m) ? <Button variant="secondary" onClick={() => removeMutation.mutate(m.id)} className="shrink-0">Remove</Button> : null}
            </div> : null}
          </div>
        </Card>;
      })}
    </div>

    {!isLoading && !data?.length ? <EmptyState text="No members" /> : null}

    <MemberModal open={open} onClose={() => setOpen(false)} onSubmit={(v: any) => createMutation.mutate(v)} currentRole={currentRole || 'member'} />
  </AppShell>;
}

function MemberModal({ open, onClose, onSubmit, currentRole }: { open: boolean; onClose: () => void; onSubmit: (v: CreateValues) => void; currentRole: WorkspaceRole }) {
  const roleOptions = currentRole === 'owner' ? ['owner', 'admin', 'member'] : currentRole === 'admin' ? ['member'] : [];
  const { register, handleSubmit, setValue, watch, formState: { errors } } = useForm<CreateValues>({ defaultValues: { role: roleOptions[0] as WorkspaceRole || 'member', avatarIconId: null } });

  return <Modal open={open} onClose={onClose} title="Add Member"><form className="space-y-3" onSubmit={handleSubmit((values) => onSubmit({ ...values, password: values.password?.trim() ? values.password : undefined }))}>
    <FormField label="Avatar image">
      <IconPicker iconId={watch('avatarIconId') ?? null} onChange={(avatarIconId) => setValue('avatarIconId', avatarIconId, { shouldDirty: true })} buttonLabel="Upload avatar" />
    </FormField>
    <FormField label="Email" required error={errors.email ? 'Required field' : undefined}><Input {...register('email', { required: true })} /></FormField>
    <FormField label="Name"><Input {...register('name')} /></FormField>
    <FormField label="Password (optional)"><Input type="password" {...register('password')} /></FormField>
    <FormField label="Role"><Select {...register('role')}>{roleOptions.map((r) => <option key={r} value={r}>{r}</option>)}</Select></FormField>
    <div className="flex justify-end gap-2"><Button variant="secondary" type="button" onClick={onClose}>Cancel</Button><Button type="submit">Add</Button></div>
  </form></Modal>;
}
