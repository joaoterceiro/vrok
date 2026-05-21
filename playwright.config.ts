import { defineConfig, devices } from '@playwright/test';

/**
 * Playwright config — smoke e2e against a running dev stack. Run with:
 *   pnpm exec playwright test
 *
 * The dev stack must be reachable at PLAYWRIGHT_BASE_URL (default
 * http://localhost:3000). For CI we boot the docker compose stack first.
 *
 * The three-viewport matrix (iPhone SE, iPad, desktop) is the responsive
 * sanity check from the design plan: no horizontal scroll anywhere, no
 * elements overflowing, composer reachable with keyboard open.
 */
export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: process.env.CI ? [['github'], ['html', { open: 'never' }]] : 'list',
  use: {
    baseURL: process.env.PLAYWRIGHT_BASE_URL ?? 'http://localhost:3000',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },
  projects: [
    {
      name: 'desktop',
      use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 900 } },
    },
    {
      name: 'tablet',
      use: { ...devices['iPad (gen 7)'] },
    },
    {
      name: 'mobile',
      use: { ...devices['iPhone SE'] },
    },
  ],
});
