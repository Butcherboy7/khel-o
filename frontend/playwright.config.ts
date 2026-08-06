import { defineConfig, devices } from '@playwright/test';

/**
 * Playwright Configuration for KHEL-O Product Stabilization Sprint
 */
export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: 1,
  reporter: [['html', { open: 'never' }], ['list']],
  use: {
    baseURL: 'http://localhost:3000',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'off',
  },
  projects: [
    {
      name: 'chromium',
      use: {
        ...devices['Desktop Chrome'],
        // TODO: Confirm Playwright CI install strategy (headless docker container with pre-baked chromium) prior to production deployment.
        channel: 'msedge', // Uses installed Microsoft Edge on Windows host
      },
    },
  ],
  webServer: [
    {
      command: 'cd ..\\backend && .\\venv\\Scripts\\python -m uvicorn app.main:app --port 8000',
      url: 'http://localhost:8000/docs',
      reuseExistingServer: true,
      timeout: 120 * 1000,
    },
    {
      command: 'npm run dev',
      url: 'http://localhost:3000',
      reuseExistingServer: true,
      timeout: 120 * 1000,
    },
  ],
});
