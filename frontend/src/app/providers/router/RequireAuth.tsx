import { Alert, Button, Spin } from 'antd';
import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { useSession, useSignOut } from '../../../shared/auth/session';
import { ApiError } from '../../../shared/api/client';
export function RequireAuth() {
  const session = useSession();
  const signOut = useSignOut();
  const location = useLocation();
  if (!session.sessionKey) return <Navigate to="/login" state={{ from: location.pathname + location.search + location.hash }} replace />;
  if (session.isPending) return <Spin fullscreen tip="Восстановление сессии…" />;
  if (session.error instanceof ApiError && session.error.status === 403) return <Navigate to="/unauthorized" replace />;
  if (session.isError) return <div style={{ padding: 24 }}>
    <Alert type="error" title="Не удалось восстановить сессию. Проверьте соединение и повторите попытку." />
    <Button onClick={() => void session.refetch()} loading={session.isFetching}>Повторить</Button>
    <Button onClick={signOut}>Выйти</Button>
  </div>;
  return <Outlet />;
}
