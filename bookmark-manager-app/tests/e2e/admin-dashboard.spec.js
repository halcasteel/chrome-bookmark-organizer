import { test, expect } from '@playwright/test';
import { testData } from './fixtures/test-data';

test.describe('Admin Dashboard', () => {
  test.beforeEach(async ({ page }) => {
    // Login as admin
    await page.goto('/login');
    await page.fill('input[name="email"]', testData.admin.email);
    await page.fill('input[name="password"]', testData.admin.password);
    await page.click('button[type="submit"]');
    await page.waitForURL('**/dashboard');
    
    // Navigate to admin dashboard
    await page.click('a[href="/admin"]');
    await page.waitForURL('**/admin');
  });

  test('should display admin dashboard', async ({ page }) => {
    await expect(page.locator('h1')).toContainText('Admin Dashboard');
    
    // Check all tabs are present
    await expect(page.locator('button:has-text("System Health")')).toBeVisible();
    await expect(page.locator('button:has-text("Logs Viewer")')).toBeVisible();
    await expect(page.locator('button:has-text("Log Analytics")')).toBeVisible();
    await expect(page.locator('button:has-text("AI Insights")')).toBeVisible();
    await expect(page.locator('button:has-text("Alerts")')).toBeVisible();
    await expect(page.locator('button:has-text("User Activity")')).toBeVisible();
  });

  test('should show system health status', async ({ page }) => {
    // System Health tab should be active by default
    await expect(page.locator('[role="tabpanel"]')).toContainText('System Status');
    
    // Check service statuses
    await expect(page.locator('text=Database')).toBeVisible();
    await expect(page.locator('text=Redis')).toBeVisible();
    await expect(page.locator('text=Backend')).toBeVisible();
    await expect(page.locator('text=Workers')).toBeVisible();
    
    // Check for status indicators
    const statusIndicators = page.locator('[data-testid="status-indicator"]');
    await expect(statusIndicators).toHaveCount(4);
  });

  test('should display logs in Logs Viewer', async ({ page }) => {
    // Click on Logs Viewer tab
    await page.click('button:has-text("Logs Viewer")');
    
    // Check log viewer elements
    await expect(page.locator('input[placeholder*="Search logs"]')).toBeVisible();
    await expect(page.locator('select[aria-label="Log level filter"]')).toBeVisible();
    await expect(page.locator('select[aria-label="Service filter"]')).toBeVisible();
    
    // Check for log entries
    await expect(page.locator('[data-testid="log-entry"]').first()).toBeVisible({ timeout: 10000 });
  });

  test('should filter logs by level', async ({ page }) => {
    await page.click('button:has-text("Logs Viewer")');
    
    // Select error level
    await page.selectOption('select[aria-label="Log level filter"]', 'error');
    
    // Verify filtered results
    const logEntries = page.locator('[data-testid="log-entry"]');
    const count = await logEntries.count();
    
    if (count > 0) {
      // All visible logs should be error level
      const levels = await logEntries.locator('[data-testid="log-level"]').allTextContents();
      levels.forEach(level => {
        expect(level.toLowerCase()).toBe('error');
      });
    }
  });

  test('should search logs', async ({ page }) => {
    await page.click('button:has-text("Logs Viewer")');
    
    // Search for specific term
    await page.fill('input[placeholder*="Search logs"]', 'database');
    await page.press('input[placeholder*="Search logs"]', 'Enter');
    
    // Wait for search results
    await page.waitForTimeout(1000);
    
    // Verify search results contain the term
    const logMessages = await page.locator('[data-testid="log-message"]').allTextContents();
    if (logMessages.length > 0) {
      expect(logMessages.some(msg => msg.toLowerCase().includes('database'))).toBe(true);
    }
  });

  test('should display analytics charts', async ({ page }) => {
    await page.click('button:has-text("Log Analytics")');
    
    // Check for chart elements
    await expect(page.locator('text=Time Series')).toBeVisible();
    await expect(page.locator('text=Service Breakdown')).toBeVisible();
    await expect(page.locator('text=Error Patterns')).toBeVisible();
    
    // Check for chart containers
    await expect(page.locator('[data-testid="time-series-chart"]')).toBeVisible();
    await expect(page.locator('[data-testid="service-breakdown-chart"]')).toBeVisible();
  });

  test('should show AI insights', async ({ page }) => {
    await page.click('button:has-text("AI Insights")');
    
    // Check insights section
    await expect(page.locator('text=/insights|analysis/i')).toBeVisible();
    
    // If there are insights, check their structure
    const insights = page.locator('[data-testid="ai-insight"]');
    const count = await insights.count();
    
    if (count > 0) {
      const firstInsight = insights.first();
      await expect(firstInsight.locator('[data-testid="insight-severity"]')).toBeVisible();
      await expect(firstInsight.locator('[data-testid="insight-title"]')).toBeVisible();
    }
  });

  test('should display user activity', async ({ page }) => {
    await page.click('button:has-text("User Activity")');
    
    // Check activity elements
    await expect(page.locator('text=Recent Activities')).toBeVisible();
    await expect(page.locator('text=Top Users')).toBeVisible();
    
    // Check for activity entries
    const activities = page.locator('[data-testid="activity-entry"]');
    if (await activities.count() > 0) {
      const firstActivity = activities.first();
      await expect(firstActivity.locator('[data-testid="activity-user"]')).toBeVisible();
      await expect(firstActivity.locator('[data-testid="activity-action"]')).toBeVisible();
      await expect(firstActivity.locator('[data-testid="activity-time"]')).toBeVisible();
    }
  });

  test('should auto-refresh system health', async ({ page }) => {
    // Stay on System Health tab
    const initialUptime = await page.locator('[data-testid="backend-uptime"]').textContent();
    
    // Wait for auto-refresh (30 seconds)
    await page.waitForTimeout(31000);
    
    // Check if uptime has changed
    const updatedUptime = await page.locator('[data-testid="backend-uptime"]').textContent();
    expect(updatedUptime).not.toBe(initialUptime);
  });

  test('should export logs', async ({ page }) => {
    await page.click('button:has-text("Logs Viewer")');
    
    // Set up download promise before clicking
    const downloadPromise = page.waitForEvent('download');
    
    // Click export button
    await page.click('button[aria-label="Export logs"]');
    
    // Wait for download
    const download = await downloadPromise;
    
    // Verify download
    expect(download.suggestedFilename()).toMatch(/logs.*\.csv$/);
  });

  test('non-admin should not access admin dashboard', async ({ page, context }) => {
    // Create a new page and try to access admin dashboard directly
    const newPage = await context.newPage();
    
    // Logout first
    await page.click('button[aria-label="User menu"]');
    await page.click('text=Logout');
    
    // Try to access admin dashboard
    await newPage.goto('/admin');
    
    // Should redirect to login or show access denied
    const url = newPage.url();
    expect(url).toMatch(/login|unauthorized/);
    
    await newPage.close();
  });
});