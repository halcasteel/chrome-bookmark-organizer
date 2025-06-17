import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { promises as fs } from 'fs';
import path from 'path';
import os from 'os';
import { v4 as uuidv4 } from 'uuid';
import agentInitializationService from '../../../backend/src/services/agentInitializationService.js';
import a2aTaskManager from '../../../backend/src/services/a2aTaskManager.js';
import db from '../../../backend/src/db/index.js';

describe('A2A Minimal Workflow Test', () => {
  let testUserId;
  let tempFilePath;
  
  beforeEach(async () => {
    // Create test user
    testUserId = uuidv4();
    await db.query(
      `INSERT INTO users (id, email, password_hash, role, two_factor_enabled, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, NOW(), NOW())`,
      [testUserId, `test-${testUserId}@az1.ai`, 'test-hash', 'user', false]
    );
    
    // Create test bookmark file
    const bookmarkHtml = `<!DOCTYPE NETSCAPE-Bookmark-file-1>
<H1>Bookmarks</H1>
<DL><p>
    <DT><A HREF="https://example.com">Example</A>
</DL><p>`;
    
    tempFilePath = path.join(os.tmpdir(), `test-${Date.now()}.html`);
    await fs.writeFile(tempFilePath, bookmarkHtml);
  });

  afterEach(async () => {
    if (tempFilePath) {
      try {
        await fs.unlink(tempFilePath);
      } catch (error) {}
    }
    await db.query('DELETE FROM users WHERE id = $1', [testUserId]);
  });

  it('should create a task without agent execution', async () => {
    // Reset and DON'T initialize agents
    await agentInitializationService.reset();
    await a2aTaskManager.reset();
    
    const importId = uuidv4();
    
    try {
      const task = await a2aTaskManager.createTask('quick_import', {
        filePath: tempFilePath,
        userId: testUserId,
        importId: importId
      });
      
      // Should fail because agents are not registered
      expect(task).toBeUndefined();
    } catch (error) {
      console.log('Expected error:', error.message);
      expect(error.message).toContain("Agent 'import' not registered");
    }
  });

  it('should create a task with agents initialized', async () => {
    // Reset first
    await agentInitializationService.reset();
    await a2aTaskManager.reset();
    
    // Then initialize
    await agentInitializationService.initialize();
    
    // Verify agents are registered with task manager
    const agents = await a2aTaskManager.getRegisteredAgents();
    console.log('Task manager agents:', agents.length);
    console.log('Agent types:', agents.map(a => a.agentType));
    
    const importId = uuidv4();
    
    // This should work now
    const task = await a2aTaskManager.createTask('quick_import', {
      filePath: tempFilePath,
      userId: testUserId,
      importId: importId
    });
    
    expect(task).toBeDefined();
    expect(task.id).toBeDefined();
    expect(task.type).toBe('quick_import');
  });
});