import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { ImportAgent } from '../../../backend/src/agents/importAgent.js';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import db from '../../../backend/src/db/index.js';
import unifiedLogger from '../../../backend/src/services/unifiedLogger.js';
import { v4 as uuidv4 } from 'uuid';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Test data directory
const TEST_DATA_DIR = path.join(__dirname, '../../fixtures/test-bookmarks');

describe('A2A Import Agent - REAL TESTS', () => {
  let agent;
  let testUserId;
  let testEmail;
  let testImportId;
  
  beforeEach(async () => {
    // Generate unique IDs for each test to avoid conflicts
    testUserId = uuidv4();
    testEmail = `test-${Date.now()}-${Math.random().toString(36).substring(7)}@az1.ai`;
    testImportId = uuidv4();
    
    // Create test data directory if it doesn't exist
    await fs.mkdir(TEST_DATA_DIR, { recursive: true });
    
    // Setup import agent with real database
    agent = new ImportAgent();
    
    // Create unique test user for this test run
    await db.query(
      `INSERT INTO users (id, email, password_hash, name, two_factor_enabled)
       VALUES ($1, $2, $3, $4, $5)`,
      [testUserId, testEmail, 'dummy-hash', 'Test User', false]
    );
    
    // Clean up any test data from previous runs
    await db.query('DELETE FROM bookmarks WHERE user_id = $1', [testUserId]);
    await db.query('DELETE FROM a2a_artifacts WHERE agent_type = $1 AND task_id LIKE $2', ['import', 'test-%']);
  });
  
  afterEach(async () => {
    // Clean up test data
    await db.query('DELETE FROM bookmarks WHERE user_id = $1', [testUserId]);
    await db.query('DELETE FROM import_history WHERE user_id = $1', [testUserId]);
    await db.query('DELETE FROM a2a_artifacts WHERE agent_type = $1 AND task_id LIKE $2', ['import', 'test-%']);
    await db.query('DELETE FROM users WHERE id = $1', [testUserId]);
    
    // Clean up test files
    try {
      const files = await fs.readdir(TEST_DATA_DIR);
      for (const file of files) {
        if (file.startsWith('test-')) {
          await fs.unlink(path.join(TEST_DATA_DIR, file));
        }
      }
    } catch (error) {
      // Directory might not exist, that's ok
    }
  });
  
  describe('Agent Configuration', () => {
    it('should have correct agent properties', () => {
      expect(agent.agentType).toBe('import');
      expect(agent.version).toBe('1.0.0');
      expect(agent.capabilities.description).toContain('bookmark files');
    });
    
    it('should declare import capabilities', () => {
      const card = agent.getAgentCard();
      
      expect(card.capabilities.inputs).toHaveProperty('filePath');
      expect(card.capabilities.inputs.filePath.required).toBe(true);
      expect(card.capabilities.inputs).toHaveProperty('userId');
      expect(card.capabilities.inputs).toHaveProperty('importId');
      
      expect(card.capabilities.outputs.type).toBe('bookmark_import_result');
      expect(card.capabilities.outputs.bookmarkIds).toBeDefined();
    });
  });
  
  // Helper function for creating test HTML files
  const createTestHTML = async (filename, content) => {
    const filepath = path.join(TEST_DATA_DIR, filename);
    await fs.writeFile(filepath, content);
    return filepath;
  };
  
  describe('HTML Parsing with Real Files', () => {
    
    it('should process real HTML bookmark file through task execution', async () => {
      const htmlContent = `<!DOCTYPE NETSCAPE-Bookmark-file-1>
<META HTTP-EQUIV="Content-Type" CONTENT="text/html; charset=UTF-8">
<TITLE>Bookmarks</TITLE>
<H1>Bookmarks</H1>
<DL><p>
    <DT><H3>Development</H3>
    <DL><p>
        <DT><A HREF="https://github.com" ADD_DATE="1625097600" TAGS="dev,git">GitHub</A>
        <DD>Where the world builds software
        <DT><A HREF="https://stackoverflow.com" ADD_DATE="1625184000">Stack Overflow</A>
    </DL><p>
    <DT><H3>News</H3>
    <DL><p>
        <DT><A HREF="https://news.ycombinator.com" ADD_DATE="1625270400" ICON="data:image/png;base64,abc">Hacker News</A>
    </DL><p>
</DL><p>`;
      
      const filepath = await createTestHTML('test-bookmarks.html', htmlContent);
      
      // User already created in beforeEach
      
      // Create import history record
      await db.query(
        `INSERT INTO import_history (id, user_id, filename, status)
         VALUES ($1, $2, $3, $4)
         ON CONFLICT (id) DO NOTHING`,
        [testImportId, testUserId, 'test-bookmarks.html', 'pending']
      );
      
      // Process through task interface
      const task = {
        id: 'test-task-html',
        type: 'import',
        status: 'running',
        context: {
          filePath: filepath,
          userId: testUserId,
          importId: testImportId
        }
      };
      
      const result = await agent.executeAction(task);
      
      expect(result.totalBookmarks).toBe(3);
      expect(result.insertedCount).toBe(3);
      expect(result.bookmarkIds).toHaveLength(3);
      
      // Verify bookmarks in database
      const dbResult = await db.query(
        'SELECT * FROM bookmarks WHERE user_id = $1 ORDER BY url',
        [testUserId]
      );
      
      expect(dbResult.rows).toHaveLength(3);
      const github = dbResult.rows.find(b => b.url === 'https://github.com');
      expect(github).toBeDefined();
      expect(github.title).toBe('GitHub');
    });
    
    it('should handle empty HTML file', async () => {
      const emptyHTML = `<!DOCTYPE NETSCAPE-Bookmark-file-1>
<TITLE>Bookmarks</TITLE>
<H1>Bookmarks</H1>
<DL><p></DL><p>`;
      
      const filepath = await createTestHTML('test-empty.html', emptyHTML);
      
      // User already created in beforeEach
      
      // Create import history
      const emptyImportId = uuidv4();
      await db.query(
        `INSERT INTO import_history (id, user_id, filename, status)
         VALUES ($1, $2, $3, $4)`,
        [emptyImportId, testUserId, 'test-empty.html', 'pending']
      );
      
      // Process through task
      const task = {
        id: 'test-task-empty',
        type: 'import',
        status: 'running',
        context: {
          filePath: filepath,
          userId: testUserId,
          importId: emptyImportId
        }
      };
      
      const result = await agent.executeAction(task);
      
      expect(result.totalBookmarks).toBe(0);
      expect(result.insertedCount).toBe(0);
      expect(result.bookmarkIds).toEqual([]);
    });
    
    it('should handle malformed HTML gracefully', async () => {
      const malformedHTML = `<html><body>Not a valid bookmarks file</body></html>`;
      
      const filepath = await createTestHTML('test-malformed.html', malformedHTML);
      
      // User already created in beforeEach
      
      // Create import history
      const malformedImportId = uuidv4();
      await db.query(
        `INSERT INTO import_history (id, user_id, filename, status)
         VALUES ($1, $2, $3, $4)`,
        [malformedImportId, testUserId, 'test-malformed.html', 'pending']
      );
      
      // Process through task
      const task = {
        id: 'test-task-malformed',
        type: 'import',
        status: 'running',
        context: {
          filePath: filepath,
          userId: testUserId,
          importId: malformedImportId
        }
      };
      
      const result = await agent.executeAction(task);
      
      expect(result.totalBookmarks).toBe(0);
      expect(result.insertedCount).toBe(0);
      expect(result.bookmarkIds).toEqual([]);
    });
    
    it('should handle non-existent file', async () => {
      const nonExistentPath = path.join(TEST_DATA_DIR, 'does-not-exist.html');
      
      // User already created in beforeEach
      
      // Create import history
      const failImportId = uuidv4();
      await db.query(
        `INSERT INTO import_history (id, user_id, filename, status)
         VALUES ($1, $2, $3, $4)`,
        [failImportId, testUserId, 'does-not-exist.html', 'pending']
      );
      
      // Process through task
      const task = {
        id: 'test-task-nonexistent',
        type: 'import',
        status: 'running',
        context: {
          filePath: nonExistentPath,
          userId: testUserId,
          importId: failImportId
        }
      };
      
      await expect(agent.executeAction(task)).rejects.toThrow();
    });
  });
  
  describe('JSON Import Support', () => {
    it('should note that JSON import is not yet implemented', () => {
      // The ImportAgent currently only supports HTML bookmark files
      // JSON support would require extending parseBookmarksFromFile method
      expect(agent.capabilities.inputs.filePath.description).toContain('HTML');
    });
  });
  
  describe('Database Operations - Real Database', () => {
    
    it('should insert bookmarks into real database', async () => {
      // Create HTML with bookmarks
      const htmlContent = `<!DOCTYPE NETSCAPE-Bookmark-file-1>
<TITLE>Bookmarks</TITLE>
<DL><p>
    <DT><A HREF="https://real-test-1.com" ADD_DATE="1625097600">Real Test 1</A>
    <DT><A HREF="https://real-test-2.com" ADD_DATE="1625184000">Real Test 2</A>
    <DD>A real test bookmark
</DL><p>`;
      
      const filepath = await createTestHTML('test-db-insert.html', htmlContent);
      
      // Create import history
      const dbImportId = uuidv4();
      await db.query(
        `INSERT INTO import_history (id, user_id, filename, status)
         VALUES ($1, $2, $3, $4)`,
        [dbImportId, testUserId, 'test-db-insert.html', 'pending']
      );
      
      // Process through task
      const task = {
        id: 'test-task-db-insert',
        type: 'import',
        status: 'running',
        context: {
          filePath: filepath,
          userId: testUserId,
          importId: dbImportId
        }
      };
      
      const result = await agent.executeAction(task);
      
      expect(result.totalBookmarks).toBe(2);
      expect(result.insertedCount).toBe(2);
      expect(result.bookmarkIds).toHaveLength(2);
      
      // Verify bookmarks were actually inserted
      const dbResult = await db.query(
        'SELECT * FROM bookmarks WHERE user_id = $1 ORDER BY url',
        [testUserId]
      );
      
      expect(dbResult.rows).toHaveLength(2);
      expect(dbResult.rows[0].url).toBe('https://real-test-1.com');
      expect(dbResult.rows[0].title).toBe('Real Test 1');
      expect(dbResult.rows[1].url).toBe('https://real-test-2.com');
    });
    
    it('should handle duplicate bookmarks with ON CONFLICT', async () => {
      // Create HTML with duplicate URL
      const htmlContent1 = `<!DOCTYPE NETSCAPE-Bookmark-file-1>
<DL><p>
    <DT><A HREF="https://duplicate-test.com" ADD_DATE="1625097600">Original Title</A>
</DL><p>`;
      
      const filepath1 = await createTestHTML('test-dup-1.html', htmlContent1);
      
      // Create first import
      const dupImportId1 = uuidv4();
      await db.query(
        `INSERT INTO import_history (id, user_id, filename, status)
         VALUES ($1, $2, $3, $4)`,
        [dupImportId1, testUserId, 'test-dup-1.html', 'pending']
      );
      
      // Process first import
      await agent.executeAction({
        id: 'test-task-dup-1',
        type: 'import',
        status: 'running',
        context: {
          filePath: filepath1,
          userId: testUserId,
          importId: dupImportId1
        }
      });
      
      // Create HTML with same URL but different title
      const htmlContent2 = `<!DOCTYPE NETSCAPE-Bookmark-file-1>
<DL><p>
    <DT><A HREF="https://duplicate-test.com" ADD_DATE="1625184000">Updated Title</A>
</DL><p>`;
      
      const filepath2 = await createTestHTML('test-dup-2.html', htmlContent2);
      
      // Create second import
      const dupImportId2 = uuidv4();
      await db.query(
        `INSERT INTO import_history (id, user_id, filename, status)
         VALUES ($1, $2, $3, $4)`,
        [dupImportId2, testUserId, 'test-dup-2.html', 'pending']
      );
      
      // Process second import
      const result2 = await agent.executeAction({
        id: 'test-task-dup-2',
        type: 'import',
        status: 'running',
        context: {
          filePath: filepath2,
          userId: testUserId,
          importId: dupImportId2
        }
      });
      
      // Should have one duplicate
      expect(result2.duplicateCount).toBe(1);
      
      // Should only have one bookmark in database
      const dbResult = await db.query(
        'SELECT * FROM bookmarks WHERE user_id = $1 AND url = $2',
        [testUserId, 'https://duplicate-test.com']
      );
      
      expect(dbResult.rows).toHaveLength(1);
      expect(dbResult.rows[0].title).toBe('Updated Title');
    });
    
    it('should chunk large bookmark sets', async () => {
      // Create HTML with 150 bookmarks to test chunking (chunks of 100)
      let largeHTML = `<!DOCTYPE NETSCAPE-Bookmark-file-1>\n<TITLE>Bookmarks</TITLE>\n<DL><p>`;
      
      for (let i = 0; i < 150; i++) {
        largeHTML += `\n    <DT><A HREF="https://bulk-test-${i}.com" ADD_DATE="${1625097600 + i}">Bulk Test ${i}</A>`;
      }
      
      largeHTML += '\n</DL><p>';
      
      const filepath = await createTestHTML('test-large-chunk.html', largeHTML);
      
      // Create import history
      const chunkImportId = uuidv4();
      await db.query(
        `INSERT INTO import_history (id, user_id, filename, status)
         VALUES ($1, $2, $3, $4)`,
        [chunkImportId, testUserId, 'test-large-chunk.html', 'pending']
      );
      
      // Process the import
      const result = await agent.executeAction({
        id: 'test-task-chunk',
        type: 'import',
        status: 'running',
        context: {
          filePath: filepath,
          userId: testUserId,
          importId: chunkImportId
        }
      });
      
      expect(result.totalBookmarks).toBe(150);
      expect(result.insertedCount).toBe(150);
      
      // Verify all were inserted
      const dbResult = await db.query(
        'SELECT COUNT(*) as count FROM bookmarks WHERE user_id = $1',
        [testUserId]
      );
      
      expect(parseInt(dbResult.rows[0].count)).toBe(150);
    });
    
    it('should emit progress events during insertion', async () => {
      const progressEvents = [];
      agent.on('message', (event) => {
        if (event.type === 'progress') {
          progressEvents.push(event);
        }
      });
      
      // Create HTML with 50 bookmarks
      let progressHTML = `<!DOCTYPE NETSCAPE-Bookmark-file-1>\n<TITLE>Bookmarks</TITLE>\n<DL><p>`;
      
      for (let i = 0; i < 50; i++) {
        progressHTML += `\n    <DT><A HREF="https://progress-test-${i}.com" ADD_DATE="${1625097600 + i}">Progress Test ${i}</A>`;
      }
      
      progressHTML += '\n</DL><p>';
      
      const filepath = await createTestHTML('test-progress.html', progressHTML);
      
      // Create import history
      const progressImportId = uuidv4();
      await db.query(
        `INSERT INTO import_history (id, user_id, filename, status)
         VALUES ($1, $2, $3, $4)`,
        [progressImportId, testUserId, 'test-progress.html', 'pending']
      );
      
      // Process the import
      await agent.executeAction({
        id: 'test-task-progress',
        type: 'import',
        status: 'running',
        context: {
          filePath: filepath,
          userId: testUserId,
          importId: progressImportId
        }
      });
      
      expect(progressEvents.length).toBeGreaterThan(0);
      expect(progressEvents.some(e => e.metadata?.progress > 0)).toBe(true);
    });
  });
  
  describe('Task Processing - Real End-to-End', () => {
    it('should process import task with real file and database', async () => {
      // Create a real HTML file
      const htmlContent = `<!DOCTYPE NETSCAPE-Bookmark-file-1>
<TITLE>Bookmarks</TITLE>
<DL><p>
    <DT><A HREF="https://task-test-1.com" ADD_DATE="1625097600">Task Test 1</A>
    <DT><A HREF="https://task-test-2.com" ADD_DATE="1625184000" TAGS="task,test">Task Test 2</A>
</DL><p>`;
      
      const filepath = path.join(TEST_DATA_DIR, 'test-task-bookmarks.html');
      await fs.writeFile(filepath, htmlContent);
      
      // Create import history record
      await db.query(
        `INSERT INTO import_history (id, user_id, filename, status)
         VALUES ($1, $2, $3, $4)`,
        [testImportId, testUserId, 'test-task-bookmarks.html', 'pending']
      );
      
      // Create a real task
      const task = {
        id: 'test-task-' + Date.now(),
        type: 'import',
        status: 'running',
        context: {
          filePath: filepath,
          userId: testUserId,
          importId: testImportId
        },
        artifacts: [],
        metadata: {}
      };
      
      const result = await agent.processTask(task);
      
      expect(result.status).toBe('completed');
      expect(result.artifacts).toHaveLength(1);
      expect(result.artifacts[0].type).toBe('bookmark_import_result');
      expect(result.artifacts[0].data.totalBookmarks).toBe(2);
      expect(result.artifacts[0].data.insertedCount).toBe(2);
      
      // Verify bookmarks are actually in the database
      const dbResult = await db.query(
        'SELECT * FROM bookmarks WHERE user_id = $1 ORDER BY url',
        [testUserId]
      );
      
      expect(dbResult.rows).toHaveLength(2);
      expect(dbResult.rows[0].url).toBe('https://task-test-1.com');
      expect(dbResult.rows[1].url).toBe('https://task-test-2.com');
      // Note: Tags parsing is not yet implemented in ImportAgent
    });
    
    it('should handle task with non-existent file', async () => {
      const task = {
        id: 'test-task-fail-' + Date.now(),
        type: 'import',
        status: 'running',
        context: {
          filePath: '/does/not/exist.html',
          userId: testUserId,
          importId: testImportId
        },
        artifacts: [],
        metadata: {}
      };
      
      await expect(agent.processTask(task)).rejects.toThrow();
    });
  });
  
  describe('Performance with Real Data', () => {
    it('should handle large HTML file efficiently', async () => {
      // Create a large HTML file with 1000 bookmarks
      let largeHTML = `<!DOCTYPE NETSCAPE-Bookmark-file-1>
<TITLE>Bookmarks</TITLE>
<DL><p>`;
      
      for (let i = 0; i < 1000; i++) {
        largeHTML += `\n    <DT><A HREF="https://perf-test-${i}.com" ADD_DATE="${1625097600 + i}">Performance Test ${i}</A>`;
        if (i % 2 === 0) {
          largeHTML += `\n    <DD>Description for bookmark ${i}`;
        }
      }
      
      largeHTML += '\n</DL><p>';
      
      const filepath = path.join(TEST_DATA_DIR, 'test-large.html');
      await fs.writeFile(filepath, largeHTML);
      
      // Create import history
      const perfImportId = uuidv4();
      await db.query(
        `INSERT INTO import_history (id, user_id, filename, status)
         VALUES ($1, $2, $3, $4)`,
        [perfImportId, testUserId, 'test-large.html', 'pending']
      );
      
      // Process through task execution
      const startTime = Date.now();
      const result = await agent.executeAction({
        id: 'test-task-perf',
        type: 'import',
        status: 'running',
        context: {
          filePath: filepath,
          userId: testUserId,
          importId: perfImportId
        }
      });
      const totalTime = Date.now() - startTime;
      
      expect(result.totalBookmarks).toBe(1000);
      expect(result.insertedCount).toBe(1000);
      expect(totalTime).toBeLessThan(15000); // Should complete in under 15 seconds
      
      // Verify all inserted
      const count = await db.query(
        'SELECT COUNT(*) as count FROM bookmarks WHERE user_id = $1',
        [testUserId]
      );
      
      expect(parseInt(count.rows[0].count)).toBe(1000);
    });
  });
});