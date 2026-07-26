'use client';

import { PropsWithChildren, Suspense } from 'react';
import { ProtectedRoute } from '@/components/auth/protected-route';
import { ClientErrorReporter } from './client-error-reporter';
import { QueryProvider } from './query-provider';
import { TabIdentityProvider } from './tab-identity-provider';
import { ToastProvider } from './toast-provider';

export function AppProvider({ children }: PropsWithChildren) {
  return (
    <QueryProvider>
      <ToastProvider>
        <Suspense
          fallback={
            <ClientErrorReporter>
              <ProtectedRoute>{children}</ProtectedRoute>
            </ClientErrorReporter>
          }
        >
          <TabIdentityProvider>
            <ClientErrorReporter>
              <ProtectedRoute>
                {children}
              </ProtectedRoute>
            </ClientErrorReporter>
          </TabIdentityProvider>
        </Suspense>
      </ToastProvider>
    </QueryProvider>
  );
}
