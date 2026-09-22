import React from 'react';
import { BrowserRouter, Routes, Route, Link, Navigate } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ConfigProvider, Layout, Menu } from 'antd';

import { DashboardPage } from '@/pages/DashboardPage';
import { OrdersPage } from '@/pages/OrdersPage';
import { InventoryPage } from '@/pages/InventoryPage';
import { ProblemsPage } from '@/pages/ProblemsPage';
import { SettingsPage } from '@/pages/SettingsPage';

const { Header, Content, Sider } = Layout;

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: false,
      retry: 1,
    },
  },
});

export const AppProvider: React.FC = () => {
  const menuItems = [
    { key: '/dashboard', label: <Link to="/dashboard">Dashboard</Link> },
    { key: '/orders', label: <Link to="/orders">Orders</Link> },
    { key: '/inventory', label: <Link to="/inventory">Inventory</Link> },
    { key: '/problems', label: <Link to="/problems">Problems</Link> },
    { key: '/settings', label: <Link to="/settings">Settings</Link> },
  ];

  return (
    <QueryClientProvider client={queryClient}>
      <ConfigProvider>
        <BrowserRouter>
          <Layout style={{ minHeight: '100vh' }}>
            <Header style={{ color: '#fff', fontSize: '18px', fontWeight: 'bold' }}>
              OrderFlow Back-Office
            </Header>
            <Layout>
              <Sider width={200} theme="light">
                <Menu mode="inline" items={menuItems} defaultSelectedKeys={['/dashboard']} />
              </Sider>
              <Layout style={{ padding: '24px' }}>
                <Content style={{ background: '#fff', padding: 24, borderRadius: 8 }}>
                  <Routes>
                    <Route path="/" element={<Navigate to="/dashboard" replace />} />
                    <Route path="/dashboard" element={<DashboardPage />} />
                    <Route path="/orders" element={<OrdersPage />} />
                    <Route path="/inventory" element={<InventoryPage />} />
                    <Route path="/problems" element={<ProblemsPage />} />
                    <Route path="/settings" element={<SettingsPage />} />
                  </Routes>
                </Content>
              </Layout>
            </Layout>
          </Layout>
        </BrowserRouter>
      </ConfigProvider>
    </QueryClientProvider>
  );
};