const { chromium } = require('@playwright/test');
const fs = require('fs');
const path = require('path');

const SCREENSHOT_DIR = 'C:/Users/ADMIN/.gemini/antigravity-ide/brain/f293d7a1-669c-4ec6-b565-b7c099624e2a/audit_screenshots';
const LOG_FILE = 'C:/Users/ADMIN/.gemini/antigravity-ide/brain/f293d7a1-669c-4ec6-b565-b7c099624e2a/audit_log.json';

if (!fs.existsSync(SCREENSHOT_DIR)) {
  fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });
}

let auditLog = [];
let networkLogs = [];
let consoleLogs = [];

function recordLog(entry) {
  auditLog.push({ timestamp: new Date().toISOString(), ...entry });
  console.log(`[AUDIT LOG] [${entry.step || 'INFO'}] ${entry.action}: ${entry.result}`);
}

async function takeScreenshot(page, name) {
  const filepath = path.join(SCREENSHOT_DIR, `${name}.png`);
  await page.screenshot({ path: filepath, fullPage: true });
  console.log(`[SCREENSHOT] Saved ${name}.png`);
  return filepath;
}

(async () => {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();

  page.on('console', msg => {
    consoleLogs.push({ type: msg.type(), text: msg.text() });
  });

  page.on('response', async response => {
    try {
      const request = response.request();
      if (request.url().includes('/api/')) {
        let responseBody = '';
        try {
          responseBody = await response.text();
        } catch (e) {
          responseBody = '[Unable to read body]';
        }
        networkLogs.push({
          url: request.url(),
          method: request.method(),
          status: response.status(),
          postData: request.postData(),
          responseBody: responseBody.slice(0, 1000)
        });
      }
    } catch (e) {
      // ignore
    }
  });

  console.log('--- STARTING SECTION A AUDIT ---');

  try {
    // Step 1: Register brand-new customer account
    console.log('\n--- Step 1: Register brand-new customer account ---');
    await page.goto('http://localhost:3000/register');
    await takeScreenshot(page, 'step_01_register_form_before');

    const testEmail = `audit_user_${Date.now()}@test.com`;
    const testPhone = '9876543210';
    const testPass = 'AuditPass123!';

    // Input fields: Full Name, Email Address, Phone Number, Password
    await page.fill('input[label="Full Name *"], input[placeholder="e.g. Rahul Sharma"]', 'Audit User One');
    await page.fill('input[type="email"]', testEmail);
    await page.fill('input[type="tel"]', testPhone);
    await page.fill('input[type="password"]', testPass);
    await takeScreenshot(page, 'step_01_register_form_filled');

    const [regResponse] = await Promise.all([
      page.waitForResponse(res => res.url().includes('/api/v1/auth/register')),
      page.click('button[type="submit"]')
    ]);

    await page.waitForTimeout(1000);
    await takeScreenshot(page, 'step_01_register_form_submitted');

    const regStatus = regResponse.status();
    const regText = await regResponse.text();

    recordLog({
      step: 'Step 1',
      action: 'Register brand-new customer account',
      testEmail,
      status: regStatus,
      response: regText,
      currentUrl: page.url(),
      result: regStatus === 200 || regStatus === 201 ? 'Success' : `Failed (Status ${regStatus})`
    });

    // Step 2: Attempt registration with invalid email format
    console.log('\n--- Step 2: Registration with invalid email format ---');
    await page.goto('http://localhost:3000/register');
    let apiCalledInStep2 = false;
    const step2Listener = res => {
      if (res.url().includes('/api/v1/auth/register')) apiCalledInStep2 = true;
    };
    page.on('response', step2Listener);

    await page.fill('input[placeholder="e.g. Rahul Sharma"]', 'Audit User Invalid Email');
    await page.fill('input[type="email"]', 'invalidemailformat');
    await page.fill('input[type="tel"]', '9876543210');
    await page.fill('input[type="password"]', 'AuditPass123!');
    await takeScreenshot(page, 'step_02_invalid_email_before');

    await page.click('button[type="submit"]');
    await page.waitForTimeout(500);
    await takeScreenshot(page, 'step_02_invalid_email_after');

    const emailErrorVisible = await page.locator('text=Please enter a valid email address').isVisible();
    page.off('response', step2Listener);

    recordLog({
      step: 'Step 2',
      action: 'Attempt registration with invalid email format',
      apiCalled: apiCalledInStep2,
      clientErrorVisible: emailErrorVisible,
      result: !apiCalledInStep2 && emailErrorVisible ? 'Rejected client-side correctly' : `API Called: ${apiCalledInStep2}, Error Visible: ${emailErrorVisible}`
    });

    // Step 3: Attempt registration with invalid phone number
    console.log('\n--- Step 3: Registration with invalid phone number ---');
    await page.goto('http://localhost:3000/register');
    let apiCalledInStep3 = false;
    const step3Listener = res => {
      if (res.url().includes('/api/v1/auth/register')) apiCalledInStep3 = true;
    };
    page.on('response', step3Listener);

    await page.fill('input[placeholder="e.g. Rahul Sharma"]', 'Audit User Invalid Phone');
    await page.fill('input[type="email"]', `valid_${Date.now()}@test.com`);
    await page.fill('input[type="tel"]', 'abcdefghij'); // invalid phone
    await page.fill('input[type="password"]', 'AuditPass123!');
    await takeScreenshot(page, 'step_03_invalid_phone_before');

    await page.click('button[type="submit"]');
    await page.waitForTimeout(500);
    await takeScreenshot(page, 'step_03_invalid_phone_after');

    const phoneErrorVisible = await page.locator('text=Please enter a valid Indian phone number').isVisible();
    page.off('response', step3Listener);

    recordLog({
      step: 'Step 3',
      action: 'Attempt registration with invalid phone number',
      apiCalled: apiCalledInStep3,
      clientErrorVisible: phoneErrorVisible,
      result: !apiCalledInStep3 && phoneErrorVisible ? 'Rejected client-side correctly' : `API Called: ${apiCalledInStep3}, Error Visible: ${phoneErrorVisible}`
    });

    // Step 4: Logout, log back in with correct credentials
    console.log('\n--- Step 4: Log out, log back in with correct credentials ---');
    await context.clearCookies();
    await page.evaluate(() => localStorage.clear());
    await page.goto('http://localhost:3000/login');
    await takeScreenshot(page, 'step_04_login_before');

    await page.fill('input[type="email"]', testEmail);
    await page.fill('input[type="password"]', testPass);

    const [loginResponse] = await Promise.all([
      page.waitForResponse(res => res.url().includes('/api/v1/auth/login')),
      page.click('button[type="submit"]')
    ]);

    await page.waitForTimeout(1000);
    await takeScreenshot(page, 'step_04_login_after');

    recordLog({
      step: 'Step 4',
      action: 'Log in with correct credentials',
      status: loginResponse.status(),
      currentUrl: page.url(),
      result: loginResponse.status() === 200 && page.url() === 'http://localhost:3000/' ? 'Success' : `Failed (Status ${loginResponse.status()}, URL ${page.url()})`
    });

    // Step 5: Attempt login with wrong password
    console.log('\n--- Step 5: Attempt login with wrong password ---');
    await context.clearCookies();
    await page.evaluate(() => localStorage.clear());
    await page.goto('http://localhost:3000/login');

    await page.fill('input[type="email"]', testEmail);
    await page.fill('input[type="password"]', 'WrongPassword123!');
    await takeScreenshot(page, 'step_05_wrong_password_before');

    const [wrongLoginRes] = await Promise.all([
      page.waitForResponse(res => res.url().includes('/api/v1/auth/login')),
      page.click('button[type="submit"]')
    ]);

    await page.waitForTimeout(500);
    await takeScreenshot(page, 'step_05_wrong_password_after');

    const errorBoxText = await page.locator('.text-error').innerText().catch(() => null);

    recordLog({
      step: 'Step 5',
      action: 'Attempt login with wrong password',
      status: wrongLoginRes.status(),
      errorDisplayed: errorBoxText,
      result: wrongLoginRes.status() === 401 && errorBoxText ? 'Proper error message shown' : `Unexpected result (Status ${wrongLoginRes.status()}, Text ${errorBoxText})`
    });

  } catch (err) {
    console.error('Execution Error:', err);
    recordLog({ step: 'ERROR', action: 'Exception', error: err.message, stack: err.stack });
  } finally {
    fs.writeFileSync(LOG_FILE, JSON.stringify({ auditLog, networkLogs, consoleLogs }, null, 2));
    await browser.close();
    console.log(`\nAudit log saved to ${LOG_FILE}`);
  }
})();
