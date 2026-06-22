'use client';

import { PropsWithChildren, useEffect, useRef, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { useAuth } from '@/hooks/use-auth';
import { isApiNetworkError } from '@/lib/api';
import { useAppToast } from '@/providers/toast-provider';

export function ProtectedRoute({ children }: PropsWithChildren) {
  const pathname = usePathname();
  const router = useRouter();
  const { token, isLoading, isAuthenticated, error } = useAuth();
  const { pushToast } = useAppToast();
  const isAuthPage = pathname === '/login' || pathname === '/register';
  const [mounted, setMounted] = useState(false);
  const hasShownConnectionAlertRef = useRef(false);
  const hasConnectionIssue = Boolean(token && isApiNetworkError(error));

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!mounted) return;

    if (hasConnectionIssue) {
      if (!hasShownConnectionAlertRef.current) {
        hasShownConnectionAlertRef.current = true;
        pushToast('Unable to connect to the server. Please try again later.', 'error');
      }
      return;
    }

    hasShownConnectionAlertRef.current = false;
  }, [mounted, hasConnectionIssue, pushToast]);

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

    if (hasConnectionIssue) {
      return;
    }

    if (!isLoading && token && !isAuthenticated) {
      router.replace('/login');
    }
  }, [mounted, token, isLoading, isAuthenticated, isAuthPage, router, pathname, hasConnectionIssue]);

  if (!mounted) {
    return <div className="flex min-h-screen items-center justify-center text-neutral-300">Loading...</div>;
  }

  if (pathname === '/register') {
    return <div className="flex min-h-screen items-center justify-center text-neutral-300">Loading...</div>;
  }

  if (pathname === '/login') {
    if (token && (isLoading || isAuthenticated) && !hasConnectionIssue) {
      return <div className="flex min-h-screen items-center justify-center text-neutral-300">Loading...</div>;
    }
    return <>{children}</>;
  }

  if (hasConnectionIssue && token) {
    return <>{children}</>;
  }

  if (isLoading || !token || !isAuthenticated) {
    return <div className="flex min-h-screen items-center justify-center text-neutral-300">Loading...</div>;
  }

  return <>{children}</>;
}
