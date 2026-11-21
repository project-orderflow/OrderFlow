import { Button, Result } from 'antd';
import { useNavigate } from 'react-router-dom';
import { setToken } from '../shared/auth/token';
export function UnauthorizedPage() {
  const navigate = useNavigate();
  return <Result status="403" title="Доступ запрещён" subTitle="У вашей учётной записи нет доступа. Обратитесь к администратору или войдите под другой учётной записью."
    extra={<Button type="primary" onClick={() => { setToken(null); navigate('/login', { replace: true }); }}>Перейти ко входу</Button>} />;
}
