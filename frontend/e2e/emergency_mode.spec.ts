import { test, expect } from '@playwright/test';

test.describe('Emergency Mode Browser Flow (Tier B)', () => {
  test('Customer browsing home page loads without emergency mode errors', async ({ page }) => {
    // 1. Log in as gamer
    await page.goto('/login');
    await page.fill('input[type="email"]', 'test@example.com');
    await page.fill('input[type="password"]', 'testpass123');
    const submitBtn = page.locator('button[type="submit"]').first();
    await submitBtn.click();

    await page.waitForURL((url) => !url.pathname.includes('/login'), { timeout: 10000 });

    // 2. Navigate home
    await page.goto('/');
    await page.waitForTimeout(1500);

    // 3. Verify page search input / cafe list container loaded
    const searchInput = page.locator('input[placeholder*="Search"]').first();
    await expect(searchInput).toBeVisible({ timeout: 10000 });
  });
});
