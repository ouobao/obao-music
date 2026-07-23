import { defineConfig, devices } from '@playwright/test';
import { existsSync } from 'node:fs';

const hasSystemEdge =
  process.platform === 'win32' &&
  (existsSync('C:/Program Files/Microsoft/Edge/Application/msedge.exe') ||
    existsSync('C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'));
const systemBrowserUse = hasSystemEdge ? { channel: 'msedge' as const } : {};

export default defineConfig({
  testDir: './tests/e2e',
  outputDir: './artifacts/playwright-results',
  fullyParallel: false,
  reporter: [['list']],
  use: {
    baseURL: 'http://127.0.0.1:5173',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure'
  },
  webServer: {
    command: 'npm run dev:vite',
    url: 'http://127.0.0.1:5173',
    reuseExistingServer: true,
    timeout: 120_000
  },
  projects: [
    {
      name: 'desktop',
      use: {
        ...devices['Desktop Chrome'],
        ...systemBrowserUse,
        viewport: { width: 1440, height: 900 }
      }
    },
    {
      name: 'compact',
      use: {
        ...devices['Desktop Chrome'],
        ...systemBrowserUse,
        viewport: { width: 1040, height: 720 }
      }
    }
  ]
});
