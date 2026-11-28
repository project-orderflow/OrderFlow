const KEY = 'orderflow.session';
const LEGACY_KEY = 'orderflow.accessToken';
const listeners = new Set<() => void>();

export interface TokenPair {
  access_token: string;
  refresh_token: string;
}

export interface StoredSession {
  id: string;
  access_token: string;
  refresh_token: string | null;
}

export function isTokenPair(value: unknown): value is TokenPair {
  return typeof value === 'object' && value !== null
    && 'access_token' in value && typeof value.access_token === 'string' && Boolean(value.access_token.trim())
    && 'refresh_token' in value && typeof value.refresh_token === 'string' && Boolean(value.refresh_token.trim());
}

export function getStoredSession(): StoredSession | null {
  const saved = localStorage.getItem(KEY);
  if (saved !== null) {
    try {
      const data: unknown = JSON.parse(saved);
      if (isTokenPair(data) && 'id' in data && typeof data.id === 'string' && data.id) {
        return { id: data.id, access_token: data.access_token, refresh_token: data.refresh_token };
      }
    } catch {
      // Invalid saved data cannot be used to authenticate.
    }
    return null;
  }

  const access = localStorage.getItem(LEGACY_KEY);
  return access ? { id: `legacy:${access}`, access_token: access, refresh_token: null } : null;
}

export const getToken = () => getStoredSession()?.access_token ?? null;
export const getSessionKey = () => getStoredSession()?.id ?? null;

export function isSameSession(left: StoredSession | null, right: StoredSession) {
  return left?.id === right.id && left.access_token === right.access_token && left.refresh_token === right.refresh_token;
}

function saveSession(session: StoredSession | null) {
  if (session) localStorage.setItem(KEY, JSON.stringify(session));
  else localStorage.removeItem(KEY);
  localStorage.removeItem(LEGACY_KEY);
  listeners.forEach(listener => listener());
}

export function setSession(tokens: TokenPair | null) {
  if (!tokens) {
    saveSession(null);
    return;
  }
  const id = Array.from(crypto.getRandomValues(new Uint8Array(16)), byte => byte.toString(16).padStart(2, '0')).join('');
  saveSession({ id, access_token: tokens.access_token, refresh_token: tokens.refresh_token });
}

export function rotateSession(previous: StoredSession, tokens: TokenPair): StoredSession | null {
  if (!isSameSession(getStoredSession(), previous)) return null;
  const next = { id: previous.id, access_token: tokens.access_token, refresh_token: tokens.refresh_token };
  saveSession(next);
  return next;
}

export function subscribeToken(listener: () => void) {
  listeners.add(listener);
  const onStorage = (event: StorageEvent) => {
    if (event.key === KEY || event.key === LEGACY_KEY || event.key === null) listener();
  };
  window.addEventListener('storage', onStorage);
  return () => { listeners.delete(listener); window.removeEventListener('storage', onStorage); };
}
