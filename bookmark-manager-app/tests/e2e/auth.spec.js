import { test, expect } from '@playwright/test';
import { testData } from './fixtures/test-data';

test.describe('Authentication', () => {
  test('should display login page', async ({ page }) => {
    await page.goto('/login');
    
    // Check page elements
    await expect(page).toHaveTitle(/Bookmark Manager/);
    await expect(page.locator('h2')).toContainText('Sign in to your account');
    await expect(page.locator('input[name="email"]')).toBeVisible();
    await expect(page.locator('input[name="password"]')).toBeVisible();
    await expect(page.locator('button[type="submit"]')).toContainText('Sign in');
  });

  test('should show error with invalid credentials', async ({ page }) => {
    await page.goto('/login');
    
    // Try invalid login
    await page.fill('input[name="email"]', 'invalid@example.com');
    await page.fill('input[name="password"]', 'wrongpassword');
    await page.click('button[type="submit"]');
    
    // Check for error message
    await expect(page.locator('[role="alert"]')).toContainText(/Invalid email or password/);
  });

  test('should login successfully with valid credentials', async ({ page }) => {
    await page.goto('/login');
    
    // Login with valid credentials
    await page.fill('input[name="email"]', testData.admin.email);
    await page.fill('input[name="password"]', testData.admin.password);
    await page.click('button[type="submit"]');
    
    // Should redirect to dashboard
    await page.waitForURL('**/dashboard');
    await expect(page).toHaveURL(/\/dashboard/);
    
    // Check user is logged in
    await expect(page.locator('text=Dashboard')).toBeVisible();
  });

  test('should logout successfully', async ({ page }) => {
    // Login first
    await page.goto('/login');
    await page.fill('input[name="email"]', testData.admin.email);
    await page.fill('input[name="password"]', testData.admin.password);
    await page.click('button[type="submit"]');
    await page.waitForURL('**/dashboard');
    
    // Find and click logout button
    await page.click('button[aria-label="User menu"]');
    await page.click('text=Logout');
    
    // Should redirect to login
    await page.waitForURL('**/login');
    await expect(page).toHaveURL(/\/login/);
  });

  test('should protect authenticated routes', async ({ page }) => {
    // Try to access dashboard without login
    await page.goto('/dashboard');
    
    // Should redirect to login
    await page.waitForURL('**/login');
    await expect(page).toHaveURL(/\/login/);
  });

  test('should persist login session', async ({ page, context }) => {
    // Login
    await page.goto('/login');
    await page.fill('input[name="email"]', testData.admin.email);
    await page.fill('input[name="password"]', testData.admin.password);
    await page.click('button[type="submit"]');
    await page.waitForURL('**/dashboard');
    
    // Create new page in same context
    const newPage = await context.newPage();
    await newPage.goto('/dashboard');
    
    // Should stay on dashboard (not redirect to login)
    await expect(newPage).toHaveURL(/\/dashboard/);
    await expect(newPage.locator('text=Dashboard')).toBeVisible();
    
    await newPage.close();
  });
});