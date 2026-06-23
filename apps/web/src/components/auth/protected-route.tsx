'use client';

import { PropsWithChildren, useEffect, useRef, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { useAuth } from '@/hooks/use-auth';
import { isApiNetworkError } from '@/lib/api';
import { useAppToast } from '@/providers/toast-provider';
import { Skeleton } from '@/components/ui/primitives';

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
    return <FullScreenLoader />;
  }

  if (pathname === '/register') {
    return <FullScreenLoader />;
  }

  if (pathname === '/login') {
    if (token && (isLoading || isAuthenticated) && !hasConnectionIssue) {
      return <FullScreenLoader />;
    }
    return <>{children}</>;
  }

  if (hasConnectionIssue && token) {
    return <>{children}</>;
  }

  if (isLoading || !token || !isAuthenticated) {
    return <FullScreenLoader />;
  }

  return <>{children}</>;
}

function FullScreenLoader() {
  return (
    <div className="min-h-screen bg-neutral-950 text-neutral-100" role="status" aria-label="Loading application">
      <span className="sr-only">Loading application</span>
      <aside className="fixed inset-y-0 left-0 hidden w-64 border-r border-neutral-800 bg-neutral-950 p-5 lg:block">
        <Skeleton className="h-6 w-40" />
        <Skeleton className="mt-2 h-4 w-32" />
        <Skeleton className="mt-8 h-10 w-full" />
        <Skeleton className="mt-5 h-24 w-full" />
        <div className="mt-6 space-y-3">
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-4 w-20" />
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-4 w-20" />
          <Skeleton className="h-10 w-full" />
        </div>
      </aside>
      <header className="flex h-14 items-center gap-3 border-b border-neutral-800 px-3 lg:hidden">
        <Skeleton className="h-10 w-10" />
        <Skeleton className="h-4 w-32" />
      </header>
      <main className="p-4 sm:p-5 lg:ml-64 lg:p-5">
        <Skeleton className="h-8 w-40" />
        <Skeleton className="mt-3 h-4 w-72 max-w-full" />
        <div className="mt-6 rounded-lg border border-neutral-800 bg-neutral-900 p-4 sm:p-5">
          <Skeleton className="h-4 w-16" />
          <Skeleton className="mt-3 h-10 w-56 max-w-full" />
        </div>
        <div className="mt-6 grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
          {Array.from({ length: 8 }, (_, index) => (
            <div key={index} className="rounded-lg border border-neutral-800 bg-neutral-900 p-4 sm:p-5">
              <Skeleton className="h-4 w-24" />
              <Skeleton className="mt-4 h-8 w-32" />
              <Skeleton className="mt-3 h-3 w-4/5" />
            </div>
          ))}
        </div>
        <div className="mt-6 grid gap-6 xl:grid-cols-2">
          <div className="rounded-lg border border-neutral-800 bg-neutral-900 p-4 sm:p-5"><Skeleton className="h-5 w-32" /><Skeleton className="mt-5 h-64 w-full" /></div>
          <div className="rounded-lg border border-neutral-800 bg-neutral-900 p-4 sm:p-5"><Skeleton className="h-5 w-28" /><Skeleton className="mt-5 h-64 w-full" /></div>
        </div>
      </main>
    </div>
  );
}
