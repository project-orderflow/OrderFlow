import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Alert, Button, Empty, Modal, Space, Table, Tag, Typography } from 'antd';
import type { TableColumnsType } from 'antd';
import { Link } from 'react-router-dom';
import { changeQueueEntry, fetchQueue } from '../entities/fulfillment/api';
import type { FulfillmentAction, FulfillmentStage, QueueEntry } from '../entities/fulfillment/api';
import { ApiError } from '../shared/api/client';
import { useSession } from '../shared/auth/session';
import { UnauthorizedPage } from './UnauthorizedPage';

const stages = {
  picking: { title: 'Очередь сборки', start: 'Начать сборку', complete: 'Завершить сборку' },
  packing: { title: 'Очередь упаковки', start: 'Начать упаковку', complete: 'Завершить упаковку' },
};

const priorities = {
  low: { text: 'Низкий', color: 'default' },
  normal: { text: 'Обычный', color: 'blue' },
  high: { text: 'Высокий', color: 'orange' },
  urgent: { text: 'Срочный', color: 'red' },
};

const statuses = {
  pending: { text: 'В очереди', color: 'default' },
  in_progress: { text: 'В работе', color: 'processing' },
  completed: { text: 'Завершено', color: 'success' },
};

interface Selection {
  entry: QueueEntry;
  action: FulfillmentAction;
}

export function FulfillmentQueuePage({ stage }: { stage: FulfillmentStage }) {
  const { sessionKey } = useSession();
  const client = useQueryClient();
  const [selection, setSelection] = useState<Selection>();
  const labels = stages[stage];
  const query = useQuery({
    queryKey: ['fulfillment', sessionKey, stage],
    queryFn: ({ signal }) => fetchQueue(stage, signal),
    retry: false,
    refetchOnWindowFocus: true,
  });
  const mutation = useMutation({
    mutationFn: ({ entry, action }: Selection) =>
      changeQueueEntry(stage, String(entry.order_id), action, entry.version),
    retry: false,
    onSettled: async (_, __, { entry }) => {
      await Promise.all([
        client.invalidateQueries({ queryKey: ['fulfillment', sessionKey] }),
        client.invalidateQueries({ queryKey: ['order', sessionKey, String(entry.order_id)] }),
        client.invalidateQueries({ queryKey: ['orders', sessionKey] }),
      ]);
    },
  });

  if (query.error instanceof ApiError && query.error.status === 403) return <UnauthorizedPage />;

  const actionStatus = mutation.error instanceof ApiError ? mutation.error.status : undefined;
  let actionError = 'Не удалось подтвердить действие. Проверьте актуальный статус заказа.';
  if (actionStatus === 409) {
    actionError = 'Состояние заказа изменилось, возможно, его уже обработал другой оператор. Проверьте актуальный статус перед новым действием.';
  } else if (actionStatus === 403) {
    actionError = 'У вас нет прав на это действие.';
  }
  const actionsDisabled = mutation.isPending || query.isFetching || query.isError;
  const columns: TableColumnsType<QueueEntry> = [
    {
      title: 'Номер заказа',
      dataIndex: 'order_number',
      render: (_, entry) => <Link to={`/orders/${encodeURIComponent(entry.order_id)}`}>{entry.order_number}</Link>,
    },
    { title: 'Позиций', dataIndex: 'item_count', align: 'right' },
    {
      title: 'Приоритет',
      dataIndex: 'priority',
      render: (priority: QueueEntry['priority']) => <Tag color={priorities[priority].color}>{priorities[priority].text}</Tag>,
    },
    {
      title: 'Статус',
      dataIndex: 'status',
      render: (status: QueueEntry['status']) => <Tag color={statuses[status].color}>{statuses[status].text}</Tag>,
    },
    {
      title: 'Действие',
      key: 'action',
      render: (_, entry) => {
        const action = entry.status === 'pending' ? 'start' : 'complete';
        if (entry.status === 'completed' || !entry.allowed_actions.includes(action)) return null;
        return (
          <Button disabled={actionsDisabled} onClick={() => setSelection({ entry, action })}>
            {labels[action]}
          </Button>
        );
      },
    },
  ];

  return (
    <Space orientation="vertical" size="large" style={{ width: '100%' }}>
      <Typography.Title level={2} style={{ margin: 0 }}>{labels.title}</Typography.Title>
      {mutation.isError && <Alert type={actionStatus === 409 ? 'warning' : 'error'} showIcon title={actionError} />}
      {mutation.isSuccess && <Alert type="success" showIcon title="Статус заказа обновлён" />}
      {query.isError && (
        <Alert
          type="error"
          showIcon
          title="Не удалось загрузить актуальную очередь"
          action={<Button loading={query.isFetching} onClick={() => void query.refetch()}>Повторить</Button>}
        />
      )}
      {(!query.isError || query.data) && (
        <Table<QueueEntry>
          rowKey="order_id"
          columns={columns}
          dataSource={query.data}
          loading={query.isPending}
          scroll={{ x: 650 }}
          pagination={{ pageSize: 10, showSizeChanger: false }}
          locale={{ emptyText: <Empty description="В очереди пока нет заказов" /> }}
        />
      )}
      {selection && (
        <Modal
          open
          title={labels[selection.action]}
          okText="Подтвердить"
          cancelText="Отмена"
          okButtonProps={{ disabled: actionsDisabled }}
          onCancel={() => setSelection(undefined)}
          onOk={() => {
            if (actionsDisabled) return;
            setSelection(undefined);
            mutation.mutate(selection);
          }}
        >
          Подтвердите действие для заказа № {selection.entry.order_number}.
        </Modal>
      )}
    </Space>
  );
}
