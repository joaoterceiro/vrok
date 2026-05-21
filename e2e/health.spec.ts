import { test, expect } from '@playwright/test';

test.describe('Smoke', () => {
  test('GET /api/health returns ok with all critical checks', async ({ request }) => {
    const res = await request.get('/api/health');
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.status).toBe('ok');
    expect(body.checks.db.status).toBe('ok');
    expect(body.checks.redis.status).toBe('ok');
    expect(body.checks.minio.status).toBe('ok');
  });

  test('GET /login renders without horizontal scroll on mobile', async ({ page, viewport }) => {
    await page.goto('/login');
    await expect(page).toHaveURL(/\/login/);
    // No horizontal scroll at any viewport — sanity check from the plan.
    const overflow = await page.evaluate(() => {
      return document.documentElement.scrollWidth > document.documentElement.clientWidth;
    });
    expect(overflow, `viewport ${viewport?.width}x${viewport?.height} overflows`).toBe(false);
  });

  test('GET /inbox redirects to login when unauthenticated', async ({ page }) => {
    const res = await page.goto('/inbox');
    expect(res?.status()).toBeLessThan(400);
    await expect(page).toHaveURL(/\/login/);
  });
});
