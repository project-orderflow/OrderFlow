import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { Alert, Button, Empty, Input, Select, Space, Table, Tag, Typography } from 'antd';
import type { TableColumnsType } from 'antd';
import { fetchOrders } from '../entities/order/api';
import type { Order } from '../entities/order/api';
import { ApiError } from '../shared/api/client';
import { useSession } from '../shared/auth/session';
import { UnauthorizedPage } from './UnauthorizedPage';

const ORDERS_REFRESH_INTERVAL_MS = 10_000;
const PAGE_SIZE = 10;

const amountFormat = new Intl.NumberFormat('ru-RU', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});
const dateFormat = new Intl.DateTimeFormat('ru-RU');
const calendarDateFormat = new Intl.DateTimeFormat('ru-RU', { timeZone: 'UTC' });

const columns: TableColumnsType<Order> = [
  { title: 'Номер', dataIndex: 'number', render: (number: Order['number'], order) => (
    <Space orientation="vertical" size={0}>
      <Link to={`/orders/${encodeURIComponent(order.id)}`}>{number}</Link>
      {order.external_number != null && String(order.external_number) !== String(number) && (
        <Typography.Text type="secondary">Внешний № {order.external_number}</Typography.Text>
      )}
    </Space>
  ) },
  { title: 'Источник', dataIndex: 'source' },
  { title: 'Клиент', dataIndex: 'customer' },
  { title: 'Сумма', dataIndex: 'total', align: 'right', render: (total: number) => amountFormat.format(total) },
  { title: 'Статус', dataIndex: 'status', render: (status: string) => <Tag>{status}</Tag> },
  { title: 'Дата', dataIndex: 'created_at', render: (date: string) => (
    (date.includes('T') ? dateFormat : calendarDateFormat).format(new Date(date))
  ) },
];

function filterOptions(orders: Order[], field: 'status' | 'source') {
  return [...new Set(orders.map(order => order[field]))]
    .sort((a, b) => a.localeCompare(b, 'ru'))
    .map(value => ({ label: value, value }));
}

export function OrdersPage() {
  const { sessionKey } = useSession();
  const [externalNumber, setExternalNumber] = useState('');
  const [status, setStatus] = useState<string>();
  const [source, setSource] = useState<string>();
  const [page, setPage] = useState(1);
  const query = useQuery({
    queryKey: ['orders', sessionKey],
    queryFn: ({ signal }) => fetchOrders(signal),
    refetchInterval: ({ state }) =>
      state.error instanceof ApiError && state.error.status === 403
        ? false
        : ORDERS_REFRESH_INTERVAL_MS,
    refetchOnWindowFocus: ({ state }) =>
      !(state.error instanceof ApiError && state.error.status === 403),
    retry: false,
  });

  if (query.error instanceof ApiError && query.error.status === 403) return <UnauthorizedPage />;

  const orders = query.data ?? [];
  const search = externalNumber.trim().toLowerCase();
  const filteredOrders = orders.filter(order =>
    (!search || String(order.external_number ?? '').toLowerCase().includes(search)) &&
    (!status || order.status === status) &&
    (!source || order.source === source),
  );
  const hasFilters = Boolean(search || status || source);
  const currentPage = Math.min(page, Math.max(1, Math.ceil(filteredOrders.length / PAGE_SIZE)));
  const hasLoadedOrders = query.data !== undefined;
  const retryButton = (
    <Button loading={query.isFetching} onClick={() => void query.refetch()}>Повторить</Button>
  );

  function resetFilters() {
    setExternalNumber('');
    setStatus(undefined);
    setSource(undefined);
    setPage(1);
  }

  return (
    <Space orientation="vertical" size="large" style={{ width: '100%' }}>
      <Typography.Title level={2} style={{ margin: 0 }}>Заказы</Typography.Title>
      <Space wrap>
        <Input
          allowClear
          aria-label="Поиск по внешнему номеру"
          placeholder="Внешний номер"
          value={externalNumber}
          onChange={event => { setExternalNumber(event.target.value); setPage(1); }}
        />
        <Select
          allowClear
          aria-label="Статус заказа"
          placeholder="Все статусы"
          style={{ minWidth: 150 }}
          value={status}
          options={filterOptions(orders, 'status')}
          onChange={value => { setStatus(value); setPage(1); }}
        />
        <Select
          allowClear
          aria-label="Источник заказа"
          placeholder="Все источники"
          style={{ minWidth: 150 }}
          value={source}
          options={filterOptions(orders, 'source')}
          onChange={value => { setSource(value); setPage(1); }}
        />
        {hasFilters && <Button onClick={resetFilters}>Сбросить фильтры</Button>}
      </Space>
      {query.isError && (
        <Alert
          type={hasLoadedOrders ? 'warning' : 'error'}
          showIcon
          title={hasLoadedOrders
            ? 'Не удалось обновить заказы. Показан последний загруженный список.'
            : 'Не удалось загрузить заказы'}
          action={retryButton}
        />
      )}
      {(!query.isError || hasLoadedOrders) && (
        <Table<Order>
          rowKey="id"
          columns={columns}
          dataSource={filteredOrders}
          loading={query.isPending && query.isFetching}
          scroll={{ x: 760 }}
          pagination={{ current: currentPage, pageSize: PAGE_SIZE, onChange: setPage, showSizeChanger: false }}
          locale={{
            emptyText: !hasLoadedOrders ? null : (
              <Empty description={orders.length === 0 ? 'Заказов пока нет' : 'Заказы по заданным условиям не найдены'}>
                {orders.length > 0 && hasFilters && <Button onClick={resetFilters}>Сбросить фильтры</Button>}
              </Empty>
            ),
          }}
        />
      )}
    </Space>
  );
}
