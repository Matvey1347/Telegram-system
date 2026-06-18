'use client';

import { useQuery } from '@tanstack/react-query';
import { authApi } from '@/lib/api';
import { getAccessToken } from '@/lib/auth';

export function useAuth() {
  const token = getAccessToken();
  const query = useQuery({ queryKey: ['me'], queryFn: authApi.me, enabled: !!token, retry: false });
  return {
    token,
    user: query.data?.user,
    workspace: query.data?.workspace,
    isLoading: !!token && query.isLoading,
    isAuthenticated: !!token && !!query.data?.user,
    error: query.error,
  };
}
