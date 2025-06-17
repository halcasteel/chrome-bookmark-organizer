import db from '../../../backend/src/db/index.js';
import { A2ATaskManager } from '../../../backend/src/services/a2aTaskManager.js';

/**
 * A2A Test Utilities
 * Helper functions for testing A2A architecture components
 */
export class A2ATestUtils {
  /**
   * Wait for a task to complete with timeout
   */
  static async waitForTaskCompletion(taskManager, taskId, options = {}) {
    const { timeout = 30000, pollInterval = 100 } = options;
    const startTime = Date.now();
    
    while (Date.now() - startTime < timeout) {
      const task = await taskManager.getTask(taskId);
      
      if (task.status === 'completed' || task.status === 'failed') {
        return task;
      }
      
      await new Promise(resolve => setTimeout(resolve, pollInterval));
    }
    
    throw new Error(`Task ${taskId} did not complete within ${timeout}ms`);
  }

  /**
   * Create a test task with default values
   */
  static async createTestTask(taskManager, agentType, context = {}, metadata = {}) {
    const defaultContext = {
      testId: `test-${Date.now()}`,
      ...context
    };
    
    const defaultMetadata = {
      testRun: true,
      createdAt: new Date(),
      ...metadata
    };
    
    return taskManager.createTask(agentType, defaultContext, defaultMetadata);
  }

  /**
   * Validate artifact structure and immutability
   */
  static async validateArtifact(artifact, expectedType, schema = {}) {
    // Validate structure
    expect(artifact).toHaveProperty('id');
    expect(artifact).toHaveProperty('type', expectedType);
    expect(artifact).toHaveProperty('data');
    expect(artifact).toHaveProperty('immutable', true);
    expect(artifact).toHaveProperty('createdAt');
    expect(artifact).toHaveProperty('createdBy');
    
    // Validate immutability
    expect(() => {
      artifact.data.testMutation = 'should fail';
    }).toThrow();
    
    // Validate schema if provided
    for (const [key, type] of Object.entries(schema)) {
      expect(artifact.data).toHaveProperty(key);
      expect(typeof artifact.data[key]).toBe(type);
    }
    
    return true;
  }

  /**
   * Clean up test data from database
   */
  static async cleanupTestData(prefix = 'test-') {
    await db.query('DELETE FROM a2a_messages WHERE task_id LIKE $1', [`${prefix}%`]);
    await db.query('DELETE FROM a2a_artifacts WHERE task_id LIKE $1', [`${prefix}%`]);
    await db.query('DELETE FROM a2a_tasks WHERE id LIKE $1', [`${prefix}%`]);
  }

  /**
   * Create test bookmarks data
   */
  static generateTestBookmarks(count = 10) {
    return Array(count).fill(null).map((_, i) => ({
      url: `https://test${i}.example.com`,
      title: `Test Bookmark ${i}`,
      description: `Description for test bookmark ${i}`,
      tags: [`test`, `category${i % 3}`],
      folder: `Test Folder ${Math.floor(i / 5)}`,
      dateAdded: new Date(Date.now() - i * 86400000), // Stagger by days
      icon: i % 2 === 0 ? `data:image/png;base64,test${i}` : null
    }));
  }

  /**
   * Generate HTML bookmarks file content
   */
  static generateHTMLBookmarks(bookmarks) {
    const folders = {};
    
    // Group by folder
    bookmarks.forEach(bookmark => {
      const folder = bookmark.folder || 'Unfiled';
      if (!folders[folder]) folders[folder] = [];
      folders[folder].push(bookmark);
    });
    
    let html = `<!DOCTYPE NETSCAPE-Bookmark-file-1>
<META HTTP-EQUIV="Content-Type" CONTENT="text/html; charset=UTF-8">
<TITLE>Bookmarks</TITLE>
<H1>Bookmarks</H1>
<DL><p>`;
    
    for (const [folder, items] of Object.entries(folders)) {
      html += `\n    <DT><H3>${folder}</H3>\n    <DL><p>`;
      
      for (const bookmark of items) {
        const addDate = Math.floor(bookmark.dateAdded.getTime() / 1000);
        const tags = bookmark.tags ? ` TAGS="${bookmark.tags.join(',')}"` : '';
        const icon = bookmark.icon ? ` ICON="${bookmark.icon}"` : '';
        
        html += `\n        <DT><A HREF="${bookmark.url}" ADD_DATE="${addDate}"${tags}${icon}>${bookmark.title}</A>`;
        
        if (bookmark.description) {
          html += `\n        <DD>${bookmark.description}`;
        }
      }
      
      html += '\n    </DL><p>';
    }
    
    html += '\n</DL><p>';
    return html;
  }

  /**
   * Generate JSON bookmarks file content
   */
  static generateJSONBookmarks(bookmarks) {
    return JSON.stringify({
      version: '1.0',
      bookmarks: bookmarks.map(b => ({
        url: b.url,
        title: b.title,
        description: b.description,
        tags: b.tags,
        folder: b.folder,
        dateAdded: b.dateAdded.toISOString(),
        icon: b.icon
      }))
    }, null, 2);
  }

  /**
   * Monitor task progress events
   */
  static async monitorTaskProgress(taskManager, taskId) {
    const events = [];
    
    const handler = (event) => {
      if (event.taskId === taskId) {
        events.push({
          type: event.type,
          timestamp: new Date(),
          data: event.data
        });
      }
    };
    
    taskManager.on('task:progress', handler);
    
    return {
      events,
      stop: () => taskManager.off('task:progress', handler),
      getEvents: () => [...events],
      getEventTypes: () => events.map(e => e.type),
      hasEvent: (type) => events.some(e => e.type === type)
    };
  }

  /**
   * Create a mock agent for testing
   */
  static createMockAgent(config = {}) {
    const defaults = {
      agentType: config.agentType || 'mock-agent',
      version: '1.0.0',
      capabilities: {
        description: 'Mock agent for testing',
        inputs: {
          data: { type: 'string', required: true }
        },
        outputs: {
          type: 'mock_result',
          schema: {
            processed: 'boolean',
            result: 'string'
          }
        },
        actions: ['process']
      },
      executeAction: async (action, inputs) => ({
        processed: true,
        result: `Processed: ${inputs.data}`
      })
    };
    
    const agent = {
      ...defaults,
      ...config,
      getAgentCard: function() {
        return {
          name: this.agentType,
          version: this.version,
          description: this.capabilities.description,
          capabilities: this.capabilities,
          protocols: ['a2a'],
          authentication: ['bearer'],
          endpoints: {
            discovery: '/.well-known/agent.json',
            tasks: `/api/agents/${this.agentType}/tasks`,
            capabilities: `/api/agents/${this.agentType}/capabilities`
          }
        };
      },
      processTask: async function(task) {
        const result = await this.executeAction('process', task.context);
        return {
          success: true,
          artifact: {
            type: this.capabilities.outputs.type,
            data: result
          }
        };
      }
    };
    
    return agent;
  }

  /**
   * Assert task state
   */
  static async assertTaskState(taskManager, taskId, expectedState) {
    const task = await taskManager.getTask(taskId);
    
    expect(task).toBeDefined();
    expect(task.status).toBe(expectedState.status);
    
    if (expectedState.error !== undefined) {
      expect(task.error).toBe(expectedState.error);
    }
    
    if (expectedState.hasArtifacts) {
      const artifacts = await db.query(
        'SELECT * FROM a2a_artifacts WHERE task_id = $1',
        [taskId]
      );
      expect(artifacts.rows.length).toBeGreaterThan(0);
    }
    
    if (expectedState.messageCount !== undefined) {
      const messages = await db.query(
        'SELECT * FROM a2a_messages WHERE task_id = $1',
        [taskId]
      );
      expect(messages.rows.length).toBe(expectedState.messageCount);
    }
    
    return task;
  }

  /**
   * Simulate workflow execution
   */
  static async executeWorkflow(taskManager, workflow, initialContext) {
    const tasks = [];
    let previousArtifact = null;
    
    for (const agentType of workflow.agents) {
      const context = previousArtifact
        ? { ...initialContext, ...previousArtifact.data }
        : initialContext;
      
      const task = await taskManager.createTask(agentType, context, {
        workflow: workflow,
        previousTask: tasks[tasks.length - 1]?.id
      });
      
      const result = await taskManager.processTask(task.id);
      tasks.push(result);
      
      if (result.status === 'completed') {
        const artifacts = await db.query(
          'SELECT * FROM a2a_artifacts WHERE task_id = $1',
          [task.id]
        );
        previousArtifact = artifacts.rows[0];
      } else {
        throw new Error(`Workflow failed at ${agentType}: ${result.error}`);
      }
    }
    
    return {
      tasks,
      finalArtifact: previousArtifact,
      success: true
    };
  }

  /**
   * Performance testing helper
   */
  static async measureTaskPerformance(taskManager, agentType, context, iterations = 10) {
    const timings = [];
    
    for (let i = 0; i < iterations; i++) {
      const start = Date.now();
      
      const task = await taskManager.createTask(agentType, {
        ...context,
        iteration: i
      });
      
      await this.waitForTaskCompletion(taskManager, task.id);
      
      const duration = Date.now() - start;
      timings.push(duration);
      
      // Clean up
      await this.cleanupTestData(task.id);
    }
    
    return {
      timings,
      average: timings.reduce((a, b) => a + b, 0) / timings.length,
      min: Math.min(...timings),
      max: Math.max(...timings),
      median: timings.sort((a, b) => a - b)[Math.floor(timings.length / 2)]
    };
  }
}

/**
 * Test data factories
 */
export const TestDataFactory = {
  createTask: (overrides = {}) => ({
    id: `test-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
    type: 'test',
    status: 'pending',
    context: {},
    metadata: {},
    createdAt: new Date(),
    ...overrides
  }),

  createArtifact: (taskId, overrides = {}) => ({
    id: `artifact-${Date.now()}`,
    taskId,
    type: 'test_result',
    data: { test: true },
    immutable: true,
    createdAt: new Date(),
    createdBy: 'test-agent',
    ...overrides
  }),

  createMessage: (taskId, overrides = {}) => ({
    id: `msg-${Date.now()}`,
    taskId,
    agentType: 'test-agent',
    type: 'progress',
    data: { message: 'Test progress' },
    timestamp: new Date(),
    ...overrides
  })
};