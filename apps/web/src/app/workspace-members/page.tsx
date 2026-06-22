'use client';

import { useEffect, useMemo, useState } from 'react';
import { Camera, Pencil, ShieldCheck, UserRound } from 'lucide-react';
import { useForm } from 'react-hook-form';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AppShell } from '@/components/layout/app-shell';
import { useAuth } from '@/hooks/use-auth';
import { accountApi, currenciesApi, workspaceMembersApi, type WorkspaceMember, type WorkspaceRole } from '@/lib/api';
import { IconPicker } from '@/components/icons/icon-picker';
import { MoneyStack } from '@/components/ui/money-stack';
import { Button, Card, EmptyState, FormError, FormField, Input, LoadingState, Modal, PageHeader, Select } from '@/components/ui/primitives';

type CreateValues = { email: string; name?: string; password?: string; role: WorkspaceRole; avatarIconId?: string | null };

export default function WorkspaceMembersPage() {
  const qc = useQueryClient();
  const { workspace } = useAuth();
  const [open, setOpen] = useState(false);
  const [tempPassword, setTempPassword] = useState<string>('');
  const [error, setError] = useState('');
  const [workspaceError, setWorkspaceError] = useState('');
  const [workspaceName, setWorkspaceName] = useState(workspace?.name || '');
  const [workspaceNameDraft, setWorkspaceNameDraft] = useState(workspace?.name || '');
  const [workspaceModalOpen, setWorkspaceModalOpen] = useState(false);
  const { data, isLoading } = useQuery({ queryKey: ['workspace-members'], queryFn: workspaceMembersApi.list });
  const { data: settings } = useQuery({ queryKey: ['currency-settings'], queryFn: currenciesApi.getSettings });
  const { data: rates } = useQuery({ queryKey: ['currency-rates'], queryFn: currenciesApi.listRates });

  const currentRole = workspace?.role;
  const ownersCount = useMemo(() => (data || []).filter((m) => m.role === 'owner').length, [data]);
  const canAdd = currentRole === 'owner' || currentRole === 'admin';
  const canEditWorkspace = currentRole === 'owner';
  const primaryCurrency = settings?.primaryCurrency ?? '';

  useEffect(() => {
    if (workspace?.name) {
      setWorkspaceName(workspace.name);
      setWorkspaceNameDraft(workspace.name);
    }
  }, [workspace?.name]);

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

  const workspaceMutation = useMutation({
    mutationFn: accountApi.updateWorkspace,
    onSuccess: (res) => {
      setWorkspaceError('');
      setWorkspaceName(res.workspace.name);
      setWorkspaceNameDraft(res.workspace.name);
      setWorkspaceModalOpen(false);
      qc.invalidateQueries({ queryKey: ['account-me'] });
      qc.invalidateQueries({ queryKey: ['me'] });
    },
    onError: (e: any) => setWorkspaceError(e?.response?.data?.message || 'Failed to update workspace'),
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
      title={`${workspaceName || 'Workspace'} Members`}
      subtitle="Manage your team"
      action={<div className="flex gap-2">{canEditWorkspace ? <Button variant="secondary" onClick={() => { setWorkspaceNameDraft(workspaceName); setWorkspaceModalOpen(true); }}><Pencil size={16} /></Button> : null}{canAdd ? <Button onClick={() => setOpen(true)}>Add Member</Button> : null}</div>}
    />

    <FormError message={workspaceError} />
    {tempPassword ? <div className="mb-4 rounded border border-amber-500/40 bg-amber-500/10 p-3 text-amber-200">Temporary password (show once): <span className="font-mono">{tempPassword}</span></div> : null}
    <FormError message={error} />
    {isLoading ? <LoadingState /> : null}

    <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
      {data?.map((m: WorkspaceMember) => {
        const hasInvestments = Number(m.investmentSummary?.totalInvestedPrimary ?? 0) > 0;
        const canManageMember = currentRole === 'owner' && !m.isCurrentUser;
        return <Card key={m.id} className="relative overflow-hidden border-neutral-800/80 bg-[linear-gradient(145deg,rgba(38,38,38,0.95),rgba(18,18,18,0.98))] p-0 shadow-[0_18px_45px_rgba(0,0,0,0.22)]">
          <div className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-blue-500/70 via-cyan-400/50 to-emerald-400/60" />
          <div className="p-5">
            <div className="flex items-start gap-4">
              <div className="relative shrink-0">
                <IconPicker
                  compact
                  iconId={m.avatarIconId ?? null}
                  onChange={(avatarIconId) => updateMutation.mutate({ id: m.id, payload: { avatarIconId } })}
                  buttonLabel="Upload avatar"
                  className="!h-16 !w-16 !rounded-2xl !border-neutral-700/80 !bg-neutral-950 text-xl shadow-inner"
                />
                {!m.avatarIconId ? (
                  <div className="pointer-events-none absolute inset-0 flex items-center justify-center rounded-2xl text-neutral-400">
                    <UserRound size={25} />
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
                <p className="mt-3 inline-flex rounded-full border border-neutral-700 bg-neutral-900/70 px-2.5 py-1 text-xs font-medium uppercase tracking-wide text-neutral-300">{m.role}</p>
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
              <select className="min-w-0 rounded-lg border border-neutral-700 bg-neutral-900 px-3 py-2 text-sm text-white disabled:opacity-50" value={m.role} disabled={!canEditRole(m)} onChange={(e) => updateMutation.mutate({ id: m.id, payload: { role: e.target.value as WorkspaceRole } })}>
                <option value="owner">owner</option><option value="admin">admin</option><option value="member">member</option>
              </select>
              {canRemove(m) ? <Button variant="secondary" onClick={() => removeMutation.mutate(m.id)} className="shrink-0">Remove</Button> : null}
            </div> : null}
          </div>
        </Card>;
      })}
    </div>

    {!isLoading && !data?.length ? <EmptyState text="No members" /> : null}

    <MemberModal open={open} onClose={() => setOpen(false)} onSubmit={(v: any) => createMutation.mutate(v)} currentRole={currentRole || 'member'} />

    <Modal open={workspaceModalOpen} onClose={() => setWorkspaceModalOpen(false)} title="Edit Workspace Name">
      <form className="space-y-3" onSubmit={(e) => { e.preventDefault(); workspaceMutation.mutate({ name: workspaceNameDraft }); }}>
        <FormField label="Workspace Name"><Input value={workspaceNameDraft} onChange={(e) => setWorkspaceNameDraft(e.target.value)} /></FormField>
        <FormError message={workspaceError} />
        <div className="flex justify-end gap-2"><Button variant="secondary" type="button" onClick={() => { setWorkspaceNameDraft(workspaceName); setWorkspaceModalOpen(false); }}>Cancel</Button><Button type="submit" disabled={workspaceMutation.isPending}>Save</Button></div>
      </form>
    </Modal>
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
