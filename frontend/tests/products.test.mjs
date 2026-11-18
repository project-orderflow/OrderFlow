import { test } from 'node:test';
import assert from 'node:assert/strict';
import { productSchema, canManageProducts } from '../src/entities/product/model.ts';
import { productsApi } from '../src/entities/product/api.ts';

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
});
test('products use backend GET, POST and PUT contracts', async () => {
  const originalFetch = globalThis.fetch;
  globalThis.localStorage = { getItem: () => 'token' };
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
