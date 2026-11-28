import { useState, useSyncExternalStore } from 'react';
import { Alert, Button, Form, Input, Typography } from 'antd';
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom';
import { AuthCard } from '../shared/auth/AuthCard';
import { ApiError, fetchApi } from '../shared/api/client';
import { getToken, isTokenPair, setSession, subscribeToken } from '../shared/auth/token';
export function LoginPage() {
  const token = useSyncExternalStore(subscribeToken, getToken);
  const location = useLocation();
  const navigate = useNavigate();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');
  const from = location.state?.from;
  const registeredEmail = typeof location.state?.registeredEmail === 'string' ? location.state.registeredEmail : undefined;
  const destination = typeof from === 'string' && /^\/(?!\/)/.test(from) && !from.startsWith('/login') && !from.startsWith('/unauthorized') ? from : '/';
  if (token) return <Navigate to={destination} replace />;
  async function login(values: { email: string; password: string }) {
    setPending(true); setError('');
    try {
      const response = await fetchApi<unknown>('/auth/login', { method: 'POST', body: JSON.stringify(values) });
      if (!isTokenPair(response)) throw new Error('Invalid login response');
      setSession(response);
      navigate(destination, { replace: true });
    } catch (cause) {
      if (cause instanceof ApiError && cause.status === 403) navigate('/unauthorized', { replace: true });
      else setError(cause instanceof ApiError && cause.status === 401 ? 'Неверный email или пароль.' : 'Не удалось войти. Попробуйте ещё раз.');
    } finally { setPending(false); }
  }
  return (
    <AuthCard title="Вход в OrderFlow">
      {registeredEmail && !error && <Alert type="success" showIcon title="Аккаунт создан. Войдите с новым паролем." style={{ marginBottom: 16 }} />}
      {error && <Alert type="error" showIcon title={error} style={{ marginBottom: 16 }} />}
      <Form layout="vertical" onFinish={login} disabled={pending} requiredMark={false} initialValues={{ email: registeredEmail }}>
        <Form.Item name="email" label="Email" rules={[{ required: true, message: 'Введите email' }, { type: 'email', message: 'Введите корректный email' }]}>
          <Input autoComplete="username" type="email" />
        </Form.Item>
        <Form.Item name="password" label="Пароль" rules={[{ required: true, message: 'Введите пароль' }]}>
          <Input.Password autoComplete="current-password" />
        </Form.Item>
        <Button type="primary" htmlType="submit" loading={pending} block>Войти</Button>
      </Form>
      <Typography.Paragraph style={{ marginTop: 16, marginBottom: 0 }}>
        Нет аккаунта? <Link to="/register" state={{ from }}>Создать аккаунт</Link>
      </Typography.Paragraph>
    </AuthCard>
  );
}
