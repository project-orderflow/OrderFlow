import { z } from 'zod';
import { fetchApi } from '../../shared/api/client';

export const paymentSchema = z.object({
  amount: z.number().nonnegative(),
  provider: z.string().min(1),
  status: z.enum(['pending', 'succeeded', 'canceled', 'failed']),
  external_id: z.union([z.string().min(1), z.number()]).nullish(),
  currency: z.string().regex(/^[A-Z]{3}$/).nullish(),
  confirmation_url: z.string().nullish(),
});

export type OrderPayment = z.infer<typeof paymentSchema>;

export async function createTestPayment(orderId: string, returnUrl: string): Promise<OrderPayment> {
  const response = await fetchApi<unknown>(`/orders/${encodeURIComponent(orderId)}/payments/test`, {
    method: 'POST',
    body: JSON.stringify({ return_url: returnUrl }),
  });
  return paymentSchema.parse(response);
}
