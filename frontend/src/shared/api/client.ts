import { getStoredSession, isSameSession, isTokenPair, rotateSession, setSession } from '../auth/token.ts';
import type { StoredSession } from '../auth/token.ts';
export const API_URL = (import.meta.env?.VITE_API_URL || 'http://localhost:8080/api').replace(/\/$/, '');
export class ApiError extends Error {
  readonly status: number;
  readonly code?: string;
  constructor(status: number, code?: string) {
    super(`API Error: ${status}`);
    this.status = status;
    this.code = code;
  }
}
let refreshFlight: { sessionId: string; promise: Promise<StoredSession> } | undefined;

function getActiveSession(id: string): StoredSession {
  const session = getStoredSession();
  if (session?.id !== id) throw new ApiError(401);
  return session;
}

async function requestRefresh(previous: StoredSession): Promise<StoredSession> {
  // Another tab may have rotated the pair while this tab waited for the lock.
  const current = getActiveSession(previous.id);
  if (!isSameSession(current, previous)) return current;
  if (!current.refresh_token) {
    setSession(null);
    throw new ApiError(401);
  }

  const response = await fetch(`${API_URL}/auth/refresh`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ refresh_token: current.refresh_token }),
  });
  const data: unknown = response.ok ? await response.json().catch(() => undefined) : undefined;

  const latest = getActiveSession(current.id);
  if (!isSameSession(latest, current)) return latest;
  if (!response.ok) {
    if ([401, 403, 422].includes(response.status)) {
      setSession(null);
      throw new ApiError(401);
    }
    throw new ApiError(response.status);
  }
  if (!isTokenPair(data)) {
    setSession(null);
    throw new ApiError(401);
  }
  const rotated = rotateSession(current, data);
  if (!rotated) throw new ApiError(401);
  return rotated;
}

async function refreshSession(previous: StoredSession) {
  const current = getActiveSession(previous.id);
  if (!isSameSession(current, previous)) return current;
  if (refreshFlight?.sessionId === current.id) return refreshFlight.promise;
  const locks = globalThis.navigator?.locks;
  const promise = locks
    ? locks.request(`orderflow.refresh:${current.id}`, () => requestRefresh(current))
    : requestRefresh(current);
  refreshFlight = { sessionId: current.id, promise };
  try { return await promise; }
  finally { if (refreshFlight?.promise === promise) refreshFlight = undefined; }
}

export async function fetchApi<T>(endpoint: string, options?: RequestInit): Promise<T> {
  const isAuth = ['/auth/login', '/auth/register', '/auth/refresh', '/auth/logout'].includes(endpoint);
  const originalSession = isAuth ? null : getStoredSession();
  async function send(token: string | null) {
    const headers = new Headers(options?.headers);
    if (options?.body && !headers.has('Content-Type')) headers.set('Content-Type', 'application/json');
    if (token) headers.set('Authorization', `Bearer ${token}`);
    return fetch(`${API_URL}${endpoint}`, { ...options, credentials: 'include', headers });
  }
  let requestSession = originalSession;
  let response = await send(requestSession?.access_token ?? null);
  if (response.status === 401 && originalSession) {
    options?.signal?.throwIfAborted();
    await refreshSession(originalSession);
    options?.signal?.throwIfAborted();
    requestSession = getActiveSession(originalSession.id);
    response = await send(requestSession.access_token);
  }
  if (!response.ok) {
    if (response.status === 401 && requestSession && isSameSession(getStoredSession(), requestSession)) {
      setSession(null);
    }
    const body: unknown = await response.json().catch(() => undefined);
    const code = body && typeof body === 'object' && 'code' in body && typeof body.code === 'string'
      ? body.code
      : undefined;
    throw new ApiError(response.status, code);
  }
  if (response.status === 204) return undefined as T;
  return response.json();
}
