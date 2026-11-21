import { Card, Empty, Space, Tag, Timeline, Typography } from 'antd';
import type { OrderEvent } from '../entities/order/api';

const categories = {
  order: { label: 'Заказ', color: 'blue' },
  payment: { label: 'Оплата', color: 'green' },
  reservation: { label: 'Резерв', color: 'gold' },
  picking: { label: 'Сборка', color: 'purple' },
  packing: { label: 'Упаковка', color: 'cyan' },
};

const dateFormat = new Intl.DateTimeFormat('ru-RU', {
  dateStyle: 'short',
  timeStyle: 'medium',
});

export function OrderTimelineCard({ events }: { events?: OrderEvent[] | null }) {
  const orderedEvents = [...(events ?? [])].sort(
    (a, b) => Date.parse(a.occurred_at) - Date.parse(b.occurred_at),
  );

  return (
    <Card title="История заказа">
      {orderedEvents.length === 0 ? <Empty description="Событий пока нет" /> : (
        <Timeline
          orientation="vertical"
          items={orderedEvents.map(event => {
            const category = categories[event.category];
            return {
              key: event.id,
              color: category.color,
              content: (
                <Space orientation="vertical" size={4}>
                  <Space wrap>
                    <Tag color={category.color}>{category.label}</Tag>
                    <Typography.Text type="secondary">
                      <time dateTime={event.occurred_at}>{dateFormat.format(new Date(event.occurred_at))}</time>
                    </Typography.Text>
                  </Space>
                  <Typography.Text strong>{event.title}</Typography.Text>
                  {event.description && <Typography.Text>{event.description}</Typography.Text>}
                </Space>
              ),
            };
          })}
        />
      )}
    </Card>
  );
}
