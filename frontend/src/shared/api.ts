import { fetchApi } from './api/client';
export const apiClient = {
  get: <T>(endpoint: string) => fetchApi<T>(endpoint),
  post: <T>(endpoint: string, data: unknown) => fetchApi<T>(endpoint, { method: 'POST', body: JSON.stringify(data) }),
};
