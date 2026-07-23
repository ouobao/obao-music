import { defineConfig, mergeConfig } from 'vitest/config';
import viteConfig from './vite.config';

export default mergeConfig(
  viteConfig,
  defineConfig({
    esbuild: {
      include: /\.[cm]?[jt]sx?$/
    },
    test: {
      environment: 'jsdom',
      setupFiles: 'src/renderer/test/setup.ts',
      exclude: ['node_modules/**', 'dist/**', 'dist-electron/**', 'tests/e2e/**']
    }
  })
);
