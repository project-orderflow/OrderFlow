import { useState } from 'react';
import { Alert, Button, Form, Input, InputNumber, Modal, Result, Select, Space, Spin, Typography } from 'antd';
import { Controller, useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { productsApi } from '../entities/product/api';
import { canManageProducts, localCatalogSource, localProductFormSchema, productSchema, useLocalCatalog } from '../entities/product/model';
import type { ProductInput } from '../entities/product/model';
import { useSession } from '../shared/auth/session';
import { ApiError } from '../shared/api/client';
import { UnauthorizedPage } from './UnauthorizedPage';

const productTextFields = useLocalCatalog ? ['sku', 'name'] as const : ['sku', 'name', 'source'] as const;

function getDeleteError(error: Error) {
  if (error instanceof ApiError) {
    if (error.status === 403) return 'У вас нет права удалять товары.';
    if (error.status === 409) return 'У товара есть связанные записи. Его можно деактивировать.';
    if (error.status === 405 || error.status === 501) return 'Подключённый API не поддерживает удаление товаров.';
  }
  return 'Не удалось удалить товар. Повторите попытку.';
}

function ProductForm({ initial, id, canDelete }: { initial?: ProductInput; id?: string; canDelete: boolean }) {
  const navigate = useNavigate();
  const client = useQueryClient();
  const [denied, setDenied] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const { control, handleSubmit, formState: { errors } } = useForm<ProductInput>({
    resolver: zodResolver(useLocalCatalog ? localProductFormSchema : productSchema),
    defaultValues: initial ?? { sku: '', name: '', price: 0, status: 'active', source: useLocalCatalog ? localCatalogSource : '' },
  });
  const mutation = useMutation({
    mutationFn: (data: ProductInput) => id ? productsApi.update(id, data) : productsApi.create(data),
    onSuccess: async () => {
      await client.invalidateQueries({ queryKey: ['products'] });
      await client.invalidateQueries({ queryKey: ['product', id] });
      navigate('/products');
    },
    onError: error => { if (error instanceof ApiError && error.status === 403) setDenied(true); },
  });
  const deletion = useMutation({
    mutationFn: async (productId: string) => {
      try {
        await productsApi.remove(productId);
      } catch (error) {
        if (!(error instanceof ApiError && error.status === 404)) throw error;
      }
    },
    onSuccess: async (_, productId) => {
      await client.invalidateQueries({ queryKey: ['products'] });
      navigate('/products', { replace: true });
      client.removeQueries({ queryKey: ['product', productId] });
    },
  });
  if (denied) return <UnauthorizedPage />;
  return <Space orientation="vertical" style={{ width: '100%', maxWidth: 640 }}>
    <Typography.Title level={2}>{id ? 'Редактирование товара' : 'Создание товара'}</Typography.Title>
    {mutation.isError && <Alert type="error" showIcon title={mutation.error instanceof ApiError && mutation.error.status === 409 ? 'Товар с таким SKU уже существует.' : 'Не удалось сохранить товар. Проверьте данные и повторите попытку.'} />}
    <Form layout="vertical" disabled={mutation.isPending || deleteOpen} onFinish={handleSubmit(data => mutation.mutate(data))}>
      {productTextFields.map(name => <Form.Item key={name} label={{ sku: 'SKU', name: 'Название', source: 'Источник' }[name]} validateStatus={errors[name] ? 'error' : undefined} help={errors[name]?.message}>
        <Controller name={name} control={control} render={({ field }) => <Input {...field} aria-label={{ sku: 'SKU', name: 'Название', source: 'Источник' }[name]} aria-invalid={Boolean(errors[name])} />} />
      </Form.Item>)}
      <Form.Item label="Цена" validateStatus={errors.price ? 'error' : undefined} help={errors.price?.message}>
        <Controller name="price" control={control} render={({ field }) => <InputNumber {...field} aria-label="Цена" style={{ width: '100%' }} />} />
      </Form.Item>
      <Form.Item label="Статус" validateStatus={errors.status ? 'error' : undefined} help={errors.status?.message}>
        <Controller name="status" control={control} render={({ field }) => <Select {...field} aria-label="Статус" options={[{ value: 'active', label: 'Активен' }, { value: 'inactive', label: 'Неактивен' }]} />} />
      </Form.Item>
      <Space>
        <Button type="primary" htmlType="submit" loading={mutation.isPending}>Сохранить</Button>
        <Button disabled={mutation.isPending} onClick={() => navigate('/products')}>Отмена</Button>
        {id && canDelete && <Button danger onClick={() => {
          deletion.reset();
          setDeleteOpen(true);
        }}>Удалить</Button>}
      </Space>
    </Form>
    {id && canDelete && <Modal
      title="Удалить товар?"
      open={deleteOpen}
      okText="Удалить"
      cancelText="Отмена"
      okButtonProps={{ danger: true, disabled: deletion.isPending }}
      cancelButtonProps={{ disabled: deletion.isPending }}
      confirmLoading={deletion.isPending}
      closable={!deletion.isPending}
      keyboard={!deletion.isPending}
      mask={{ closable: !deletion.isPending }}
      onOk={() => deletion.mutate(id)}
      onCancel={() => setDeleteOpen(false)}
    >
      <Typography.Paragraph>Товар «{initial?.name}» будет удалён без возможности восстановления.</Typography.Paragraph>
      {deletion.error && <Alert type="error" showIcon title={getDeleteError(deletion.error)} />}
    </Modal>}
  </Space>;
}
export function ProductFormPage() {
  const { id } = useParams();
  const { data: user, sessionKey } = useSession();
  const allowed = canManageProducts(user, id ? 'update' : 'create');
  const query = useQuery({
    queryKey: ['product', id, sessionKey],
    queryFn: ({ signal }) => productsApi.get(id!, signal),
    enabled: Boolean(id) && allowed, retry: false,
  });
  if (!allowed || (query.error instanceof ApiError && query.error.status === 403)) return <UnauthorizedPage />;
  if (id && query.isPending) return <Spin tip="Загрузка товара"><div style={{ minHeight: 200 }} /></Spin>;
  if (id && query.error instanceof ApiError && query.error.status === 404) return <Result status="404" title="Товар не найден" extra={<Link to="/products">К товарам</Link>} />;
  if (id && query.isError) return <Alert type="error" title="Не удалось загрузить товар" action={<Button loading={query.isFetching} onClick={() => void query.refetch()}>Повторить</Button>} />;
  return <ProductForm key={id ?? 'new'} id={id} initial={query.data} canDelete={canManageProducts(user, 'delete')} />;
}
