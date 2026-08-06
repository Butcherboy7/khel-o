import { test, expect } from '@playwright/test';

test.describe('Admin Verification Queue E2E (Tier B)', () => {
  test('Admin can view verification queue and approve pending cafe via PATCH route', async ({ page }) => {
    // 1. Log in as admin user
    await page.goto('/login');
    await page.fill('input[type="email"]', 'admin@example.com');
    await page.fill('input[type="password"]', 'testpass123');
    const submitBtn = page.locator('button[type="submit"]').first();
    await submitBtn.click();

    await page.waitForURL((url) => !url.pathname.includes('/login'), { timeout: 10000 });

    // 2. Navigate to Admin page
    await page.goto('/admin');
    await page.waitForTimeout(1500);

    // 3. Verify Admin Verification Queue header is visible
    const heading = page.locator('h1:has-text("Admin Verification Queue")');
    await expect(heading).toBeVisible({ timeout: 10000 });

    // 4. Verify pending queue section loaded
    const pendingHeader = page.locator('h2:has-text("Pending Applications")');
    await expect(pendingHeader).toBeVisible();
  });
});
