'use client';

import { PropsWithChildren } from 'react';
import { ProtectedRoute } from '@/components/auth/protected-route';
import { QueryProvider } from './query-provider';

export function AppProvider({ children }: PropsWithChildren) {
  return (
    <QueryProvider>
      <ProtectedRoute>{children}</ProtectedRoute>
    </QueryProvider>
  );
}
