import { z } from 'zod';
import { fetchApi } from '../../shared/api/client';

const actionSchema = z.enum(['start', 'complete']);
const queueSchema = z.array(z.object({
  order_id: z.union([z.string().min(1), z.number()]),
  order_number: z.union([z.string().min(1), z.number()]),
  item_count: z.number().int().nonnegative(),
  priority: z.enum(['low', 'normal', 'high', 'urgent']),
  status: z.enum(['pending', 'in_progress', 'completed']),
  version: z.union([z.string().min(1), z.number().int().nonnegative()]),
  allowed_actions: z.array(actionSchema),
}));

export type FulfillmentStage = 'picking' | 'packing';
export type FulfillmentAction = z.infer<typeof actionSchema>;
export type QueueEntry = z.infer<typeof queueSchema>[number];

export async function fetchQueue(stage: FulfillmentStage, signal?: AbortSignal) {
  return queueSchema.parse(await fetchApi<unknown>(`/fulfillment/${stage}`, { signal }));
}

export function changeQueueEntry(
  stage: FulfillmentStage,
  orderId: string,
  action: FulfillmentAction,
  version: QueueEntry['version'],
) {
  return fetchApi(`/fulfillment/${stage}/${encodeURIComponent(orderId)}/${action}`, {
    method: 'POST',
    body: JSON.stringify({ version }),
  });
}
