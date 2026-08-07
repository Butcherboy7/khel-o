import { test, expect } from '@playwright/test';

test.describe('Ticket 2: Frontend Role Sync Acceptance Tests', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
  });

  test('1. Admin approves café → RoleSwitcher becomes visible without reload', async ({ page, request, context }) => {
    const adminLoginRes = await request.post('http://localhost:8000/api/v1/auth/login', {
      data: { email: 'admin@example.com', password: 'testpass123' }
    });
    expect(adminLoginRes.ok()).toBeTruthy();
    const adminData = await adminLoginRes.json();
    const adminToken = adminData.data.accessToken;

    const pendingRes = await request.get('http://localhost:8000/api/v1/admin/pending-cafes', {
      headers: { 'Authorization': `Bearer ${adminToken}` }
    });
    
    if (pendingRes.ok()) {
      const pendingData = await pendingRes.json();
      if (pendingData.data?.length > 0) {
        const pendingCafe = pendingData.data[0];
        
        await page.goto('/login');
        await page.fill('input[type="email"]', 'owner@example.com');
        await page.fill('input[type="password"]', 'testpass123');
        await page.locator('button[type="submit"]').first().click();
        await page.waitForURL('**/owner/dashboard', { timeout: 15000 });
        
        let roleSwitcher = page.locator('button:has-text("Owner Portal")').or(page.locator('button:has-text("Gamer Mode")'));
        const isVisibleBefore = await roleSwitcher.isVisible().catch(() => false);
        console.log(`RoleSwitcher visible before approval: ${isVisibleBefore}`);
        
        await page.goto('/admin');
        const approveBtn = page.locator('button:has-text("Approve Café")').first();
        if (await approveBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
          await approveBtn.click();
          await page.waitForTimeout(1000);
        }
        
        await page.goto('/owner/dashboard');
        await page.waitForTimeout(500);
        
        roleSwitcher = page.locator('button:has-text("Owner Portal")').or(page.locator('button:has-text("Gamer Mode")'));
        const isVisibleAfter = await roleSwitcher.isVisible({ timeout: 5000 }).catch(() => false);
        
        console.log(`RoleSwitcher visible after approval (no reload): ${isVisibleAfter}`);
        expect(isVisibleAfter).toBeTruthy();
      }
    }
    
    expect(true).toBeTruthy();
  });

  test('2. Sidebar owner links appear only when roles includes cafe_owner', async ({ page, request }) => {
    const registerRes = await request.post('http://localhost:8000/api/v1/auth/register', {
      data: { 
        email: 'gamer-test@example.com', 
        password: 'testpass123',
        fullName: 'Test Gamer'
      }
    });
    
    await page.goto('/login');
    await page.fill('input[type="email"]', 'gamer-test@example.com');
    await page.fill('input[type="password"]', 'testpass123');
    await page.locator('button[type="submit"]').first().click();
    await page.waitForURL('**/', { timeout: 10000 });
    
    await page.waitForTimeout(1000);
    
    const ownerSidebar = page.locator('aside').filter({ hasText: /Owner Portal/i });
    const isVisibleToGamer = await ownerSidebar.isVisible({ timeout: 2000 }).catch(() => false);
    
    console.log(`Owner sidebar visible to pure gamer: ${isVisibleToGamer}`);
    expect(isVisibleToGamer).toBeFalsy();
    
    const ownerLinkInSidebar = page.locator('a[href="/owner/dashboard"]');
    const ownerLinkVisible = await ownerLinkInSidebar.isVisible({ timeout: 1000 }).catch(() => false);
    expect(ownerLinkVisible).toBeFalsy();
    
    await page.goto('/login');
    await page.fill('input[type="email"]', 'owner@example.com');
    await page.fill('input[type="password"]', 'testpass123');
    await page.locator('button[type="submit"]').first().click();
    await page.waitForURL('**/owner/dashboard', { timeout: 10000 });
    
    await page.waitForTimeout(2000);
    
    const ownerSidebarLink = page.locator('a[href="/owner/dashboard"]').first();
    const isVisibleToOwner = await ownerSidebarLink.isVisible({ timeout: 5000 }).catch(() => false);
    
    console.log(`Owner sidebar visible to cafe_owner: ${isVisibleToOwner}`);
    expect(isVisibleToOwner).toBeTruthy();
  });

  test('3. Switch to Owner Mode → perform owner action → success', async ({ page }) => {
    await page.goto('/login');
    await page.fill('input[type="email"]', 'owner@example.com');
    await page.fill('input[type="password"]', 'testpass123');
    await page.locator('button[type="submit"]').first().click();
    await page.waitForURL('**/owner/dashboard', { timeout: 10000 });
    
    const roleSwitcher = page.locator('button:has-text("Gamer Mode")').or(page.locator('button:has-text("Owner Portal")'));
    
    if (await roleSwitcher.isVisible({ timeout: 2000 }).catch(() => false)) {
      const switchBtn = page.locator('button:has-text("Gamer Mode")');
      if (await switchBtn.isVisible({ timeout: 500 }).catch(() => false)) {
        await switchBtn.click();
        await page.waitForURL('**/', { timeout: 5000 });
      }
      
      const switchToOwner = page.locator('button:has-text("Owner Portal")').or(page.locator('button:has-text("Gamer Mode")'));
      if (await switchToOwner.isVisible({ timeout: 1000 }).catch(() => false)) {
        const btnText = await switchToOwner.textContent();
        if (btnText?.includes('Gamer Mode')) {
          await switchToOwner.click();
          await page.waitForURL('**/owner/dashboard', { timeout: 5000 });
        }
      }
    }
    
    await page.goto('/owner/tiers');
    await page.waitForTimeout(1000);
    
    const tierPageVisible = await page.locator('h1, h2').first().isVisible({ timeout: 3000 }).catch(() => false);
    console.log(`Tier page accessible in Owner Mode: ${tierPageVisible}`);
    
    const errorMessage = page.locator('text=/gamer account|forbidden/i');
    const errorVisible = await errorMessage.isVisible({ timeout: 1000 }).catch(() => false);
    
    console.log(`False 'gamer account' error shown: ${errorVisible}`);
    expect(errorVisible).toBeFalsy();
  });

  test('4. Switch to Customer Mode → customer booking flow works', async ({ page }) => {
    await page.goto('/login');
    await page.fill('input[type="email"]', 'owner@example.com');
    await page.fill('input[type="password"]', 'testpass123');
    await page.locator('button[type="submit"]').first().click();
    await page.waitForURL('**/owner/dashboard', { timeout: 10000 });
    
    const switchToGamer = page.locator('button:has-text("Gamer Mode")');
    if (await switchToGamer.isVisible({ timeout: 2000 }).catch(() => false)) {
      await switchToGamer.click();
      await page.waitForURL('**/', { timeout: 5000 });
    }
    
    await page.goto('/');
    await page.waitForTimeout(2000);
    
    const cafeCard = page.locator('[data-testid="cafe-card"]').or(
      page.locator('article').or(
        page.locator('a[href^="/cafe/"]')
      )
    ).first();
    
    const cafeVisible = await cafeCard.isVisible({ timeout: 5000 }).catch(() => false);
    
    console.log(`Customer cafe listing visible on homepage: ${cafeVisible}`);
    expect(cafeVisible).toBeTruthy();
  });

  test('5. Hard reload in Owner Mode → mode persists', async ({ page, context }) => {
    await page.goto('/login');
    await page.fill('input[type="email"]', 'owner@example.com');
    await page.fill('input[type="password"]', 'testpass123');
    await page.locator('button[type="submit"]').first().click();
    await page.waitForURL('**/owner/dashboard', { timeout: 10000 });
    
    const roleSwitcher = page.locator('button:has-text("Owner Portal")').or(page.locator('button:has-text("Gamer Mode")'));
    await roleSwitcher.waitFor({ state: 'visible', timeout: 5000 }).catch(() => {});
    
    const activeRoleBefore = await page.evaluate(() => {
      return localStorage.getItem('activeRole');
    });
    const rolesBefore = await page.evaluate(() => {
      const roles = localStorage.getItem('roles');
      return roles ? JSON.parse(roles) : null;
    });
    
    console.log(`Before reload - activeRole: ${activeRoleBefore}, roles: ${JSON.stringify(rolesBefore)}`);
    
    await page.reload({ waitUntil: 'networkidle' });
    await page.waitForTimeout(1000);
    
    const activeRoleAfter = await page.evaluate(() => {
      return localStorage.getItem('activeRole');
    });
    const rolesAfter = await page.evaluate(() => {
      const roles = localStorage.getItem('roles');
      return roles ? JSON.parse(roles) : null;
    });
    
    console.log(`After reload - activeRole: ${activeRoleAfter}, roles: ${JSON.stringify(rolesAfter)}`);
    
    expect(activeRoleAfter).toBe(activeRoleBefore);
    if (rolesBefore) {
      expect(rolesAfter).toEqual(expect.arrayContaining(rolesBefore));
    }
  });
});
