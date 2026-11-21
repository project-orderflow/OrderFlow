import { useState, useSyncExternalStore } from 'react';
import { Alert, Button, Card, Form, Input, Typography } from 'antd';
import { Navigate, useLocation, useNavigate } from 'react-router-dom';
import { ApiError, fetchApi } from '../shared/api/client';
import { getToken, setToken, subscribeToken } from '../shared/auth/token';
export function LoginPage() {
  const token = useSyncExternalStore(subscribeToken, getToken);
  const location = useLocation();
  const navigate = useNavigate();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');
  const from = location.state?.from;
  const destination = typeof from === 'string' && /^\/(?!\/)/.test(from) && !from.startsWith('/login') && !from.startsWith('/unauthorized') ? from : '/';
  if (token) return <Navigate to={destination} replace />;
  async function login(values: { email: string; password: string }) {
    setPending(true); setError('');
    try {
      const response = await fetchApi<{ access_token: string }>('/auth/login', { method: 'POST', body: JSON.stringify(values) });
      if (typeof response.access_token !== 'string' || !response.access_token.trim()) throw new Error('Missing token');
      setToken(response.access_token);
      navigate(destination, { replace: true });
    } catch (cause) {
      if (cause instanceof ApiError && cause.status === 403) navigate('/unauthorized', { replace: true });
      else setError(cause instanceof ApiError && cause.status === 401 ? 'Неверный email или пароль.' : 'Не удалось войти. Попробуйте ещё раз.');
    } finally { setPending(false); }
  }
  return <main style={{ minHeight: '100vh', display: 'grid', placeItems: 'center', padding: 24, background: '#f5f5f5' }}>
    <Card style={{ width: '100%', maxWidth: 400 }}>
      <Typography.Title level={2}>Вход в OrderFlow</Typography.Title>
      {error && <Alert type="error" showIcon title={error} style={{ marginBottom: 16 }} />}
      <Form layout="vertical" onFinish={login} disabled={pending} requiredMark={false}>
        <Form.Item name="email" label="Email" rules={[{ required: true, message: 'Введите email' }, { type: 'email', message: 'Введите корректный email' }]}>
          <Input autoComplete="username" type="email" />
        </Form.Item>
        <Form.Item name="password" label="Пароль" rules={[{ required: true, message: 'Введите пароль' }]}>
          <Input.Password autoComplete="current-password" />
        </Form.Item>
        <Button type="primary" htmlType="submit" loading={pending} block>Войти</Button>
      </Form>
    </Card>
  </main>;
}
