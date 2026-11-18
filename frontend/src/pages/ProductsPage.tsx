import { Alert, Button, Empty, Space, Table, Tag, Typography } from 'antd';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { productsApi } from '../entities/product/api';
import { canManageProducts } from '../entities/product/model';
import type { Product } from '../entities/product/model';
import { useSession } from '../shared/auth/session';
import { ApiError } from '../shared/api/client';
import { UnauthorizedPage } from './UnauthorizedPage';

export function ProductsPage() {
  const { data: user, sessionKey } = useSession();
  const query = useQuery({ queryKey: ['products', sessionKey], queryFn: ({ signal }) => productsApi.list(signal), retry: false });
  if (query.error instanceof ApiError && query.error.status === 403) return <UnauthorizedPage />;
  return <Space orientation="vertical" style={{ width: '100%' }} size="large">
    <Space wrap>
      <Typography.Title level={2} style={{ margin: 0 }}>Товары</Typography.Title>
      {canManageProducts(user, 'create') && <Link to="/products/new"><Button type="primary">Создать товар</Button></Link>}
    </Space>
    {query.isError ? <Alert type="error" showIcon title="Не удалось загрузить товары" action={<Button loading={query.isFetching} onClick={() => void query.refetch()}>Повторить</Button>} /> :
      <Table<Product> rowKey="id" dataSource={query.data} loading={query.isPending} scroll={{ x: 720 }}
        locale={{ emptyText: <Empty description="Товаров пока нет" /> }}
        columns={[
          { title: 'SKU', dataIndex: 'sku' },
          { title: 'Название', dataIndex: 'name' },
          { title: 'Цена', dataIndex: 'price', render: (price: number) => price.toLocaleString('ru-RU', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) },
          { title: 'Статус', dataIndex: 'status', render: (status: string) => <Tag color={status === 'active' ? 'green' : 'default'}>{status === 'active' ? 'Активен' : 'Неактивен'}</Tag> },
          { title: 'Источник', dataIndex: 'source' },
          ...(canManageProducts(user, 'update') ? [{ title: 'Действия', key: 'actions', render: (_: unknown, product: Product) => <Link to={`/products/${encodeURIComponent(product.id)}/edit`}>Редактировать</Link> }] : []),
        ]} />}
  </Space>;
}
