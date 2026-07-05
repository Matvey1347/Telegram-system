'use client';

import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { authApi } from '@/lib/api';
import { AUTH_TOKEN_CHANGED_EVENT, getAccessToken } from '@/lib/auth';

export function useAuth() {
  const [token, setToken] = useState<string | null | undefined>(undefined);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setToken(getAccessToken());
    const onStorage = () => setToken(getAccessToken());
    const onTokenChanged = () => setToken(getAccessToken());
    window.addEventListener('storage', onStorage);
    window.addEventListener(AUTH_TOKEN_CHANGED_EVENT, onTokenChanged);
    return () => {
      window.removeEventListener('storage', onStorage);
      window.removeEventListener(AUTH_TOKEN_CHANGED_EVENT, onTokenChanged);
    };
  }, []);

  const isTokenReady = token !== undefined;
  const query = useQuery({
    queryKey: ['auth', 'me'],
    queryFn: authApi.me,
    enabled: !!token,
    retry: false,
  });
  const isAuthenticated = !!token && !!query.data?.user;
  const isAuthResolved =
    isTokenReady && (!token || isAuthenticated || query.isError);

  return {
    token: token ?? null,
    user: query.data?.user,
    workspace: query.data?.workspace,
    isTokenReady,
    isAuthResolved,
    isLoading: !isAuthResolved,
    isAuthenticated,
    error: query.error,
  };
}
