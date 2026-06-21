'use client';

import { useState } from 'react';
import axios from 'axios';
import Link from 'next/link';
import { useForm } from 'react-hook-form';
import { useRouter } from 'next/navigation';
import { authApi, isApiNetworkError } from '@/lib/api';
import { setAccessToken } from '@/lib/auth';
import { Button, FormError, Input } from '@/components/ui/primitives';

type LoginValues = { email: string; password: string };

export default function LoginPage() {
  const router = useRouter();
  const [error, setError] = useState('');
  const { register, handleSubmit, formState: { isSubmitting } } = useForm<LoginValues>();

  const onSubmit = handleSubmit(async (values) => {
    setError('');
    try {
      const result = await authApi.login(values.email, values.password);
      setAccessToken(result.accessToken);
      router.replace('/');
    } catch (error) {
      if (isApiNetworkError(error)) {
        setError('Unable to connect to the server. Please try again later.');
        return;
      }

      if (axios.isAxiosError(error)) {
        if (error.response.status === 401) {
          setError('Invalid email or password');
          return;
        }

        const message = typeof error.response.data?.message === 'string' ? error.response.data.message : '';
        setError(message || 'Sign in failed. Please try again.');
        return;
      }

      setError('Sign in failed. Please try again.');
    }
  });

  return <div className="flex min-h-screen items-center justify-center bg-neutral-950 px-4 text-neutral-100"><form onSubmit={onSubmit} className="w-full max-w-md rounded-2xl border border-neutral-800 bg-neutral-900 p-6"><h1 className="text-2xl font-semibold">Sign in</h1><p className="mt-1 text-sm text-neutral-400">Use your workspace account</p><div className="mt-4 space-y-3"><Input placeholder="Email" type="email" {...register('email', { required: true })} /><Input placeholder="Password" type="password" {...register('password', { required: true })} /><Button type="submit" disabled={isSubmitting} className="w-full">{isSubmitting ? 'Signing in...' : 'Sign in'}</Button><FormError message={error} /></div><p className="mt-4 text-sm text-neutral-400">No account? <Link className="text-neutral-200 underline" href="/register">Create workspace</Link></p></form></div>;
}
