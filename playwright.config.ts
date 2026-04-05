import type { PlaywrightTestConfig } from '@playwright/test';

const PORT = process.env.SMOKE_PORT ? Number(process.env.SMOKE_PORT) : 9011;
const HOST = process.env.SMOKE_HOST || '127.0.0.1';
const ROOT = (process.env.SMOKE_ROOT || '.').replace(/"/g, '\\"');

const config: PlaywrightTestConfig = {
  testDir: './tests',
  testIgnore: ['**/unit/**'],
  testMatch: ['**/*.spec.{js,ts}'],
  timeout: 60_000,
  expect: {
    timeout: 10_000,
  },
  use: {
    baseURL: `http://${HOST}:${PORT}/`,
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },
  webServer: {
    command: `npx http-server "${ROOT}" -p ${PORT} -c-1`,
    url: `http://${HOST}:${PORT}/`,
    // release-gate runs smoke then e2e back-to-back; allow reuse so port 9011 is not dead-locked on Windows.
    reuseExistingServer: true,
    timeout: 60_000,
  },
  reporter: [['list'], ['html', { outputFolder: 'playwright-report', open: 'never' }]],
};

export default config;
