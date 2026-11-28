import { Button, Result } from 'antd';
import { useNavigate } from 'react-router-dom';
import { useSignOut } from '../shared/auth/session';
export function UnauthorizedPage() {
  const navigate = useNavigate();
  const signOut = useSignOut();
  return <Result status="403" title="Доступ запрещён" subTitle="У вашей учётной записи нет доступа. Обратитесь к администратору или войдите под другой учётной записью."
    extra={<Button type="primary" onClick={() => { signOut(); navigate('/login', { replace: true }); }}>Перейти ко входу</Button>} />;
}
