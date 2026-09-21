import { test, expect } from '@playwright/test';

// Follows the inline login pattern used by e2e/owner_onboarding.spec.ts and
// e2e/ticket7.spec.ts (no shared "login as owner without cafe" helper exists
// in this codebase yet — e2e/auth.ts's `authenticatedPage` fixture mocks
// localStorage for a different purpose and doesn't hit a real backend
// session). test@example.com is the "Demo Gamer" seeded by
// backend/scripts/seed_test_accounts.py: a role=gamer account with no café,
// so it lands cleanly on a fresh Step 1 of the onboarding wizard.
test.describe('Onboarding Step 1: state-first location flow', () => {
  test('state locks after selecting a city and unlocks via the city field Change button', async ({ page }) => {
    await page.goto('/login');
    await page.fill('input[type="email"]', 'test@example.com');
    await page.fill('input[type="password"]', 'testpass123');
    await page.click('button[type="submit"]');
    await page.waitForURL((url) => !url.pathname.includes('/login'), { timeout: 10000 });

    await page.goto('/owner/onboarding');
    await expect(page.locator('h1').filter({ hasText: /Café Onboarding Setup/i })).toBeVisible({ timeout: 10000 });

    // The state selector and the (later) city field each render their value
    // inside a bordered box immediately after their own <label>. Scoping
    // through the label avoids ambiguity between the two "Change" buttons
    // and between "Telangana" appearing in both the state box and the
    // "Secunderabad, Telangana" city box.
    const stateBlock = page.locator('label:has-text("State / UT")').locator('xpath=following-sibling::div[1]');
    const cityBlock = page.locator('label:has-text("City / Town / Locality")').locator('xpath=following-sibling::div[1]');

    // No city/town field before a state is chosen.
    await expect(page.getByPlaceholder(/search for your city/i)).toHaveCount(0);

    const stateSelect = page.locator('select').first();
    await stateSelect.selectOption('Telangana');

    await expect(stateBlock).toContainText('Telangana');
    // State stays changeable until a city is chosen.
    await expect(stateBlock.getByRole('button', { name: 'Change' })).toBeVisible();

    const citySearch = page.getByPlaceholder(/search for your city/i);
    await citySearch.fill('Secunderabad');
    const secunderabadOption = page.getByText('Secunderabad, Telangana');
    await expect(secunderabadOption).toBeVisible({ timeout: 5000 });
    await secunderabadOption.click();

    // Selecting a city locks the state: its "Change" button disappears.
    await expect(cityBlock).toContainText('Secunderabad, Telangana');
    await expect(stateBlock.getByRole('button', { name: 'Change' })).toHaveCount(0);

    // The city field's own "Change" button unlocks state again.
    await cityBlock.getByRole('button', { name: 'Change' }).click();
    await expect(stateBlock.getByRole('button', { name: 'Change' })).toBeVisible();
  });

  test('city search shows popular cities for the state on focus, before typing', async ({ page }) => {
    await page.goto('/login');
    await page.fill('input[type="email"]', 'test@example.com');
    await page.fill('input[type="password"]', 'testpass123');
    await page.click('button[type="submit"]');
    await page.waitForURL((url) => !url.pathname.includes('/login'), { timeout: 10000 });

    await page.goto('/owner/onboarding');
    await expect(page.locator('h1').filter({ hasText: /Café Onboarding Setup/i })).toBeVisible({ timeout: 10000 });

    const stateSelect = page.locator('select').first();
    await stateSelect.selectOption('Telangana');

    const citySearch = page.getByPlaceholder(/search for your city/i);
    await citySearch.click();

    // Focusing the empty field should populate results from the seeded
    // Telangana rows (Task 2) without the owner typing a single character.
    await expect(page.getByText(/, Telangana/).first()).toBeVisible({ timeout: 5000 });
  });

  test('city search finds a named locality, not just major metros', async ({ page }) => {
    await page.goto('/login');
    await page.fill('input[type="email"]', 'test@example.com');
    await page.fill('input[type="password"]', 'testpass123');
    await page.click('button[type="submit"]');
    await page.waitForURL((url) => !url.pathname.includes('/login'), { timeout: 10000 });

    await page.goto('/owner/onboarding');
    await expect(page.locator('h1').filter({ hasText: /Café Onboarding Setup/i })).toBeVisible({ timeout: 10000 });

    const stateSelect = page.locator('select').first();
    await stateSelect.selectOption('Telangana');

    const citySearch = page.getByPlaceholder(/search for your city/i);
    await citySearch.fill('Nampally');
    await expect(page.getByText('Nampally, Telangana')).toBeVisible({ timeout: 5000 });
  });

  test('clicking outside the city dropdown closes it', async ({ page }) => {
    await page.goto('/login');
    await page.fill('input[type="email"]', 'test@example.com');
    await page.fill('input[type="password"]', 'testpass123');
    await page.click('button[type="submit"]');
    await page.waitForURL((url) => !url.pathname.includes('/login'), { timeout: 10000 });

    await page.goto('/owner/onboarding');
    await expect(page.locator('h1').filter({ hasText: /Café Onboarding Setup/i })).toBeVisible({ timeout: 10000 });

    const stateSelect = page.locator('select').first();
    await stateSelect.selectOption('Telangana');

    // Focusing (without typing) opens the popular-cities dropdown.
    const citySearch = page.getByPlaceholder(/search for your city/i);
    await citySearch.click();
    const popularResult = page.getByText(/, Telangana/).first();
    await expect(popularResult).toBeVisible({ timeout: 5000 });

    // Clicking a clearly unrelated field must close the dropdown — there is
    // no onBlur/click-away handling by accident here, it's an explicit
    // containerRef + document mousedown listener (see LocationSearchInput.tsx).
    await page.getByLabel('Café Name *').click();
    await expect(popularResult).toHaveCount(0);
  });
});
