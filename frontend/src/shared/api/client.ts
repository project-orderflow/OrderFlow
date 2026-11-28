import { getToken, setToken } from '../auth/token.ts';
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
let refreshFlight: { token: string; promise: Promise<string> } | undefined;
let lastRotation: { from: string; to: string } | undefined;
async function refreshToken(token: string): Promise<string> {
  if (refreshFlight?.token === token) return refreshFlight.promise;
  const promise = (async () => {
    const response = await fetch(`${API_URL}/auth/refresh`, { method: 'POST', credentials: 'include' });
    if (!response.ok) {
      if ([401, 403].includes(response.status) && getToken() === token) setToken(null);
      throw new ApiError(response.status);
    }
    const data = await response.json();
    if (typeof data.access_token !== 'string' || !data.access_token.trim()) throw new Error('Invalid refresh response');
    if (getToken() !== token) throw new ApiError(401);
    lastRotation = { from: token, to: data.access_token };
    setToken(data.access_token, true);
    return data.access_token as string;
  })();
  refreshFlight = { token, promise };
  try { return await promise; }
  finally { if (refreshFlight?.promise === promise) refreshFlight = undefined; }
}
export async function fetchApi<T>(endpoint: string, options?: RequestInit): Promise<T> {
  const isAuth = ['/auth/login', '/auth/register', '/auth/refresh', '/auth/logout'].includes(endpoint);
  const originalToken = isAuth ? null : getToken();
  async function send(token: string | null) {
    const headers = new Headers(options?.headers);
    if (options?.body && !headers.has('Content-Type')) headers.set('Content-Type', 'application/json');
    if (token) headers.set('Authorization', `Bearer ${token}`);
    return fetch(`${API_URL}${endpoint}`, { ...options, credentials: 'include', headers });
  }
  let response = await send(originalToken);
  let requestToken = originalToken;
  if (response.status === 401 && originalToken && !isAuth) {
    options?.signal?.throwIfAborted();
    const currentToken = getToken();
    if (!currentToken) throw new ApiError(401);
    if (currentToken !== originalToken && (lastRotation?.from !== originalToken || lastRotation.to !== currentToken)) throw new ApiError(401);
    requestToken = currentToken !== originalToken ? currentToken : await refreshToken(originalToken);
    options?.signal?.throwIfAborted();
    // Logout while refresh was in flight must never replay a protected request.
    if (getToken() !== requestToken) throw new ApiError(401);
    response = await send(requestToken);
  }
  if (!response.ok) {
    if (response.status === 401 && requestToken && getToken() === requestToken) setToken(null);
    const body: unknown = await response.json().catch(() => undefined);
    const code = body && typeof body === 'object' && 'code' in body && typeof body.code === 'string'
      ? body.code
      : undefined;
    throw new ApiError(response.status, code);
  }
  if (response.status === 204) return undefined as T;
  return response.json();
}
