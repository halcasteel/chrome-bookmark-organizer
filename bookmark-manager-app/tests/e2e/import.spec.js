import { test, expect } from '@playwright/test';
import { testData } from './fixtures/test-data';
import path from 'path';
import fs from 'fs';

test.describe('Bookmark Import', () => {
  let tempFilePath;

  test.beforeAll(async () => {
    // Create a temporary bookmark file for testing
    tempFilePath = path.join(process.cwd(), 'test-bookmarks.html');
    fs.writeFileSync(tempFilePath, testData.sampleBookmarkFile);
  });

  test.afterAll(async () => {
    // Clean up temporary file
    if (fs.existsSync(tempFilePath)) {
      fs.unlinkSync(tempFilePath);
    }
  });

  test.beforeEach(async ({ page }) => {
    // Login before each test
    await page.goto('/login');
    await page.fill('input[name="email"]', testData.admin.email);
    await page.fill('input[name="password"]', testData.admin.password);
    await page.click('button[type="submit"]');
    await page.waitForURL('**/dashboard');
    
    // Navigate to import page
    await page.click('a[href="/import"]');
    await page.waitForURL('**/import');
  });

  test('should display import page', async ({ page }) => {
    await expect(page.locator('h1')).toContainText('Import Bookmarks');
    await expect(page.locator('text=Drop your bookmark file here')).toBeVisible();
    await expect(page.locator('button:has-text("Choose File")')).toBeVisible();
  });

  test('should import bookmarks from file', async ({ page }) => {
    // Upload the file
    const fileChooserPromise = page.waitForEvent('filechooser');
    await page.click('button:has-text("Choose File")');
    const fileChooser = await fileChooserPromise;
    await fileChooser.setFiles(tempFilePath);
    
    // Wait for file to be processed
    await expect(page.locator('text=test-bookmarks.html')).toBeVisible();
    
    // Start import
    await page.click('button:has-text("Start Import")');
    
    // Wait for import to complete
    await expect(page.locator('text=Import completed')).toBeVisible({ timeout: 30000 });
    
    // Verify imported bookmarks count
    await expect(page.locator('text=/imported.*5.*bookmarks/i')).toBeVisible();
  });

  test('should show import progress', async ({ page }) => {
    // Upload file
    const fileChooserPromise = page.waitForEvent('filechooser');
    await page.click('button:has-text("Choose File")');
    const fileChooser = await fileChooserPromise;
    await fileChooser.setFiles(tempFilePath);
    
    // Start import
    await page.click('button:has-text("Start Import")');
    
    // Check progress indicators
    await expect(page.locator('[role="progressbar"]')).toBeVisible();
    await expect(page.locator('text=/Processing.*bookmarks/i')).toBeVisible();
  });

  test('should handle drag and drop import', async ({ page }) => {
    // Create a data transfer for drag and drop
    const dataTransfer = await page.evaluateHandle(() => new DataTransfer());
    
    // Read file content
    const fileContent = fs.readFileSync(tempFilePath, 'utf8');
    
    // Simulate drag and drop
    await page.dispatchEvent('[data-testid="drop-zone"]', 'drop', {
      dataTransfer,
      files: [{
        name: 'test-bookmarks.html',
        mimeType: 'text/html',
        buffer: Buffer.from(fileContent)
      }]
    });
    
    // Verify file is loaded
    await expect(page.locator('text=test-bookmarks.html')).toBeVisible();
  });

  test('should validate file type', async ({ page }) => {
    // Try to upload non-HTML file
    const invalidFile = path.join(process.cwd(), 'test.txt');
    fs.writeFileSync(invalidFile, 'This is not a bookmark file');
    
    const fileChooserPromise = page.waitForEvent('filechooser');
    await page.click('button:has-text("Choose File")');
    const fileChooser = await fileChooserPromise;
    await fileChooser.setFiles(invalidFile);
    
    // Should show error
    await expect(page.locator('[role="alert"]')).toContainText(/invalid file type|only.*html.*files/i);
    
    // Clean up
    fs.unlinkSync(invalidFile);
  });

  test('should show import history', async ({ page }) => {
    // First do an import
    const fileChooserPromise = page.waitForEvent('filechooser');
    await page.click('button:has-text("Choose File")');
    const fileChooser = await fileChooserPromise;
    await fileChooser.setFiles(tempFilePath);
    await page.click('button:has-text("Start Import")');
    await expect(page.locator('text=Import completed')).toBeVisible({ timeout: 30000 });
    
    // Check import history
    await page.click('button:has-text("View Import History")');
    await expect(page.locator('text=test-bookmarks.html')).toBeVisible();
    await expect(page.locator('text=/5.*bookmarks/i')).toBeVisible();
  });

  test('should handle WebSocket updates during import', async ({ page }) => {
    // Upload file
    const fileChooserPromise = page.waitForEvent('filechooser');
    await page.click('button:has-text("Choose File")');
    const fileChooser = await fileChooserPromise;
    await fileChooser.setFiles(tempFilePath);
    
    // Listen for WebSocket connection
    let wsConnected = false;
    page.on('websocket', ws => {
      wsConnected = true;
      ws.on('framereceived', frame => {
        const data = frame.payload;
        console.log('WebSocket frame received:', data);
      });
    });
    
    // Start import
    await page.click('button:has-text("Start Import")');
    
    // Verify WebSocket connection was established
    await page.waitForTimeout(1000);
    expect(wsConnected).toBe(true);
  });
});