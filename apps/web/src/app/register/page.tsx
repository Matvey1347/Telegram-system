'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { authApi } from '@/lib/api';
import { setAccessToken } from '@/lib/auth';
import { Button, FormError, Input } from '@/components/ui/primitives';

type RegisterValues = { email: string; password: string; name: string; workspaceName?: string };

export default function RegisterPage() {
  const router = useRouter();
  const [error, setError] = useState('');
  const { register, handleSubmit, formState: { isSubmitting } } = useForm<RegisterValues>();

  const onSubmit = handleSubmit(async (values) => {
    setError('');
    try {
      const result = await authApi.register(values);
      setAccessToken(result.accessToken);
      router.replace('/');
    } catch (e: any) {
      setError(e?.response?.data?.message || 'Failed to register');
    }
  });

  return <div className="flex min-h-screen items-center justify-center bg-neutral-950 px-4 text-neutral-100"><form onSubmit={onSubmit} className="w-full max-w-md rounded-2xl border border-neutral-800 bg-neutral-900 p-6"><h1 className="text-2xl font-semibold">Create Account</h1><div className="mt-4 space-y-3"><Input placeholder="Name" {...register('name', { required: true })} /><Input placeholder="Email" type="email" {...register('email', { required: true })} /><Input placeholder="Password" type="password" {...register('password', { required: true, minLength: 8 })} /><Input placeholder="Workspace Name (optional)" {...register('workspaceName')} /><Button type="submit" disabled={isSubmitting} className="w-full">{isSubmitting ? 'Creating...' : 'Create Workspace'}</Button><FormError message={error} /></div><p className="mt-4 text-sm text-neutral-400">Already have an account? <Link className="text-neutral-200 underline" href="/login">Sign in</Link></p></form></div>;
}
