import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    // Optional: set VITE_API_BASE_URL=/api in .env.local to call the API through this dev server (same origin, no CORS).
    proxy: {
      '/api': { target: 'http://localhost:5000', changeOrigin: false },
      '/uploads': { target: 'http://localhost:5000', changeOrigin: false },
    },
  },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: './src/test/setup.js',
    css: false,
  },
});
