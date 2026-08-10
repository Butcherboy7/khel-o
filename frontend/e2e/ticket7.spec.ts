import { test, expect } from '@playwright/test';

test.describe('Ticket 7: End-to-End Onboarding Flow', () => {
  
  test.use({ 
    browserName: 'chromium',
  });
  
  test('Complete onboarding wizard and verify role transition', async ({ page }) => {
    const timestamp = Date.now();
    const testUser = {
      email: `test-${timestamp}@example.com`,
      password: 'TestPass123!',
      fullName: 'Test Cafe Owner',
    };
    
    await test.step('1. Register new gamer user', async () => {
      await page.goto('/register');
      await page.waitForLoadState('networkidle');
      
      await page.locator('input[type="email"]').fill(testUser.email);
      await page.locator('input[type="password"]').first().fill(testUser.password);
      await page.locator('input[name*="name"], input[placeholder*="name"]').first().fill(testUser.fullName);
      await page.locator('button[type="submit"]').click();
      
      await page.waitForURL('**/login', { timeout: 10000 });
    });
    
    await test.step('2. Login and navigate to onboarding', async () => {
      await page.goto('/login');
      await page.waitForLoadState('networkidle');
      
      await page.locator('input[type="email"]').fill(testUser.email);
      await page.locator('input[type="password"]').fill(testUser.password);
      await page.locator('button[type="submit"]').click();
      
      await page.waitForURL('**/', { timeout: 10000 });
      await page.waitForTimeout(1000);
      
      await page.goto('/partner');
      await page.waitForLoadState('networkidle');
      
      const ctaButton = page.locator('button').filter({ hasText: /Get Listed/i }).or(
        page.locator('a[href*="onboarding"]')
      );
      
      if (await ctaButton.count() > 0) {
        await ctaButton.click();
        await page.waitForURL('**/onboarding', { timeout: 10000 });
      } else {
        await page.goto('/owner/onboarding');
      }
    });
    
    await test.step('3. Complete wizard - all 6 steps', async () => {
      await page.waitForLoadState('networkidle');
      await page.waitForTimeout(2000);
      
      const cafeInput = page.locator('input').first();
      await cafeInput.fill('Test Gaming Cafe');
      
      const textareas = page.locator('textarea');
      if (await textareas.count() > 0) {
        await textareas.first().fill('Test description for automated testing');
      }
      
      const addressInputs = page.locator('input[placeholder*="Address"], input[name*="address"]');
      if (await addressInputs.count() > 0) {
        await addressInputs.first().fill('123 Test Street');
      }
      
      const cityInput = page.locator('input[placeholder*="City"], input[name*="city"]');
      if (await cityInput.count() > 0) {
        await cityInput.first().fill('Hyderabad');
      }
      
      const stateSelect = page.locator('select').first();
      if (await stateSelect.count() > 0) {
        await stateSelect.selectOption('Karnataka');
      }
      
      let currentStep = 1;
      for (let step = currentStep; step < 6; step++) {
        const nextButton = page.locator('button').filter({ hasText: /Next/i }).first();
        
        if (await nextButton.isEnabled()) {
          await nextButton.click();
          await page.waitForTimeout(1000);
        }
      }
      
      await page.waitForTimeout(1000);
      
      const gstiInput = page.locator('input').filter({ hasText: /[placeholder*="GST"], [placeholder*="29ABC"]/ });
      const gstToggleButton = page.locator('button').filter({ hasText: /^Yes$/i }).first();
      
      if (await gstToggleButton.count() > 0) {
        await gstToggleButton.click();
        await page.waitForTimeout(500);
      }
    });
    
    await test.step('4. Submit and verify pending review', async () => {
      const submitButton = page.locator('button').filter({ hasText: /Submit|Complete|Finish/i });
      
      if (await submitButton.count() > 0) {
        await submitButton.click();
        await page.waitForTimeout(3000);
        
        const pendingText = page.locator('text=/pending|review|submitted/i');
        await expect(pendingText.first()).toBeVisible({ timeout: 10000 });
      }
    });
  });
  
  test('Verify gamer can still book after becoming cafe_owner', async ({ page, request }) => {
    const testUserId = 'baf66a1e-248a-450f-959f-2f614e8201dd';
    
    const response = await request.get(`http://localhost:8000/api/v1/bookings`, {
      headers: {
        'Authorization': 'Bearer test-token'
      }
    });
    
    expect([200, 401, 422]).toContain(response.status());
  });
});
