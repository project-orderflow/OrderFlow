import { Layout, Menu } from 'antd';
import { 
  DashboardOutlined, 
  ShoppingOutlined, 
  AppstoreOutlined, 
  CarryOutOutlined,
  InboxOutlined,
  WarningOutlined, 
  SettingOutlined 
} from '@ant-design/icons';
import { useLocation, useMatch, useNavigate } from 'react-router-dom';

const { Sider } = Layout;

export const Sidebar = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const ordersMatch = useMatch('/orders/*');
  const productsMatch = useMatch('/products/*');
  const selectedKey = ordersMatch ? '/orders' : productsMatch ? '/products' : location.pathname;

  const menuItems = [
    { key: '/products', icon: <ShoppingOutlined />, label: 'Товары' },
    { key: '/', icon: <DashboardOutlined />, label: 'Дашборд' },
    { key: '/orders', icon: <ShoppingOutlined />, label: 'Заказы' },
    { key: '/inventory', icon: <AppstoreOutlined />, label: 'Склад' },
    { key: '/picking', icon: <CarryOutOutlined />, label: 'Сборка' },
    { key: '/packing', icon: <InboxOutlined />, label: 'Упаковка' },
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
        selectedKeys={[selectedKey]}
        items={menuItems}
        onClick={({ key }) => navigate(key)}
        style={{ borderRight: 0 }}
      />
    </Sider>
  );
};
