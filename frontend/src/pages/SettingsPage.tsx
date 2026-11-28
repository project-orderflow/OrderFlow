import { useState } from 'react';
import { Alert, Button, Card, Descriptions, Flex, Form, Input, Typography } from 'antd';
import { useQueryClient } from '@tanstack/react-query';
import { ApiError, fetchApi } from '../shared/api/client';
import { getDisplayName, useSession } from '../shared/auth/session';
import type { User } from '../shared/auth/session';
import { getSessionKey } from '../shared/auth/token';

const roleLabels: Record<string, string> = {
  ADMIN: 'Администратор',
  OPERATOR: 'Оператор',
  WAREHOUSE: 'Склад',
};

function ProfileForm({ user, sessionKey }: { user: User; sessionKey: string }) {
  const queryClient = useQueryClient();
  const [form] = Form.useForm<{ name: string }>();
  const [pending, setPending] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState('');

  async function saveName({ name }: { name: string }) {
    if (getSessionKey() !== sessionKey) return;
    setPending(true);
    setSaved(false);
    setError('');
    try {
      const updated = await fetchApi<User>('/auth/me', {
        method: 'PATCH',
        body: JSON.stringify({ name: name.trim() }),
      });
      if (getSessionKey() !== sessionKey) return;
      queryClient.setQueryData(['session', sessionKey], updated);
      form.setFieldValue('name', getDisplayName(updated));
      setSaved(true);
    } catch {
      setError('Не удалось сохранить имя. Попробуйте ещё раз.');
    } finally {
      setPending(false);
    }
  }

  return (
    <Card title="Профиль">
      <Flex vertical gap={16}>
        <Descriptions column={1} items={[
          { key: 'email', label: 'Email', children: user.email || '—' },
          { key: 'role', label: 'Роль', children: user.role ? roleLabels[user.role] ?? user.role : '—' },
        ]} />
        {error && <Alert type="error" showIcon title={error} />}
        {saved && <Alert type="success" showIcon title="Имя сохранено." />}
        <Form form={form} layout="vertical" initialValues={{ name: getDisplayName(user) }} onFinish={saveName} disabled={pending}>
          <Form.Item name="name" label="Имя пользователя" rules={[
            { required: true, whitespace: true, message: 'Введите имя' },
            { max: 120, message: 'Имя должно быть не длиннее 120 символов' },
          ]}>
            <Input autoComplete="name" />
          </Form.Item>
          <Button type="primary" htmlType="submit" loading={pending}>Сохранить имя</Button>
        </Form>
      </Flex>
    </Card>
  );
}

interface PasswordValues {
  currentPassword: string;
  newPassword: string;
  confirmPassword: string;
}

function PasswordForm({ sessionKey }: { sessionKey: string }) {
  const [form] = Form.useForm<PasswordValues>();
  const [pending, setPending] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState('');

  async function savePassword({ currentPassword, newPassword }: PasswordValues) {
    if (getSessionKey() !== sessionKey) return;
    setPending(true);
    setSaved(false);
    setError('');
    try {
      await fetchApi<void>('/auth/me/password', {
        method: 'PATCH',
        body: JSON.stringify({ current_password: currentPassword, new_password: newPassword }),
      });
      form.resetFields();
      setSaved(true);
    } catch (cause) {
      setError(cause instanceof ApiError && cause.status === 400
        ? 'Текущий пароль указан неверно.'
        : 'Не удалось сменить пароль. Попробуйте ещё раз.');
    } finally {
      setPending(false);
    }
  }

  return (
    <Card title="Смена пароля">
      <Flex vertical gap={16}>
        {error && <Alert type="error" showIcon title={error} />}
        {saved && <Alert type="success" showIcon title="Пароль изменён." />}
        <Form form={form} layout="vertical" onFinish={savePassword} disabled={pending}>
          <Form.Item name="currentPassword" label="Текущий пароль" rules={[
            { required: true, message: 'Введите текущий пароль' },
            { max: 128, message: 'Пароль должен быть не длиннее 128 символов' },
          ]}>
            <Input.Password autoComplete="current-password" />
          </Form.Item>
          <Form.Item name="newPassword" label="Новый пароль" extra="От 12 до 128 символов" rules={[
            { required: true, message: 'Введите новый пароль' },
            { min: 12, max: 128, message: 'Введите от 12 до 128 символов' },
          ]}>
            <Input.Password autoComplete="new-password" />
          </Form.Item>
          <Form.Item name="confirmPassword" label="Повторите новый пароль" dependencies={['newPassword']} rules={[
            { required: true, message: 'Повторите новый пароль' },
            ({ getFieldValue }) => ({
              validator: (_, value: string | undefined) => !value || value === getFieldValue('newPassword')
                ? Promise.resolve()
                : Promise.reject(new Error('Пароли не совпадают')),
            }),
          ]}>
            <Input.Password autoComplete="new-password" />
          </Form.Item>
          <Button type="primary" htmlType="submit" loading={pending}>Сменить пароль</Button>
        </Form>
      </Flex>
    </Card>
  );
}

export function SettingsPage() {
  const { data: user, sessionKey } = useSession();

  return (
    <Flex vertical gap={16} style={{ maxWidth: 600 }}>
      <Typography.Title level={2} style={{ margin: 0 }}>Настройки</Typography.Title>
      {user && sessionKey && <ProfileForm key={sessionKey} user={user} sessionKey={sessionKey} />}
      {sessionKey && <PasswordForm key={`password:${sessionKey}`} sessionKey={sessionKey} />}
    </Flex>
  );
}
