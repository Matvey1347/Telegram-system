'use client';

import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AppShell } from '@/components/layout/app-shell';
import { accountApi } from '@/lib/api';
import { IconPicker } from '@/components/icons/icon-picker';
import { Button, Card, FormError, FormField, Input, LoadingState, PageHeader } from '@/components/ui/primitives';

type ProfileValues = { name: string; email: string };
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

  const profileForm = useForm<ProfileValues>({ values: { name: data?.name || '', email: data?.email || '' } });
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

  return <AppShell>
    <PageHeader title="My Profile" subtitle="Manage your account" />
    {isLoading || !data ? <LoadingState /> : <div className="grid grid-cols-1 gap-4">
      <Card>
        <h3 className="mb-2 text-lg font-semibold">Edit Profile</h3>
        <form className="space-y-3" onSubmit={profileForm.handleSubmit((values) => updateProfile.mutate({ ...values, avatarIconId }))}>
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
