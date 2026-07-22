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
    rollupOptions: {
      output: {
        // Three.js changes far less often than gameplay code. Keeping it in a
        // stable vendor chunk prevents small gameplay additions from pushing
        // the initial application entry over the deployment budget, and lets
        // browsers retain the engine chunk across game-only releases.
        manualChunks: {
          'vendor-three': ['three'],
        },
      },
    },
  },
  preview: {
    port: 4173,
    host: true,
  },
});
