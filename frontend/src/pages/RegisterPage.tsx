import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { Alert, Button, Form, Input, Typography } from 'antd';
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom';
import { AuthCard } from '../shared/auth/AuthCard';
import { ApiError } from '../shared/api/client';
import { registerAccount } from '../shared/auth/registration';
import { getToken, subscribeToken } from '../shared/auth/token';

interface RegistrationForm {
  name: string;
  email: string;
  password: string;
  confirmPassword: string;
}

const MIN_PASSWORD_LENGTH = 12;
const MAX_PASSWORD_LENGTH = 128;

function registrationErrorMessage(error: unknown) {
  if (error instanceof ApiError) {
    switch (error.status) {
      case 400:
      case 422:
        return 'Сервер отклонил данные регистрации. Проверьте поля и попробуйте снова.';
      case 401:
      case 403:
        return 'Самостоятельная регистрация отключена в этом окружении.';
      case 404:
      case 405:
      case 501:
        return 'Регистрация пока недоступна на этом сервере. Если аккаунт уже есть, перейдите ко входу.';
      case 409:
        return 'Аккаунт с таким email уже существует. Попробуйте войти.';
      case 429:
        return 'Слишком много попыток регистрации. Попробуйте чуть позже.';
    }
  }
  return 'Не удалось подтвердить регистрацию. Если аккаунт уже создан, попробуйте войти.';
}

export function RegisterPage() {
  const token = useSyncExternalStore(subscribeToken, getToken);
  const location = useLocation();
  const navigate = useNavigate();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string>();
  const submission = useRef<AbortController | null>(null);
  const from = location.state?.from;

  useEffect(() => () => submission.current?.abort(), []);

  if (token) return <Navigate to="/" replace />;

  async function submit(values: RegistrationForm) {
    if (submission.current) return;

    const controller = new AbortController();
    submission.current = controller;
    setPending(true);
    setError(undefined);
    try {
      const account = await registerAccount(values, controller.signal);
      if (!controller.signal.aborted) {
        navigate('/login', { replace: true, state: { from, registeredEmail: account.email } });
      }
    } catch (cause) {
      if (!controller.signal.aborted) setError(registrationErrorMessage(cause));
    } finally {
      submission.current = null;
      if (!controller.signal.aborted) setPending(false);
    }
  }

  return (
    <AuthCard title="Создание аккаунта OrderFlow">
      {error && <Alert type="error" showIcon title={error} style={{ marginBottom: 16 }} />}
      <Form<RegistrationForm> layout="vertical" onFinish={submit} disabled={pending} requiredMark={false}>
        <Form.Item name="name" label="Имя" rules={[
          { required: true, whitespace: true, message: 'Введите имя' },
          { max: 120, message: 'Имя должно быть не длиннее 120 символов' },
        ]}>
          <Input autoComplete="name" />
        </Form.Item>
        <Form.Item name="email" label="Email" rules={[
          { required: true, whitespace: true, message: 'Введите email' },
          { type: 'email', transform: (value: string | undefined) => value?.trim(), message: 'Введите корректный email' },
          { max: 255, message: 'Email должен быть не длиннее 255 символов' },
        ]}>
          <Input autoComplete="username" inputMode="email" />
        </Form.Item>
        <Form.Item
          name="password"
          label="Пароль"
          extra={`От ${MIN_PASSWORD_LENGTH} до ${MAX_PASSWORD_LENGTH} символов`}
          rules={[
            { required: true, message: 'Введите пароль' },
            { min: MIN_PASSWORD_LENGTH, max: MAX_PASSWORD_LENGTH, message: `Введите от ${MIN_PASSWORD_LENGTH} до ${MAX_PASSWORD_LENGTH} символов` },
          ]}
        >
          <Input.Password autoComplete="new-password" />
        </Form.Item>
        <Form.Item name="confirmPassword" label="Повторите пароль" dependencies={['password']} rules={[
          { required: true, message: 'Повторите пароль' },
          ({ getFieldValue }) => ({
            validator: (_, value: string | undefined) =>
              !value || getFieldValue('password') === value
                ? Promise.resolve()
                : Promise.reject(new Error('Пароли не совпадают')),
          }),
        ]}>
          <Input.Password autoComplete="new-password" />
        </Form.Item>
        <Button type="primary" htmlType="submit" loading={pending} block>Зарегистрироваться</Button>
      </Form>
      <Typography.Paragraph style={{ marginTop: 16, marginBottom: 0 }}>
        Уже есть аккаунт? <Link to="/login" state={{ from }}>Войти</Link>
      </Typography.Paragraph>
    </AuthCard>
  );
}
