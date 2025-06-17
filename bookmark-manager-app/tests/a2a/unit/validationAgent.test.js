import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { ValidationAgent } from '../../../backend/src/agents/validationAgentA2A.js';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import db from '../../../backend/src/db/index.js';
import unifiedLogger from '../../../backend/src/services/unifiedLogger.js';
import { v4 as uuidv4 } from 'uuid';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

describe('A2A Validation Agent - REAL TESTS', () => {
  let agent;
  let testUserId;
  let testEmail;
  let testBookmarkIds;
  
  beforeEach(async () => {
    // Generate unique IDs for each test to avoid conflicts
    testUserId = uuidv4();
    testEmail = `test-${Date.now()}-${Math.random().toString(36).substring(7)}@az1.ai`;
    testBookmarkIds = [];
    
    // Setup validation agent with real database
    agent = new ValidationAgent();
    
    // Create unique test user for this test run
    await db.query(
      `INSERT INTO users (id, email, password_hash, name, two_factor_enabled)
       VALUES ($1, $2, $3, $4, $5)`,
      [testUserId, testEmail, 'dummy-hash', 'Test User', false]
    );
    
    // Create test bookmarks with various URLs
    const testBookmarks = [
      { url: 'https://example.com', title: 'Example Site' },
      { url: 'https://github.com', title: 'GitHub' },
      { url: 'https://invalid-domain-that-does-not-exist.com', title: 'Invalid Domain' },
      { url: 'https://httpstat.us/404', title: '404 Test' },
      { url: 'https://httpstat.us/500', title: '500 Test' }
    ];
    
    for (const bookmark of testBookmarks) {
      const bookmarkId = uuidv4();
      testBookmarkIds.push(bookmarkId);
      
      await db.query(
        `INSERT INTO bookmarks (id, user_id, url, title, created_at)
         VALUES ($1, $2, $3, $4, NOW())`,
        [bookmarkId, testUserId, bookmark.url, bookmark.title]
      );
    }
    
    // Clean up any artifacts from previous runs
    await db.query('DELETE FROM a2a_artifacts WHERE agent_type = $1 AND task_id LIKE $2', ['validation', 'test-%']);
  });
  
  afterEach(async () => {
    // Clean up test data
    await db.query('DELETE FROM bookmarks WHERE user_id = $1', [testUserId]);
    await db.query('DELETE FROM a2a_artifacts WHERE agent_type = $1 AND task_id LIKE $2', ['validation', 'test-%']);
    await db.query('DELETE FROM users WHERE id = $1', [testUserId]);
    
    // Close browser if still open
    if (agent.browser) {
      await agent.closeBrowser();
    }
  });
  
  describe('Agent Configuration', () => {
    it('should have correct agent properties', () => {
      expect(agent.agentType).toBe('validation');
      expect(agent.version).toBe('1.0.0');
      expect(agent.capabilities.description).toContain('Validates bookmark URLs');
    });
    
    it('should declare validation capabilities', () => {
      const card = agent.getAgentCard();
      
      expect(card.capabilities.inputs).toHaveProperty('bookmarkIds');
      expect(card.capabilities.inputs.bookmarkIds.required).toBe(true);
      expect(card.capabilities.inputs).toHaveProperty('userId');
      expect(card.capabilities.inputs.userId.required).toBe(true);
      
      expect(card.capabilities.outputs.type).toBe('bookmark_validation_result');
      expect(card.capabilities.outputs.validatedCount).toBeDefined();
      expect(card.capabilities.outputs.failedCount).toBeDefined();
    });
  });
  
  describe('Browser Management', () => {
    it('should initialize Playwright browser', async () => {
      expect(agent.browser).toBeNull();
      
      await agent.initBrowser();
      
      expect(agent.browser).toBeDefined();
      expect(agent.browser.isConnected()).toBe(true);
      
      await agent.closeBrowser();
      expect(agent.browser).toBeNull();
    });
    
    it('should handle browser initialization errors gracefully', async () => {
      // This test might be tricky to simulate real browser failure
      // For now, just ensure cleanup works
      await agent.initBrowser();
      await agent.closeBrowser();
      
      // Try to close again - should not throw
      await expect(agent.closeBrowser()).resolves.not.toThrow();
    });
  });
  
  describe('Bookmark Validation', () => {
    it('should validate a valid URL successfully', async () => {
      await agent.initBrowser();
      
      const bookmark = {
        id: testBookmarkIds[0],
        url: 'https://example.com',
        title: 'Example Site'
      };
      
      const result = await agent.validateBookmark(bookmark);
      
      expect(result.isValid).toBe(true);
      expect(result.statusCode).toBe(200);
      expect(result.error).toBeNull();
      expect(result.validatedAt).toBeInstanceOf(Date);
      
      await agent.closeBrowser();
    });
    
    it('should detect invalid domain', async () => {
      await agent.initBrowser();
      
      const bookmark = {
        id: testBookmarkIds[2],
        url: 'https://invalid-domain-that-does-not-exist.com',
        title: 'Invalid Domain'
      };
      
      const result = await agent.validateBookmark(bookmark);
      
      expect(result.isValid).toBe(false);
      expect(result.error).toContain('Domain not found');
      
      await agent.closeBrowser();
    });
    
    it('should detect 404 errors', async () => {
      await agent.initBrowser();
      
      const bookmark = {
        id: testBookmarkIds[3],
        url: 'https://httpstat.us/404',
        title: '404 Test'
      };
      
      const result = await agent.validateBookmark(bookmark);
      
      // Log the result for debugging
      console.log('404 test result:', result);
      
      expect(result.isValid).toBe(false);
      // httpstat.us might be timing out, so check for either 404 or error
      if (result.statusCode) {
        expect(result.statusCode).toBe(404);
      } else {
        expect(result.error).toBeTruthy();
      }
      
      await agent.closeBrowser();
    });
    
    it('should extract page metadata', async () => {
      await agent.initBrowser();
      
      const bookmark = {
        id: testBookmarkIds[1],
        url: 'https://github.com',
        title: 'GitHub'
      };
      
      const result = await agent.validateBookmark(bookmark);
      
      expect(result.isValid).toBe(true);
      expect(result.title).toBeTruthy();
      // GitHub should have a description meta tag
      expect(result.description).toBeTruthy();
      
      await agent.closeBrowser();
    });
  });
  
  describe('Database Operations', () => {
    it('should fetch bookmarks for user', async () => {
      const bookmarks = await agent.fetchBookmarks(testBookmarkIds, testUserId);
      
      expect(bookmarks).toHaveLength(5);
      expect(bookmarks[0]).toHaveProperty('id');
      expect(bookmarks[0]).toHaveProperty('url');
      expect(bookmarks[0]).toHaveProperty('title');
    });
    
    it('should not fetch bookmarks for wrong user', async () => {
      const wrongUserId = uuidv4();
      const bookmarks = await agent.fetchBookmarks(testBookmarkIds, wrongUserId);
      
      expect(bookmarks).toHaveLength(0);
    });
    
    it('should update bookmark validation status', async () => {
      const bookmarkId = testBookmarkIds[0];
      const validation = {
        isValid: true,
        error: null,
        validatedAt: new Date(),
        title: 'Updated Title',
        description: 'Updated Description'
      };
      
      await agent.updateBookmarkValidation(bookmarkId, validation);
      
      const result = await db.query(
        'SELECT is_valid, validation_errors, title, description FROM bookmarks WHERE id = $1',
        [bookmarkId]
      );
      
      expect(result.rows[0].is_valid).toBe(true);
      expect(result.rows[0].validation_errors).toEqual([]);
      expect(result.rows[0].title).toBe('Updated Title');
      expect(result.rows[0].description).toBe('Updated Description');
    });
  });
  
  describe('Task Processing', () => {
    it('should process validation task successfully', async () => {
      const task = {
        id: 'test-task-' + Date.now(),
        type: 'validation',
        status: 'running',
        context: {
          bookmarkIds: testBookmarkIds.slice(0, 2), // Just test first 2
          userId: testUserId
        }
      };
      
      const result = await agent.processTask(task);
      
      expect(result.status).toBe('completed');
      expect(result.artifacts).toHaveLength(1);
      expect(result.artifacts[0].type).toBe('bookmark_validation_result');
      
      const artifactData = result.artifacts[0].data;
      expect(artifactData.validatedCount).toBeGreaterThanOrEqual(0);
      expect(artifactData.failedCount).toBeGreaterThanOrEqual(0);
      expect(artifactData.validationResults).toHaveLength(2);
    });
    
    it('should handle empty bookmark list', async () => {
      const task = {
        id: 'test-task-empty-' + Date.now(),
        type: 'validation',
        status: 'running',
        context: {
          bookmarkIds: [],
          userId: testUserId
        }
      };
      
      const result = await agent.executeAction(task);
      
      expect(result.validatedCount).toBe(0);
      expect(result.failedCount).toBe(0);
      expect(result.validationResults).toEqual([]);
    });
    
    it('should emit progress events during validation', async () => {
      const progressEvents = [];
      agent.on('message', (event) => {
        if (event.type === 'progress') {
          progressEvents.push(event);
        }
      });
      
      const task = {
        id: 'test-task-progress-' + Date.now(),
        type: 'validation',
        status: 'running',
        context: {
          bookmarkIds: testBookmarkIds,
          userId: testUserId
        }
      };
      
      await agent.executeAction(task);
      
      expect(progressEvents.length).toBeGreaterThan(0);
      expect(progressEvents.some(e => e.metadata?.progress > 0)).toBe(true);
      expect(progressEvents.some(e => e.metadata?.progress >= 95)).toBe(true);
    });
  });
  
  describe('Batch Processing', () => {
    it('should process bookmarks in batches', async () => {
      // Create many bookmarks
      const manyBookmarkIds = [];
      for (let i = 0; i < 25; i++) {
        const id = uuidv4();
        manyBookmarkIds.push(id);
        await db.query(
          `INSERT INTO bookmarks (id, user_id, url, title, created_at)
           VALUES ($1, $2, $3, $4, NOW())`,
          [id, testUserId, `https://example.com/page${i}`, `Test Page ${i}`]
        );
      }
      
      const task = {
        id: 'test-task-batch-' + Date.now(),
        type: 'validation',
        status: 'running',
        context: {
          bookmarkIds: manyBookmarkIds,
          userId: testUserId
        }
      };
      
      // Agent has batchSize of 10 by default
      const progressEvents = [];
      agent.on('message', (event) => {
        if (event.type === 'progress' && event.content?.includes('batch')) {
          progressEvents.push(event);
        }
      });
      
      await agent.executeAction(task);
      
      // Should have processed in 3 batches (10, 10, 5)
      expect(progressEvents.length).toBeGreaterThanOrEqual(3);
      
      // Clean up extra bookmarks
      await db.query('DELETE FROM bookmarks WHERE id = ANY($1)', [manyBookmarkIds]);
    });
  });
  
  describe('Error Handling', () => {
    it('should continue processing after individual bookmark failure', async () => {
      const task = {
        id: 'test-task-errors-' + Date.now(),
        type: 'validation',
        status: 'running',
        context: {
          bookmarkIds: testBookmarkIds, // Mix of valid and invalid
          userId: testUserId
        }
      };
      
      const result = await agent.executeAction(task);
      
      // Should have some valid and some failed
      expect(result.validatedCount).toBeGreaterThan(0);
      expect(result.failedCount).toBeGreaterThan(0);
      expect(result.validationResults).toHaveLength(5);
    });
    
    it('should handle database update failures gracefully', async () => {
      // Test with a bookmark ID that doesn't exist
      const fakeBookmarkId = uuidv4();
      const validation = {
        isValid: true,
        error: null,
        validatedAt: new Date()
      };
      
      // Should not throw, just log error
      await expect(
        agent.updateBookmarkValidation(fakeBookmarkId, validation)
      ).resolves.not.toThrow();
    });
  });
});