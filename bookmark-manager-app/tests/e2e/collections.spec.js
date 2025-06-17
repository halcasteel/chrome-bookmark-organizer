import { test, expect } from '@playwright/test';
import { testData } from './fixtures/test-data';

test.describe('Collections', () => {
  test.beforeEach(async ({ page }) => {
    // Login before each test
    await page.goto('/login');
    await page.fill('input[name="email"]', testData.admin.email);
    await page.fill('input[name="password"]', testData.admin.password);
    await page.click('button[type="submit"]');
    await page.waitForURL('**/dashboard');
    
    // Navigate to collections page
    await page.click('a[href="/collections"]');
    await page.waitForURL('**/collections');
  });

  test('should display collections page', async ({ page }) => {
    await expect(page.locator('h1')).toContainText('Collections');
    await expect(page.locator('button:has-text("Create Collection")')).toBeVisible();
  });

  test('should create a new collection', async ({ page }) => {
    // Click create collection
    await page.click('button:has-text("Create Collection")');
    
    // Fill in collection details
    await page.fill('input[name="name"]', testData.collections.work.name);
    await page.fill('textarea[name="description"]', testData.collections.work.description);
    
    // Select color
    await page.click('[data-testid="color-picker"]');
    await page.click(`[data-color="${testData.collections.work.color}"]`);
    
    // Save collection
    await page.click('button:has-text("Create")');
    
    // Verify collection was created
    await expect(page.locator(`text=${testData.collections.work.name}`)).toBeVisible();
    await expect(page.locator(`text=${testData.collections.work.description}`)).toBeVisible();
  });

  test('should add bookmarks to collection', async ({ page }) => {
    // Create a collection first
    await page.click('button:has-text("Create Collection")');
    await page.fill('input[name="name"]', testData.collections.personal.name);
    await page.fill('textarea[name="description"]', testData.collections.personal.description);
    await page.click('button:has-text("Create")');
    
    // Go to bookmarks page
    await page.click('a[href="/bookmarks"]');
    
    // Add a bookmark
    await page.click('button:has-text("Add Bookmark")');
    await page.fill('input[name="url"]', testData.bookmarks.google.url);
    await page.fill('input[name="title"]', testData.bookmarks.google.title);
    
    // Select collection
    await page.selectOption('select[name="collection"]', testData.collections.personal.name);
    
    // Save bookmark
    await page.click('button:has-text("Save")');
    
    // Go back to collections
    await page.click('a[href="/collections"]');
    
    // Click on the collection
    await page.click(`text=${testData.collections.personal.name}`);
    
    // Verify bookmark is in collection
    await expect(page.locator(`text=${testData.bookmarks.google.title}`)).toBeVisible();
  });

  test('should edit collection', async ({ page }) => {
    // Create a collection first
    await page.click('button:has-text("Create Collection")');
    await page.fill('input[name="name"]', 'Original Name');
    await page.fill('textarea[name="description"]', 'Original Description');
    await page.click('button:has-text("Create")');
    
    // Edit the collection
    await page.click('[aria-label="Edit collection"]');
    
    // Update name and description
    await page.fill('input[name="name"]', 'Updated Name');
    await page.fill('textarea[name="description"]', 'Updated Description');
    await page.click('button:has-text("Save")');
    
    // Verify updates
    await expect(page.locator('text=Updated Name')).toBeVisible();
    await expect(page.locator('text=Updated Description')).toBeVisible();
  });

  test('should delete collection', async ({ page }) => {
    // Create a collection to delete
    await page.click('button:has-text("Create Collection")');
    await page.fill('input[name="name"]', 'To Be Deleted');
    await page.fill('textarea[name="description"]', 'This will be deleted');
    await page.click('button:has-text("Create")');
    
    // Delete the collection
    await page.click('[aria-label="Delete collection"]');
    
    // Confirm deletion
    await page.click('button:has-text("Delete")');
    
    // Verify collection is gone
    await expect(page.locator('text=To Be Deleted')).not.toBeVisible();
  });

  test('should show collection statistics', async ({ page }) => {
    // Create a collection
    await page.click('button:has-text("Create Collection")');
    await page.fill('input[name="name"]', testData.collections.work.name);
    await page.fill('textarea[name="description"]', testData.collections.work.description);
    await page.click('button:has-text("Create")');
    
    // Check statistics
    const collectionCard = page.locator(`[data-testid="collection-card"]:has-text("${testData.collections.work.name}")`);
    await expect(collectionCard.locator('text=/0.*bookmarks/i')).toBeVisible();
  });

  test('should share collection', async ({ page }) => {
    // Create a collection
    await page.click('button:has-text("Create Collection")');
    await page.fill('input[name="name"]', 'Shared Collection');
    await page.fill('textarea[name="description"]', 'This is a shared collection');
    await page.click('button:has-text("Create")');
    
    // Click share button
    await page.click('[aria-label="Share collection"]');
    
    // Check share dialog
    await expect(page.locator('text=Share Collection')).toBeVisible();
    await expect(page.locator('[data-testid="share-link"]')).toBeVisible();
    
    // Copy share link
    await page.click('button:has-text("Copy Link")');
    
    // Verify copy notification
    await expect(page.locator('text=Link copied')).toBeVisible();
  });
});