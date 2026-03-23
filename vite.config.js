import { defineConfig } from 'vite';

export default defineConfig({
  server: {
    host: '0.0.0.0',
    port: parseInt(process.env.PORT || '3000')
  },
  build: {
    target: 'esnext'
  },
  optimizeDeps: {
    exclude: ['@dimforge/rapier3d-compat']
  }
});
