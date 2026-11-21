import { defineConfig, devices } from '@playwright/test';
export default defineConfig({
  testDir: 'tests/e2e',
  timeout: 60000,
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: 'list',
  use: { baseURL: 'http://127.0.0.1:4173', trace: 'retain-on-failure' },
  webServer: [
    {
      command: 'npx tsx server/index.ts',
      url: 'http://127.0.0.1:3011/api/health',
      reuseExistingServer: false,
      env: {
        PORT: '3011',
        HOST: '127.0.0.1',
        DATABASE_PATH: 'data/e2e.sqlite',
        TEST_MODE: 'true',
        TEST_TIMEOUT_MS: '20000',
        ADMIN_PASSWORD: 'automated-browser-only-password',
      },
    },
    {
      command: 'npx vite --host 127.0.0.1 --port 4173 --strictPort',
      url: 'http://127.0.0.1:4173',
      reuseExistingServer: false,
      env: { VITE_API_PORT: '3011' },
    },
  ],
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
});
