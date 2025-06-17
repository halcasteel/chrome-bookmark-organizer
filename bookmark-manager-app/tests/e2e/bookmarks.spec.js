import { test, expect } from '@playwright/test';
import { testData } from './fixtures/test-data';

test.describe('Bookmarks Management', () => {
  test.beforeEach(async ({ page }) => {
    // Login before each test
    await page.goto('/login');
    await page.fill('input[name="email"]', testData.admin.email);
    await page.fill('input[name="password"]', testData.admin.password);
    await page.click('button[type="submit"]');
    await page.waitForURL('**/dashboard');
    
    // Navigate to bookmarks page
    await page.click('a[href="/bookmarks"]');
    await page.waitForURL('**/bookmarks');
  });

  test('should display bookmarks page', async ({ page }) => {
    await expect(page.locator('h1')).toContainText('Bookmarks');
    await expect(page.locator('button:has-text("Add Bookmark")')).toBeVisible();
    await expect(page.locator('input[placeholder*="Search"]')).toBeVisible();
  });

  test('should add a new bookmark', async ({ page }) => {
    // Click add bookmark button
    await page.click('button:has-text("Add Bookmark")');
    
    // Fill in bookmark details
    await page.fill('input[name="url"]', testData.bookmarks.valid.url);
    await page.fill('input[name="title"]', testData.bookmarks.valid.title);
    await page.fill('textarea[name="description"]', testData.bookmarks.valid.description);
    
    // Add tags
    for (const tag of testData.bookmarks.valid.tags) {
      await page.fill('input[placeholder*="Add tags"]', tag);
      await page.press('input[placeholder*="Add tags"]', 'Enter');
    }
    
    // Save bookmark
    await page.click('button:has-text("Save")');
    
    // Verify bookmark was added
    await expect(page.locator(`text=${testData.bookmarks.valid.title}`)).toBeVisible();
    await expect(page.locator(`text=${testData.bookmarks.valid.description}`)).toBeVisible();
  });

  test('should search bookmarks', async ({ page }) => {
    // Add a bookmark first
    await page.click('button:has-text("Add Bookmark")');
    await page.fill('input[name="url"]', testData.bookmarks.github.url);
    await page.fill('input[name="title"]', testData.bookmarks.github.title);
    await page.fill('textarea[name="description"]', testData.bookmarks.github.description);
    await page.click('button:has-text("Save")');
    
    // Search for the bookmark
    await page.fill('input[placeholder*="Search"]', 'GitHub');
    await page.press('input[placeholder*="Search"]', 'Enter');
    
    // Verify search results
    await expect(page.locator(`text=${testData.bookmarks.github.title}`)).toBeVisible();
  });

  test('should edit a bookmark', async ({ page }) => {
    // Add a bookmark first
    await page.click('button:has-text("Add Bookmark")');
    await page.fill('input[name="url"]', testData.bookmarks.google.url);
    await page.fill('input[name="title"]', testData.bookmarks.google.title);
    await page.click('button:has-text("Save")');
    
    // Click edit button on the bookmark
    await page.click(`[aria-label="Edit bookmark"]`);
    
    // Update the description
    await page.fill('textarea[name="description"]', 'Updated description for Google');
    await page.click('button:has-text("Save")');
    
    // Verify update
    await expect(page.locator('text=Updated description for Google')).toBeVisible();
  });

  test('should delete a bookmark', async ({ page }) => {
    // Add a bookmark first
    await page.click('button:has-text("Add Bookmark")');
    await page.fill('input[name="url"]', 'https://delete-me.com');
    await page.fill('input[name="title"]', 'Delete Me');
    await page.click('button:has-text("Save")');
    
    // Delete the bookmark
    await page.click(`[aria-label="Delete bookmark"]`);
    
    // Confirm deletion
    await page.click('button:has-text("Delete")');
    
    // Verify bookmark is gone
    await expect(page.locator('text=Delete Me')).not.toBeVisible();
  });

  test('should filter bookmarks by tag', async ({ page }) => {
    // Add bookmarks with different tags
    await page.click('button:has-text("Add Bookmark")');
    await page.fill('input[name="url"]', testData.bookmarks.github.url);
    await page.fill('input[name="title"]', testData.bookmarks.github.title);
    await page.fill('input[placeholder*="Add tags"]', 'development');
    await page.press('input[placeholder*="Add tags"]', 'Enter');
    await page.click('button:has-text("Save")');
    
    // Click on tag to filter
    await page.click('.tag:has-text("development")');
    
    // Verify filtered results
    await expect(page.locator(`text=${testData.bookmarks.github.title}`)).toBeVisible();
  });

  test('should bulk select and delete bookmarks', async ({ page }) => {
    // Add multiple bookmarks
    const bookmarks = [
      { url: 'https://bulk1.com', title: 'Bulk 1' },
      { url: 'https://bulk2.com', title: 'Bulk 2' },
      { url: 'https://bulk3.com', title: 'Bulk 3' },
    ];
    
    for (const bookmark of bookmarks) {
      await page.click('button:has-text("Add Bookmark")');
      await page.fill('input[name="url"]', bookmark.url);
      await page.fill('input[name="title"]', bookmark.title);
      await page.click('button:has-text("Save")');
    }
    
    // Select all bookmarks
    await page.click('input[type="checkbox"][aria-label="Select all"]');
    
    // Click bulk delete
    await page.click('button:has-text("Delete Selected")');
    await page.click('button:has-text("Confirm")');
    
    // Verify all are deleted
    for (const bookmark of bookmarks) {
      await expect(page.locator(`text=${bookmark.title}`)).not.toBeVisible();
    }
  });
});