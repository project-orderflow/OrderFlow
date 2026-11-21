import { useSyncExternalStore } from 'react';
import { useQuery } from '@tanstack/react-query';
import { fetchApi } from '../api/client';
import { getToken, getSessionKey, subscribeToken } from './token';
export interface User { id: string | number; email?: string; name?: string; role?: string; roles?: string[]; permissions?: string[] }
export function useSession() {
  const token = useSyncExternalStore(subscribeToken, getToken);
  const sessionKey = getSessionKey();
  const query = useQuery({
    queryKey: ['session', sessionKey],
    queryFn: ({ signal }) => fetchApi<User>('/auth/me', { signal }),
    enabled: Boolean(token), retry: false, staleTime: Infinity, gcTime: 0,
  });
  return { token, sessionKey, ...query };
}
