import { defineConfig } from 'vite';

export default defineConfig({
  base: '/',
  server: {
    host: true,
    port: 5173,
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    chunkSizeWarningLimit: 1500,
  },
  define: {
    __DEBUG__: JSON.stringify(process.env.DEBUG !== 'false'),
  },
  preview: {
    port: 4173,
    host: true,
  },
});
