const KEY = 'orderflow.accessToken';
const listeners = new Set<() => void>();
export const getToken = () => localStorage.getItem(KEY);
let observedToken: string | null | undefined;
let sessionKey: string | null = null;
export function getSessionKey() {
  const token = getToken();
  if (token !== observedToken) { observedToken = token; sessionKey = token; }
  return sessionKey;
}
export function setToken(token: string | null, rotation = false) {
  getSessionKey();
  if (token) localStorage.setItem(KEY, token);
  else localStorage.removeItem(KEY);
  observedToken = token;
  if (!rotation || !token) sessionKey = token;
  listeners.forEach(listener => listener());
}
export function subscribeToken(listener: () => void) {
  listeners.add(listener);
  const onStorage = (event: StorageEvent) => {
    if (event.key === KEY || event.key === null) listener();
  };
  window.addEventListener('storage', onStorage);
  return () => { listeners.delete(listener); window.removeEventListener('storage', onStorage); };
}
