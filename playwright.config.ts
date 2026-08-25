import { defineConfig, devices } from '@playwright/test';

// Keep E2E on dedicated defaults so a developer's production-like servers on
// 8000/5173 cannot be reused with rate limiting and different environment flags.
const backendPort = process.env.PLAYWRIGHT_BACKEND_PORT ?? '8010';
const frontendPort = process.env.PLAYWRIGHT_FRONTEND_PORT ?? '5180';
const backendURL = `http://127.0.0.1:${backendPort}`;
const frontendURL = `http://127.0.0.1:${frontendPort}`;
const databaseURL =
  process.env.DATABASE_URL ?? 'postgresql://app:app@127.0.0.1:5432/app';

export default defineConfig({
  testDir: './frontend/tests/e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 2 : undefined,
  reporter: [['html'], ['list']],
  use: {
    baseURL: process.env.PLAYWRIGHT_BASE_URL ?? frontendURL,
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
  },
  webServer: [
    {
      command: `docker compose up -d --wait db redis && cd backend && uv run prisma migrate deploy && PYTHONPATH=src uv run python scripts/seed_dev_accounts.py && PYTHONPATH=src uv run python scripts/seed_e2e_fixtures.py && uv run uvicorn app.main:app --app-dir src --host 127.0.0.1 --port ${backendPort}`,
      url: `${backendURL}/health/ready`,
      reuseExistingServer: !process.env.CI,
      timeout: 120_000,
      env: {
        ...process.env,
        APP_ENV: 'e2e',
        DATABASE_URL: databaseURL,
        BACKEND_CORS_ORIGINS: JSON.stringify([frontendURL]),
        FRONTEND_URL: frontendURL,
      },
    },
    {
      command: `npm --prefix frontend run dev -- --host 127.0.0.1 --port ${frontendPort}`,
      url: frontendURL,
      reuseExistingServer: !process.env.CI,
      env: {
        ...process.env,
        VITE_ENABLE_DEMO_LOGIN: 'true',
        VITE_API_URL: backendURL,
      },
    },
  ],
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
});
