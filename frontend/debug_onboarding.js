const { chromium } = require('@playwright/test');

(async () => {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  const page = await context.newPage();

  // Register user first
  await page.goto('http://localhost:3000/register');
  const timestamp = Date.now();
  const email = `test_owner_${timestamp}@test.com`;
  await page.fill('input[placeholder="e.g. Rahul Sharma"]', 'Test Owner');
  await page.fill('input[type="email"]', email);
  await page.fill('input[type="tel"]', '9876543210');
  await page.fill('input[type="password"]', 'AuditPass123!');
  await Promise.all([
    page.waitForResponse(res => res.url().includes('/api/v1/auth/register')),
    page.click('button[type="submit"]')
  ]);
  await page.waitForTimeout(1000);

  // Navigate to onboarding
  await page.goto('http://localhost:3000/owner/onboarding');
  await page.waitForTimeout(500);

  console.log('On onboarding page');

  // Fill Step 1
  await page.fill('input[placeholder="e.g. Velocity Esports Lounge"]', `Arena ${timestamp}`);
  await page.fill('textarea', 'Description test');
  await page.fill('input[placeholder="Building number, street address"]', 'Address Line 1');
  await page.click('button:has-text("Next Step")');
  await page.waitForTimeout(500);

  let errText = await page.locator('.text-rose-600, .text-error').innerText().catch(() => null);
  let stepText = await page.locator('h2').innerText().catch(() => 'No H2');
  console.log('After Step 1 Next:', stepText, '| Error:', errText);

  // Step 2
  await page.fill('input[placeholder="+91 98765 43210"]', '+919876543210');
  await page.fill('input[placeholder="contact@esportsarena.in"]', email);
  await page.fill('input[placeholder="ABCDE1234F"]', 'ABCDE1234F');
  await page.fill('input[placeholder="29ABCDE1234F1Z5"]', '29ABCDE1234F1Z5');
  await page.fill('input[placeholder="https://drive.google.com/... or document link"]', 'https://example.com/license.pdf');
  await page.click('button:has-text("Next Step")');
  await page.waitForTimeout(500);

  errText = await page.locator('.text-rose-600, .text-error').innerText().catch(() => null);
  stepText = await page.locator('h2').innerText().catch(() => 'No H2');
  console.log('After Step 2 Next:', stepText, '| Error:', errText);

  // Step 3
  await page.fill('input[placeholder="e.g. LXG Gaming Private Limited"]', 'Test Account');
  await page.fill('input[placeholder="9180200192847291"]', '123456789012');
  await page.fill('input[placeholder="HDFC0000128"]', 'SBIN0001234');
  await page.click('button:has-text("Next Step")');
  await page.waitForTimeout(500);

  errText = await page.locator('.text-rose-600, .text-error').innerText().catch(() => null);
  stepText = await page.locator('h2').innerText().catch(() => 'No H2');
  console.log('After Step 3 Next:', stepText, '| Error:', errText);

  // Step 4
  await page.click('button:has-text("Next Step")');
  await page.waitForTimeout(500);

  errText = await page.locator('.text-rose-600, .text-error').innerText().catch(() => null);
  stepText = await page.locator('h2').innerText().catch(() => 'No H2');
  console.log('After Step 4 Next:', stepText, '| Error:', errText);

  // Step 5
  await page.click('button:has-text("Next Step")');
  await page.waitForTimeout(500);

  errText = await page.locator('.text-rose-600, .text-error').innerText().catch(() => null);
  stepText = await page.locator('h2').innerText().catch(() => 'No H2');
  console.log('After Step 5 Next:', stepText, '| Error:', errText);

  const submitVisible = await page.locator('button:has-text("Submit Café Application")').isVisible().catch(() => false);
  console.log('Submit button visible:', submitVisible);

  await browser.close();
})();
