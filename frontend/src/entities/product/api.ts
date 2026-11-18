import { z } from 'zod';
import { fetchApi } from '../../shared/api/client.ts';
import { productResponseSchema } from './model.ts';
import type { ProductInput } from './model.ts';
export const productsApi = {
  list: async (signal?: AbortSignal) => z.array(productResponseSchema).parse(await fetchApi('/products', { signal })),
  get: async (id: string, signal?: AbortSignal) => productResponseSchema.parse(await fetchApi(`/products/${encodeURIComponent(id)}`, { signal })),
  create: (data: ProductInput) => fetchApi('/products', { method: 'POST', body: JSON.stringify(data) }),
  update: (id: string, data: ProductInput) => fetchApi(`/products/${encodeURIComponent(id)}`, { method: 'PUT', body: JSON.stringify(data) }),
};
