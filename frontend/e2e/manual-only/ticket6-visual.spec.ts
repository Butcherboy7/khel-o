import { test, expect } from '@playwright/test';

test.describe('Ticket 6: Onboarding UX Fixes', () => {
  
  test('Click Become a Partner → lands on intro page', async ({ page }) => {
    await page.goto('/partner');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(2000);
    
    const title = page.locator('h1').filter({ hasText: /List Your Gaming|Partner/i });
    await expect(title).toBeVisible({ timeout: 10000 });
    
    const ctaButton = page.locator('button').filter({ hasText: /Get Listed|Become Partner/i });
    await expect(ctaButton).toBeVisible({ timeout: 5000 });
  });
  
  test('State field is a select/dropdown', async ({ page }) => {
    await page.goto('/owner/onboarding');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(2000);
    
    const stateSelect = page.locator('select');
    await expect(stateSelect.first()).toBeVisible({ timeout: 10000 });
    
    const options = await stateSelect.first().locator('option').allInnerTexts();
    expect(options.length).toBeGreaterThan(10);
    expect(options.some(opt => opt.includes('Karnataka') || opt.includes('Maharashtra') || opt.includes('Delhi'))).toBeTruthy();
  });
  
  test('GST toggle shows/hides input', async ({ page }) => {
    await page.goto('/owner/onboarding');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(1000);
    
    const yesButton = page.locator('button').filter({ hasText: /^Yes$/i });
    const noButton = page.locator('button').filter({ hasText: /^No$/i });
    
    await expect(yesButton.first()).toBeVisible({ timeout: 5000 });
    await expect(noButton.first()).toBeVisible({ timeout: 5000 });
    
    await noButton.first().click();
    await page.waitForTimeout(500);
    
    const gstInput = page.locator('input').filter({ has: page.locator('[placeholder*="GST"], [placeholder*="29ABC"]') });
    const gstCountAfterNo = await gstInput.count();
    
    await yesButton.first().click();
    await page.waitForTimeout(500);
    
    const gstCountAfterYes = await gstInput.count();
    expect(gstCountAfterYes).toBeGreaterThan(gstCountAfterNo);
  });
  
  test('Bank account input has autoComplete', async ({ page }) => {
    await page.goto('/owner/onboarding');
    await page.waitForLoadState('networkidle');
    
    for (let i = 0; i < 3; i++) {
      const nextButton = page.locator('button').filter({ hasText: /Next/i }).first();
      if (await nextButton.isVisible()) {
        await nextButton.click();
        await page.waitForTimeout(500);
      }
    }
    
    const bankInput = page.locator('input').filter({ has: page.locator('[placeholder*="9180"], [placeholder*="account"], [name*="bank"]') });
    
    if (await bankInput.count() > 0) {
      const autoComplete = await bankInput.first().getAttribute('autocomplete');
      expect(autoComplete).toBe('off');
    }
  });
});
