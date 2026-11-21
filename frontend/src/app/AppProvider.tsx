import { RouterProvider } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ConfigProvider } from 'antd';
import { appRouter } from './providers/router/appRouter';
const queryClient = new QueryClient({ defaultOptions: { queries: { refetchOnWindowFocus: false, retry: 1 } } });
export function AppProvider() {
  return <QueryClientProvider client={queryClient}><ConfigProvider><RouterProvider router={appRouter} /></ConfigProvider></QueryClientProvider>;
}
