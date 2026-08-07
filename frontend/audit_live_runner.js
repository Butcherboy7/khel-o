const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const SCREENSHOT_DIR = path.join(__dirname, 'audit_screenshots_live');
if (!fs.existsSync(SCREENSHOT_DIR)) {
  fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });
}

const auditResults = {
  flows: [],
  networkLogs: [],
  consoleLogs: []
};

function logNetwork(req, res, postData, responseBody) {
  auditResults.networkLogs.push({
    url: req.url(),
    method: req.method(),
    status: res ? res.status() : null,
    postData: postData || null,
    responseBody: responseBody || null,
    timestamp: new Date().toISOString()
  });
}

async function safeType(page, selector, text) {
  try {
    const el = await page.waitForSelector(selector, { state: 'visible', timeout: 5000 });
    if (el) {
      const currentVal = await page.inputValue(selector).catch(() => '');
      if (currentVal && currentVal.length > 0) {
        await page.fill(selector, '');
      }
      await page.type(selector, text, { delay: 20 });
    }
  } catch (err) {
    console.log(`Failed to type into ${selector}: ${err.message}`);
  }
}

(async () => {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const page = await context.newPage();

  page.on('console', msg => {
    auditResults.consoleLogs.push({
      type: msg.type(),
      text: msg.text(),
      timestamp: new Date().toISOString()
    });
  });

  page.on('request', req => {
    if (req.url().includes('/api/')) {
      req._postData = req.postData();
    }
  });

  page.on('response', async res => {
    const req = res.request();
    if (req.url().includes('/api/')) {
      let resBody = null;
      try {
        resBody = await res.text();
      } catch (e) {
        resBody = '[Unable to read body]';
      }
      logNetwork(req, res, req._postData, resBody);
    }
  });

  console.log('--- Starting Complete Live QA Audit (10 Flows) ---');

  // ==========================================
  // FLOW 1: Customer Browse -> Detail -> Book -> Razorpay Failure
  // ==========================================
  console.log('Running Flow 1...');
  let flow1 = { flow: 1, name: 'Customer: Browse -> Detail -> Book -> Razorpay Failure', steps: [] };

  try {
    await page.goto('http://localhost:3000/register');
    await page.waitForTimeout(1000);
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, 'flow1_01_register_before.png') });
    
    const timestamp = Date.now();
    const customerEmail = `qa_gamer_${timestamp}@test.com`;
    
    await safeType(page, 'input[placeholder*="Rahul"], input[type="text"]', 'QA Gamer Live');
    await safeType(page, 'input[type="email"]', customerEmail);
    await safeType(page, 'input[type="password"]', 'Password123!');
    await safeType(page, 'input[type="tel"]', '9876543210');
    
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, 'flow1_02_register_filled.png') });
    await page.click('button[type="submit"]');
    await page.waitForTimeout(2500);
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, 'flow1_03_register_after.png') });

    flow1.steps.push({
      step: '1a. Register Customer',
      expected: '201 Created & redirected to home page',
      actual: `Landed on route ${page.url()}`,
      evidence: { url: page.url() }
    });

    await page.goto('http://localhost:3000/cafes');
    await page.waitForTimeout(1500);
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, 'flow1_04_cafes_list.png') });

    await page.goto('http://localhost:3000/cafe/fb4dfbdc-6257-40bc-848c-ca358898d92f');
    await page.waitForTimeout(2000);
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, 'flow1_05_cafe_detail.png') });

    flow1.steps.push({
      step: '1b. Open Cafe Detail',
      expected: 'Café detail page loaded with booking options',
      actual: `Loaded route ${page.url()}`,
      evidence: { url: page.url() }
    });

    const bookBtn = await page.$('button:has-text("Book"), button:has-text("Proceed"), button:has-text("Select Slot")');
    let bookClicked = false;
    if (bookBtn) {
      await bookBtn.click();
      bookClicked = true;
      await page.waitForTimeout(2000);
    }
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, 'flow1_06_after_book_click.png') });

    const domText = await page.innerText('body');
    const hasRetry = domText.includes('Retry') || domText.includes('Try Again');
    const hasCancel = domText.includes('Cancel');
    const hasSharePass = domText.includes('Share Pass') || domText.includes('QR Pass');

    flow1.steps.push({
      step: '1c. Book Slot & Razorpay Payment Failure State',
      expected: 'Payment modal opens OR Retry/Cancel/Share Pass state observable',
      actual: `Book clicked: ${bookClicked}. Retry button: ${hasRetry}, Cancel button: ${hasCancel}, Share Pass: ${hasSharePass}`,
      evidence: { bookClicked, hasRetry, hasCancel, hasSharePass, snippet: domText.substring(0, 300) }
    });
  } catch (err) {
    flow1.steps.push({ step: 'Error in Flow 1', error: err.message });
  }
  auditResults.flows.push(flow1);

  // ==========================================
  // FLOW 2: Customer Cafe Detail -> Back Button Location Persistence
  // ==========================================
  console.log('Running Flow 2...');
  let flow2 = { flow: 2, name: 'Customer: Cafe Detail -> Back Button Location Persistence', steps: [] };

  try {
    await page.goto('http://localhost:3000/cafes?city=Bengaluru');
    await page.waitForTimeout(1000);
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, 'flow2_01_browse_city_set.png') });

    await page.goto('http://localhost:3000/cafe/fb4dfbdc-6257-40bc-848c-ca358898d92f');
    await page.waitForTimeout(1000);
    
    await page.goBack();
    await page.waitForTimeout(1500);
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, 'flow2_02_after_back.png') });

    const currentUrl = page.url();
    const cityInputVal = await page.inputValue('input[placeholder*="City"], input[placeholder*="Location"]').catch(() => 'N/A');

    flow2.steps.push({
      step: '2a. Back Button City Filter Persistence',
      expected: 'City filter "Bengaluru" persists in URL/Input on returning to search',
      actual: `URL after back: ${currentUrl}. City input value: ${cityInputVal}`,
      evidence: { url: currentUrl, cityInputVal }
    });
  } catch (err) {
    flow2.steps.push({ step: 'Error in Flow 2', error: err.message });
  }
  auditResults.flows.push(flow2);

  // ==========================================
  // FLOW 3: Customer Notifications State
  // ==========================================
  console.log('Running Flow 3...');
  let flow3 = { flow: 3, name: 'Customer: Notifications -> Mark All Read -> Refresh', steps: [] };

  try {
    await page.goto('http://localhost:3000/notifications');
    await page.waitForTimeout(1500);
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, 'flow3_01_notifications_page.png') });

    const markAllReadBtn = await page.$('button:has-text("Mark all as read"), button:has-text("Clear All")');
    let markedRead = false;
    if (markAllReadBtn) {
      await markAllReadBtn.click();
      markedRead = true;
      await page.waitForTimeout(1000);
    }
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, 'flow3_02_after_mark_read.png') });

    await page.reload();
    await page.waitForTimeout(1500);
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, 'flow3_03_after_refresh.png') });

    const badgeEl = await page.$('[class*="badge"], [class*="notification-count"]');
    const badgeText = badgeEl ? await badgeEl.innerText() : 'No badge element found';

    flow3.steps.push({
      step: '3a. Mark All Read & Badge State After Refresh',
      expected: 'Badge count cleared or 0 after mark as read & refresh',
      actual: `Mark read clicked: ${markedRead}. Badge text after refresh: ${badgeText}`,
      evidence: { markedRead, badgeText, url: page.url() }
    });
  } catch (err) {
    flow3.steps.push({ step: 'Error in Flow 3', error: err.message });
  }
  auditResults.flows.push(flow3);

  // ==========================================
  // FLOW 4: New User Onboarding Route Entry
  // ==========================================
  console.log('Running Flow 4...');
  let flow4 = { flow: 4, name: 'New User: Become a Partner Route Landing', steps: [] };

  try {
    await page.goto('http://localhost:3000/register');
    const timestamp = Date.now();
    const ownerEmail = `qa_owner_${timestamp}@test.com`;

    await safeType(page, 'input[placeholder*="Rahul"], input[type="text"]', 'QA Owner Live');
    await safeType(page, 'input[type="email"]', ownerEmail);
    await safeType(page, 'input[type="password"]', 'Password123!');
    await safeType(page, 'input[type="tel"]', '9876543211');
    await page.click('button[type="submit"]');
    await page.waitForTimeout(2500);

    await page.goto('http://localhost:3000/owner/onboarding');
    await page.waitForTimeout(1500);
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, 'flow4_01_partner_landing.png') });
    
    const landedUrl = page.url();
    const domBody = await page.innerText('body');
    const isWizardDirect = domBody.includes('Business') || domBody.includes('Step') || landedUrl.includes('/onboarding');

    flow4.steps.push({
      step: '4a. Become a Partner Landing Route',
      expected: 'Intro landing page OR direct onboarding form',
      actual: `Landed on route: ${landedUrl}. Renders wizard directly: ${isWizardDirect}`,
      evidence: { landedUrl, isWizardDirect }
    });
  } catch (err) {
    flow4.steps.push({ step: 'Error in Flow 4', error: err.message });
  }
  auditResults.flows.push(flow4);

  // ==========================================
  // FLOW 5: Mid-Onboarding Sidebar Navigation Crash Check
  // ==========================================
  console.log('Running Flow 5...');
  let flow5 = { flow: 5, name: 'Mid-Onboarding Sidebar Navigation Crash Check', steps: [] };

  try {
    await page.goto('http://localhost:3000/owner/onboarding');
    await page.waitForTimeout(1500);

    const sidebarLinks = ['/owner/dashboard', '/owner/analytics', '/owner/bookings', '/owner/tiers'];
    for (const link of sidebarLinks) {
      await page.goto(`http://localhost:3000${link}`).catch(() => {});
      await page.waitForTimeout(1000);
      const urlNow = page.url();
      const bodyText = await page.innerText('body').catch(() => 'CRASH/BLANK');
      const isError = bodyText.includes('Application error') || bodyText.includes('Unhandled Runtime Error');

      await page.screenshot({ path: path.join(SCREENSHOT_DIR, `flow5_sidebar_${link.replace(/\//g, '_')}.png`) });

      flow5.steps.push({
        step: `5. Navigated to ${link} mid-onboarding`,
        expected: 'Page renders gracefully or redirects without crash',
        actual: `Route: ${urlNow}. Error state: ${isError}`,
        evidence: { route: urlNow, isError, snippet: bodyText.substring(0, 200) }
      });
    }
  } catch (err) {
    flow5.steps.push({ step: 'Error in Flow 5', error: err.message });
  }
  auditResults.flows.push(flow5);

  // ==========================================
  // FLOW 6: Complete Onboarding Form & Submit
  // ==========================================
  console.log('Running Flow 6...');
  let flow6 = { flow: 6, name: 'Complete Onboarding Form & Submit', steps: [] };

  try {
    await page.goto('http://localhost:3000/owner/onboarding');
    await page.waitForTimeout(1500);

    const cafeName = `Live Arena ${Date.now()}`;
    await safeType(page, 'input[placeholder*="Cafe Name"], input[placeholder*="Business Name"], input[type="text"]', cafeName);
    await safeType(page, 'textarea', 'Premier esports cafe in Bengaluru');

    await page.screenshot({ path: path.join(SCREENSHOT_DIR, 'flow6_01_form_filled.png') });

    const submitBtn = await page.$('button[type="submit"], button:has-text("Submit"), button:has-text("Next"), button:has-text("Continue")');
    if (submitBtn) {
      await submitBtn.click();
      await page.waitForTimeout(3000);
    }
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, 'flow6_02_after_submit.png') });

    const postSubmitUrl = page.url();
    const postSubmitBody = await page.innerText('body');

    flow6.steps.push({
      step: '6a. Submit Onboarding Form',
      expected: 'Form submits, POST /api/v1/owner/onboarding succeeds, redirect to pending/dashboard',
      actual: `Post-submit URL: ${postSubmitUrl}. Contains success text: ${postSubmitBody.includes('Success') || postSubmitBody.includes('Submitted')}`,
      evidence: { postSubmitUrl, bodySnippet: postSubmitBody.substring(0, 300) }
    });
  } catch (err) {
    flow6.steps.push({ step: 'Error in Flow 6', error: err.message });
  }
  auditResults.flows.push(flow6);

  // ==========================================
  // FLOW 7: Login as Admin & Check Pending Queue (No Refresh)
  // ==========================================
  console.log('Running Flow 7...');
  let flow7 = { flow: 7, name: 'Admin Pending Queue Real-Time Check', steps: [] };

  try {
    await page.goto('http://localhost:3000/login');
    await safeType(page, 'input[type="email"]', 'admin@khel.com');
    await safeType(page, 'input[type="password"]', 'Admin123!');
    await page.click('button[type="submit"]');
    await page.waitForTimeout(2000);

    await page.goto('http://localhost:3000/admin');
    await page.waitForTimeout(2000);
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, 'flow7_01_admin_pending_queue.png') });

    const adminBody = await page.innerText('body');
    const hasPendingQueue = adminBody.includes('Pending') || adminBody.includes('Approval Queue') || adminBody.includes('Cafés');

    flow7.steps.push({
      step: '7a. Admin Pending Queue Immediate Check',
      expected: 'Admin dashboard pending queue displays recent submissions without manual reload',
      actual: `Landed at ${page.url()}. Pending section present: ${hasPendingQueue}`,
      evidence: { url: page.url(), hasPendingQueue, adminBodySnippet: adminBody.substring(0, 400) }
    });
  } catch (err) {
    flow7.steps.push({ step: 'Error in Flow 7', error: err.message });
  }
  auditResults.flows.push(flow7);

  // ==========================================
  // FLOW 8: Approve Cafe as Admin & Capture API Response
  // ==========================================
  console.log('Running Flow 8...');
  let flow8 = { flow: 8, name: 'Admin Approval API Capture', steps: [] };

  try {
    const approveBtn = await page.$('button:has-text("Approve")');
    let approved = false;
    if (approveBtn) {
      await approveBtn.click();
      approved = true;
      await page.waitForTimeout(2000);
    }
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, 'flow8_01_after_approve.png') });

    flow8.steps.push({
      step: '8a. Approve Pending Cafe',
      expected: 'Approve API request sent (PATCH /api/v1/admin/cafes/{id}/approve), status 200',
      actual: `Approve button clicked: ${approved}`,
      evidence: { approved }
    });
  } catch (err) {
    flow8.steps.push({ step: 'Error in Flow 8', error: err.message });
  }
  auditResults.flows.push(flow8);

  // ==========================================
  // FLOW 9: Owner "Get Owner Dashboard" Behavior (No Reload)
  // ==========================================
  console.log('Running Flow 9...');
  let flow9 = { flow: 9, name: 'Owner "Get Owner Dashboard" (No Reload)', steps: [] };

  try {
    await page.goto('http://localhost:3000/owner/dashboard');
    await page.waitForTimeout(1500);
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, 'flow9_01_owner_dashboard_no_reload.png') });

    const ctaBtn = await page.$('button:has-text("Get Owner Dashboard"), a:has-text("Get Owner Dashboard")');
    let ctaClicked = false;
    if (ctaBtn) {
      await ctaBtn.click();
      ctaClicked = true;
      await page.waitForTimeout(1500);
    }
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, 'flow9_02_after_cta_click.png') });

    const ownerDom = await page.innerText('body');

    flow9.steps.push({
      step: '9a. Get Owner Dashboard CTA without manual reload',
      expected: 'Dashboard updates to reflect approved owner status',
      actual: `CTA clicked: ${ctaClicked}. Contains verified text: ${ownerDom.includes('Verified') || ownerDom.includes('Active')}`,
      evidence: { ctaClicked, snippet: ownerDom.substring(0, 300) }
    });
  } catch (err) {
    flow9.steps.push({ step: 'Error in Flow 9', error: err.message });
  }
  auditResults.flows.push(flow9);

  // ==========================================
  // FLOW 10: Manual Reload & Role Switcher
  // ==========================================
  console.log('Running Flow 10...');
  let flow10 = { flow: 10, name: 'Manual Reload & Role Switcher Verification', steps: [] };

  try {
    await page.reload();
    await page.waitForTimeout(2000);
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, 'flow10_01_after_reload.png') });

    const roleSwitcher = await page.$('[class*="role-switcher"], button:has-text("Switch Role"), select[aria-label*="role"]');
    const hasRoleSwitcher = !!roleSwitcher;

    if (roleSwitcher) {
      await roleSwitcher.click().catch(() => {});
      await page.waitForTimeout(1000);
    }
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, 'flow10_02_role_switcher_clicked.png') });

    flow10.steps.push({
      step: '10a. Manual Reload & Switch to Owner Role',
      expected: 'Role switcher appears on reload, switching role calls POST /api/v1/auth/switch-role',
      actual: `Has role switcher: ${hasRoleSwitcher}. Final route: ${page.url()}`,
      evidence: { hasRoleSwitcher, route: page.url() }
    });
  } catch (err) {
    flow10.steps.push({ step: 'Error in Flow 10', error: err.message });
  }
  auditResults.flows.push(flow10);

  fs.writeFileSync(path.join(__dirname, 'live_qa_audit_results.json'), JSON.stringify(auditResults, null, 2));
  console.log('--- Complete Live QA Audit Finished! Saved to live_qa_audit_results.json ---');

  await browser.close();
})();
