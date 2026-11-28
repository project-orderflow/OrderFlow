import { test, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { fetchApi, ApiError } from '../src/shared/api/client.ts';
import { registerAccount } from '../src/shared/auth/registration.ts';
import { getToken, getSessionKey, getStoredSession, setSession, subscribeToken } from '../src/shared/auth/token.ts';

const tokens = access => ({ access_token: access, refresh_token: `refresh-${access}` });
const signIn = access => setSession(tokens(access));

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
  signIn('saved-token');
  assert.equal(getToken(), 'saved-token');
  assert.equal(getStoredSession().refresh_token, 'refresh-saved-token');
  const event = new Event('storage');
  event.key = 'orderflow.session';
  window.dispatchEvent(event);
  setSession(null);
  assert.equal(getToken(), null);
  assert.equal(getStoredSession(), null);
  assert.equal(calls, 3);
  unsubscribe();
  signIn('another');
  assert.equal(calls, 3);
});

test('a new login gets a separate cache key even if the access token matches', () => {
  signIn('same-access');
  const key = getSessionKey();
  signIn('same-access');
  assert.notEqual(getSessionKey(), key);
});

test('restores session via /auth/me with bearer token and preserves custom headers', async () => {
  signIn('saved-token');
  globalThis.fetch = async (url, options) => {
    assert.ok(url.endsWith('/auth/me'));
    assert.equal(options.headers.get('Authorization'), 'Bearer saved-token');
    assert.equal(options.headers.get('X-Test'), 'yes');
    return Response.json({ id: 1, email: 'operator@example.com' });
  };
  assert.equal((await fetchApi('/auth/me', { headers: new Headers({ 'X-Test': 'yes' }) })).id, 1);
});

test('a rejected refresh clears the current session', async () => {
  signIn('expired');
  globalThis.fetch = async () => new Response(null, { status: 401 });
  await assert.rejects(fetchApi('/auth/me'), error => error instanceof ApiError && error.status === 401);
  assert.equal(getStoredSession(), null);
});

test('a legacy access-only session signs out on expiry without calling refresh', async () => {
  localStorage.setItem('orderflow.accessToken', 'legacy-access');
  globalThis.fetch = async (url, options) => {
    assert.ok(url.endsWith('/auth/me'));
    assert.equal(options.headers.get('Authorization'), 'Bearer legacy-access');
    return new Response(null, { status: 401 });
  };
  await assert.rejects(fetchApi('/auth/me'), error => error.status === 401);
  assert.equal(getStoredSession(), null);
  assert.equal(localStorage.getItem('orderflow.accessToken'), null);
});

test('late 401 cannot invalidate a newer session', async () => {
  signIn('old');
  globalThis.fetch = async url => {
    assert.ok(url.endsWith('/auth/me'));
    signIn('new');
    return new Response(null, { status: 401 });
  };
  await assert.rejects(fetchApi('/auth/me'));
  assert.equal(getToken(), 'new');
});

test('403, server and network errors preserve the token for recovery', async () => {
  signIn('valid');
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
  signIn('old');
  const credentials = { email: 'operator@example.com', password: 'test-password' };
  globalThis.fetch = async (_url, options) => {
    assert.equal(options.method, 'POST');
    assert.equal(options.headers.get('Authorization'), null);
    assert.equal(options.headers.get('Content-Type'), 'application/json');
    assert.deepEqual(JSON.parse(options.body), credentials);
    return Response.json(tokens('new'));
  };
  assert.deepEqual(await fetchApi('/auth/login', { method: 'POST', body: JSON.stringify(credentials) }), tokens('new'));
});

test('registers with the public API and returns the account email for sign-in', async () => {
  signIn('saved-token');
  const account = { id: 23, email: 'operator@example.test' };
  const password = 'registration-test-password';
  const signal = new AbortController().signal;
  globalThis.fetch = async (url, options) => {
    assert.ok(url.endsWith('/auth/register'));
    assert.equal(options.method, 'POST');
    assert.equal(options.headers.get('Authorization'), null);
    assert.equal(options.signal, signal);
    assert.deepEqual(JSON.parse(options.body), { name: 'Оператор', email: account.email, password });
    return Response.json(account, { status: 201 });
  };
  assert.deepEqual(
    await registerAccount({ name: ' Оператор ', email: ` ${account.email} `, password }, signal),
    account,
  );
});

test('parallel 401 responses share a JSON refresh and the next refresh uses the rotated token', async () => {
  signIn('parallel-old');
  const sessionKey = getSessionKey();
  const refreshes = [];
  let validAccess = 'parallel-new';
  let requests = 0;
  globalThis.fetch = async (url, options) => {
    if (url.endsWith('/auth/refresh')) {
      assert.equal(options.method, 'POST');
      assert.equal(new Headers(options.headers).get('Content-Type'), 'application/json');
      refreshes.push(JSON.parse(options.body));
      await new Promise(resolve => setTimeout(resolve, 10));
      return Response.json(tokens(validAccess));
    }
    requests++;
    return options.headers.get('Authorization') === `Bearer ${validAccess}`
      ? Response.json({ ok: true }) : new Response(null, { status: 401 });
  };
  const results = await Promise.all([fetchApi('/products'), fetchApi('/auth/me')]);
  assert.deepEqual(results, [{ ok: true }, { ok: true }]);
  assert.deepEqual(refreshes, [{ refresh_token: 'refresh-parallel-old' }]);
  assert.equal(requests, 4);
  assert.equal(getStoredSession().refresh_token, 'refresh-parallel-new');
  assert.equal(getSessionKey(), sessionKey);

  validAccess = 'third-access';
  assert.deepEqual(await fetchApi('/auth/me'), { ok: true });
  assert.deepEqual(refreshes[1], { refresh_token: 'refresh-parallel-new' });
  assert.equal(getToken(), 'third-access');
  assert.equal(getStoredSession().refresh_token, 'refresh-third-access');
});

test('logout during refresh cannot restore a session or replay a request', async () => {
  signIn('logout-old');
  let requests = 0;
  globalThis.fetch = async url => {
    if (url.endsWith('/auth/refresh')) {
      setSession(null);
      return Response.json(tokens('should-not-persist'));
    }
    requests++;
    return new Response(null, { status: 401 });
  };
  await assert.rejects(fetchApi('/products'));
  assert.equal(getStoredSession(), null);
  assert.equal(requests, 1);
});

test('a repeated 401 stops after one refresh and clears the token', async () => {
  signIn('retry-old');
  let refreshes = 0;
  globalThis.fetch = async url => {
    if (url.endsWith('/auth/refresh')) {
      refreshes++;
      return Response.json(tokens('retry-new'));
    }
    return new Response(null, { status: 401 });
  };
  await assert.rejects(fetchApi('/products'));
  assert.equal(refreshes, 1);
  assert.equal(getToken(), null);
});

test('refresh server failure preserves the session and allows a later retry', async () => {
  signIn('transient');
  globalThis.fetch = async url => new Response(null, { status: url.endsWith('/auth/refresh') ? 500 : 401 });
  await assert.rejects(fetchApi('/products'), error => error.status === 500);
  assert.equal(getToken(), 'transient');
  assert.equal(getStoredSession().refresh_token, 'refresh-transient');
});

test('invalid refresh data clears an unrecoverable session', async () => {
  for (const response of [new Response(null, { status: 422 }), Response.json({ access_token: 'incomplete' })]) {
    signIn('invalid');
    globalThis.fetch = async url => url.endsWith('/auth/refresh') ? response : new Response(null, { status: 401 });
    await assert.rejects(fetchApi('/auth/me'), error => error.status === 401);
    assert.equal(getStoredSession(), null);
  }
});
