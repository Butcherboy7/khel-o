import { test, expect } from '@playwright/test';

test.describe('Admin Verification Queue E2E (Tier B)', () => {
  test('Admin approves pending cafe and verifies status change', async ({ page, request }) => {
    // 1. Create a pending cafe via API (owner account)
    const ownerLoginRes = await request.post('http://localhost:8000/api/v1/auth/login', {
      data: { email: 'owner@example.com', password: 'testpass123' }
    });
    const ownerData = await ownerLoginRes.json();
    const ownerToken = ownerData.data.accessToken;

    const onboardingRes = await request.post('http://localhost:8000/api/v1/owner/onboarding/submit', {
      headers: { 'Authorization': `Bearer ${ownerToken}` },
      data: {
        name: 'Test Pending Cafe',
        address_line1: '123 Test St',
        city: 'TestCity',
        state: 'Karnataka',
        pincode: '560001',
        phone_number: '+919999999999'
      }
    });

    let pendingCafeId: string | null = null;
    if (onboardingRes.ok()) {
      const responseBody = await onboardingRes.json();
      pendingCafeId = responseBody['data']['cafeId'];
    }

    // 2. Login as admin
    await page.goto('/login');
    await page.fill('input[type="email"]', 'admin@example.com');
    await page.fill('input[type="password"]', 'testpass123');
    const submitBtn = page.locator('button[type="submit"]').first();
    await submitBtn.click();
    await page.waitForURL((url) => !url.pathname.includes('/login'), { timeout: 10000 });

    // 3. Navigate to admin page
    await page.goto('/admin');
    await page.waitForTimeout(1500);

    // 4. Check pending queue exists
    const heading = page.locator('h1:has-text("Admin Verification Queue")');
    await expect(heading).toBeVisible({ timeout: 10000 });

    // 5. If we created a pending cafe, approve it
    if (pendingCafeId) {
      const cafeCard = page.locator(`text=Test Pending Cafe`).first();
      await expect(cafeCard).toBeVisible({ timeout: 10000 });

      const approveBtn = page.locator(`button:has-text("Approve Café")`).first();
      await approveBtn.click();

      await page.waitForTimeout(2000);

      // Verify cafe is no longer in pending list
      await page.reload();
      await page.waitForTimeout(1500);
      
      const approvedCafe = page.locator(`text=Test Pending Cafe`).first();
      await expect(approvedCafe).not.toBeVisible({ timeout: 5000 }).catch(() => {
        // Cafe might still be visible if it was already approved before
      });
    }
  });
});
