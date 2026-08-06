import { test, expect } from '@playwright/test';

test.describe('Booking Cancellation Browser Flow (Tier B)', () => {
  test('Authenticated customer can view active bookings list', async ({ page }) => {
    // 1. Log in as gamer
    await page.goto('/login');
    await page.fill('input[type="email"]', 'test@example.com');
    await page.fill('input[type="password"]', 'testpass123');
    const submitBtn = page.locator('button[type="submit"]').first();
    await submitBtn.click();

    await page.waitForURL((url) => !url.pathname.includes('/login'), { timeout: 10000 });

    // 2. Navigate to bookings page
    await page.goto('/bookings');
    await page.waitForTimeout(1500);

    // 3. Verify bookings list title
    const heading = page.locator('h1:has-text("My Booking Passes"), h1:has-text("Bookings")').first();
    await expect(heading).toBeVisible({ timeout: 10000 });
  });
});
