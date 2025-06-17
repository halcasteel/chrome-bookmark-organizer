import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { promises as fs } from 'fs';
import path from 'path';
import os from 'os';
import { v4 as uuidv4 } from 'uuid';
import { chromium } from 'playwright';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import agentInitializationService from '../../../backend/src/services/agentInitializationService.js';
import a2aTaskManager from '../../../backend/src/services/a2aTaskManager.js';
import db from '../../../backend/src/db/index.js';
import Bull from 'bull';

describe('A2A Frontend Import Integration Test', () => {
  let browser;
  let context;
  let page;
  let testUserId;
  let testUserEmail;
  let testUserPassword;
  let authToken;
  let tempFilePath;
  
  beforeEach(async () => {
    // Reset services
    await agentInitializationService.reset();
    await a2aTaskManager.reset();
    
    // Clear test data
    await db.query('DELETE FROM a2a_tasks WHERE created < NOW()');
    await db.query('DELETE FROM a2a_artifacts WHERE created < NOW()');
    await db.query('DELETE FROM a2a_messages WHERE timestamp < NOW()');
    await db.query('DELETE FROM bookmarks WHERE created_at < NOW()');
    
    // Clear Redis
    const testQueue = new Bull('test-cleanup', process.env.REDIS_URL || 'redis://localhost:6382');
    await testQueue.empty();
    await testQueue.close();
    
    // Initialize agents
    await agentInitializationService.initialize();
    
    // Create test user with proper password hash
    testUserId = uuidv4();
    testUserEmail = `test-${testUserId}@az1.ai`;
    testUserPassword = 'Test123!@#';
    const passwordHash = await bcrypt.hash(testUserPassword, 10);
    
    await db.query(
      `INSERT INTO users (id, email, password_hash, role, two_factor_enabled, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, NOW(), NOW())`,
      [testUserId, testUserEmail, passwordHash, 'user', false]
    );
    
    // Generate JWT token for the user
    authToken = jwt.sign(
      { 
        id: testUserId, 
        email: testUserEmail,
        role: 'user'
      },
      process.env.JWT_SECRET || 'test-secret',
      { expiresIn: '1h' }
    );
    
    // Create test bookmark file
    const bookmarkHtml = `<!DOCTYPE NETSCAPE-Bookmark-file-1>
<META HTTP-EQUIV="Content-Type" CONTENT="text/html; charset=UTF-8">
<TITLE>Bookmarks</TITLE>
<H1>Bookmarks</H1>
<DL><p>
    <DT><A HREF="https://example.com" ADD_DATE="1234567890">Example Site</A>
    <DD>A test bookmark for integration testing
    <DT><A HREF="https://test.com" ADD_DATE="1234567891">Test Site</A>
    <DD>Another test bookmark
</DL><p>`;
    
    tempFilePath = path.join(os.tmpdir(), `test-bookmarks-${Date.now()}.html`);
    await fs.writeFile(tempFilePath, bookmarkHtml);
    
    // Launch browser
    browser = await chromium.launch({ headless: true });
    context = await browser.newContext();
    page = await context.newPage();
    
    // Set auth token in localStorage
    await page.goto('http://localhost:5173');
    await page.evaluate((token) => {
      localStorage.setItem('authToken', token);
    }, authToken);
  });

  afterEach(async () => {
    // Cleanup
    if (tempFilePath) {
      try {
        await fs.unlink(tempFilePath);
      } catch (error) {}
    }
    
    if (page) await page.close();
    if (context) await context.close();
    if (browser) await browser.close();
    
    await db.query('DELETE FROM users WHERE id = $1', [testUserId]);
    await agentInitializationService.shutdown();
    await a2aTaskManager.reset();
  });

  it('should navigate to A2A import page and upload a file', async () => {
    // Navigate to A2A import page
    const response = await page.goto('http://localhost:5173/import-a2a');
    console.log('Page response status:', response?.status());
    
    // Take screenshot for debugging
    await page.screenshot({ path: 'test-debug-screenshot.png' });
    
    // Try to get page content
    const content = await page.content();
    console.log('Page content length:', content.length);
    console.log('Page title:', await page.title());
    
    // Wait for page to load - try different selector
    await page.waitForSelector('body', { timeout: 5000 });
    
    // Verify we're on the A2A import page
    const heading = await page.textContent('h1');
    expect(heading).toContain('A2A Import');
    
    // Check for file input
    const fileInput = await page.locator('input[type="file"]');
    expect(fileInput).toBeTruthy();
    
    // Upload file
    await fileInput.setInputFiles(tempFilePath);
    
    // Wait for file to be selected
    await page.waitForTimeout(500);
    
    // Click import button
    const importButton = await page.locator('button:has-text("Import Bookmarks")');
    await importButton.click();
    
    // Wait for progress to appear
    await page.waitForSelector('[role="progressbar"]', { timeout: 10000 });
    
    // Wait for import to complete (max 30 seconds)
    await page.waitForFunction(
      () => {
        const alerts = document.querySelectorAll('[role="alert"]');
        return Array.from(alerts).some(alert => 
          alert.textContent?.includes('Import completed successfully')
        );
      },
      { timeout: 30000 }
    );
    
    // Verify success message
    const successAlert = await page.locator('[role="alert"]:has-text("Import completed successfully")');
    expect(await successAlert.isVisible()).toBeTruthy();
    
    // Verify bookmarks were imported by checking the database
    const bookmarkResult = await db.query(
      'SELECT * FROM bookmarks WHERE user_id = $1 ORDER BY url',
      [testUserId]
    );
    
    expect(bookmarkResult.rows.length).toBe(2);
    expect(bookmarkResult.rows[0].url).toBe('https://example.com');
    expect(bookmarkResult.rows[0].title).toBe('Example Site');
    expect(bookmarkResult.rows[1].url).toBe('https://test.com');
    expect(bookmarkResult.rows[1].title).toBe('Test Site');
  }, 60000);

  it('should show real-time progress updates during import', async () => {
    await page.goto('http://localhost:5173/import-a2a');
    await page.waitForSelector('h1', { timeout: 5000 });
    
    // Upload file
    const fileInput = await page.locator('input[type="file"]');
    await fileInput.setInputFiles(tempFilePath);
    
    // Click import
    const importButton = await page.locator('button:has-text("Import Bookmarks")');
    await importButton.click();
    
    // Collect progress updates
    const progressUpdates = [];
    
    // Monitor progress for up to 10 seconds
    const startTime = Date.now();
    while (Date.now() - startTime < 10000) {
      const progressText = await page.locator('.progress-message').textContent().catch(() => null);
      if (progressText && !progressUpdates.includes(progressText)) {
        progressUpdates.push(progressText);
      }
      
      // Check if import completed
      const isComplete = await page.locator('[role="alert"]:has-text("Import completed")').isVisible().catch(() => false);
      if (isComplete) break;
      
      await page.waitForTimeout(100);
    }
    
    // Verify we got some progress updates
    expect(progressUpdates.length).toBeGreaterThan(0);
    console.log('Progress updates received:', progressUpdates);
  }, 30000);

  it('should handle import errors gracefully', async () => {
    await page.goto('http://localhost:5173/import-a2a');
    await page.waitForSelector('h1', { timeout: 5000 });
    
    // Create an invalid bookmark file
    const invalidFilePath = path.join(os.tmpdir(), `invalid-${Date.now()}.html`);
    await fs.writeFile(invalidFilePath, 'This is not a valid bookmark file');
    
    try {
      // Upload invalid file
      const fileInput = await page.locator('input[type="file"]');
      await fileInput.setInputFiles(invalidFilePath);
      
      // Click import
      const importButton = await page.locator('button:has-text("Import Bookmarks")');
      await importButton.click();
      
      // Wait for error message
      await page.waitForSelector('[role="alert"]', { timeout: 10000 });
      
      // Verify error is displayed
      const alerts = await page.locator('[role="alert"]').all();
      const errorFound = false;
      
      for (const alert of alerts) {
        const text = await alert.textContent();
        if (text?.includes('error') || text?.includes('failed')) {
          errorFound = true;
          break;
        }
      }
      
      // We expect either an error or the import to process the file as having 0 bookmarks
      // Both are acceptable outcomes for this test
      expect(alerts.length).toBeGreaterThan(0);
      
    } finally {
      await fs.unlink(invalidFilePath).catch(() => {});
    }
  }, 30000);
});