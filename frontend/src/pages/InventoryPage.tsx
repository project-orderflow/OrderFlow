import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Alert, Button, Card, Empty, Form, Input, InputNumber, Space, Table, Tag, Typography } from 'antd';
import type { TableColumnsType } from 'antd';
import { fetchInventory, receiveStock } from '../entities/inventory/api';
import type { InventoryItem, StockReceipt } from '../entities/inventory/api';
import { getStockErrorMessage } from '../entities/inventory/stockErrors';
import { ApiError } from '../shared/api/client';
import { useSession } from '../shared/auth/session';
import { UnauthorizedPage } from './UnauthorizedPage';

const LOW_STOCK_THRESHOLD = 5;
const PAGE_SIZE = 10;

const columns: TableColumnsType<InventoryItem> = [
  { title: 'SKU', dataIndex: 'sku' },
  { title: 'Название', dataIndex: 'name' },
  { title: 'Фактический остаток', dataIndex: 'on_hand', align: 'right' },
  { title: 'Зарезервировано', dataIndex: 'reserved', align: 'right' },
  {
    title: 'Доступно',
    dataIndex: 'available',
    align: 'right',
    render: (available: number) => {
      if (available <= 0) return <Tag color="red">{available} · Нет в наличии</Tag>;
      if (available <= LOW_STOCK_THRESHOLD) return <Tag color="gold">{available} · Низкий остаток</Tag>;
      return available;
    },
  },
];

function ReceiptForm({ inventoryKey }: { inventoryKey: readonly ['inventory', string | null] }) {
  const [form] = Form.useForm<StockReceipt>();
  const client = useQueryClient();
  const receipt = useMutation({
    mutationFn: receiveStock,
    retry: false,
    onSuccess: async () => {
      form.resetFields();
      await client.invalidateQueries({ queryKey: inventoryKey });
    },
  });
  const error = receipt.error instanceof ApiError ? receipt.error : undefined;
  const errorMessage = error?.status === 403
    ? 'У вас нет прав на приёмку товара.'
    : error?.status === 404
      ? 'Товар с таким SKU не найден.'
      : getStockErrorMessage(error?.code) ?? 'Не удалось подтвердить приёмку. Проверьте остаток перед повторной отправкой.';

  return (
    <Card title="Ручная приёмка">
      {receipt.isSuccess && <Alert type="success" showIcon title="Товар принят на склад" />}
      {receipt.isError && <Alert type="error" showIcon title={errorMessage} />}
      <Form<StockReceipt>
        form={form}
        layout="vertical"
        disabled={receipt.isPending}
        onFinish={({ sku, quantity }) => {
          if (!receipt.isPending) receipt.mutate({ sku: sku.trim(), quantity });
        }}
        style={{ maxWidth: 400 }}
      >
        <Form.Item name="sku" label="SKU товара" rules={[{ required: true, whitespace: true, message: 'Введите SKU' }]}>
          <Input />
        </Form.Item>
        <Form.Item name="quantity" label="Количество" rules={[
          { required: true, message: 'Введите количество' },
          { type: 'integer', min: 1, max: Number.MAX_SAFE_INTEGER, message: 'Введите положительное целое количество' },
        ]}>
          <InputNumber min={1} style={{ width: '100%' }} />
        </Form.Item>
        <Button type="primary" htmlType="submit" loading={receipt.isPending}>Принять товар</Button>
      </Form>
    </Card>
  );
}

export function InventoryPage() {
  const { data: user, sessionKey } = useSession();
  const inventoryKey = ['inventory', sessionKey] as const;
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const query = useQuery({
    queryKey: inventoryKey,
    queryFn: ({ signal }) => fetchInventory(signal),
    retry: false,
  });

  if (query.error instanceof ApiError && query.error.status === 403) return <UnauthorizedPage />;

  const canReceive = user?.permissions
    ? user.permissions.includes('inventory:receive')
    : (user?.roles ?? [user?.role]).some(role => role === 'admin' || role === 'manager' || role === 'operator');
  const term = search.trim().toLowerCase();
  const items = query.data ?? [];
  const filtered = items.filter(item =>
    item.sku.toLowerCase().includes(term) || item.name.toLowerCase().includes(term),
  );
  const currentPage = Math.min(page, Math.max(1, Math.ceil(filtered.length / PAGE_SIZE)));

  return (
    <Space orientation="vertical" size="large" style={{ width: '100%' }}>
      <Typography.Title level={2} style={{ margin: 0 }}>Склад</Typography.Title>
      <Input
        allowClear
        aria-label="Поиск по SKU или названию"
        placeholder="SKU или название"
        value={search}
        onChange={event => { setSearch(event.target.value); setPage(1); }}
        style={{ maxWidth: 400 }}
      />
      {query.isError ? (
        <Alert type="error" showIcon title="Не удалось загрузить остатки"
          action={<Button loading={query.isFetching} onClick={() => void query.refetch()}>Повторить</Button>} />
      ) : (
        <Table<InventoryItem>
          rowKey="sku"
          columns={columns}
          dataSource={filtered}
          loading={query.isPending}
          scroll={{ x: 700 }}
          pagination={{ current: currentPage, pageSize: PAGE_SIZE, showSizeChanger: false, onChange: setPage }}
          locale={{
            emptyText: !query.isPending && (
              <Empty description={items.length ? 'Товары по этому запросу не найдены' : 'Складских остатков пока нет'} />
            ),
          }}
        />
      )}
      {canReceive && <ReceiptForm inventoryKey={inventoryKey} />}
    </Space>
  );
}
