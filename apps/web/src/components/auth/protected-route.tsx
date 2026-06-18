'use client';

import { PropsWithChildren, useEffect, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { useAuth } from '@/hooks/use-auth';

export function ProtectedRoute({ children }: PropsWithChildren) {
  const pathname = usePathname();
  const router = useRouter();
  const { token, isLoading, isAuthenticated } = useAuth();
  const isAuthPage = pathname === '/login' || pathname === '/register';
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!mounted) return;

    if (pathname === '/register') {
      router.replace('/login');
      return;
    }

    if (pathname === '/login') {
      if (!isLoading && token && isAuthenticated) {
        router.replace('/');
      }
      return;
    }

    if (!token) {
      router.replace('/login');
      return;
    }

    if (!isLoading && token && !isAuthenticated) {
      router.replace('/login');
    }
  }, [mounted, token, isLoading, isAuthenticated, isAuthPage, router, pathname]);

  if (!mounted) {
    return <div className="flex min-h-screen items-center justify-center text-neutral-300">Loading...</div>;
  }

  if (pathname === '/register') {
    return <div className="flex min-h-screen items-center justify-center text-neutral-300">Loading...</div>;
  }

  if (pathname === '/login') {
    if (token && (isLoading || isAuthenticated)) {
      return <div className="flex min-h-screen items-center justify-center text-neutral-300">Loading...</div>;
    }
    return <>{children}</>;
  }

  if (isLoading || !token || !isAuthenticated) {
    return <div className="flex min-h-screen items-center justify-center text-neutral-300">Loading...</div>;
  }

  return <>{children}</>;
}
