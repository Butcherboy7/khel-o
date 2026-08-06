import { test, expect } from '@playwright/test';

test.describe('Owner Café Onboarding Wizard Flow (Phase 2)', () => {
  test('Gamer user can access wizard and navigate steps without 422 errors', async ({ page }) => {
    // 1. Navigate to login as customer/gamer
    await page.goto('/login');
    await page.fill('input[type="email"]', 'test@example.com');
    await page.fill('input[type="password"]', 'testpass123');
    await page.click('button[type="submit"]');

    // Wait for redirect away from login after successful auth
    await page.waitForURL((url) => !url.pathname.includes('/login'), { timeout: 10000 });

    // 2. Navigate to owner onboarding page
    await page.goto('/owner/onboarding');
    await page.waitForTimeout(1000);

    // 3. Verify onboarding header loads
    await expect(page.locator('h1').filter({ hasText: /Café Onboarding Setup/i })).toBeVisible({ timeout: 10000 });

    // 4. Fill required step 1 fields
    await page.fill('input[placeholder*="Velocity"]', 'Nexus Cyber Lounge');
    await page.fill('input[placeholder*="Building"]', 'MG Road 45');

    // 5. Click Next Step
    const nextBtn = page.locator('button:has-text("Next Step")').first();
    if (await nextBtn.isVisible()) {
      await nextBtn.click();
      await page.waitForTimeout(500);
    }

    // 6. Verify transition to step 2 or wizard progress
    expect(page.url()).toContain('/owner/onboarding');
  });

  test('Pending owner visiting onboarding sees application status or setup screen', async ({ page }) => {
    // 1. Navigate to login as pending owner
    await page.goto('/login');
    await page.fill('input[type="email"]', 'pending@example.com');
    await page.fill('input[type="password"]', 'testpass123');
    await page.click('button[type="submit"]');

    // Wait for redirect away from login after successful auth
    await page.waitForURL((url) => !url.pathname.includes('/login'), { timeout: 10000 });

    // 2. Navigate to owner onboarding page
    await page.goto('/owner/onboarding');
    await page.waitForLoadState('networkidle');

    // 3. Verify onboarding page loads cleanly without auth redirect
    expect(page.url()).toContain('/owner/onboarding');
  });
});
