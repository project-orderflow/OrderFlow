import { test, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { fetchApi, ApiError } from '../src/shared/api/client.ts';
import { getToken, getSessionKey, setToken, subscribeToken } from '../src/shared/auth/token.ts';

const originalFetch = globalThis.fetch;
beforeEach(() => {
  const storage = new Map();
  globalThis.localStorage = {
    getItem: key => storage.get(key) ?? null,
    setItem: (key, value) => storage.set(key, value),
    removeItem: key => storage.delete(key),
  };
  globalThis.window = new EventTarget();
});
afterEach(() => { globalThis.fetch = originalFetch; });

test('persists token and notifies subscribers on login, logout and other tabs', () => {
  let calls = 0;
  const unsubscribe = subscribeToken(() => calls++);
  setToken('saved-token');
  assert.equal(getToken(), 'saved-token');
  const event = new Event('storage');
  event.key = 'orderflow.accessToken';
  window.dispatchEvent(event);
  setToken(null);
  assert.equal(getToken(), null);
  assert.equal(calls, 3);
  unsubscribe();
  setToken('another');
  assert.equal(calls, 3);
});

test('refresh preserves query identity while a new login changes it', () => {
  setToken('session-start');
  const key = getSessionKey();
  setToken('session-rotated', true);
  assert.equal(getSessionKey(), key);
  setToken(null);
  setToken('other-user');
  assert.notEqual(getSessionKey(), key);
});

test('restores session via /auth/me with bearer token and preserves custom headers', async () => {
  setToken('saved-token');
  globalThis.fetch = async (url, options) => {
    assert.ok(url.endsWith('/auth/me'));
    assert.equal(options.headers.get('Authorization'), 'Bearer saved-token');
    assert.equal(options.headers.get('X-Test'), 'yes');
    return Response.json({ id: 1, email: 'operator@example.com' });
  };
  assert.equal((await fetchApi('/auth/me', { headers: new Headers({ 'X-Test': 'yes' }) })).id, 1);
});

test('401 invalidates the current session', async () => {
  setToken('expired');
  globalThis.fetch = async () => new Response(null, { status: 401 });
  await assert.rejects(fetchApi('/auth/me'), error => error instanceof ApiError && error.status === 401);
  assert.equal(getToken(), null);
});

test('late 401 cannot invalidate a newer session', async () => {
  setToken('old');
  globalThis.fetch = async () => { setToken('new'); return new Response(null, { status: 401 }); };
  await assert.rejects(fetchApi('/auth/me'));
  assert.equal(getToken(), 'new');
});

test('403, server and network errors preserve the token for recovery', async () => {
  setToken('valid');
  for (const status of [403, 500]) {
    globalThis.fetch = async () => new Response(null, { status });
    await assert.rejects(fetchApi('/auth/me'), error => error.status === status);
    assert.equal(getToken(), 'valid');
  }
  globalThis.fetch = async () => { throw new TypeError('offline'); };
  await assert.rejects(fetchApi('/auth/me'));
  assert.equal(getToken(), 'valid');
});

test('login sends JSON credentials without attaching an existing bearer token', async () => {
  setToken('old');
  const credentials = { email: 'operator@example.com', password: 'test-password' };
  globalThis.fetch = async (_url, options) => {
    assert.equal(options.method, 'POST');
    assert.equal(options.headers.get('Authorization'), null);
    assert.equal(options.headers.get('Content-Type'), 'application/json');
    assert.deepEqual(JSON.parse(options.body), credentials);
    return Response.json({ access_token: 'new' });
  };
  assert.deepEqual(await fetchApi('/auth/login', { method: 'POST', body: JSON.stringify(credentials) }), { access_token: 'new' });
});

test('parallel 401 responses share refresh and replay with the new token', async () => {
  setToken('parallel-old');
  let refreshes = 0;
  let requests = 0;
  globalThis.fetch = async (url, options) => {
    if (url.endsWith('/auth/refresh')) {
      refreshes++;
      assert.equal(options.credentials, 'include');
      await new Promise(resolve => setTimeout(resolve, 10));
      return Response.json({ access_token: 'parallel-new' });
    }
    requests++;
    return options.headers.get('Authorization') === 'Bearer parallel-new'
      ? Response.json({ ok: true }) : new Response(null, { status: 401 });
  };
  const results = await Promise.all([fetchApi('/products'), fetchApi('/auth/me')]);
  assert.deepEqual(results, [{ ok: true }, { ok: true }]);
  assert.equal(refreshes, 1);
  assert.equal(requests, 4);
});

test('logout during refresh cannot restore a session or replay a request', async () => {
  setToken('logout-old');
  let requests = 0;
  globalThis.fetch = async url => {
    if (url.endsWith('/auth/refresh')) {
      setToken(null);
      return Response.json({ access_token: 'should-not-persist' });
    }
    requests++;
    return new Response(null, { status: 401 });
  };
  await assert.rejects(fetchApi('/products'));
  assert.equal(getToken(), null);
  assert.equal(requests, 1);
});

test('a repeated 401 stops after one refresh and clears the token', async () => {
  setToken('retry-old');
  let refreshes = 0;
  globalThis.fetch = async url => {
    if (url.endsWith('/auth/refresh')) {
      refreshes++;
      return Response.json({ access_token: 'retry-new' });
    }
    return new Response(null, { status: 401 });
  };
  await assert.rejects(fetchApi('/products'));
  assert.equal(refreshes, 1);
  assert.equal(getToken(), null);
});

test('refresh server failure preserves the session and allows a later retry', async () => {
  setToken('transient');
  globalThis.fetch = async url => new Response(null, { status: url.endsWith('/auth/refresh') ? 500 : 401 });
  await assert.rejects(fetchApi('/products'), error => error.status === 500);
  assert.equal(getToken(), 'transient');
});
