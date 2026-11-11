import { createBrowserRouter } from 'react-router-dom';
import { MainLayout } from '../../../widgets/layout/ui/MainLayout';
import { DashboardPage } from '../../../pages/DashboardPage';
import { OrdersPage } from '../../../pages/OrdersPage';
import { InventoryPage } from '../../../pages/InventoryPage';
import { ProblemsPage } from '../../../pages/ProblemsPage';
import { SettingsPage } from '../../../pages/SettingsPage';

export const appRouter = createBrowserRouter([
  {
    path: '/',
    element: <MainLayout />,
    children: [
      { path: '/', element: <DashboardPage /> },
      { path: '/orders', element: <OrdersPage /> },
      { path: '/inventory', element: <InventoryPage /> },
      { path: '/problems', element: <ProblemsPage /> },
      { path: '/settings', element: <SettingsPage /> },
    ],
  },
]);