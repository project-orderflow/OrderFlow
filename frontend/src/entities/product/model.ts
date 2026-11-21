import { z } from 'zod';
export const productSchema = z.object({
  sku: z.string().trim().min(1, 'Введите SKU').max(100, 'Максимум 100 символов'),
  name: z.string().trim().min(1, 'Введите название').max(255, 'Максимум 255 символов'),
  price: z.number({ error: 'Введите цену' }).finite().min(0, 'Цена не может быть отрицательной'),
  status: z.enum(['active', 'inactive']),
  source: z.string().trim().min(1, 'Введите источник').max(100, 'Максимум 100 символов'),
});
export type ProductInput = z.infer<typeof productSchema>;
export const productResponseSchema = productSchema.extend({ id: z.union([z.string().min(1), z.number()]) });
export type Product = z.infer<typeof productResponseSchema>;
export const useLocalCatalog = import.meta.env?.DEV === true && import.meta.env.MODE === 'local-api';
export const localCatalogSource = 'Локальный каталог';
export const localProductFormSchema = productSchema.extend({
  price: productSchema.shape.price
    .positive('Цена должна быть больше нуля')
    .max(9999999999.99, 'Цена превышает допустимый максимум')
    .multipleOf(0.01, 'Укажите не более двух знаков после запятой'),
});
export interface ProductUser { role?: string; roles?: string[]; permissions?: string[] }
export function canManageProducts(user: ProductUser | undefined, action: 'create' | 'update' | 'delete') {
  if (!user) return false;
  // An explicit permission list takes precedence over role defaults.
  if (user.permissions) return user.permissions.includes(`products:${action}`);
  const roles = user.roles ?? (user.role ? [user.role] : []);
  if (useLocalCatalog) return roles.includes('ADMIN');
  return roles.includes('admin') || (action !== 'delete' && roles.includes('manager'));
}
