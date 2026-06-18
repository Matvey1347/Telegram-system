'use client';

import { useEffect, useMemo, useState } from 'react';
import { Pencil } from 'lucide-react';
import { useForm } from 'react-hook-form';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AppShell } from '@/components/layout/app-shell';
import { useAuth } from '@/hooks/use-auth';
import { accountApi, workspaceMembersApi, type WorkspaceMember, type WorkspaceRole } from '@/lib/api';
import { Button, EmptyState, EntityCard, FormError, FormField, Input, LoadingState, Modal, PageHeader, Select } from '@/components/ui/primitives';

type CreateValues = { email: string; name?: string; password?: string; role: WorkspaceRole };

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

  const currentRole = workspace?.role;
  const ownersCount = useMemo(() => (data || []).filter((m) => m.role === 'owner').length, [data]);
  const canAdd = currentRole === 'owner' || currentRole === 'admin';
  const canEditWorkspace = currentRole === 'owner';

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
    mutationFn: ({ id, role }: { id: string; role: WorkspaceRole }) => workspaceMembersApi.update(id, { role }),
    onSuccess: () => { setError(''); qc.invalidateQueries({ queryKey: ['workspace-members'] }); },
    onError: (e: any) => setError(e?.response?.data?.message || 'Failed to update role'),
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

    <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
      {data?.map((m: WorkspaceMember) => {
        const hasInvestments = Number(m.investmentSummary?.totalInvestedPrimary ?? 0) > 0;
        return <EntityCard key={m.id} title={m.user.name} className="p-4">
        <p>{m.user.email}</p>
        <p>Role: {m.role} {m.isCurrentUser ? <span className="ml-2 rounded bg-blue-900/40 px-2 py-0.5 text-xs text-blue-300">You</span> : null} {m.role === 'owner' ? <span className="ml-2 rounded bg-amber-900/40 px-2 py-0.5 text-xs text-amber-300">Owner</span> : null}</p>
        {hasInvestments ? <>
          <p>Total Invested: {Number(m.investmentSummary?.totalInvestedPrimary ?? 0).toFixed(2)}</p>
          <p>Share of total investments: {Number(m.investmentSummary?.investmentSharePercent ?? 0).toFixed(2)}%</p>
        </> : null}
        {m.isCurrentUser ? <p className="mt-2 text-xs text-neutral-400">Manage your personal info in My Profile.</p> : null}

        {(currentRole === 'owner' && !m.isCurrentUser) ? <div className="mt-3 flex gap-2">
          <select className="rounded bg-neutral-800 px-2 py-1 disabled:opacity-50" value={m.role} disabled={!canEditRole(m)} onChange={(e) => updateMutation.mutate({ id: m.id, role: e.target.value as WorkspaceRole })}>
            <option value="owner">owner</option><option value="admin">admin</option><option value="member">member</option>
          </select>
          {canRemove(m) ? <Button variant="secondary" onClick={() => removeMutation.mutate(m.id)}>Remove</Button> : null}
        </div> : null}
      </EntityCard>;
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
  const { register, handleSubmit, formState: { errors } } = useForm<CreateValues>({ defaultValues: { role: roleOptions[0] as WorkspaceRole || 'member' } });

  return <Modal open={open} onClose={onClose} title="Add Member"><form className="space-y-3" onSubmit={handleSubmit((values) => onSubmit({ ...values, password: values.password?.trim() ? values.password : undefined }))}>
    <FormField label="Email" required error={errors.email ? 'Required field' : undefined}><Input {...register('email', { required: true })} /></FormField>
    <FormField label="Name"><Input {...register('name')} /></FormField>
    <FormField label="Password (optional)"><Input {...register('password')} /></FormField>
    <FormField label="Role"><Select {...register('role')}>{roleOptions.map((r) => <option key={r} value={r}>{r}</option>)}</Select></FormField>
    <div className="flex justify-end gap-2"><Button variant="secondary" type="button" onClick={onClose}>Cancel</Button><Button type="submit">Add</Button></div>
  </form></Modal>;
}
