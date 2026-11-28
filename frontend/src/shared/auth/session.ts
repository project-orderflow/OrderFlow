import { useSyncExternalStore } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { fetchApi } from '../api/client';
import { getSessionKey, setSession, subscribeToken } from './token';
export interface User { id: string | number; email?: string; name?: string; role?: string; roles?: string[]; permissions?: string[] }

export function getDisplayName(user: User | undefined) {
  return user?.name?.trim() || user?.email || '';
}

export function useSession() {
  const sessionKey = useSyncExternalStore(subscribeToken, getSessionKey);
  const query = useQuery({
    queryKey: ['session', sessionKey],
    queryFn: ({ signal }) => fetchApi<User>('/auth/me', { signal }),
    enabled: Boolean(sessionKey), retry: false, staleTime: Infinity, gcTime: 0,
  });
  return { sessionKey, ...query };
}

export function useSignOut() {
  const queryClient = useQueryClient();
  return () => {
    setSession(null);
    queryClient.clear();
  };
}
