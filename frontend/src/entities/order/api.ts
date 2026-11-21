import { z } from 'zod';
import { fetchApi } from '../../shared/api/client';
import { paymentSchema } from './payment';

const orderSchema = z.object({
  id: z.union([z.string().min(1), z.number()]),
  number: z.union([z.string().min(1), z.number()]),
  external_number: z.union([z.string(), z.number()]).nullish(),
  source: z.string().min(1),
  customer: z.string().min(1),
  total: z.number(),
  status: z.string().min(1),
  created_at: z.union([z.iso.datetime({ offset: true }), z.iso.date()]),
});

const ordersSchema = z.array(orderSchema);
export type Order = z.infer<typeof orderSchema>;

const orderEventSchema = z.object({
  id: orderSchema.shape.id,
  category: z.enum(['order', 'payment', 'reservation', 'picking', 'packing']),
  occurred_at: z.iso.datetime({ offset: true }),
  title: z.string().min(1),
  description: z.string().nullish(),
});

export type OrderEvent = z.infer<typeof orderEventSchema>;

const orderDetailSchema = orderSchema.extend({
  events: z.array(orderEventSchema).nullish(),
  payment: paymentSchema.nullish(),
  can_create_test_payment: z.boolean().optional(),
  external_id: z.union([z.string().min(1), z.number()]).nullish(),
  reservation_status: z.string().min(1).nullish(),
  reservation_error: z.string().nullish(),
  customer: z.object({
    name: z.string().min(1),
    email: z.string().nullish(),
    phone: z.string().nullish(),
  }),
  items: z.array(z.object({
    id: orderSchema.shape.id,
    name: z.string().min(1),
    sku: z.string().nullish(),
    quantity: z.number().int().positive(),
    reserved_quantity: z.number().int().nonnegative().nullish(),
    unit_price: z.number(),
    total: z.number(),
  })),
  subtotal: z.number().nullish(),
  shipping: z.number().nullish(),
  discount: z.number().nullish(),
  tax: z.number().nullish(),
});

export type OrderDetail = z.infer<typeof orderDetailSchema>;

export async function fetchOrders(signal?: AbortSignal): Promise<Order[]> {
  const response = await fetchApi<unknown>('/orders', { signal });
  return ordersSchema.parse(response);
}

export async function fetchOrderDetail(id: string, signal?: AbortSignal): Promise<OrderDetail> {
  const response = await fetchApi<unknown>(`/orders/${encodeURIComponent(id)}`, { signal });
  return orderDetailSchema.parse(response);
}
