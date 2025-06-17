# A2A-Compliant Agent Architecture Design
## Unified Agent System Following Google A2A Standard

### Overview
Design a bookmark processing system that follows Google's Agent2Agent (A2A) protocol principles and standards, enabling future interoperability while maintaining efficient internal coordination.

## A2A Core Principles Integration

### 1. Embrace Agentic Capabilities
- Each agent operates independently with clear capabilities
- Agents collaborate without shared memory/context
- Natural, unstructured communication patterns

### 2. Build on Existing Standards
- HTTP/HTTPS for agent discovery
- JSON-RPC 2.0 for communication
- Server-Sent Events (SSE) for streaming
- JSON for data exchange

### 3. Secure by Default
- Enterprise-grade authentication
- Authorization controls
- Secure agent-to-agent communication

### 4. Support Long-Running Tasks
- Tasks can run from seconds to hours
- Persistent task state management
- Human-in-the-loop support

### 5. Modality Agnostic
- Support text, files, structured data
- Extensible for future media types

## A2A-Compliant Architecture

### AgentCard Standard (/.well-known/agent.json)
```json
{
  "name": "bookmark-import-agent",
  "version": "1.0.0",
  "description": "Processes bookmark files and inserts into database",
  "capabilities": {
    "inputs": {
      "filePath": { "type": "string", "required": true },
      "userId": { "type": "string", "required": true },
      "importId": { "type": "string", "required": true }
    },
    "outputs": {
      "bookmarkIds": { "type": "array", "items": "string" },
      "totalBookmarks": { "type": "number" },
      "artifacts": { "type": "array", "items": "object" }
    },
    "estimatedDuration": "30-300s",
    "maxConcurrency": 1,
    "supportsStreaming": true
  },
  "endpoints": {
    "task": "/api/agents/import/task",
    "status": "/api/agents/import/status/{taskId}",
    "stream": "/api/agents/import/stream/{taskId}"
  },
  "authentication": ["bearer", "oauth2"],
  "protocols": ["a2a", "http"]
}
```

### Task-Centric Data Model
```javascript
// A2A Task Entity
{
  id: "task_12345_abc",
  type: "bookmark_import_workflow", 
  status: "running", // pending, running, completed, failed, cancelled
  created: "2025-06-17T00:00:00Z",
  updated: "2025-06-17T00:05:00Z",
  
  // A2A Standard Fields
  artifacts: [
    {
      id: "artifact_1",
      type: "bookmark_list",
      mimeType: "application/json",
      data: { bookmarkIds: [...], totalBookmarks: 5535 },
      created: "2025-06-17T00:05:00Z",
      immutable: true
    }
  ],
  
  messages: [
    {
      id: "msg_1",
      type: "progress",
      content: "Processing chunk 10/55",
      timestamp: "2025-06-17T00:02:00Z",
      metadata: { progress: 18 }
    }
  ],
  
  // Workflow-specific
  workflow: {
    type: "full_import",
    agents: ["import", "validation", "enrichment", "categorization", "embedding"],
    currentAgent: "import",
    currentStep: 1,
    totalSteps: 5
  },
  
  // Context for agent collaboration
  context: {
    userId: "user_123",
    workflowId: "workflow_456",
    options: { enableValidation: true }
  }
}
```

### Standardized Agent Base Class
```javascript
import { EventEmitter } from 'events';
import unifiedLogger from '../services/unifiedLogger.js';

/**
 * A2A-Compliant Agent Base Class
 * Implements Google A2A protocol patterns and standards
 */
export class A2AAgent extends EventEmitter {
  constructor(config) {
    super();
    this.agentType = config.agentType;
    this.capabilities = config.capabilities;
    this.version = config.version || "1.0.0";
    
    unifiedLogger.info('A2A Agent initialized', {
      service: this.agentType,
      method: 'constructor',
      version: this.version,
      capabilities: Object.keys(this.capabilities.inputs || {})
    });
  }

  /**
   * A2A Standard: AgentCard for service discovery
   */
  getAgentCard() {
    return {
      name: this.agentType,
      version: this.version,
      description: this.capabilities.description,
      capabilities: this.capabilities,
      endpoints: this.getEndpoints(),
      authentication: ["bearer"],
      protocols: ["a2a", "http"]
    };
  }

  /**
   * A2A Standard: Task processing entry point
   * @param {Object} task - A2A Task entity
   * @returns {Object} - Updated task with artifacts
   */
  async processTask(task) {
    const startTime = Date.now();
    
    try {
      // Validate inputs against capabilities
      this.validateInputs(task.context);
      
      // Send initial progress message
      await this.sendMessage(task.id, {
        type: "progress",
        content: `${this.agentType} agent started`,
        metadata: { progress: 0 }
      });

      // Execute agent-specific logic
      const result = await this.executeAction(task);
      
      // Create immutable artifact
      const artifact = this.createArtifact(result, task.id);
      
      // Update task with artifact
      task.artifacts.push(artifact);
      task.status = "completed";
      task.updated = new Date().toISOString();
      
      // Send completion message
      await this.sendMessage(task.id, {
        type: "completion",
        content: `${this.agentType} completed successfully`,
        metadata: { 
          progress: 100,
          duration: Date.now() - startTime,
          artifactId: artifact.id
        }
      });

      unifiedLogger.info('Task completed successfully', {
        service: this.agentType,
        method: 'processTask',
        taskId: task.id,
        duration: Date.now() - startTime,
        artifactCount: task.artifacts.length
      });

      return task;
      
    } catch (error) {
      task.status = "failed";
      task.updated = new Date().toISOString();
      
      await this.sendMessage(task.id, {
        type: "error",
        content: `${this.agentType} failed: ${error.message}`,
        metadata: { error: error.message, stack: error.stack }
      });

      this.handleError(error, task);
      throw error;
    }
  }

  /**
   * Agent-specific implementation - override in subclasses
   */
  async executeAction(task) {
    throw new Error(`executeAction must be implemented by ${this.agentType}`);
  }

  /**
   * A2A Standard: Create immutable artifact
   */
  createArtifact(data, taskId) {
    return {
      id: `artifact_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      type: this.capabilities.outputs.type || `${this.agentType}_result`,
      mimeType: "application/json",
      data: data,
      created: new Date().toISOString(),
      immutable: true,
      taskId: taskId,
      agentType: this.agentType
    };
  }

  /**
   * A2A Standard: Send progress messages
   */
  async sendMessage(taskId, message) {
    const standardMessage = {
      id: `msg_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      taskId: taskId,
      agentType: this.agentType,
      timestamp: new Date().toISOString(),
      ...message
    };

    // Emit for real-time updates (SSE)
    this.emit('message', standardMessage);
    
    // Store in task messages array
    // Implementation will persist to database/redis
    
    unifiedLogger.debug('Message sent', {
      service: this.agentType,
      method: 'sendMessage',
      taskId: taskId,
      messageType: message.type,
      progress: message.metadata?.progress
    });
  }

  /**
   * A2A Standard: Validate inputs against capabilities
   */
  validateInputs(context) {
    const required = this.capabilities.inputs;
    
    for (const [field, spec] of Object.entries(required)) {
      if (spec.required && !(field in context)) {
        throw new Error(`Required input '${field}' missing for ${this.agentType}`);
      }
    }
  }

  /**
   * Standard error handling
   */
  handleError(error, task) {
    unifiedLogger.error(`${this.agentType} task failed`, {
      service: this.agentType,
      method: 'handleError',
      error: error.message,
      stack: error.stack,
      taskId: task.id,
      workflowId: task.context.workflowId
    });
  }

  /**
   * A2A Standard: Agent endpoints for HTTP access
   */
  getEndpoints() {
    return {
      task: `/api/agents/${this.agentType}/task`,
      status: `/api/agents/${this.agentType}/status/{taskId}`,
      stream: `/api/agents/${this.agentType}/stream/{taskId}`,
      capabilities: `/api/agents/${this.agentType}/capabilities`
    };
  }
}
```

### Specific Agent Implementations

#### Import Agent (A2A-Compliant)
```javascript
import { A2AAgent } from './baseAgent.js';

export class ImportAgent extends A2AAgent {
  constructor() {
    super({
      agentType: 'import',
      version: '1.0.0',
      capabilities: {
        description: 'Processes bookmark files and inserts into database',
        inputs: {
          filePath: { type: 'string', required: true },
          userId: { type: 'string', required: true },
          importId: { type: 'string', required: true }
        },
        outputs: {
          type: 'bookmark_import_result',
          bookmarkIds: { type: 'array', items: 'string' },
          totalBookmarks: { type: 'number' }
        },
        estimatedDuration: '30-300s',
        maxConcurrency: 1
      }
    });
  }

  async executeAction(task) {
    const { filePath, userId, importId } = task.context;
    
    // Parse bookmarks from file
    const bookmarks = await this.parseBookmarksFromFile(filePath);
    
    // Insert in chunks with progress updates
    const insertedBookmarks = await this.insertBookmarksInChunks(
      bookmarks, 
      userId, 
      importId, 
      task
    );
    
    return {
      bookmarkIds: insertedBookmarks.map(b => b.id),
      totalBookmarks: bookmarks.length,
      insertedCount: insertedBookmarks.length,
      importId: importId
    };
  }

  async insertBookmarksInChunks(bookmarks, userId, importId, task) {
    const chunkSize = 100;
    const totalChunks = Math.ceil(bookmarks.length / chunkSize);
    const insertedBookmarks = [];
    
    for (let i = 0; i < bookmarks.length; i += chunkSize) {
      const chunk = bookmarks.slice(i, i + chunkSize);
      const chunkNum = Math.floor(i / chunkSize) + 1;
      
      // Insert chunk
      const inserted = await this.insertChunk(chunk, userId, importId);
      insertedBookmarks.push(...inserted);
      
      // Send progress message
      const progress = Math.round((chunkNum / totalChunks) * 100);
      await this.sendMessage(task.id, {
        type: 'progress',
        content: `Processed chunk ${chunkNum}/${totalChunks}`,
        metadata: { 
          progress: progress,
          chunkNum: chunkNum,
          totalChunks: totalChunks,
          processedBookmarks: insertedBookmarks.length
        }
      });
    }
    
    return insertedBookmarks;
  }
}
```

### A2A-Compliant Task Manager
```javascript
/**
 * A2A-Compliant Task Management Service
 * Manages task lifecycle according to A2A standards
 */
export class A2ATaskManager {
  constructor() {
    this.activeTasks = new Map();
    this.agents = new Map();
    
    // A2A workflow definitions
    this.workflows = {
      full_import: ['import', 'validation', 'enrichment', 'categorization', 'embedding'],
      quick_import: ['import', 'validation'],
      validation_only: ['validation']
    };
  }

  /**
   * A2A Standard: Create and start task
   */
  async createTask(workflowType, context, options = {}) {
    const task = {
      id: `task_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      type: workflowType,
      status: 'pending',
      created: new Date().toISOString(),
      updated: new Date().toISOString(),
      artifacts: [],
      messages: [],
      workflow: {
        type: workflowType,
        agents: this.workflows[workflowType],
        currentAgent: null,
        currentStep: 0,
        totalSteps: this.workflows[workflowType].length
      },
      context: { ...context, ...options }
    };

    // Store task
    this.activeTasks.set(task.id, task);
    
    // Start first agent
    await this.executeNextAgent(task);
    
    return task;
  }

  /**
   * Execute next agent in workflow pipeline
   */
  async executeNextAgent(task) {
    const { agents, currentStep } = task.workflow;
    
    if (currentStep >= agents.length) {
      // Workflow complete
      task.status = 'completed';
      task.updated = new Date().toISOString();
      return;
    }

    const agentType = agents[currentStep];
    const agent = this.agents.get(agentType);
    
    if (!agent) {
      throw new Error(`Agent '${agentType}' not found`);
    }

    // Update task status
    task.workflow.currentAgent = agentType;
    task.workflow.currentStep = currentStep;
    task.status = 'running';
    task.updated = new Date().toISOString();

    try {
      // Process with agent
      const updatedTask = await agent.processTask(task);
      
      // Handle agent completion
      await this.onAgentComplete(updatedTask, agentType);
      
    } catch (error) {
      task.status = 'failed';
      task.updated = new Date().toISOString();
      throw error;
    }
  }

  /**
   * Handle agent completion and transition
   */
  async onAgentComplete(task, completedAgent) {
    // Special handling for import agent (creates bookmarkIds)
    if (completedAgent === 'import') {
      const importArtifact = task.artifacts.find(a => a.agentType === 'import');
      if (importArtifact && importArtifact.data.bookmarkIds) {
        // Transition from file-based to bookmark-based processing
        task.context.bookmarkIds = importArtifact.data.bookmarkIds;
      }
    }

    // Move to next agent
    task.workflow.currentStep++;
    await this.executeNextAgent(task);
  }

  /**
   * A2A Standard: Get task status
   */
  getTask(taskId) {
    return this.activeTasks.get(taskId);
  }

  /**
   * A2A Standard: Register agent
   */
  registerAgent(agent) {
    this.agents.set(agent.agentType, agent);
    
    unifiedLogger.info('Agent registered', {
      service: 'taskManager',
      method: 'registerAgent',
      agentType: agent.agentType,
      version: agent.version
    });
  }
}
```

## Migration Checklist

### Phase 1: Foundation
- [ ] Create A2A base agent class
- [ ] Create A2A task manager
- [ ] Update database schema for tasks/artifacts
- [ ] Create agent discovery endpoints

### Phase 2: Agent Migration
- [ ] Migrate Import Agent to A2A pattern
- [ ] Migrate Validation Agent (replace Puppeteer with Playwright)
- [ ] Migrate Enrichment Agent
- [ ] Migrate Categorization Agent (integrate Claude Code)
- [ ] Migrate Embedding Agent

### Phase 3: Integration
- [ ] Update import routes to use A2A task manager
- [ ] Update frontend to use A2A task/artifact APIs
- [ ] Add SSE streaming for real-time updates
- [ ] Remove old orchestrator/services

### Phase 4: A2A Compliance
- [ ] Add HTTP endpoints for external A2A access
- [ ] Implement AgentCard discovery
- [ ] Add authentication/authorization
- [ ] Test A2A interoperability

## Benefits of A2A Compliance

1. **Future Interoperability**: Can integrate with other A2A-compliant systems
2. **Industry Standards**: Following Google's enterprise-grade patterns
3. **Task Persistence**: Better tracking and debugging
4. **Artifact Management**: Immutable results for audit trails
5. **Real-time Updates**: SSE streaming for live progress
6. **Agent Discovery**: Automatic capability detection
7. **Scalability**: Enterprise-ready architecture patterns