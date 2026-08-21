import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

export default defineConfig({
  base: './',
  plugins: [react()],
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    chunkSizeWarningLimit: 550,
    rollupOptions: {
      output: {
        manualChunks(id) {
          const normalizedId = id.replace(/\\/g, '/');

          if (
            normalizedId.includes('/node_modules/react/') ||
            normalizedId.includes('/node_modules/react-dom/') ||
            normalizedId.includes('/node_modules/scheduler/')
          ) {
            return 'react-vendor';
          }

          if (normalizedId.includes('/node_modules/three/')) {
            return 'three-vendor';
          }

          if (normalizedId.includes('/node_modules/gsap/') || normalizedId.includes('/node_modules/@gsap/react/')) {
            return 'gsap-vendor';
          }
        }
      }
    }
  },
  server: {
    host: '127.0.0.1',
    port: 5173,
    strictPort: true,
    watch: {
      ignored: ['**/.runtime/**', '**/logs/**', '**/dist/**', '**/dist-electron/**', '**/release/**']
    }
  }
});
