import { test as base } from '@playwright/test';

export const test = base.extend({
  // Admin authenticated page
  adminPage: async ({ page }, use) => {
    // Login as admin
    await page.goto('/login');
    await page.fill('input[name="email"]', 'admin@az1.ai');
    await page.fill('input[name="password"]', 'changeme123');
    await page.click('button[type="submit"]');
    
    // Wait for redirect to dashboard
    await page.waitForURL('**/dashboard');
    
    // Use the authenticated page
    await use(page);
  },

  // Regular user authenticated page
  userPage: async ({ page }, use) => {
    // For now, use admin credentials (update when we have regular users)
    await page.goto('/login');
    await page.fill('input[name="email"]', 'admin@az1.ai');
    await page.fill('input[name="password"]', 'changeme123');
    await page.click('button[type="submit"]');
    
    await page.waitForURL('**/dashboard');
    
    await use(page);
  },
});