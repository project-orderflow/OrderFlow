import { Layout, Avatar, Space, Typography } from 'antd';
import { UserOutlined, BellOutlined } from '@ant-design/icons';

const { Header } = Layout;

export const TopBar = () => {
  return (
    <Header style={{ background: '#fff', padding: '0 24px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid #f0f0f0' }}>
      <Typography.Title level={4} style={{ margin: 0 }}>Система управления заказами</Typography.Title>
      <Space size={16}>
        <BellOutlined style={{ fontSize: 18, cursor: 'pointer' }} />
        <Space style={{ cursor: 'pointer' }}>
          <Avatar icon={<UserOutlined />} />
          <Typography.Text strong>Оператор</Typography.Text>
        </Space>
      </Space>
    </Header>
  );
};