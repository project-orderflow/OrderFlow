import { Layout } from 'antd';
import { Outlet } from 'react-router-dom';
import { Sidebar } from '../../sidebar/ui/Sidebar';
import { TopBar } from '../../topbar/ui/TopBar';

const { Content } = Layout;

export const MainLayout = () => {
  return (
    <Layout style={{ minHeight: '100vh' }}>
      <Sidebar />
      <Layout>
        <TopBar />
        <Content style={{ margin: '24px', minHeight: 280 }}>
          <Outlet />
        </Content>
      </Layout>
    </Layout>
  );
};