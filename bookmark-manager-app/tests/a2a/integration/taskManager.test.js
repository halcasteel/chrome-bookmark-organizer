import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { A2ATaskManager } from '../../../backend/src/services/a2aTaskManager.js';
import { A2AAgent } from '../../../backend/src/agents/baseAgent.js';
import db from '../../../backend/src/db/index.js';
import unifiedLogger from '../../../backend/src/services/unifiedLogger.js';
import { EventEmitter } from 'events';
import websocketService from '../../../backend/src/services/websocketService.js';

describe('A2A Task Manager Integration', () => {
  let taskManager;
  let testAgent;
  let importAgent;
  let validationAgent;
  
  // Use existing test user to avoid conflicts
  const testUserId = '5d10a4a1-47b9-4e1c-bf0d-e8e82cf96a8d'; // Existing test@az1.ai user
  
  beforeEach(async () => {
    // Test user already exists in database (test@az1.ai)
    
    // Initialize task manager
    taskManager = new A2ATaskManager();
    
    // Create test agents
    testAgent = new A2AAgent({
      agentType: 'test-agent',
      version: '1.0.0',
      capabilities: {
        description: 'Test agent for integration testing',
        inputs: {
          data: { type: 'string', required: true }
        },
        outputs: {
          type: 'test_result',
          schema: {
            processed: 'boolean',
            result: 'string'
          }
        },
        actions: ['process']
      }
    });
    
    // Mock agent execution
    testAgent.executeAction = async (task) => {
      return {
        processed: true,
        result: task.context.data.toUpperCase()
      };
    };
    
    // Create import agent mock
    importAgent = new A2AAgent({
      agentType: 'import',
      version: '1.0.0',
      capabilities: {
        description: 'Import bookmarks from files',
        inputs: {
          filePath: { type: 'string', required: true },
          userId: { type: 'string', required: true }
        },
        outputs: {
          type: 'import_result',
          schema: {
            bookmarkIds: 'array',
            totalBookmarks: 'number'
          }
        },
        actions: ['import']
      }
    });
    
    importAgent.executeAction = async (task) => {
      return {
        bookmarkIds: ['bookmark-1', 'bookmark-2', 'bookmark-3'],
        totalBookmarks: 3,
        importedCount: 3
      };
    };
    
    // Create validation agent mock
    validationAgent = new A2AAgent({
      agentType: 'validation',
      version: '1.0.0',
      capabilities: {
        description: 'Validate bookmark URLs',
        inputs: {
          bookmarkIds: { type: 'array', required: true }
        },
        outputs: {
          type: 'validation_result',
          schema: {
            validatedCount: 'number',
            failedCount: 'number'
          }
        },
        actions: ['validate']
      }
    });
    
    validationAgent.executeAction = async (task) => {
      const bookmarkIds = task.context.bookmarkIds || [];
      return {
        validatedCount: bookmarkIds.length,
        failedCount: 0
      };
    };
    
    // Clean test data
    await db.query('DELETE FROM a2a_tasks WHERE id LIKE $1', ['test-%']);
    await db.query('DELETE FROM a2a_tasks WHERE id LIKE $1', ['task_%']);
    await db.query('DELETE FROM a2a_artifacts WHERE task_id LIKE $1', ['test-%']);
    await db.query('DELETE FROM a2a_artifacts WHERE task_id LIKE $1', ['task_%']);
    await db.query('DELETE FROM a2a_messages WHERE task_id LIKE $1', ['test-%']);
    await db.query('DELETE FROM a2a_messages WHERE task_id LIKE $1', ['task_%']);
  });
  
  afterEach(async () => {
    // Cleanup - order matters due to foreign keys
    await db.query('DELETE FROM a2a_messages WHERE task_id LIKE $1', ['test-%']);
    await db.query('DELETE FROM a2a_messages WHERE task_id LIKE $1', ['task_%']);
    await db.query('DELETE FROM a2a_artifacts WHERE task_id LIKE $1', ['test-%']);
    await db.query('DELETE FROM a2a_artifacts WHERE task_id LIKE $1', ['task_%']);
    await db.query('DELETE FROM a2a_tasks WHERE id LIKE $1', ['test-%']);
    await db.query('DELETE FROM a2a_tasks WHERE id LIKE $1', ['task_%']);
    // Don't delete the test user - we'll reuse it
  });
  
  describe('Agent Registration', () => {
    it('should register agent successfully', () => {
      taskManager.registerAgent(testAgent);
      
      expect(taskManager.agents.has('test-agent')).toBe(true);
      expect(taskManager.agents.get('test-agent')).toBe(testAgent);
    });
    
    it('should require agentType for registration', () => {
      const invalidAgent = { version: '1.0.0' }; // Missing agentType
      
      expect(() => {
        taskManager.registerAgent(invalidAgent);
      }).toThrow('Agent must have agentType property');
    });
    
    it('should set up event listeners on registration', () => {
      const messageHandler = vi.fn();
      taskManager.handleAgentMessage = messageHandler;
      
      taskManager.registerAgent(testAgent);
      
      // Emit a message from the agent
      testAgent.emit('message', { type: 'test' });
      
      expect(messageHandler).toHaveBeenCalledWith({ type: 'test' });
    });
  });
  
  describe('Task Creation with Workflows', () => {
    beforeEach(() => {
      // Register agents for workflows
      taskManager.registerAgent(importAgent);
      taskManager.registerAgent(validationAgent);
    });
    
    it('should create task with valid workflow', async () => {
      const task = await taskManager.createTask('quick_import', {
        filePath: '/tmp/bookmarks.html',
        userId: testUserId
      });
      
      expect(task.id).toMatch(/^task_/);
      expect(task.type).toBe('quick_import');
      expect(task.status).toBe('pending');
      expect(task.workflow.agents).toEqual(['import', 'validation']);
      expect(task.workflow.currentStep).toBe(0);
    });
    
    it('should persist task to database', async () => {
      const task = await taskManager.createTask('quick_import', {
        filePath: '/tmp/bookmarks.html',
        userId: testUserId
      });
      
      const result = await db.query(
        'SELECT * FROM a2a_tasks WHERE id = $1',
        [task.id]
      );
      
      expect(result.rows).toHaveLength(1);
      expect(result.rows[0].type).toBe('quick_import');
      expect(result.rows[0].status).toBe('running'); // Should be running after first agent starts
    });
    
    it('should reject unknown workflow types', async () => {
      await expect(
        taskManager.createTask('unknown_workflow', {})
      ).rejects.toThrow('Unknown workflow type: unknown_workflow');
    });
    
    it('should start workflow execution immediately', async () => {
      const task = await taskManager.createTask('quick_import', {
        filePath: '/tmp/bookmarks.html',
        userId: testUserId
      });
      
      // Wait a bit for async execution
      await new Promise(resolve => setTimeout(resolve, 100));
      
      // Task should be in activeTasks
      expect(taskManager.activeTasks.has(task.id)).toBe(true);
      
      // Task should have progressed
      const activeTask = taskManager.activeTasks.get(task.id);
      expect(activeTask.status).toBe('running');
    });
  });
  
  describe('Workflow Execution', () => {
    beforeEach(() => {
      taskManager.registerAgent(importAgent);
      taskManager.registerAgent(validationAgent);
    });
    
    it('should execute quick_import workflow end-to-end', async () => {
      const completedTasks = [];
      taskManager.on('task:completed', (task) => completedTasks.push(task));
      
      const task = await taskManager.createTask('quick_import', {
        filePath: '/tmp/bookmarks.html',
        userId: testUserId
      });
      
      // Wait for workflow completion
      await new Promise(resolve => {
        taskManager.on('task:completed', () => resolve());
      });
      
      expect(completedTasks).toHaveLength(1);
      expect(completedTasks[0].id).toBe(task.id);
      expect(completedTasks[0].status).toBe('completed');
      
      // Check artifacts were created
      const artifacts = await db.query(
        'SELECT * FROM a2a_artifacts WHERE task_id = $1 ORDER BY created',
        [task.id]
      );
      
      expect(artifacts.rows).toHaveLength(2); // Import + Validation artifacts
      expect(artifacts.rows[0].agent_type).toBe('import');
      expect(artifacts.rows[1].agent_type).toBe('validation');
    });
    
    it('should handle agent failures in workflow', async () => {
      // Make validation agent fail
      validationAgent.executeAction = async () => {
        throw new Error('Validation failed');
      };
      
      const failedTasks = [];
      taskManager.on('task:failed', (task) => failedTasks.push(task));
      
      const task = await taskManager.createTask('quick_import', {
        filePath: '/tmp/bookmarks.html',
        userId: testUserId
      });
      
      // Wait for failure
      await new Promise(resolve => {
        taskManager.on('task:failed', () => resolve());
      });
      
      expect(failedTasks).toHaveLength(1);
      expect(failedTasks[0].id).toBe(task.id);
      expect(failedTasks[0].status).toBe('failed');
      expect(failedTasks[0].metadata.errorMessage).toBe('Validation failed');
    });
    
    it('should pass context between agents', async () => {
      let validationContext;
      
      validationAgent.executeAction = async (task) => {
        validationContext = task.context;
        return {
          validatedCount: task.context.bookmarkIds?.length || 0,
          failedCount: 0
        };
      };
      
      await taskManager.createTask('quick_import', {
        filePath: '/tmp/bookmarks.html',
        userId: testUserId
      });
      
      // Wait for completion
      await new Promise(resolve => {
        taskManager.on('task:completed', () => resolve());
      });
      
      // Validation agent should have received bookmarkIds from import agent
      expect(validationContext).toBeDefined();
      expect(validationContext.bookmarkIds).toEqual(['bookmark-1', 'bookmark-2', 'bookmark-3']);
      expect(validationContext.totalBookmarks).toBe(3);
    });
  });
  
  describe('Message Handling', () => {
    beforeEach(() => {
      taskManager.registerAgent(importAgent);
    });
    
    it('should store and persist task messages', async () => {
      const messages = [];
      importAgent.on('task:message', ({ message }) => messages.push(message));
      
      const task = await taskManager.createTask('validation_only', {
        bookmarkIds: ['bookmark-1'],
        userId: testUserId
      });
      
      // Import agent will emit messages during processing
      await new Promise(resolve => setTimeout(resolve, 200));
      
      // Check messages were stored in database
      const dbMessages = await db.query(
        'SELECT * FROM a2a_messages WHERE task_id = $1 ORDER BY timestamp',
        [task.id]
      );
      
      expect(dbMessages.rows.length).toBeGreaterThan(0);
    });
  });
  
  describe('Task Retrieval', () => {
    it('should retrieve active task from memory', async () => {
      taskManager.registerAgent(importAgent);
      
      const task = await taskManager.createTask('validation_only', {
        bookmarkIds: ['bookmark-1'],
        userId: testUserId
      });
      
      const retrieved = await taskManager.getTask(task.id);
      
      expect(retrieved).toBeDefined();
      expect(retrieved.id).toBe(task.id);
      expect(retrieved.type).toBe('validation_only');
    });
    
    it('should retrieve completed task from database', async () => {
      // Insert a completed task directly
      const taskId = 'test-completed-task';
      await db.query(
        `INSERT INTO a2a_tasks (id, type, status, context, metadata, workflow_type, workflow_agents, created, updated)
         VALUES ($1, $2, $3, $4, $5, $6, $7, NOW(), NOW())`,
        [
          taskId,
          'validation_only',
          'completed',
          { bookmarkIds: ['test'] },
          {},
          'validation_only',
          ['validation']
        ]
      );
      
      const task = await taskManager.getTask(taskId);
      
      expect(task).toBeDefined();
      expect(task.id).toBe(taskId);
      expect(task.status).toBe('completed');
    });
  });
  
  describe('Agent Capabilities', () => {
    it('should register agent capabilities in database', async () => {
      await taskManager.registerAgent(testAgent);
      
      // Give it time to persist
      await new Promise(resolve => setTimeout(resolve, 100));
      
      const capabilities = await taskManager.getAgentCapabilities();
      
      const testAgentCap = capabilities.find(c => c.agentType === 'test-agent');
      expect(testAgentCap).toBeDefined();
      expect(testAgentCap.version).toBe('1.0.0');
      expect(testAgentCap.description).toBe('Test agent for integration testing');
    });
  });
  
  describe('Performance', () => {
    it('should handle concurrent workflow execution', async () => {
      taskManager.registerAgent(importAgent);
      taskManager.registerAgent(validationAgent);
      
      const tasks = await Promise.all(
        Array(5).fill(null).map((_, i) => 
          taskManager.createTask('quick_import', {
            filePath: `/tmp/bookmarks-${i}.html`,
            userId: testUserId
          })
        )
      );
      
      // Wait for all to complete
      await new Promise(resolve => {
        let completed = 0;
        taskManager.on('task:completed', () => {
          completed++;
          if (completed === 5) resolve();
        });
      });
      
      // All tasks should be completed
      for (const task of tasks) {
        const final = await taskManager.getTask(task.id);
        expect(final.status).toBe('completed');
      }
    });
  });
});