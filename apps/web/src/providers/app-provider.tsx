'use client';

import { PropsWithChildren } from 'react';
import { ProtectedRoute } from '@/components/auth/protected-route';
import { ClientErrorReporter } from './client-error-reporter';
import { QueryProvider } from './query-provider';
import { TabIdentityProvider } from './tab-identity-provider';
import { ToastProvider } from './toast-provider';

export function AppProvider({ children }: PropsWithChildren) {
  return (
    <QueryProvider>
      <ToastProvider>
        <TabIdentityProvider>
          <ClientErrorReporter>
            <ProtectedRoute>
              {children}
            </ProtectedRoute>
          </ClientErrorReporter>
        </TabIdentityProvider>
      </ToastProvider>
    </QueryProvider>
  );
}
