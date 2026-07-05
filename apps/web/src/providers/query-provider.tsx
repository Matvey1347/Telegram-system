'use client';

import { keepPreviousData, QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { PersistQueryClientProvider } from '@tanstack/react-query-persist-client';
import { createSyncStoragePersister } from '@tanstack/query-sync-storage-persister';
import { PropsWithChildren, useState } from 'react';

const PERSISTED_QUERY_KEYS = [
  'auth',
  'account-me',
  'workspaces',
  'workspace-selected',
  'workspace-members',
  'telegram-channels',
  'telegram-managed-posts',
  'post-groups',
  'post-group',
  'icons',
  'icon',
  'currency-settings',
  'currency-rates',
  'accounts',
  'transaction-categories',
  'transaction-categories-admin',
  'telegram-channel-networks',
  'advertising-people',
  'promos',
  'ad-campaigns',
  'ad-hypotheses',
] as const;

const workspaceScopedQueryKeys = new Set<string>([
  'account-me',
  'workspace-selected',
  'workspace-members',
  'telegram-channels',
  'telegram-managed-posts',
  'post-groups',
  'post-group',
  'currency-settings',
  'currency-rates',
  'accounts',
  'transactions',
  'transfers',
  'transaction-categories',
  'transaction-categories-admin',
  'telegram-channel-networks',
  'advertising-people',
  'promos',
  'ad-campaigns',
  'ad-hypotheses',
  'dashboard-summary',
]);

export const QUERY_PERSIST_STORAGE_KEY = 'telegram-system-react-query-cache';

export function clearPersistedQueryCache() {
  if (typeof window === 'undefined') return;
  window.localStorage.removeItem(QUERY_PERSIST_STORAGE_KEY);
}

export function QueryProvider({ children }: PropsWithChildren) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 4 * 60_000,
            gcTime: 45 * 60_000,
            placeholderData: keepPreviousData,
            refetchOnWindowFocus: false,
            refetchOnReconnect: true,
            retry: 1,
          },
        },
      }),
  );
  const [persister] = useState(() =>
    typeof window === 'undefined'
      ? null
      : createSyncStoragePersister({
          storage: window.localStorage,
          key: QUERY_PERSIST_STORAGE_KEY,
          throttleTime: 1_000,
        }),
  );
  const [buster] = useState(() => {
    if (typeof window === 'undefined') return 'server';
    return `workspace:${window.localStorage.getItem('selected-workspace-id') ?? 'none'}`;
  });

  if (!persister) {
    return (
      <QueryClientProvider client={queryClient}>
        {children}
      </QueryClientProvider>
    );
  }

  return (
    <PersistQueryClientProvider
      client={queryClient}
      persistOptions={{
        persister,
        buster,
        maxAge: 45 * 60_000,
        dehydrateOptions: {
          shouldDehydrateMutation: () => false,
          shouldDehydrateQuery: (query) => {
            if (query.state.status !== 'success') return false;
            const [root] = query.queryKey;
            return (
              typeof root === 'string' &&
              (PERSISTED_QUERY_KEYS as readonly string[]).includes(root)
            );
          },
        },
      }}
    >
      {children}
    </PersistQueryClientProvider>
  );
}

export function isWorkspaceScopedQuery(queryKey: readonly unknown[]) {
  const [root] = queryKey;
  return typeof root === 'string' && workspaceScopedQueryKeys.has(root);
}
