import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { EnrichmentAgent } from '../../../backend/src/agents/enrichmentAgentA2A.js';
import db from '../../../backend/src/db/index.js';
import aiEnrichmentService from '../../../backend/src/services/aiEnrichmentService.js';
import unifiedLogger from '../../../backend/src/services/unifiedLogger.js';
import { v4 as uuidv4 } from 'uuid';

describe('A2A Enrichment Agent - REAL TESTS', () => {
  let agent;
  let testUserId;
  let testEmail;
  let testBookmarkIds;
  
  beforeEach(async () => {
    // Generate unique IDs for each test to avoid conflicts
    testUserId = uuidv4();
    testEmail = `test-${Date.now()}-${Math.random().toString(36).substring(7)}@az1.ai`;
    testBookmarkIds = [];
    
    // Setup enrichment agent
    agent = new EnrichmentAgent();
    
    // Create unique test user for this test run
    await db.query(
      `INSERT INTO users (id, email, password_hash, name, two_factor_enabled)
       VALUES ($1, $2, $3, $4, $5)`,
      [testUserId, testEmail, 'dummy-hash', 'Test User', false]
    );
    
    // Create test bookmarks with various content
    const testBookmarks = [
      { 
        url: 'https://github.com/nodejs/node', 
        title: 'Node.js GitHub Repository',
        description: 'JavaScript runtime built on Chrome\'s V8 JavaScript engine'
      },
      { 
        url: 'https://example.com/cooking-recipe', 
        title: 'Best Chocolate Cake Recipe',
        description: 'A delicious chocolate cake recipe with flour, sugar, cocoa powder, eggs'
      },
      { 
        url: 'https://example.com/tech-news', 
        title: 'Latest AI Developments',
        description: 'News about artificial intelligence and recent breakthroughs in machine learning'
      }
    ];
    
    for (const bookmark of testBookmarks) {
      const bookmarkId = uuidv4();
      testBookmarkIds.push(bookmarkId);
      
      await db.query(
        `INSERT INTO bookmarks (id, user_id, url, title, description, is_valid, created_at)
         VALUES ($1, $2, $3, $4, $5, true, NOW())`,
        [bookmarkId, testUserId, bookmark.url, bookmark.title, bookmark.description]
      );
    }
    
    // Clean up any artifacts from previous runs
    await db.query('DELETE FROM a2a_artifacts WHERE agent_type = $1 AND task_id LIKE $2', ['enrichment', 'test-%']);
  });
  
  afterEach(async () => {
    // Clean up test data
    await db.query('DELETE FROM bookmarks WHERE user_id = $1', [testUserId]);
    await db.query('DELETE FROM a2a_artifacts WHERE agent_type = $1 AND task_id LIKE $2', ['enrichment', 'test-%']);
    await db.query('DELETE FROM users WHERE id = $1', [testUserId]);
  });
  
  describe('Agent Configuration', () => {
    it('should have correct agent properties', () => {
      expect(agent.agentType).toBe('enrichment');
      expect(agent.version).toBe('1.0.0');
      expect(agent.capabilities.description).toContain('Enriches bookmarks');
    });
    
    it('should declare enrichment capabilities', () => {
      const card = agent.getAgentCard();
      
      expect(card.capabilities.inputs).toHaveProperty('bookmarkIds');
      expect(card.capabilities.inputs.bookmarkIds.required).toBe(true);
      expect(card.capabilities.inputs).toHaveProperty('userId');
      expect(card.capabilities.inputs.userId.required).toBe(true);
      
      expect(card.capabilities.outputs.type).toBe('bookmark_enrichment_result');
      expect(card.capabilities.outputs.enrichedCount).toBeDefined();
      expect(card.capabilities.outputs.failedCount).toBeDefined();
    });
  });
  
  describe('Bookmark Enrichment', () => {
    it('should enrich a technical bookmark (Claude Code environment)', async () => {
      // In Claude Code environment, we use built-in logic
      const isClaudeEnv = process.env.USE_CLAUDE_CODE_FIRST === 'true';
      
      const bookmark = {
        id: testBookmarkIds[0],
        url: 'https://github.com/nodejs/node',
        title: 'Node.js GitHub Repository',
        description: 'JavaScript runtime built on Chrome\'s V8 JavaScript engine',
        enrichment_data: {}
      };
      
      const result = await agent.enrichBookmark(bookmark);
      
      expect(result.success).toBe(true);
      expect(result.category).toBeTruthy();
      expect(result.tags).toBeInstanceOf(Array);
      expect(result.tags.length).toBeGreaterThan(0);
      
      if (isClaudeEnv) {
        // Claude's built-in logic should categorize as Development
        expect(result.category).toBe('Development');
        // Tags might vary based on content analysis - check for any development-related tags
        const devTags = ['javascript', 'nodejs', 'programming', 'development', 'software', 'api', 'framework'];
        expect(result.tags.some(tag => devTags.includes(tag.toLowerCase()))).toBe(true);
      } else {
        // OpenAI might use different categories
        expect(['programming', 'technology', 'development', 'software']).toContain(result.category.toLowerCase());
      }
    });
    
    it('should enrich a cooking bookmark', async () => {
      const bookmark = {
        id: testBookmarkIds[1],
        url: 'https://example.com/cooking-recipe',
        title: 'Best Chocolate Cake Recipe',
        description: 'A delicious chocolate cake recipe with flour, sugar, cocoa powder, eggs',
        enrichment_data: {}
      };
      
      const result = await agent.enrichBookmark(bookmark);
      
      expect(result.success).toBe(true);
      expect(result.category).toBeTruthy();
      expect(result.tags).toBeInstanceOf(Array);
      // Since example.com might not exist, just check we got some category
      expect(result.category).toBeDefined();
    });
    
    it('should handle enrichment failures gracefully', async () => {
      // Mock AI service to throw error
      const originalEnrich = aiEnrichmentService.enrichBookmark;
      aiEnrichmentService.enrichBookmark = vi.fn().mockRejectedValue(new Error('API rate limit exceeded'));
      
      const bookmark = {
        id: testBookmarkIds[0],
        url: 'https://example.com',
        title: 'Test'
      };
      
      const result = await agent.enrichBookmark(bookmark);
      
      expect(result.success).toBe(false);
      expect(result.error).toContain('API rate limit exceeded');
      
      // Restore original function
      aiEnrichmentService.enrichBookmark = originalEnrich;
    });
  });
  
  describe('Database Operations', () => {
    it('should fetch bookmarks with content', async () => {
      const bookmarks = await agent.fetchBookmarksWithContent(testBookmarkIds, testUserId);
      
      expect(bookmarks).toHaveLength(3);
      expect(bookmarks[0]).toHaveProperty('id');
      expect(bookmarks[0]).toHaveProperty('url');
      expect(bookmarks[0]).toHaveProperty('title');
      expect(bookmarks[0]).toHaveProperty('enrichment_data');
    });
    
    it('should not fetch bookmarks for wrong user', async () => {
      const wrongUserId = uuidv4();
      const bookmarks = await agent.fetchBookmarksWithContent(testBookmarkIds, wrongUserId);
      
      expect(bookmarks).toHaveLength(0);
    });
    
    it('should update bookmark with enrichment data', async () => {
      const bookmarkId = testBookmarkIds[0];
      const enrichment = {
        success: true,
        category: 'programming',
        tags: ['nodejs', 'javascript', 'backend'],
        summary: 'Node.js runtime repository',
        keywords: ['runtime', 'v8', 'javascript']
      };
      
      await agent.updateBookmarkEnrichment(bookmarkId, enrichment);
      
      const result = await db.query(
        'SELECT ai_tags, ai_summary, enrichment_data FROM bookmarks WHERE id = $1',
        [bookmarkId]
      );
      
      expect(result.rows[0].enrichment_data.category).toBe('programming');
      expect(result.rows[0].ai_tags).toEqual(['nodejs', 'javascript', 'backend']);
      expect(result.rows[0].ai_summary).toBe('Node.js runtime repository');
      expect(result.rows[0].enrichment_data.keywords).toEqual(['runtime', 'v8', 'javascript']);
    });
  });
  
  describe('Task Processing', () => {
    it('should process enrichment task successfully', async () => {
      const task = {
        id: 'test-task-' + Date.now(),
        type: 'enrichment',
        status: 'running',
        context: {
          bookmarkIds: testBookmarkIds.slice(0, 2), // Just test first 2
          userId: testUserId
        }
      };
      
      const result = await agent.processTask(task);
      
      expect(result.status).toBe('completed');
      expect(result.artifacts).toHaveLength(1);
      expect(result.artifacts[0].type).toBe('bookmark_enrichment_result');
      
      const artifactData = result.artifacts[0].data;
      expect(artifactData.enrichedCount).toBeGreaterThanOrEqual(0);
      expect(artifactData.failedCount).toBeGreaterThanOrEqual(0);
      expect(artifactData.enrichmentResults).toHaveLength(2);
    });
    
    it('should handle empty bookmark list', async () => {
      const task = {
        id: 'test-task-empty-' + Date.now(),
        type: 'enrichment',
        status: 'running',
        context: {
          bookmarkIds: [],
          userId: testUserId
        }
      };
      
      const result = await agent.executeAction(task);
      
      expect(result.enrichedCount).toBe(0);
      expect(result.failedCount).toBe(0);
      expect(result.enrichmentResults).toEqual([]);
    });
    
    it('should emit progress events during enrichment', async () => {
      const progressEvents = [];
      agent.on('message', (event) => {
        if (event.type === 'progress') {
          progressEvents.push(event);
        }
      });
      
      const task = {
        id: 'test-task-progress-' + Date.now(),
        type: 'enrichment',
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
      for (let i = 0; i < 12; i++) {
        const id = uuidv4();
        manyBookmarkIds.push(id);
        await db.query(
          `INSERT INTO bookmarks (id, user_id, url, title, is_valid, created_at)
           VALUES ($1, $2, $3, $4, true, NOW())`,
          [id, testUserId, `https://example.com/page${i}`, `Test Page ${i}`]
        );
      }
      
      const task = {
        id: 'test-task-batch-' + Date.now(),
        type: 'enrichment',
        status: 'running',
        context: {
          bookmarkIds: manyBookmarkIds,
          userId: testUserId
        }
      };
      
      // Agent has batchSize of 5 by default
      const progressEvents = [];
      agent.on('message', (event) => {
        if (event.type === 'progress' && event.content?.includes('batch')) {
          progressEvents.push(event);
        }
      });
      
      await agent.executeAction(task);
      
      // Should have processed in 3 batches (5, 5, 2)
      expect(progressEvents.length).toBeGreaterThanOrEqual(3);
      
      // Clean up extra bookmarks
      await db.query('DELETE FROM bookmarks WHERE id = ANY($1)', [manyBookmarkIds]);
    });
  });
  
  describe('Error Handling', () => {
    it('should continue processing after individual bookmark failure', async () => {
      // Mock AI service to fail on specific bookmarks
      const originalEnrich = aiEnrichmentService.enrichBookmark;
      let callCount = 0;
      aiEnrichmentService.enrichBookmark = vi.fn().mockImplementation(async (data) => {
        callCount++;
        // Fail every other bookmark
        if (callCount % 2 === 0) {
          throw new Error('Simulated AI error');
        }
        return {
          category: 'test',
          tags: ['test'],
          summary: 'Test summary',
          keywords: ['test']
        };
      });
      
      const task = {
        id: 'test-task-errors-' + Date.now(),
        type: 'enrichment',
        status: 'running',
        context: {
          bookmarkIds: testBookmarkIds,
          userId: testUserId
        }
      };
      
      const result = await agent.executeAction(task);
      
      // Should have some enriched and some failed
      expect(result.enrichedCount).toBeGreaterThan(0);
      expect(result.failedCount).toBeGreaterThan(0);
      expect(result.enrichmentResults).toHaveLength(3);
      
      // Restore original function
      aiEnrichmentService.enrichBookmark = originalEnrich;
    });
    
    it('should handle database update failures gracefully', async () => {
      // Test with a bookmark ID that doesn't exist
      const fakeBookmarkId = uuidv4();
      const enrichment = {
        success: true,
        category: 'test',
        tags: ['test'],
        summary: 'Test'
      };
      
      // Should not throw, just log error
      await expect(
        agent.updateBookmarkEnrichment(fakeBookmarkId, enrichment)
      ).resolves.not.toThrow();
    });
  });
});