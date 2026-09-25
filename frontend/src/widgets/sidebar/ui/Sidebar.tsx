import { Layout, Menu } from 'antd';
import { 
  DashboardOutlined, 
  ShoppingOutlined, 
  AppstoreOutlined, 
  WarningOutlined, 
  SettingOutlined 
} from '@ant-design/icons';
import { useLocation, useNavigate } from 'react-router-dom';

const { Sider } = Layout;

export const Sidebar = () => {
  const navigate = useNavigate();
  const location = useLocation();

  const menuItems = [
    { key: '/', icon: <DashboardOutlined />, label: 'Дашборд' },
    { key: '/orders', icon: <ShoppingOutlined />, label: 'Заказы' },
    { key: '/inventory', icon: <AppstoreOutlined />, label: 'Склад' },
    { key: '/problems', icon: <WarningOutlined />, label: 'Проблемы' },
    { key: '/settings', icon: <SettingOutlined />, label: 'Настройки' },
  ];

  return (
    <Sider width={220} theme="light" style={{ borderRight: '1px solid #f0f0f0' }}>
      <div style={{ height: 64, display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 'bold', fontSize: 18, borderBottom: '1px solid #f0f0f0' }}>
        OrderFlow
      </div>
      <Menu
        mode="inline"
        selectedKeys={[location.pathname]}
        items={menuItems}
        onClick={({ key }) => navigate(key)}
        style={{ borderRight: 0 }}
      />
    </Sider>
  );
};