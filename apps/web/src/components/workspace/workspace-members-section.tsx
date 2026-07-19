'use client';

import { useEffect, useMemo, useState } from 'react';
import { Camera, Eye, EyeOff, Pencil, ShieldCheck } from 'lucide-react';
import { useForm } from 'react-hook-form';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/hooks/use-auth';
import {
  currenciesApi,
  telegramUserAccountsApi,
  workspaceMembersApi,
  type TelegramUserAccount,
  type WorkspaceMember,
  type WorkspaceRole,
} from '@/lib/api';
import { IconPicker } from '@/components/icons/icon-picker';
import { MoneyStack } from '@/components/ui/money-stack';
import {
  Button,
  Card,
  CustomSelect,
  EmptyState,
  FormError,
  FormField,
  IconButton,
  Input,
  LoadingState,
  Modal,
  PageHeader,
  Select,
} from '@/components/ui/primitives';

type MemberFormValues = {
  email: string;
  name?: string;
  password?: string;
  role: WorkspaceRole;
  avatarIconId?: string | null;
  telegramUsername?: string | null;
  telegramUserAccountIds: string[];
};

const ROLE_LABELS: Record<WorkspaceRole, string> = {
  owner: 'Owner',
  admin: 'Admin',
  MEDIA_BUYER: 'Media buyer',
  member: 'Member',
};

function roleOptionsFor(currentRole: WorkspaceRole) {
  if (currentRole === 'owner') {
    return ['owner', 'admin', 'MEDIA_BUYER', 'member'] as WorkspaceRole[];
  }
  if (currentRole === 'admin') return ['member'] as WorkspaceRole[];
  return [] as WorkspaceRole[];
}

function RoleBadge({ role }: { role: WorkspaceRole }) {
  const tone =
    role === 'owner'
      ? 'border-amber-400/20 bg-amber-500/15 text-amber-200'
      : role === 'admin'
        ? 'border-sky-400/20 bg-sky-500/15 text-sky-200'
        : role === 'MEDIA_BUYER'
          ? 'border-emerald-400/20 bg-emerald-500/15 text-emerald-200'
          : 'border-neutral-700 bg-neutral-800 text-neutral-200';
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-medium ${tone}`}
    >
      {role === 'owner' ? <ShieldCheck size={12} /> : null}
      {ROLE_LABELS[role]}
    </span>
  );
}

export function WorkspaceMembersSection({ embedded = false }: { embedded?: boolean }) {
  const qc = useQueryClient();
  const { workspace } = useAuth();
  const [open, setOpen] = useState(false);
  const [editingMember, setEditingMember] = useState<WorkspaceMember | null>(null);
  const [tempPassword, setTempPassword] = useState<string>('');
  const [error, setError] = useState('');
  const { data, isLoading, error: membersError } = useQuery({ queryKey: ['workspace-members'], queryFn: workspaceMembersApi.list });
  const { data: settings } = useQuery({ queryKey: ['currency-settings'], queryFn: currenciesApi.getSettings });
  const { data: rates } = useQuery({ queryKey: ['currency-rates'], queryFn: currenciesApi.listRates });
  const { data: telegramAccounts } = useQuery({ queryKey: ['telegram-user-accounts'], queryFn: telegramUserAccountsApi.list });

  const currentRole = workspace?.role;
  const ownersCount = useMemo(() => (data || []).filter((member) => member.role === 'owner').length, [data]);
  const canAdd = currentRole === 'owner' || currentRole === 'admin';
  const primaryCurrency = settings?.primaryCurrency ?? '';

  const accountOwnerById = useMemo(() => {
    const map = new Map<string, WorkspaceMember>();
    for (const member of data || []) {
      for (const account of member.assignedTelegramUserAccounts || []) {
        map.set(account.id, member);
      }
    }
    return map;
  }, [data]);

  const createMutation = useMutation({
    mutationFn: (payload: Omit<MemberFormValues, 'telegramUserAccountIds'>) =>
      workspaceMembersApi.create(payload),
    onSuccess: (res: WorkspaceMember & { temporaryPassword?: string }) => {
      setError('');
      qc.invalidateQueries({ queryKey: ['workspace-members'] });
      setOpen(false);
      setTempPassword(res?.temporaryPassword || '');
    },
    onError: (e: any) =>
      setError(e?.response?.data?.message || 'Failed to add member'),
  });

  const updateMutation = useMutation({
    mutationFn: ({
      id,
      payload,
    }: {
      id: string;
      payload: {
        role?: WorkspaceRole;
        isHidden?: boolean;
        avatarIconId?: string | null;
        telegramUsername?: string | null;
        telegramUserAccountIds?: string[];
      };
    }) => workspaceMembersApi.update(id, payload),
    onSuccess: () => {
      setError('');
      qc.invalidateQueries({ queryKey: ['workspace-members'] });
      qc.invalidateQueries({ queryKey: ['telegram-user-accounts'] });
      setEditingMember(null);
    },
    onError: (e: any) =>
      setError(e?.response?.data?.message || 'Failed to update member'),
  });

  const removeMutation = useMutation({
    mutationFn: (id: string) => workspaceMembersApi.remove(id),
    onSuccess: () => {
      setError('');
      qc.invalidateQueries({ queryKey: ['workspace-members'] });
    },
    onError: (e: any) =>
      setError(e?.response?.data?.message || 'Failed to remove member'),
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

  return <>
    {embedded ? (
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-semibold text-white">Workspace members</h2>
          <p className="text-sm text-neutral-400">Manage members, roles and Telegram identity</p>
        </div>
        {canAdd ? <Button onClick={() => setOpen(true)}>Add Member</Button> : null}
      </div>
    ) : (
      <PageHeader
        title={`${workspace?.name || 'Workspace'} Members`}
        subtitle="Manage your team"
        action={canAdd ? <Button onClick={() => setOpen(true)}>Add Member</Button> : null}
      />
    )}

    {tempPassword ? <div className="mb-4 rounded border border-amber-500/40 bg-amber-500/10 p-3 text-amber-200">Temporary password (show once): <span className="font-mono">{tempPassword}</span></div> : null}
    <FormError message={error} />
    {isLoading ? <LoadingState /> : null}

    <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
      {data?.map((member: WorkspaceMember) => {
        const hasInvestments = Number(member.investmentSummary?.totalInvestedPrimary ?? 0) > 0;
        const canManageMember = currentRole === 'owner' && !member.isCurrentUser;
        const linkedAccountsCount = member.assignedTelegramUserAccounts?.length ?? 0;
        return <Card key={member.id} className="relative overflow-visible border-neutral-800/80 bg-[linear-gradient(145deg,rgba(38,38,38,0.95),rgba(18,18,18,0.98))] p-0 shadow-[0_18px_45px_rgba(0,0,0,0.22)]">
          <div className="p-5">
            <div className="flex items-start gap-4">
              <div className="relative shrink-0">
                <IconPicker
                  compact
                  iconId={member.avatarIconId ?? null}
                  onChange={(avatarIconId) => updateMutation.mutate({ id: member.id, payload: { avatarIconId } })}
                  buttonLabel="Upload avatar"
                  className={`!h-16 !w-16 !overflow-hidden !rounded-2xl !border-neutral-700/80 !bg-neutral-950 text-xl shadow-inner ${!member.avatarIconId ? '[&>svg]:hidden' : ''}`}
                  iconClassName="!h-full !w-full !rounded-2xl !border-0 !bg-transparent !text-4xl"
                />
                {!member.avatarIconId ? (
                  <div className="pointer-events-none absolute inset-0 flex items-center justify-center rounded-2xl text-2xl font-semibold text-neutral-300">
                    {(member.user.name?.trim()?.[0] || '?').toUpperCase()}
                  </div>
                ) : null}
                <span className="pointer-events-none absolute -bottom-1 -right-1 flex h-6 w-6 items-center justify-center rounded-lg border border-neutral-800 bg-neutral-900 text-blue-300 shadow-lg">
                  <Camera size={13} />
                </span>
              </div>

              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <h3 className="truncate text-lg font-semibold text-white">{member.user.name}</h3>
                  {member.isCurrentUser ? <span className="rounded-full border border-blue-400/20 bg-blue-500/15 px-2 py-0.5 text-xs font-medium text-blue-200">You</span> : null}
                  <RoleBadge role={member.role} />
                  {member.isHidden ? <span className="rounded-full border border-neutral-600 bg-neutral-900/80 px-2 py-0.5 text-xs font-medium text-neutral-300">Hidden in finance</span> : null}
                </div>
                <p className="mt-1 truncate text-sm text-neutral-400">{member.user.email}</p>
                {member.telegramUsername ? <p className="mt-2 text-xs text-neutral-300">@{member.telegramUsername}</p> : null}
                <p className="mt-1 text-xs text-neutral-500">{linkedAccountsCount} Telegram {linkedAccountsCount === 1 ? 'account' : 'accounts'}</p>
              </div>
            </div>

            {hasInvestments ? (
              <div className="mt-5 grid grid-cols-2 gap-3">
                <div className="rounded-xl border border-neutral-800 bg-neutral-950/60 p-3">
                  <p className="text-xs text-neutral-500">Total Invested</p>
                  <MoneyStack amount={member.investmentSummary?.totalInvestedPrimary ?? 0} currency={primaryCurrency} settings={settings} rates={rates} mainClassName="font-semibold text-white" />
                </div>
                <div className="rounded-xl border border-neutral-800 bg-neutral-950/60 p-3">
                  <p className="text-xs text-neutral-500">Investment Share</p>
                  <p className="mt-1 text-sm font-semibold text-white">{Number(member.investmentSummary?.investmentSharePercent ?? 0).toFixed(2)}%</p>
                </div>
              </div>
            ) : null}

            {member.isCurrentUser ? <p className="mt-4 rounded-lg border border-neutral-800 bg-neutral-950/40 px-3 py-2 text-xs text-neutral-400">Manage your personal info in My Profile.</p> : null}
            {member.isHidden ? <p className="mt-4 rounded-lg border border-neutral-800 bg-neutral-950/40 px-3 py-2 text-xs text-neutral-400">Finance accounts assigned to this member are hidden from finance lists and dashboard balances. Transactions remain visible.</p> : null}

            {canManageMember ? <div className="mt-4 flex gap-2">
              <div className="min-w-0 flex-1">
                <CustomSelect
                  value={member.role}
                  disabled={!canEditRole(member)}
                  options={roleOptionsFor(currentRole || 'member').map((value) => ({ value, label: ROLE_LABELS[value] }))}
                  onChange={(role) => updateMutation.mutate({ id: member.id, payload: { role: role as WorkspaceRole } })}
                />
              </div>
              <Button variant="secondary" type="button" onClick={() => setEditingMember(member)} className="px-3">
                <Pencil size={14} />
              </Button>
              <Button
                variant="secondary"
                type="button"
                onClick={() => updateMutation.mutate({ id: member.id, payload: { isHidden: !member.isHidden } })}
                className="px-3"
                title={member.isHidden ? 'Show member in finance' : 'Hide member from finance'}
              >
                {member.isHidden ? <Eye size={14} /> : <EyeOff size={14} />}
              </Button>
              {canRemove(member) ? (
                <IconButton
                  kind="delete"
                  onClick={() => removeMutation.mutate(member.id)}
                  className="shrink-0"
                  aria-label={`Remove ${member.user.name}`}
                  title="Remove member"
                />
              ) : null}
            </div> : null}
          </div>
        </Card>;
      })}
    </div>

    {!isLoading && !membersError && !data?.length ? <EmptyState text="No members" /> : null}

    <MemberModal
      open={open}
      mode="create"
      onClose={() => setOpen(false)}
      onSubmit={(values) => createMutation.mutate({
        email: values.email,
        name: values.name,
        password: values.password,
        role: values.role,
        avatarIconId: values.avatarIconId,
        telegramUsername: values.telegramUsername?.trim() || null,
      })}
      currentRole={currentRole || 'member'}
      telegramAccounts={telegramAccounts ?? []}
      members={data ?? []}
      accountOwnerById={accountOwnerById}
    />
    <MemberModal
      open={!!editingMember}
      mode="edit"
      member={editingMember}
      onClose={() => setEditingMember(null)}
      onSubmit={(values) => {
        if (!editingMember) return;
        updateMutation.mutate({
          id: editingMember.id,
          payload: {
            role: values.role,
            avatarIconId: values.avatarIconId,
            telegramUsername: values.telegramUsername?.trim() || null,
            telegramUserAccountIds: values.telegramUserAccountIds,
          },
        });
      }}
      currentRole={currentRole || 'member'}
      telegramAccounts={telegramAccounts ?? []}
      members={data ?? []}
      accountOwnerById={accountOwnerById}
    />
  </>;
}

function MemberModal({
  open,
  mode,
  member,
  onClose,
  onSubmit,
  currentRole,
  telegramAccounts,
  accountOwnerById,
}: {
  open: boolean;
  mode: 'create' | 'edit';
  member?: WorkspaceMember | null;
  onClose: () => void;
  onSubmit: (v: MemberFormValues) => void;
  currentRole: WorkspaceRole;
  telegramAccounts: TelegramUserAccount[];
  members: WorkspaceMember[];
  accountOwnerById: Map<string, WorkspaceMember>;
}) {
  const allowedRoles = useMemo(
    () => roleOptionsFor(currentRole),
    [currentRole],
  );
  const initialAssignedIds = useMemo(
    () => member?.assignedTelegramUserAccounts?.map((account) => account.id) ?? [],
    [member],
  );
  const { register, handleSubmit, reset, setValue, watch, formState: { errors } } = useForm<MemberFormValues>({
    defaultValues: {
      email: '',
      name: '',
      password: '',
      role: allowedRoles[0] ?? 'member',
      avatarIconId: null,
      telegramUsername: '',
      telegramUserAccountIds: [],
    },
  });

  useEffect(() => {
    if (!open) return;
    reset({
      email: mode === 'create' ? '' : member?.user.email ?? '',
      name: mode === 'create' ? '' : member?.user.name ?? '',
      password: '',
      role: mode === 'create' ? (allowedRoles[0] ?? 'member') : (member?.role ?? 'member'),
      avatarIconId: member?.avatarIconId ?? null,
      telegramUsername: member?.telegramUsername ?? '',
      telegramUserAccountIds: initialAssignedIds,
    });
  }, [allowedRoles, initialAssignedIds, member, mode, open, reset]);

  const selectedAccountIds = watch('telegramUserAccountIds') ?? [];

  const toggleAccount = (accountId: string, checked: boolean) => {
    const next = checked
      ? [...new Set([...selectedAccountIds, accountId])]
      : selectedAccountIds.filter((id) => id !== accountId);
    setValue('telegramUserAccountIds', next, { shouldDirty: true });
  };

  return <Modal open={open} onClose={onClose} title={mode === 'create' ? 'Add Member' : `Edit ${member?.user.name ?? 'member'}`}>
    <form className="space-y-4" onSubmit={handleSubmit((values) => onSubmit(values))}>
      <FormField label="Avatar image">
        <IconPicker iconId={watch('avatarIconId') ?? null} onChange={(avatarIconId) => setValue('avatarIconId', avatarIconId, { shouldDirty: true })} buttonLabel="Upload avatar" />
      </FormField>

      <div className="rounded-xl border border-neutral-800 bg-neutral-950/40 p-4">
        <p className="text-sm font-medium text-white">Role</p>
        <div className="mt-3 space-y-3">
          {mode === 'create' ? (
            <>
              <FormField label="Email" required error={errors.email ? 'Required field' : undefined}><Input {...register('email', { required: true })} /></FormField>
              <FormField label="Name"><Input {...register('name')} /></FormField>
              <FormField label="Password (optional)"><Input type="password" {...register('password')} /></FormField>
            </>
          ) : null}
          <FormField label="Role">
            <Select {...register('role')}>
              {allowedRoles.map((role) => <option key={role} value={role}>{ROLE_LABELS[role]}</option>)}
            </Select>
          </FormField>
        </div>
      </div>

      <div className="rounded-xl border border-neutral-800 bg-neutral-950/40 p-4">
        <p className="text-sm font-medium text-white">Telegram identity</p>
        <div className="mt-3 space-y-3">
          <FormField label="Telegram username">
            <Input placeholder="@matvey" {...register('telegramUsername')} />
            <p className="mt-2 text-xs text-neutral-500">Used to match invite links when this person's MTProto account is not connected.</p>
          </FormField>

          {mode === 'edit' ? (
            <div>
              <p className="text-sm text-neutral-200">Telegram accounts</p>
              <div className="mt-2 space-y-2">
                {telegramAccounts.length ? telegramAccounts.map((account) => {
                  const owner = accountOwnerById.get(account.id);
                  const isTakenByOther = owner && owner.id !== member?.id;
                  const checked = selectedAccountIds.includes(account.id);
                  const title = [account.firstName, account.lastName].filter(Boolean).join(' ') || account.label;
                  return (
                    <label key={account.id} className={`flex items-start gap-3 rounded-lg border px-3 py-2 text-sm ${isTakenByOther ? 'border-neutral-800 bg-neutral-900/30 text-neutral-500' : 'border-neutral-700 bg-neutral-900 text-neutral-200'}`}>
                      <input
                        type="checkbox"
                        className="mt-1"
                        checked={checked}
                        disabled={Boolean(isTakenByOther)}
                        onChange={(event) => toggleAccount(account.id, event.target.checked)}
                      />
                      <div className="min-w-0 flex-1">
                        <p className="truncate font-medium text-white">{title}</p>
                        <p className="truncate text-xs text-neutral-400">{account.username ? `@${account.username}` : account.label}</p>
                        <p className="mt-1 text-xs text-neutral-500">{account.status}</p>
                        {isTakenByOther ? <p className="mt-1 text-xs text-amber-300">Already linked to {owner.user.name}</p> : null}
                      </div>
                    </label>
                  );
                }) : <p className="text-sm text-neutral-500">No MTProto accounts connected yet.</p>}
              </div>
            </div>
          ) : null}
        </div>
      </div>

      <div className="flex justify-end gap-2">
        <Button variant="secondary" type="button" onClick={onClose}>Cancel</Button>
        <Button type="submit">{mode === 'create' ? 'Add' : 'Save'}</Button>
      </div>
    </form>
  </Modal>;
}
