import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { promises as fs } from 'fs';
import path from 'path';
import os from 'os';
import { v4 as uuidv4 } from 'uuid';
import agentInitializationService from '../../../backend/src/services/agentInitializationService.js';
import a2aTaskManager from '../../../backend/src/services/a2aTaskManager.js';
import db from '../../../backend/src/db/index.js';
import Bull from 'bull';

describe('A2A Complete Workflow Test', () => {
  let testUserId;
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
    
    // Verify agents are registered
    const registeredAgents = await a2aTaskManager.getRegisteredAgents();
    console.log('Registered agents:', registeredAgents.map(a => a.agentType));
    
    // Create test user
    testUserId = uuidv4();
    await db.query(
      `INSERT INTO users (id, email, password_hash, role, two_factor_enabled, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, NOW(), NOW())`,
      [testUserId, `test-${testUserId}@az1.ai`, 'test-hash', 'user', false]
    );
    
    // Create test bookmark file with single bookmark
    const bookmarkHtml = `<!DOCTYPE NETSCAPE-Bookmark-file-1>
<META HTTP-EQUIV="Content-Type" CONTENT="text/html; charset=UTF-8">
<TITLE>Bookmarks</TITLE>
<H1>Bookmarks</H1>
<DL><p>
    <DT><A HREF="https://example.com" ADD_DATE="1234567890" ICON="data:image/png;base64,iVBORw0KGgo=">Example Site</A>
</DL><p>`;
    
    tempFilePath = path.join(os.tmpdir(), `test-bookmarks-${Date.now()}.html`);
    await fs.writeFile(tempFilePath, bookmarkHtml);
  });

  afterEach(async () => {
    // Cleanup
    if (tempFilePath) {
      try {
        await fs.unlink(tempFilePath);
      } catch (error) {
        // File might already be deleted
      }
    }
    
    await db.query('DELETE FROM users WHERE id = $1', [testUserId]);
    await agentInitializationService.shutdown();
    await a2aTaskManager.reset();
  });

  it('should process a single bookmark through the complete A2A workflow', async () => {
    // Create import task
    const importId = uuidv4();
    const task = await a2aTaskManager.createTask('quick_import', {
      filePath: tempFilePath,
      userId: testUserId,
      importId: importId
    });
    
    expect(task).toBeDefined();
    expect(task.id).toBeDefined();
    expect(task.type).toBe('quick_import');
    
    // Task might have already started processing
    console.log('Initial task status:', task.status);
    console.log('Task metadata:', task.metadata);
    
    // Wait for task to complete (with timeout)
    const maxWaitTime = 30000; // 30 seconds
    const startTime = Date.now();
    let completedTask = null;
    
    while (Date.now() - startTime < maxWaitTime) {
      await new Promise(resolve => setTimeout(resolve, 1000)); // Wait 1 second
      
      completedTask = await a2aTaskManager.getTask(task.id);
      
      if (completedTask.status === 'completed' || completedTask.status === 'failed') {
        break;
      }
    }
    
    // Verify task completed successfully
    expect(completedTask).toBeDefined();
    console.log('Final task status:', completedTask.status);
    console.log('Task error:', completedTask.metadata?.errorMessage);
    
    expect(completedTask.status).toBe('completed');
    
    // Check artifacts were created
    const artifactsResult = await db.query(
      'SELECT * FROM a2a_artifacts WHERE task_id = $1 ORDER BY created',
      [task.id]
    );
    
    expect(artifactsResult.rows.length).toBeGreaterThan(0);
    
    // Find import artifact
    const importArtifact = artifactsResult.rows.find(a => a.agent_type === 'import');
    expect(importArtifact).toBeDefined();
    expect(importArtifact.data.bookmarkIds).toBeDefined();
    expect(importArtifact.data.bookmarkIds.length).toBe(1);
    expect(importArtifact.data.totalBookmarks).toBe(1);
    expect(importArtifact.data.insertedCount).toBe(1);
    
    // Verify bookmark was inserted
    const bookmarkResult = await db.query(
      'SELECT * FROM bookmarks WHERE user_id = $1',
      [testUserId]
    );
    
    expect(bookmarkResult.rows.length).toBe(1);
    const bookmark = bookmarkResult.rows[0];
    expect(bookmark.url).toBe('https://example.com');
    expect(bookmark.title).toBe('Example Site');
    expect(bookmark.import_id).toBe(importId);
    
    // Check for validation artifact (if validation ran)
    const validationArtifact = artifactsResult.rows.find(a => a.agent_type === 'validation');
    if (validationArtifact) {
      expect(validationArtifact.data.validatedCount).toBeGreaterThanOrEqual(0);
      expect(validationArtifact.data.validationResults).toBeDefined();
    }
    
    // Check messages were recorded
    const messagesResult = await db.query(
      'SELECT * FROM a2a_messages WHERE task_id = $1 ORDER BY timestamp',
      [task.id]
    );
    
    expect(messagesResult.rows.length).toBeGreaterThan(0);
    
    // Verify workflow progression
    const progressMessages = messagesResult.rows.filter(m => m.type === 'progress');
    expect(progressMessages.length).toBeGreaterThan(0);
  }, 60000); // 60 second timeout for the test

  it('should handle duplicate bookmarks correctly', async () => {
    // First, insert a bookmark directly
    const existingBookmarkId = uuidv4();
    await db.query(
      `INSERT INTO bookmarks (id, user_id, url, title, created_at, status)
       VALUES ($1, $2, $3, $4, NOW(), 'active')`,
      [existingBookmarkId, testUserId, 'https://example.com', 'Existing Bookmark']
    );
    
    // Now run import with same URL
    const importId = uuidv4();
    const task = await a2aTaskManager.createTask('quick_import', {
      filePath: tempFilePath,
      userId: testUserId,
      importId: importId
    });
    
    // Wait for completion
    const maxWaitTime = 30000;
    const startTime = Date.now();
    let completedTask = null;
    
    while (Date.now() - startTime < maxWaitTime) {
      await new Promise(resolve => setTimeout(resolve, 1000));
      completedTask = await a2aTaskManager.getTask(task.id);
      if (completedTask.status === 'completed' || completedTask.status === 'failed') {
        break;
      }
    }
    
    expect(completedTask.status).toBe('completed');
    
    // Check import artifact
    const artifactsResult = await db.query(
      'SELECT * FROM a2a_artifacts WHERE task_id = $1 AND agent_type = $2',
      [task.id, 'import']
    );
    
    const importArtifact = artifactsResult.rows[0];
    expect(importArtifact.data.duplicateCount).toBe(1);
    expect(importArtifact.data.insertedCount).toBe(0);
    
    // Verify only one bookmark exists
    const bookmarkResult = await db.query(
      'SELECT * FROM bookmarks WHERE user_id = $1 AND url = $2',
      [testUserId, 'https://example.com']
    );
    
    expect(bookmarkResult.rows.length).toBe(1);
    // Title should be updated to the new one
    expect(bookmarkResult.rows[0].title).toBe('Example Site');
  }, 60000);
});