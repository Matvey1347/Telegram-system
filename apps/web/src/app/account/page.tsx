'use client';

import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AppShell } from '@/components/layout/app-shell';
import { accountApi } from '@/lib/api';
import { Button, Card, FormError, FormField, Input, LoadingState, PageHeader } from '@/components/ui/primitives';

type ProfileValues = { name: string; email: string };
type PasswordValues = { currentPassword: string; newPassword: string; confirmNewPassword: string };

export default function AccountPage() {
  const qc = useQueryClient();
  const [profileError, setProfileError] = useState('');
  const [passwordError, setPasswordError] = useState('');
  const { data, isLoading } = useQuery({ queryKey: ['account-me'], queryFn: accountApi.me });

  const profileForm = useForm<ProfileValues>({ values: { name: data?.name || '', email: data?.email || '' } });
  const passwordForm = useForm<PasswordValues>();

  const updateProfile = useMutation({
    mutationFn: accountApi.updateMe,
    onSuccess: () => {
      setProfileError('');
      qc.invalidateQueries({ queryKey: ['account-me'] });
      qc.invalidateQueries({ queryKey: ['me'] });
    },
    onError: (e: any) => setProfileError(e?.response?.data?.message || 'Failed to update profile'),
  });

  const updatePassword = useMutation({
    mutationFn: accountApi.updatePassword,
    onSuccess: () => {
      setPasswordError('');
      passwordForm.reset();
    },
    onError: (e: any) => setPasswordError(e?.response?.data?.message || 'Failed to update password'),
  });

  return <AppShell>
    <PageHeader title="My Profile" subtitle="Manage your account" />
    {isLoading || !data ? <LoadingState /> : <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
      <Card>
        <h3 className="mb-2 text-lg font-semibold">Current Account & Workspace</h3>
        <p>Name: {data.name}</p>
        <p>Email: {data.email}</p>
        <p>Workspace: {data.workspace.name}</p>
        <p>Role: {data.workspace.role}</p>
      </Card>

      <Card>
        <h3 className="mb-2 text-lg font-semibold">Edit Profile</h3>
        <form className="space-y-3" onSubmit={profileForm.handleSubmit((values) => updateProfile.mutate(values))}>
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
