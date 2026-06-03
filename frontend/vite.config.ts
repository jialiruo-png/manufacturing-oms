import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import viteCompression from 'vite-plugin-compression';

export default defineConfig({
  plugins: [
    react(),
    viteCompression({ algorithm: 'gzip', threshold: 1024 }),
  ],
  server: {
    port: 5173,
    proxy: {
      '/api': process.env.VITE_API_PROXY_TARGET || 'http://localhost:3001',
    },
  },
  build: {
    target: 'es2019',
    rollupOptions: {
      output: {
        manualChunks: {
          'react-vendor': ['react', 'react-dom'],
          'antd-vendor': ['antd', '@ant-design/icons'],
          echarts: [
            'echarts/core',
            'echarts/charts',
            'echarts/components',
            'echarts/renderers',
          ],
          leaflet: ['leaflet'],
          utils: ['axios', 'dayjs'],
        },
      },
    },
  },
});
