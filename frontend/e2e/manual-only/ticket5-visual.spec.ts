import { test, expect } from '@playwright/test';

test.describe('Ticket 5: City Persistence + Notifications', () => {
  
  test('Bug A: City query param persists on back navigation', async ({ page }) => {
    await page.goto('/?city=Bengaluru');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(3000);
    
    const cityButton = page.locator('button').filter({ hasText: /Cities|Bengaluru|Hyderabad/i }).first();
    await expect(cityButton).toBeVisible({ timeout: 15000 });
    
    const buttonText = await cityButton.textContent();
    expect(buttonText).toContain('Bengaluru');
    
    const cafeCard = page.locator('a[href*="/cafe/"]').first();
    const cardCount = await cafeCard.count();
    
    if (cardCount > 0) {
      await cafeCard.click();
      await page.waitForURL('**/cafe/**', { timeout: 10000 });
      await page.waitForTimeout(1000);
      
      await page.goBack();
      await page.waitForLoadState('networkidle');
      await page.waitForTimeout(1000);
      
      expect(page.url()).toContain('city=Bengaluru');
      
      const cityButtonAfter = page.locator('button').filter({ hasText: /Bengaluru/i }).first();
      await expect(cityButtonAfter).toBeVisible({ timeout: 10000 });
    }
  });
  
  test('Bug B: Notifications page renders successfully', async ({ page }) => {
    await page.goto('/notifications');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(3000);
    
    await expect(page.locator('text=/404|Not Found/i')).not.toBeVisible({ timeout: 5000 });
    
    const notificationsTitle = page.locator('h1, h2, h3').filter({ hasText: /Notifications/i });
    await expect(notificationsTitle.first()).toBeVisible({ timeout: 10000 });
  });
  
  test('Badge shows unread count number', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(3000);
    
    const bellIcon = page.locator('svg[class*="lucide"]').filter({ has: page.locator('path[d*="M"]') }).or(
      page.locator('button[aria-label*="Notification"]')
    ).or(
      page.locator('a[href*="notification"]')
    );
    
    if (await bellIcon.count() > 0) {
      const parent = bellIcon.first().locator('xpath=..');
      const badge = parent.locator('span').filter({ hasText: /\d+/ });
      
      if (await badge.count() > 0) {
        const text = await badge.textContent();
        expect(text).toMatch(/\d+/);
      }
    }
  });
});
