import { Layout, Avatar, Button, Space, Typography } from 'antd';
import { useQueryClient } from '@tanstack/react-query';
import { useSession } from '../../../shared/auth/session';
import { setToken } from '../../../shared/auth/token';
import { fetchApi } from '../../../shared/api/client';
import { useState } from 'react';
import { UserOutlined, BellOutlined } from '@ant-design/icons';

const { Header } = Layout;

export const TopBar = () => {
  const { data: user } = useSession();
  const queryClient = useQueryClient();
  const [loggingOut, setLoggingOut] = useState(false);
  async function logout() {
    setLoggingOut(true);
    setToken(null);
    queryClient.clear();
    try { await fetchApi('/auth/logout', { method: 'POST' }); }
    catch { /* Local logout still applies when the backend is unavailable. */ }
    finally { setLoggingOut(false); }
  }
  return (
    <Header style={{ background: '#fff', padding: '0 24px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid #f0f0f0' }}>
      <Typography.Title level={4} style={{ margin: 0 }}>Система управления заказами</Typography.Title>
      <Space size={16}>
        <BellOutlined style={{ fontSize: 18, cursor: 'pointer' }} />
        <Space style={{ cursor: 'pointer' }}>
          <Avatar icon={<UserOutlined />} />
          <Typography.Text strong>{user?.name || user?.email || 'Оператор'}</Typography.Text>
        </Space>
        <Button loading={loggingOut} onClick={() => void logout()}>Выйти</Button>
      </Space>
    </Header>
  );
};
