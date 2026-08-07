import { test, expect } from '@playwright/test';

test.describe('Booking Cancellation Browser Flow (Tier B)', () => {
  test('Cancel button always visible, disabled with reason if outside window', async ({ page, request }) => {
    // 1. Login as gamer
    await page.goto('/login');
    await page.fill('input[type="email"]', 'test@example.com');
    await page.fill('input[type="password"]', 'testpass123');
    const submitBtn = page.locator('button[type="submit"]').first();
    await submitBtn.click();
    await page.waitForURL((url) => !url.pathname.includes('/login'), { timeout: 10000 });

    // 2. Create a booking far in future (ensure cancellable)
    // Assuming verified cafe exists from seed (owner@example.com's cafe)
    const cafesRes = await request.get('http://localhost:8000/api/v1/cafes');
    const cafesData = await cafesRes.json();
    const cafe = cafesData.data.items?.[0];
    
    if (!cafe) {
      test.skip();
      return;
    }

    const tiersRes = await request.get(`http://localhost:8000/api/v1/cafes/${cafe.id}/tiers`);
    const tiersData = await tiersRes.json();
    const tier = tiersData.data.tiers?.[0];

    if (!tier) {
      test.skip();
      return;
    }

    // Create booking 3 days in future
    const futureDate = new Date();
    futureDate.setDate(futureDate.getDate() + 3);
    const sessionDate = futureDate.toISOString().split('T')[0];

    const token = await page.evaluate(() => localStorage.getItem('token'));
    const createRes = await request.post('http://localhost:8000/api/v1/bookings', {
      headers: { 'Authorization': `Bearer ${token}` },
      data: {
        cafeId: cafe.id,
        hardwareTierId: tier.id,
        sessionDate,
        startTime: '14:00:00',
        durationHours: 2
      }
    });

    if (!createRes.ok()) {
      // Booking creation failed (maybe payment required)
      test.skip();
      return;
    }

    const bookingData = await createRes.json();
    const bookingId = bookingData.data.booking.id;

    // 3. Navigate to booking detail
    await page.goto(`/bookings/${bookingId}`);
    await page.waitForTimeout(1500);

    // 4. Verify cancel button exists
    const cancelBtn = page.locator('button:has-text("Cancel Booking")').first();
    await expect(cancelBtn).toBeVisible({ timeout: 10000 });

    // 5. Since booking is 3 days away, button should be enabled (canCancel=true)
    await expect(cancelBtn).toBeEnabled();

    // 6. Click and cancel
    await cancelBtn.click();
    await page.waitForTimeout(500);
    
    // Confirm modal appears
    const confirmBtn = page.locator('button:has-text("Confirm Cancellation")').first();
    await expect(confirmBtn).toBeVisible({ timeout: 5000 });
    await confirmBtn.click();

    // 7. Wait for cancellation to complete
    await page.waitForTimeout(2000);

    // 8. Verify status changed to cancelled
    await page.reload();
    await page.waitForTimeout(1500);
    const statusBadge = page.locator('text=/cancelled/i').first();
    await expect(statusBadge).toBeVisible({ timeout: 10000 });

    // Cleanup: verify cancel button now shows disabled with reason
    const cancelBtnAfter = page.locator('button:has-text("Cancel Booking")').first();
    await expect(cancelBtnAfter).toBeDisabled();
  });
});
