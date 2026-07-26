'use client';

import { PropsWithChildren } from 'react';
import { PageTabHead } from '@/components/layout/page-tab-head';
import { ProtectedRoute } from '@/components/auth/protected-route';
import { ClientErrorReporter } from './client-error-reporter';
import { QueryProvider } from './query-provider';
import { ToastProvider } from './toast-provider';

export function AppProvider({ children }: PropsWithChildren) {
  return (
    <QueryProvider>
      <ToastProvider>
        <ClientErrorReporter>
          <ProtectedRoute>
            <PageTabHead />
            {children}
          </ProtectedRoute>
        </ClientErrorReporter>
      </ToastProvider>
    </QueryProvider>
  );
}
