'use client';

import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AppShell } from '@/components/layout/app-shell';
import { accountApi, telegramUserAccountsApi, type TelegramUserAccount } from '@/lib/api';
import { IconPicker } from '@/components/icons/icon-picker';
import { Button, Card, FormError, FormField, Input, LoadingState, PageHeader } from '@/components/ui/primitives';

type ProfileValues = {
  name: string;
  email: string;
  telegramUsername: string;
  telegramUserAccountIds: string[];
};
type PasswordValues = { currentPassword: string; newPassword: string; confirmNewPassword: string };

function errorMessage(error: unknown, fallback: string) {
  const response = (error as { response?: { data?: { message?: unknown } } })
    ?.response;
  return typeof response?.data?.message === 'string'
    ? response.data.message
    : fallback;
}

export default function AccountPage() {
  const qc = useQueryClient();
  const [profileError, setProfileError] = useState('');
  const [passwordError, setPasswordError] = useState('');
  const [avatarIconId, setAvatarIconId] = useState<string | null>(null);
  const { data, isLoading } = useQuery({ queryKey: ['account-me'], queryFn: accountApi.me });
  const { data: telegramAccounts } = useQuery({
    queryKey: ['telegram-user-accounts'],
    queryFn: telegramUserAccountsApi.list,
  });

  const profileForm = useForm<ProfileValues>({
    values: {
      name: data?.name || '',
      email: data?.email || '',
      telegramUsername: data?.telegramUsername || '',
      telegramUserAccountIds:
        data?.assignedTelegramUserAccounts?.map((account) => account.id) || [],
    },
  });
  const passwordForm = useForm<PasswordValues>();

  useEffect(() => {
    if (!data) return;
    // Query data hydrates this independent icon picker state.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setAvatarIconId(data.avatarIconId ?? data.avatarIcon?.id ?? null);
  }, [data]);

  const updateProfile = useMutation({
    mutationFn: accountApi.updateMe,
    onSuccess: () => {
      setProfileError('');
      qc.invalidateQueries({ queryKey: ['account-me'] });
      qc.invalidateQueries({ queryKey: ['auth', 'me'] });
      qc.invalidateQueries({ queryKey: ['workspace-members'] });
      qc.invalidateQueries({ queryKey: ['telegram-user-accounts'] });
    },
    onError: (error: unknown) => setProfileError(errorMessage(error, 'Failed to update profile')),
  });

  const updatePassword = useMutation({
    mutationFn: accountApi.updatePassword,
    onSuccess: () => {
      setPasswordError('');
      passwordForm.reset();
    },
    onError: (error: unknown) => setPasswordError(errorMessage(error, 'Failed to update password')),
  });

  const selectedTelegramAccountIds =
    profileForm.watch('telegramUserAccountIds') ?? [];

  const accountOwnerName = (account: TelegramUserAccount) => {
    const owner = (telegramAccounts || []).find(
      (candidate) =>
        candidate.id === account.id &&
        'assignedMember' in candidate &&
        (candidate as TelegramUserAccount & { assignedMember?: { user?: { name?: string } } | null }).assignedMember?.user?.name,
    ) as (TelegramUserAccount & { assignedMember?: { user?: { name?: string } } | null }) | undefined;
    return owner?.assignedMember?.user?.name ?? null;
  };

  return <AppShell>
    <PageHeader title="My Profile" subtitle="Manage your account" />
    {isLoading || !data ? <LoadingState /> : <div className="grid grid-cols-1 gap-4">
      <Card>
        <h3 className="mb-2 text-lg font-semibold">Edit Profile</h3>
        <form className="space-y-4" onSubmit={profileForm.handleSubmit((values) => updateProfile.mutate({
          ...values,
          avatarIconId,
          telegramUsername: values.telegramUsername.trim() || null,
        }))}>
          <div className="flex items-center gap-4">
            <IconPicker
              compact
              iconId={avatarIconId}
              onChange={setAvatarIconId}
              buttonLabel="Upload avatar"
              className="!h-16 !w-16 !overflow-hidden !rounded-2xl !border-neutral-700/80 !bg-neutral-950 text-xl shadow-inner"
              iconClassName="!h-full !w-full !rounded-2xl !border-0 !bg-transparent"
            />
            <div>
              <p className="text-sm font-medium text-white">Avatar</p>
              <p className="text-xs text-neutral-400">Shown in workspace members.</p>
            </div>
          </div>
          <FormField label="Name" required error={profileForm.formState.errors.name ? 'Required field' : undefined}><Input {...profileForm.register('name', { required: true })} /></FormField>
          <FormField label="Email" required error={profileForm.formState.errors.email ? 'Required field' : undefined}><Input type="email" {...profileForm.register('email', { required: true })} /></FormField>
          <div className="rounded-xl border border-neutral-800 bg-neutral-950/40 p-4">
            <p className="text-sm font-medium text-white">Telegram identity</p>
            <div className="mt-3 space-y-3">
              <FormField label="Telegram username">
                <Input placeholder="@matvey" {...profileForm.register('telegramUsername')} />
                <p className="mt-2 text-xs text-neutral-500">Used to match invite links when your MTProto account is not connected.</p>
              </FormField>
              <div>
                <p className="text-sm text-neutral-200">Telegram accounts</p>
                <div className="mt-2 space-y-2">
                  {telegramAccounts?.length ? telegramAccounts.map((account) => {
                    const assignedToSelf = data.assignedTelegramUserAccounts?.some(
                      (item) => item.id === account.id,
                    );
                    const ownerName = accountOwnerName(account);
                    const isTakenByOther =
                      Boolean(ownerName) && !assignedToSelf;
                    const checked = selectedTelegramAccountIds.includes(account.id);
                    const title =
                      [account.firstName, account.lastName].filter(Boolean).join(' ') ||
                      account.label;
                    return (
                      <label key={account.id} className={`flex items-start gap-3 rounded-lg border px-3 py-2 text-sm ${isTakenByOther ? 'border-neutral-800 bg-neutral-900/30 text-neutral-500' : 'border-neutral-700 bg-neutral-900 text-neutral-200'}`}>
                        <input
                          type="checkbox"
                          className="mt-1"
                          checked={checked}
                          disabled={isTakenByOther}
                          onChange={(event) => {
                            const next = event.target.checked
                              ? [...new Set([...selectedTelegramAccountIds, account.id])]
                              : selectedTelegramAccountIds.filter((id) => id !== account.id);
                            profileForm.setValue('telegramUserAccountIds', next, {
                              shouldDirty: true,
                            });
                          }}
                        />
                        <div className="min-w-0 flex-1">
                          <p className="truncate font-medium text-white">{title}</p>
                          <p className="truncate text-xs text-neutral-400">{account.username ? `@${account.username}` : account.label}</p>
                          <p className="mt-1 text-xs text-neutral-500">{account.status}</p>
                          {isTakenByOther ? (
                            <p className="mt-1 text-xs text-amber-300">
                              Already linked to {ownerName}
                            </p>
                          ) : null}
                        </div>
                      </label>
                    );
                  }) : <p className="text-sm text-neutral-500">No MTProto accounts connected yet.</p>}
                </div>
              </div>
            </div>
          </div>
          <FormError message={profileError} />
          <Button type="submit" disabled={updateProfile.isPending}>Save Profile</Button>
        </form>
      </Card>

      <Card className="lg:col-span-2">
        <h3 className="mb-2 text-lg font-semibold">Change Password</h3>
        <form className="grid grid-cols-1 gap-3 md:grid-cols-3" onSubmit={passwordForm.handleSubmit((values) => {
          if (values.newPassword !== values.confirmNewPassword) {
            setPasswordError('New password confirmation does not match');
            return;
          }
          updatePassword.mutate({ currentPassword: values.currentPassword, newPassword: values.newPassword });
        })}>
          <FormField label="Current Password" required error={passwordForm.formState.errors.currentPassword ? 'Required field' : undefined}><Input type="password" {...passwordForm.register('currentPassword', { required: true })} /></FormField>
          <FormField label="New Password" required error={passwordForm.formState.errors.newPassword ? 'Required field' : undefined}><Input type="password" {...passwordForm.register('newPassword', { required: true, minLength: 8 })} /></FormField>
          <FormField label="Confirm New Password" required error={passwordForm.formState.errors.confirmNewPassword ? 'Required field' : undefined}><Input type="password" {...passwordForm.register('confirmNewPassword', { required: true })} /></FormField>
          <div className="md:col-span-3">
            <FormError message={passwordError} />
            <Button type="submit" disabled={updatePassword.isPending}>Update Password</Button>
          </div>
        </form>
      </Card>
    </div>}
  </AppShell>;
}
