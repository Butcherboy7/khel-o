import { test as base } from '@playwright/test';

type Fixtures = {
  authenticatedPage: import('@playwright/test').Page;
};

export const test = base.extend<Fixtures>({
  authenticatedPage: async ({ page }, use) => {
    await page.goto('/login');
    
    await page.evaluate(() => {
      const mockUser = {
        id: 'baf66a1e-248a-450f-959f-2f614e8201dd',
        email: 'test@khelo.com',
        fullName: 'Test User',
        role: 'gamer'
      };
      const mockToken = 'test-token';
      
      localStorage.setItem('khelo_user', JSON.stringify(mockUser));
      localStorage.setItem('khelo_token', mockToken);
    });
    
    await page.goto('/');
    await use(page);
  },
});

export { expect } from '@playwright/test';
