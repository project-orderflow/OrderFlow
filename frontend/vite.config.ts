import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig(({ command, mode, isPreview }) => {
  const useLocalApi = command === 'serve' && !isPreview && mode === 'local-api';

  return {
    plugins: [react()],
    resolve: {
      alias: {
        '@': path.resolve(import.meta.dirname, './src'),
      },
    },
    ...(useLocalApi && {
      define: { 'import.meta.env.VITE_API_URL': JSON.stringify('/api') },
      server: {
        proxy: {
          '/api/': {
            target: 'http://127.0.0.1:8000',
            rewrite: (url) => url.slice('/api'.length),
          },
        },
      },
    }),
  };
});
