import { z } from 'zod';
import { fetchApi } from '../../shared/api/client.ts';
import { localCatalogSource, productResponseSchema, useLocalCatalog } from './model.ts';
import type { ProductInput } from './model.ts';

const localProductResponseSchema = productResponseSchema.pick({ id: true, sku: true, name: true }).extend({
  price: z.string().regex(/^\d+(?:\.\d+)?$/).pipe(z.coerce.number()),
  active: z.boolean(),
}).transform(({ active, ...product }) => ({
  ...product,
  status: active ? 'active' as const : 'inactive' as const,
  source: localCatalogSource,
}));

export function createProductsApi(localCatalog: boolean) {
  const responseSchema = localCatalog ? localProductResponseSchema : productResponseSchema;
  const listSchema = z.array(responseSchema);

  function productBody(data: ProductInput) {
    if (!localCatalog) return JSON.stringify(data);
    const { sku, name, price, status } = data;
    return JSON.stringify({ sku, name, price, active: status === 'active' });
  }

  return {
    list: async (signal?: AbortSignal) => listSchema.parse(await fetchApi('/products', { signal })),
    get: async (id: string, signal?: AbortSignal) => responseSchema.parse(await fetchApi(`/products/${encodeURIComponent(id)}`, { signal })),
    create: (data: ProductInput) => fetchApi('/products', { method: 'POST', body: productBody(data) }),
    update: (id: string, data: ProductInput) => fetchApi(`/products/${encodeURIComponent(id)}`, {
      method: localCatalog ? 'PATCH' : 'PUT',
      body: productBody(data),
    }),
    remove: (id: string) => fetchApi<void>(`/products/${encodeURIComponent(id)}`, { method: 'DELETE' }),
  };
}

export const productsApi = createProductsApi(useLocalCatalog);
