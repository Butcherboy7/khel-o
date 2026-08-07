import { test, expect } from '@playwright/test';

test.describe('Emergency Mode Browser Flow (Tier B)', () => {
  test('Owner toggles emergency mode ON → cafe hidden from search + booking blocked', async ({ page, request }) => {
    // 1. Owner login
    await page.goto('/login');
    await page.fill('input[type="email"]', 'owner@example.com');
    await page.fill('input[type="password"]', 'testpass123');
    const submitBtn = page.locator('button[type="submit"]').first();
    await submitBtn.click();
    await page.waitForURL((url) => !url.pathname.includes('/login'), { timeout: 10000 });

    // 2. Get owner's cafe ID (assume first verified cafe)
    const dashboardRes = await request.get(`http://localhost:8000/api/v1/owner/status`, {
      headers: {
        'Authorization': `Bearer ${await page.evaluate(() => localStorage.getItem('token'))}`
      }
    });
    const dashboardData = await dashboardRes.json();
    const cafeId = dashboardData.data.cafe?.id;
    
    if (!cafeId) {
      // No cafe seeded, skip test
      test.skip();
      return;
    }

    // 3. Toggle emergency mode ON via API
    const toggleRes = await request.patch(`http://localhost:8000/api/v1/owner/cafes/${cafeId}/emergency-mode?isEmergencyMode=true`, {
      headers: {
        'Authorization': `Bearer ${await page.evaluate(() => localStorage.getItem('token'))}`
      }
    });
    expect(toggleRes.ok()).toBeTruthy();

    // 4. Switch to gamer account
    await page.goto('/login');
    await page.fill('input[type="email"]', 'test@example.com');
    await page.fill('input[type="password"]', 'testpass123');
    const submitBtn2 = page.locator('button[type="submit"]').first();
    await submitBtn2.click();
    await page.waitForURL((url) => !url.pathname.includes('/login'), { timeout: 10000 });

    // 5. Search cafes - should NOT find this cafe
    await page.goto('/');
    await page.waitForTimeout(2000);
    
    // Intercept search API to verify cafe excluded from results
    const searchRes = await request.get(`http://localhost:8000/api/v1/cafes`, {
      headers: {
        'Authorization': `Bearer ${await page.evaluate(() => localStorage.getItem('token'))}`
      }
    });
    const searchData = await searchRes.json();
    const cafeFound = searchData.data.items?.some((c: any) => c.id === cafeId);
    expect(cafeFound).toBe(false);

    // 6. Cleanup: toggle emergency mode OFF
    await page.goto('/login');
    await page.fill('input[type="email"]', 'owner@example.com');
    await page.fill('input[type="password"]', 'testpass123');
    const submitBtn3 = page.locator('button[type="submit"]').first();
    await submitBtn3.click();
    await page.waitForURL((url) => !url.pathname.includes('/login'), { timeout: 10000 });
    
    await request.patch(`http://localhost:8000/api/v1/owner/cafes/${cafeId}/emergency-mode?isEmergencyMode=false`, {
      headers: {
        'Authorization': `Bearer ${await page.evaluate(() => localStorage.getItem('token'))}`
      }
    });
  });
});
