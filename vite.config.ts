import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  // Importante para Electron em produção: assets precisam ser relativos no file://
  base: './',
  plugins: [react()],
  server: {
    port: 5173,
    strictPort: true
  }
});
