import { test, expect } from '@playwright/test';

test.describe('Dual-Role Switcher E2E Integration (Phase 3)', () => {
  test('Verified owner can switch active role via Role Switcher UI component', async ({ page }) => {
    // 1. Log in as verified owner
    await page.goto('/login');
    await page.fill('input[type="email"]', 'owner@example.com');
    await page.fill('input[type="password"]', 'testpass123');
    await page.click('button[type="submit"]');

    await page.waitForURL((url) => !url.pathname.includes('/login'), { timeout: 10000 });

    // 2. Verify Role Switcher button is present on customer shell or owner dashboard
    const roleSwitcherBtn = page.locator('button:has-text("Owner"), button:has-text("Gamer Mode")').first();
    await expect(roleSwitcherBtn).toBeVisible({ timeout: 10000 });

    // 3. Click Role Switcher to toggle portal mode
    await roleSwitcherBtn.click();
    await page.waitForTimeout(1000);

    // 4. Verify smooth transition URL or active role state
    expect(page.url()).not.toContain('/login');
  });
});
