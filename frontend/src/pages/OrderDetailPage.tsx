import { useEffect, useRef } from 'react';
import type { ReactNode } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Alert, Button, Card, Col, Descriptions, Empty, Result, Row, Space, Spin, Table, Tag, Typography } from 'antd';
import type { TableColumnsType } from 'antd';
import { Link, useParams } from 'react-router-dom';
import { fetchOrderDetail } from '../entities/order/api';
import type { OrderDetail } from '../entities/order/api';
import { createTestPayment } from '../entities/order/payment';
import { getStockErrorMessage } from '../entities/inventory/stockErrors';
import { ApiError } from '../shared/api/client';
import { useSession } from '../shared/auth/session';
import { UnauthorizedPage } from './UnauthorizedPage';
import { OrderPaymentCard } from './OrderPaymentCard';
import { OrderTimelineCard } from './OrderTimelineCard';

type OrderItem = OrderDetail['items'][number];

const amountFormat = new Intl.NumberFormat('ru-RU', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

const reservationLabels = new Map([
  ['pending', { text: 'Ожидает резерва', color: 'processing' }],
  ['reserved', { text: 'Зарезервирован', color: 'success' }],
  ['partial', { text: 'Частично зарезервирован', color: 'warning' }],
  ['not_reserved', { text: 'Не зарезервирован', color: 'default' }],
  ['released', { text: 'Резерв снят', color: 'default' }],
  ['failed', { text: 'Не удалось зарезервировать', color: 'error' }],
]);

const itemColumns: TableColumnsType<OrderItem> = [
  { title: 'Название', dataIndex: 'name' },
  { title: 'SKU', dataIndex: 'sku', render: (sku: OrderItem['sku']) => sku || '—' },
  { title: 'Количество', dataIndex: 'quantity', align: 'right' },
  {
    title: 'Зарезервировано',
    dataIndex: 'reserved_quantity',
    align: 'right',
    render: (quantity: OrderItem['reserved_quantity']) => quantity ?? '—',
  },
  { title: 'Цена за единицу', dataIndex: 'unit_price', align: 'right', render: (value: number) => amountFormat.format(value) },
  { title: 'Сумма', dataIndex: 'total', align: 'right', render: (value: number) => amountFormat.format(value) },
];

const PAYMENT_REFRESH_INTERVAL_MS = 5_000;

function getOrderKey(sessionKey: string | null, orderId?: string) {
  return ['order', sessionKey, orderId] as const;
}

function OrderSummary({ order, paymentCard }: { order: OrderDetail; paymentCard: ReactNode }) {
  const isWooCommerce = order.source.trim().toLowerCase() === 'woocommerce';
  const reservation = reservationLabels.get(order.reservation_status?.toLowerCase() ?? '');
  const reservationError = getStockErrorMessage(order.reservation_error);
  const amounts = [
    { label: 'Стоимость товаров', value: order.subtotal },
    { label: 'Доставка', value: order.shipping },
    { label: 'Скидка', value: order.discount },
    { label: 'Налог', value: order.tax },
  ];

  return (
    <Space orientation="vertical" size="large" style={{ width: '100%' }}>
      <Space wrap>
        <Typography.Title level={2} style={{ margin: 0 }}>Заказ № {order.number}</Typography.Title>
        <Tag>{order.status}</Tag>
      </Space>
      <Row gutter={[16, 16]}>
        <Col xs={24} md={12}>
          <Card title="Клиент">
            <Descriptions column={1} items={[
              { key: 'name', label: 'Имя', children: order.customer.name },
              { key: 'email', label: 'Email', children: order.customer.email || '—' },
              { key: 'phone', label: 'Телефон', children: order.customer.phone || '—' },
            ]} />
          </Card>
        </Col>
        <Col xs={24} md={12}>
          <Card title="Источник">
            <Descriptions column={1} items={[
              { key: 'source', label: 'Канал', children: isWooCommerce ? <Tag color="purple">WooCommerce</Tag> : order.source },
              { key: 'external-id', label: 'Внешний ID', children: order.external_id ?? '—' },
              ...(order.external_number != null
                ? [{ key: 'external-number', label: 'Внешний номер', children: order.external_number }]
                : []),
            ]} />
          </Card>
        </Col>
      </Row>
      <Card title="Позиции заказа">
        <Space orientation="vertical" style={{ width: '100%' }}>
          <Space wrap>
            <Typography.Text strong>Статус резерва</Typography.Text>
            <Tag color={reservation?.color}>
              {reservation?.text ?? (order.reservation_status ? 'Неизвестный статус' : 'Нет данных')}
            </Tag>
          </Space>
          {reservationError && (
            <Alert type="warning" showIcon title="Проблема с резервом" description={reservationError} />
          )}
          <Table<OrderItem>
            rowKey="id"
            columns={itemColumns}
            dataSource={order.items}
            pagination={false}
            scroll={{ x: 800 }}
            locale={{ emptyText: <Empty description="В заказе нет позиций" /> }}
          />
        </Space>
      </Card>
      {paymentCard}
      <Card title="Итоги">
        <Descriptions column={1} items={[
          ...amounts.flatMap(({ label, value }) => value == null ? [] : [
            { key: label, label, children: amountFormat.format(value) },
          ]),
          { key: 'total', label: 'Итого', children: <Typography.Text strong>{amountFormat.format(order.total)}</Typography.Text> },
        ]} />
      </Card>
      <OrderTimelineCard events={order.events} />
    </Space>
  );
}

export function OrderDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { sessionKey } = useSession();
  const queryClient = useQueryClient();
  const creatingPayment = useRef(false);
  const query = useQuery({
    queryKey: getOrderKey(sessionKey, id),
    queryFn: ({ signal }) => fetchOrderDetail(id!, signal),
    enabled: Boolean(id),
    retry: false,
    refetchOnMount: 'always',
    refetchOnWindowFocus: ({ state }) => !hasTerminalOrderError(state.error),
    refetchInterval: ({ state }) =>
      state.data?.payment?.status === 'pending' && !hasTerminalOrderError(state.error)
        ? PAYMENT_REFRESH_INTERVAL_MS
        : false,
  });
  const { refetch } = query;
  useEffect(() => {
    function refreshRestoredPage(event: PageTransitionEvent) {
      if (event.persisted) void refetch({ cancelRefetch: false });
    }

    window.addEventListener('pageshow', refreshRestoredPage);
    return () => window.removeEventListener('pageshow', refreshRestoredPage);
  }, [refetch]);

  const createPayment = useMutation({
    mutationFn: ({ orderId, returnUrl }: { orderId: string; returnUrl: string; sessionKey: string | null }) =>
      createTestPayment(orderId, returnUrl),
    retry: false,
    onSuccess: async (payment, variables) => {
      const queryKey = getOrderKey(variables.sessionKey, variables.orderId);
      await queryClient.cancelQueries({ queryKey, exact: true });
      queryClient.setQueryData<OrderDetail>(queryKey, order =>
        order?.payment?.status === 'succeeded' || !order
          ? order
          : { ...order, payment, can_create_test_payment: false },
      );
      if (payment.status !== 'pending') {
        await queryClient.invalidateQueries({ queryKey, exact: true });
      }
    },
    onError: (_, variables) => queryClient.invalidateQueries({
      queryKey: getOrderKey(variables.sessionKey, variables.orderId),
      exact: true,
    }),
  });
  const status = query.error instanceof ApiError ? query.error.status : undefined;
  const stockError = query.error instanceof ApiError ? getStockErrorMessage(query.error.code) : undefined;

  if (status === 403) return <UnauthorizedPage />;

  const backLink = <Link to="/orders">К списку заказов</Link>;
  if (!id || status === 404) return <Result status="404" title="Заказ не найден" extra={backLink} />;

  const order = query.data;
  const paymentStatus = order?.payment?.status;
  const canCreate = order?.can_create_test_payment === true
    && paymentStatus !== 'pending' && paymentStatus !== 'succeeded';
  const hasPaymentError = createPayment.isError
    && createPayment.variables?.orderId === id
    && createPayment.variables.sessionKey === sessionKey;
  const paymentErrorStatus = hasPaymentError && createPayment.error instanceof ApiError
    ? createPayment.error.status
    : undefined;
  let paymentError: string | undefined;
  if (hasPaymentError && paymentStatus !== 'succeeded') {
    if (paymentErrorStatus === 403) paymentError = 'У вас нет прав на создание тестового платежа.';
    else if (paymentErrorStatus === 409) paymentError = 'Создание платежа недоступно. Проверьте текущий статус оплаты.';
    else paymentError = 'Не удалось подтвердить создание платежа. Проверьте текущий статус оплаты.';
  }

  function submitPayment(orderId: string) {
    if (!canCreate || query.isFetching || query.isError || creatingPayment.current || paymentErrorStatus === 403) return;
    creatingPayment.current = true;
    const returnUrl = new URL(window.location.pathname, window.location.origin).href;
    void createPayment.mutateAsync({ orderId, returnUrl, sessionKey })
      .catch(() => undefined)
      .finally(() => { creatingPayment.current = false; });
  }

  return (
    <Space orientation="vertical" size="middle" style={{ width: '100%' }}>
      {backLink}
      {query.isError && (
        <Alert
          type={order ? 'warning' : 'error'}
          showIcon
          title={stockError ? 'Проблема с остатками' : order ? 'Не удалось обновить заказ' : 'Не удалось загрузить заказ'}
          description={stockError}
          action={<Button loading={query.isFetching} onClick={() => void query.refetch()}>Повторить</Button>}
        />
      )}
      {query.isPending && (
        <Spin tip="Загрузка заказа"><div style={{ minHeight: 160 }} /></Spin>
      )}
      {order && (
        <OrderSummary order={order} paymentCard={
          <OrderPaymentCard
            payment={order.payment}
            canCreate={canCreate && paymentErrorStatus !== 403}
            busy={createPayment.isPending}
            refreshing={query.isFetching || query.isError}
            error={paymentError}
            onCreate={() => submitPayment(id)}
          />
        } />
      )}
    </Space>
  );
}

function hasTerminalOrderError(error: unknown) {
  return error instanceof ApiError && (error.status === 403 || error.status === 404);
}
