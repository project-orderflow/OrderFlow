import { Layout, Avatar, Button, Space, Typography } from 'antd';
import { useSession, useSignOut } from '../../../shared/auth/session';
import { UserOutlined, BellOutlined } from '@ant-design/icons';

const { Header } = Layout;

export const TopBar = () => {
  const { data: user } = useSession();
  const signOut = useSignOut();
  return (
    <Header style={{ background: '#fff', padding: '0 24px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid #f0f0f0' }}>
      <Typography.Title level={4} style={{ margin: 0 }}>Система управления заказами</Typography.Title>
      <Space size={16}>
        <BellOutlined style={{ fontSize: 18, cursor: 'pointer' }} />
        <Space style={{ cursor: 'pointer' }}>
          <Avatar icon={<UserOutlined />} />
          <Typography.Text strong>{user?.name || user?.email || 'Оператор'}</Typography.Text>
        </Space>
        <Button onClick={signOut}>Выйти</Button>
      </Space>
    </Header>
  );
};
