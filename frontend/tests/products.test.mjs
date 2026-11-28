import { test } from 'node:test';
import assert from 'node:assert/strict';
import { productSchema, canManageProducts, localCatalogSource, localProductFormSchema } from '../src/entities/product/model.ts';
import { createProductsApi, productsApi } from '../src/entities/product/api.ts';

const product = { sku: 'ABC', name: 'Товар', price: 12.5, status: 'active', source: 'ERP' };
test('product validation rejects empty fields, invalid prices and statuses', () => {
  assert.equal(productSchema.safeParse(product).success, true);
  for (const patch of [{ sku: ' ' }, { name: '' }, { source: '' }, { price: -1 }, { price: null }, { price: Infinity }, { status: 'unknown' }]) {
    assert.equal(productSchema.safeParse({ ...product, ...patch }).success, false);
  }
});
test('permissions deny by default and explicit permissions override roles', () => {
  assert.equal(canManageProducts(undefined, 'create'), false);
  assert.equal(canManageProducts({}, 'update'), false);
  assert.equal(canManageProducts({ role: 'viewer' }, 'create'), false);
  assert.equal(canManageProducts({ role: 'admin' }, 'update'), true);
  assert.equal(canManageProducts({ role: 'admin', permissions: [] }, 'update'), false);
  assert.equal(canManageProducts({ permissions: ['products:create'] }, 'create'), true);
  assert.equal(canManageProducts({ permissions: ['products:create'] }, 'update'), false);
  assert.equal(canManageProducts({ role: 'admin' }, 'delete'), true);
  assert.equal(canManageProducts({ role: 'manager' }, 'delete'), false);
  assert.equal(canManageProducts({ role: 'manager', permissions: ['products:delete'] }, 'delete'), true);
  assert.equal(canManageProducts({ role: 'admin', permissions: ['products:update'] }, 'delete'), false);
});
test('products use backend GET, POST and PUT contracts', async () => {
  const originalFetch = globalThis.fetch;
  globalThis.localStorage = { getItem: key => key === 'orderflow.accessToken' ? 'token' : null };
  const calls = [];
  globalThis.fetch = async (url, options) => {
    calls.push({ url, options });
    return Response.json(url.endsWith('/products') && !options.method ? [{ ...product, id: 1 }] : { ...product, id: 1 });
  };
  try {
    assert.equal((await productsApi.list())[0].sku, 'ABC');
    assert.equal((await productsApi.get('1')).id, 1);
    await productsApi.create(product);
    await productsApi.update('1', product);
    assert.deepEqual(calls.map(call => call.options.method ?? 'GET'), ['GET', 'GET', 'POST', 'PUT']);
    assert.ok(calls[3].url.endsWith('/products/1'));
    assert.deepEqual(JSON.parse(calls[2].options.body), product);
  } finally { globalThis.fetch = originalFetch; }
});

test('deleting a product uses its encoded id and accepts an empty 204 response', async () => {
  const originalFetch = globalThis.fetch;
  const originalStorage = globalThis.localStorage;
  globalThis.localStorage = { getItem: key => key === 'orderflow.accessToken' ? 'token' : null };
  globalThis.fetch = async (url, options) => {
    assert.ok(url.endsWith('/products/a%2Fb'));
    assert.equal(options.method, 'DELETE');
    assert.equal(options.headers.get('Authorization'), 'Bearer token');
    return new Response(null, { status: 204 });
  };

  try {
    assert.equal(await productsApi.remove('a/b'), undefined);
    assert.equal(await createProductsApi(true).remove('a/b'), undefined);
  } finally {
    globalThis.fetch = originalFetch;
    globalThis.localStorage = originalStorage;
  }
});

test('local catalog reads Decimal prices and writes active status using POST and PATCH', async () => {
  const originalFetch = globalThis.fetch;
  const originalStorage = globalThis.localStorage;
  globalThis.localStorage = { getItem: key => key === 'orderflow.accessToken' ? 'token' : null };
  const localProducts = createProductsApi(true);
  const calls = [];
  const stored = { id: 'product-id', sku: product.sku, name: product.name, price: '12.50', active: false };
  globalThis.fetch = async (url, options) => {
    calls.push({ url, options });
    return Response.json(url.endsWith('/products') && !options.method ? [stored] : stored);
  };

  try {
    const expected = { ...product, id: stored.id, status: 'inactive', source: localCatalogSource };
    assert.deepEqual(await localProducts.list(), [expected]);
    assert.deepEqual(await localProducts.get(stored.id), expected);
    await localProducts.create(product);
    await localProducts.update(stored.id, { ...product, status: 'inactive' });
    assert.deepEqual(calls.map(call => call.options.method ?? 'GET'), ['GET', 'GET', 'POST', 'PATCH']);
    assert.ok(calls[3].url.endsWith('/products/product-id'));
    assert.deepEqual(JSON.parse(calls[2].options.body), { sku: product.sku, name: product.name, price: 12.5, active: true });
    assert.deepEqual(JSON.parse(calls[3].options.body), { sku: product.sku, name: product.name, price: 12.5, active: false });
  } finally {
    globalThis.fetch = originalFetch;
    globalThis.localStorage = originalStorage;
  }
});

test('local catalog form enforces the Docker API price limits', () => {
  for (const price of [0.01, 12.5, 9999999999.99]) {
    assert.equal(localProductFormSchema.safeParse({ ...product, price }).success, true);
  }
  for (const price of [0, -1, 12.345, 10000000000]) {
    assert.equal(localProductFormSchema.safeParse({ ...product, price }).success, false);
  }
});
