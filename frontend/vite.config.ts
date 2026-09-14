import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'node:path';

// In production via Caddy, leave these empty — frontend and API share the
// same origin and the proxy in vite.config is unused.
//
// In dev mode with the backend on another host (e.g. your VPS), set:
//   VITE_API_TARGET=http://your-vps-ip:4000   pnpm dev
// to make the Vite proxy forward /api and /socket.io to the remote
// backend instead of localhost.
const API_TARGET = process.env.VITE_API_TARGET ?? 'http://localhost:4000';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'src'),
    },
  },
  server: {
    host: '0.0.0.0',
    port: 5173,
    proxy: {
      '/api': {
        target: API_TARGET,
        changeOrigin: true,
      },
      '/socket.io': {
        target: API_TARGET,
        ws: true,
        changeOrigin: true,
      },
    },
  },
});