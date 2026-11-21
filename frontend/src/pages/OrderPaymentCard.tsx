import { Alert, Button, Card, Descriptions, Space, Tag, Typography } from 'antd';
import type { OrderPayment } from '../entities/order/payment';

const paymentStatuses = {
  pending: { label: 'Ожидает оплаты', color: 'processing' },
  succeeded: { label: 'Оплачен', color: 'success' },
  canceled: { label: 'Отменён', color: 'default' },
  failed: { label: 'Не прошёл', color: 'error' },
} satisfies Record<OrderPayment['status'], { label: string; color: string }>;

function getConfirmationUrl(value: string | null | undefined) {
  if (!value) return undefined;
  try {
    const url = new URL(value);
    if (url.username || url.password) return undefined;
    if (url.protocol === 'https:') return url.href;
    if (url.protocol === 'http:' && ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)) {
      return url.href;
    }
  } catch {
    return undefined;
  }
}

interface Props {
  payment?: OrderPayment | null;
  canCreate: boolean;
  busy: boolean;
  refreshing: boolean;
  error?: string;
  onCreate: () => void;
}

export function OrderPaymentCard({ payment, canCreate, busy, refreshing, error, onCreate }: Props) {
  const status = payment && paymentStatuses[payment.status];
  const confirmationUrl = payment?.status === 'pending' ? getConfirmationUrl(payment.confirmation_url) : undefined;
  const amount = payment?.amount.toLocaleString('ru-RU', payment.currency
    ? { style: 'currency', currency: payment.currency }
    : { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  return (
    <Card title="Оплата">
      <Space orientation="vertical" style={{ width: '100%' }}>
        {error && <Alert type="error" showIcon title={error} />}
        {payment && status ? (
          <Descriptions column={{ xs: 1, sm: 2 }} items={[
            { key: 'amount', label: 'Сумма', children: amount },
            { key: 'provider', label: 'Провайдер', children: payment.provider },
            { key: 'status', label: 'Статус', children: <Tag color={status.color}>{status.label}</Tag> },
            { key: 'external-id', label: 'Внешний ID', children: payment.external_id ?? '—' },
          ]} />
        ) : <Typography.Text type="secondary">Платёж ещё не создан</Typography.Text>}
        {canCreate && (
          <Button type="primary" onClick={onCreate} loading={busy} disabled={refreshing}>
            Создать тестовый платёж
          </Button>
        )}
        {confirmationUrl && (
          <Button type="primary" href={confirmationUrl} disabled={refreshing}>
            Перейти к тестовой оплате
          </Button>
        )}
        {payment?.status === 'pending' && !confirmationUrl && (
          <Typography.Text type="secondary">Ссылка на оплату пока недоступна.</Typography.Text>
        )}
      </Space>
    </Card>
  );
}
