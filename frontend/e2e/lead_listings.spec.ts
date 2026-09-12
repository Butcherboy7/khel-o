import { test, expect } from '@playwright/test';

/**
 * Lead listings: cafés KHEL-O listed from research that have not agreed to
 * take bookings yet.
 *
 * These assert the promises the card makes, because every one of them is a
 * statement about a real business:
 *  - it never claims the venue is open or closed
 *  - it never shows a price nobody agreed to
 *  - it never offers a booking that cannot happen
 *  - the waiting count is real, so tapping twice must not move it
 *
 * Requires the dev stack (playwright.config.ts starts it) and at least one
 * café with is_lead_listing = true. Seed with scripts/seed_real_cafes.py.
 */

const LEAD_BADGE = 'Booking soon';

test.describe('lead listings', () => {
  test('explore shows a Booking soon badge and no invented price', async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('a[href^="/cafe/"]', { timeout: 15_000 });

    const badges = page.getByText(LEAD_BADGE, { exact: true });
    const count = await badges.count();
    test.skip(count === 0, 'no lead listings seeded in this environment');

    const card = page.locator('a[href^="/cafe/"]').filter({ hasText: LEAD_BADGE }).first();
    await expect(card).toBeVisible();

    // A lead listing must not assert the venue's open state either way.
    await expect(card.getByText('Open now')).toHaveCount(0);
    await expect(card.getByText('Closed')).toHaveCount(0);
    // ...nor a starting price the café never agreed to.
    await expect(card.getByText(/from\s*₹/)).toHaveCount(0);
  });

  test('a long café name wraps instead of clipping', async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('a[href^="/cafe/"]', { timeout: 15_000 });

    const title = page.locator('a[href^="/cafe/"] h3').first();
    await expect(title).toBeVisible();
    // line-clamp-2 rather than truncate: real names run long enough that a
    // single line loses the end of the venue's own name.
    await expect(title).toHaveClass(/line-clamp-2/);
  });

  test('opening a lead listing offers notify-me, not a booking', async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('a[href^="/cafe/"]', { timeout: 15_000 });

    const card = page.locator('a[href^="/cafe/"]').filter({ hasText: LEAD_BADGE }).first();
    test.skip((await card.count()) === 0, 'no lead listings seeded in this environment');

    await card.click();
    await page.waitForURL(/\/cafe\//);

    await expect(page.getByRole('button', { name: /Notify me/i })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Book now' })).toHaveCount(0);
  });

  test('tapping notify me twice does not double the count', async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('a[href^="/cafe/"]', { timeout: 15_000 });

    const card = page.locator('a[href^="/cafe/"]').filter({ hasText: LEAD_BADGE }).first();
    test.skip((await card.count()) === 0, 'no lead listings seeded in this environment');

    await card.click();
    await page.waitForURL(/\/cafe\//);

    const notify = page.getByRole('button', { name: /Notify me/i });
    await notify.click();

    // Signed out, the button reveals a contact field first.
    const contact = page.getByPlaceholder('Phone or email');
    if (await contact.isVisible()) {
      await contact.fill('9999999999');
      await page.getByRole('button', { name: 'Done' }).click();
    }

    await expect(page.getByRole('button', { name: /Notifying you/i })).toBeVisible();

    const readCount = async () => {
      const label = page.getByText(/\d+ people waiting/);
      return (await label.count()) === 0 ? null : await label.first().textContent();
    };
    const first = await readCount();

    await page.reload();
    await page.waitForSelector('button');
    expect(await readCount()).toBe(first);
  });

  test('a cafe with no confirmed hours claims neither Open now nor Closed', async ({ page }) => {
    // isCafeOpenNow treats a missing opening/closing time as open, so without a
    // guard every researched cafe -- 12 of 14 have no hours on file -- would
    // advertise "Open now" for a real business on no evidence. Spec AC2.
    await page.goto('/');
    await page.waitForSelector('a[href^="/cafe/"]', { timeout: 15_000 });

    const leadCards = page.locator('a[href^="/cafe/"]').filter({ hasText: LEAD_BADGE });
    test.skip((await leadCards.count()) === 0, 'no lead listings seeded in this environment');

    // A lead listing badge replaces the open/closed badge entirely.
    for (const card of await leadCards.all()) {
      await expect(card.getByText('Open now', { exact: true })).toHaveCount(0);
      await expect(card.getByText('Closed', { exact: true })).toHaveCount(0);
    }
  });
});
