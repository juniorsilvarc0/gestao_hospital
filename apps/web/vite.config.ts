import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'node:path';

// HMS-BR Web — Vite config.
// Roda em container (Docker-first); host 0.0.0.0 para o port-forward funcionar.
// Alias `@` aponta para `./src` (compat com shadcn-ui templates e tsconfig paths).
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  server: {
    host: '0.0.0.0',
    port: 5173,
    strictPort: true,
    hmr: {
      overlay: true,
    },
  },
  preview: {
    host: '0.0.0.0',
    port: 4173,
    strictPort: true,
  },
  build: {
    target: 'es2022',
    sourcemap: true,
    outDir: 'dist',
    emptyOutDir: true,
  },
});
