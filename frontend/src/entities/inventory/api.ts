import { z } from 'zod';
import { fetchApi } from '../../shared/api/client';

const inventorySchema = z.array(z.object({
  sku: z.string().min(1),
  name: z.string().min(1),
  on_hand: z.number().int(),
  reserved: z.number().int().nonnegative(),
  available: z.number().int(),
}));

export type InventoryItem = z.infer<typeof inventorySchema>[number];
export interface StockReceipt {
  sku: string;
  quantity: number;
}

export async function fetchInventory(signal?: AbortSignal): Promise<InventoryItem[]> {
  return inventorySchema.parse(await fetchApi<unknown>('/inventory', { signal }));
}

export function receiveStock(receipt: StockReceipt) {
  return fetchApi('/inventory/receipts', {
    method: 'POST',
    body: JSON.stringify(receipt),
  });
}
