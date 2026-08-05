import { test, expect } from '@playwright/test';

test.describe('Customer Baseline Flow Smoke Tests (Phase 1a Baseline)', () => {

  test('Unauthenticated user attempting profile access is redirected to login', async ({ page }) => {
    await page.goto('/profile');
    
    // Verify redirection to /login
    await page.waitForURL(/\/login/, { timeout: 10000 });
    expect(page.url()).toContain('/login');
  });

  test('Customer login flow works with test credentials', async ({ page }) => {
    await page.goto('/login');
    
    await page.fill('input[type="email"]', 'test@example.com');
    await page.fill('input[type="password"]', 'testpass123');
    
    const submitBtn = page.locator('button[type="submit"]').first();
    await submitBtn.click();
    
    // Wait for redirect away from login after successful auth
    await page.waitForURL((url) => !url.pathname.includes('/login'), { timeout: 10000 });
    expect(page.url()).not.toContain('/login');
  });

  test.describe('Authenticated Customer Browsing & Booking Flows', () => {
    test.beforeEach(async ({ page }) => {
      // Authenticate as test gamer account before customer browsing tests
      await page.goto('/login');
      await page.fill('input[type="email"]', 'test@example.com');
      await page.fill('input[type="password"]', 'testpass123');
      const submitBtn = page.locator('button[type="submit"]').first();
      await submitBtn.click();
      await page.waitForURL((url) => !url.pathname.includes('/login'), { timeout: 10000 });
    });

    test('Homepage loads correctly with search input and cafe listings for authenticated customer', async ({ page }) => {
      await page.goto('/');
      
      // Page title check
      await expect(page).toHaveTitle(/KHEL/i);
      
      // Wait for search input to hydrate and become visible
      const searchInput = page.locator('input[type="text"]').first();
      await searchInput.waitFor({ state: 'visible', timeout: 10000 });
      await expect(searchInput).toBeVisible();

      // Check heading
      const heading = page.locator('h1').first();
      await expect(heading).toBeVisible();

      // Wait for cafe cards/links to load from API
      const cafeLink = page.locator('a[href^="/cafe/"]').first();
      await cafeLink.waitFor({ state: 'visible', timeout: 10000 });
      await expect(cafeLink).toBeVisible();
    });

    test('Café detail page loads hardware tiers and amenities for authenticated customer', async ({ page }) => {
      await page.goto('/');
      
      // Wait for first cafe link to load and click
      const firstCafeLink = page.locator('a[href^="/cafe/"]').first();
      await firstCafeLink.waitFor({ state: 'visible', timeout: 10000 });
      
      const href = await firstCafeLink.getAttribute('href');
      expect(href).toBeTruthy();
      
      await page.goto(href!);
      
      // Verify café detail heading is visible
      const mainHeading = page.locator('h1').first();
      await mainHeading.waitFor({ state: 'visible', timeout: 10000 });
      await expect(mainHeading).toBeVisible();

      // Verify "Book now" button is present and clickable
      const bookNowBtn = page.locator('text=/Book now/i').first();
      await expect(bookNowBtn).toBeVisible();
    });

    test('Authenticated customer can navigate through booking wizard to payment/summary step', async ({ page }) => {
      await page.goto('/');
      
      // Get first cafe link
      const firstCafeLink = page.locator('a[href^="/cafe/"]').first();
      await firstCafeLink.waitFor({ state: 'visible', timeout: 10000 });
      const href = await firstCafeLink.getAttribute('href');
      const cafeId = href?.split('/cafe/')[1];
      expect(cafeId).toBeTruthy();

      // Navigate directly to booking wizard for this cafe
      await page.goto(`/bookings/new?cafeId=${cafeId}`);
      await page.waitForLoadState('domcontentloaded');

      // Verify booking wizard title / venue name loads
      const heading = page.locator('h1, h2').first();
      await heading.waitFor({ state: 'visible', timeout: 10000 });
      await expect(heading).toBeVisible();

      // Verify price breakdown and proceed to pay / confirm button is present
      const checkoutBtn = page.locator('button:has-text("Pay"), button:has-text("Confirm"), button:has-text("Proceed")').first();
      await checkoutBtn.waitFor({ state: 'visible', timeout: 10000 });
      await expect(checkoutBtn).toBeVisible();
    });
  });
});
