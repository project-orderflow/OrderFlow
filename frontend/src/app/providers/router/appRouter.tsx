import { createBrowserRouter, Navigate } from 'react-router-dom';
import { LoginPage } from '../../../pages/LoginPage';
import { RegisterPage } from '../../../pages/RegisterPage';
import { UnauthorizedPage } from '../../../pages/UnauthorizedPage';
import { RequireAuth } from './RequireAuth';
import { ProductsPage } from '../../../pages/ProductsPage';
import { ProductFormPage } from '../../../pages/ProductFormPage';
import { MainLayout } from '../../../widgets/layout/ui/MainLayout';
import { DashboardPage } from '../../../pages/DashboardPage';
import { OrdersPage } from '../../../pages/OrdersPage';
import { OrderDetailPage } from '../../../pages/OrderDetailPage';
import { InventoryPage } from '../../../pages/InventoryPage';
import { FulfillmentQueuePage } from '../../../pages/FulfillmentQueuePage';
import { ProblemsPage } from '../../../pages/ProblemsPage';
import { SettingsPage } from '../../../pages/SettingsPage';

export const appRouter = createBrowserRouter([
  { path: '/login', element: <LoginPage /> },
  { path: '/register', element: <RegisterPage /> },
  { path: '/unauthorized', element: <UnauthorizedPage /> },
  { element: <RequireAuth />, children: [
  {
    path: '/',
    element: <MainLayout />,
    children: [
      { path: '/products', element: <ProductsPage /> },
      { path: '/products/new', element: <ProductFormPage /> },
      { path: '/products/:id/edit', element: <ProductFormPage /> },
      { path: '/dashboard', element: <Navigate to="/" replace /> },
      { path: '/', element: <DashboardPage /> },
      { path: '/orders', element: <OrdersPage /> },
      { path: '/orders/:id', element: <OrderDetailPage /> },
      { path: '/inventory', element: <InventoryPage /> },
      { path: '/picking', element: <FulfillmentQueuePage key="picking" stage="picking" /> },
      { path: '/packing', element: <FulfillmentQueuePage key="packing" stage="packing" /> },
      { path: '/problems', element: <ProblemsPage /> },
      { path: '/settings', element: <SettingsPage /> },
    ],
  },
  ] },
]);
