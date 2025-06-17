import { EventEmitter } from 'events';
import db from '../db/index.js';
import unifiedLogger from './unifiedLogger.js';
import websocketService from './websocketService.js';

/**
 * A2A-Compliant Task Management Service
 * Manages task lifecycle according to Google A2A standards
 * 
 * This service orchestrates agent workflows while maintaining
 * minimal coupling and maximum flexibility.
 */
export class A2ATaskManager extends EventEmitter {
  constructor() {
    super();
    
    // Store active tasks in memory for quick access
    this.activeTasks = new Map();
    
    // Registered agents
    this.agents = new Map();
    
    // A2A workflow definitions
    this.workflows = {
      full_import: ['import', 'validation', 'enrichment', 'categorization', 'embedding'],
      quick_import: ['import', 'validation'],
      validation_only: ['validation'],
      enrichment_only: ['enrichment'],
      reprocess: ['validation', 'enrichment', 'categorization', 'embedding']
    };
    
    // Initialize agent message handlers
    this.setupMessageHandlers();
    
    unifiedLogger.info('A2A Task Manager initialized', {
      service: 'a2aTaskManager',
      method: 'constructor',
      workflows: Object.keys(this.workflows)
    });
  }

  /**
   * A2A Standard: Create and start task
   * @param {string} workflowType - Type of workflow to execute
   * @param {Object} context - Task context data
   * @param {Object} options - Additional options
   * @returns {Object} - Created task
   */
  async createTask(workflowType, context, options = {}) {
    const taskId = `task_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    // Validate workflow type
    if (!this.workflows[workflowType]) {
      throw new Error(`Unknown workflow type: ${workflowType}`);
    }
    
    const task = {
      id: taskId,
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
      context: { ...context, ...options },
      metadata: options.metadata || {}
    };

    // Store in database
    await this.persistTask(task);
    
    // Store in memory
    this.activeTasks.set(taskId, task);
    
    // Emit task created event
    this.emit('task:created', task);
    
    // Send WebSocket notification
    if (context.userId) {
      websocketService.emitToUser(context.userId, 'task:created', {
        taskId: task.id,
        type: task.type,
        status: task.status
      });
    }
    
    unifiedLogger.info('Task created', {
      service: 'a2aTaskManager',
      method: 'createTask',
      taskId: task.id,
      workflowType,
      agentCount: task.workflow.agents.length
    });
    
    // Start first agent
    await this.executeNextAgent(task);
    
    return task;
  }

  /**
   * Execute next agent in workflow pipeline
   * @param {Object} task - Current task
   */
  async executeNextAgent(task) {
    const { agents, currentStep } = task.workflow;
    
    if (currentStep >= agents.length) {
      // Workflow complete
      await this.completeTask(task);
      return;
    }

    const agentType = agents[currentStep];
    const agent = this.agents.get(agentType);
    
    if (!agent) {
      throw new Error(`Agent '${agentType}' not registered`);
    }

    // Update task status
    task.workflow.currentAgent = agentType;
    task.workflow.currentStep = currentStep;
    task.status = 'running';
    task.updated = new Date().toISOString();
    
    await this.updateTaskStatus(task);

    try {
      unifiedLogger.info('Executing agent', {
        service: 'a2aTaskManager',
        method: 'executeNextAgent',
        taskId: task.id,
        agentType,
        step: `${currentStep + 1}/${agents.length}`
      });
      
      // Process with agent
      const updatedTask = await agent.processTask(task);
      
      // Handle agent completion
      await this.onAgentComplete(updatedTask, agentType);
      
    } catch (error) {
      await this.failTask(task, error.message);
    }
  }

  /**
   * Handle agent completion and transition
   * @param {Object} task - Updated task from agent
   * @param {string} completedAgent - Agent that just completed
   */
  async onAgentComplete(task, completedAgent) {
    unifiedLogger.info('Agent completed', {
      service: 'a2aTaskManager',
      method: 'onAgentComplete',
      taskId: task.id,
      completedAgent,
      artifactCount: task.artifacts.length
    });
    
    // Special handling for import agent (creates bookmarkIds)
    if (completedAgent === 'import') {
      const importArtifact = task.artifacts.find(a => a.agentType === 'import');
      if (importArtifact && importArtifact.data.bookmarkIds) {
        // Transition from file-based to bookmark-based processing
        const bookmarkIds = importArtifact.data.bookmarkIds;
        
        unifiedLogger.info('Import agent created bookmarks', {
          service: 'a2aTaskManager',
          method: 'onAgentComplete',
          taskId: task.id,
          bookmarkCount: bookmarkIds.length
        });
        
        // For subsequent agents, we need to process each bookmark
        // Store bookmarkIds in context for next agents
        task.context.bookmarkIds = bookmarkIds;
        task.context.totalBookmarks = bookmarkIds.length;
        
        // Create sub-tasks for each bookmark if needed
        // For now, we'll process in the same task with progress tracking
      }
    }

    // Update task in memory
    this.activeTasks.set(task.id, task);
    
    // Persist artifacts and messages
    await this.persistArtifacts(task);
    await this.persistMessages(task);

    // Move to next agent
    task.workflow.currentStep++;
    await this.executeNextAgent(task);
  }

  /**
   * Complete a task successfully
   * @param {Object} task - Task to complete
   */
  async completeTask(task) {
    task.status = 'completed';
    task.updated = new Date().toISOString();
    
    await this.updateTaskStatus(task);
    
    // Remove from active tasks
    this.activeTasks.delete(task.id);
    
    // Emit completion event
    this.emit('task:completed', task);
    
    // Send WebSocket notification
    if (task.context.userId) {
      websocketService.emitToUser(task.context.userId, 'task:completed', {
        taskId: task.id,
        type: task.type,
        artifactCount: task.artifacts.length,
        duration: new Date(task.updated) - new Date(task.created)
      });
    }
    
    unifiedLogger.info('Task completed', {
      service: 'a2aTaskManager',
      method: 'completeTask',
      taskId: task.id,
      type: task.type,
      duration: new Date(task.updated) - new Date(task.created),
      artifactCount: task.artifacts.length
    });
  }

  /**
   * Fail a task with error
   * @param {Object} task - Task to fail
   * @param {string} errorMessage - Error message
   */
  async failTask(task, errorMessage) {
    task.status = 'failed';
    task.updated = new Date().toISOString();
    task.metadata.errorMessage = errorMessage;
    
    await this.updateTaskStatus(task, errorMessage);
    
    // Remove from active tasks
    this.activeTasks.delete(task.id);
    
    // Emit failure event
    this.emit('task:failed', task);
    
    // Send WebSocket notification
    if (task.context.userId) {
      websocketService.emitToUser(task.context.userId, 'task:failed', {
        taskId: task.id,
        type: task.type,
        error: errorMessage
      });
    }
    
    unifiedLogger.error('Task failed', {
      service: 'a2aTaskManager',
      method: 'failTask',
      taskId: task.id,
      type: task.type,
      error: errorMessage
    });
  }

  /**
   * A2A Standard: Get task status
   * @param {string} taskId - Task ID
   * @returns {Object} - Task or null
   */
  async getTask(taskId) {
    // Check memory first
    if (this.activeTasks.has(taskId)) {
      return this.activeTasks.get(taskId);
    }
    
    // Load from database
    const result = await db.query(
      `SELECT * FROM a2a_tasks WHERE id = $1`,
      [taskId]
    );
    
    if (result.rows.length === 0) {
      return null;
    }
    
    const task = this.dbRowToTask(result.rows[0]);
    
    // Load artifacts and messages
    task.artifacts = await this.loadArtifacts(taskId);
    task.messages = await this.loadMessages(taskId);
    
    return task;
  }

  /**
   * A2A Standard: Register agent
   * @param {Object} agent - Agent instance
   */
  registerAgent(agent) {
    if (!agent.agentType) {
      throw new Error('Agent must have agentType property');
    }
    
    this.agents.set(agent.agentType, agent);
    
    // Register agent capabilities in database
    this.registerAgentCapabilities(agent);
    
    // Set up agent event listeners
    agent.on('message', (message) => {
      this.handleAgentMessage(message);
    });
    
    agent.on('task:message', ({ taskId, message }) => {
      this.addTaskMessage(taskId, message);
    });
    
    unifiedLogger.info('Agent registered', {
      service: 'a2aTaskManager',
      method: 'registerAgent',
      agentType: agent.agentType,
      version: agent.version
    });
  }

  /**
   * Register agent capabilities for discovery
   * @param {Object} agent - Agent instance
   */
  async registerAgentCapabilities(agent) {
    const agentCard = agent.getAgentCard();
    
    await db.query(
      `INSERT INTO a2a_agent_capabilities 
       (agent_type, version, description, capabilities, endpoints, authentication, protocols, status)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       ON CONFLICT (agent_type) DO UPDATE SET
         version = EXCLUDED.version,
         description = EXCLUDED.description,
         capabilities = EXCLUDED.capabilities,
         endpoints = EXCLUDED.endpoints,
         updated = NOW()`,
      [
        agent.agentType,
        agentCard.version,
        agentCard.description,
        JSON.stringify(agentCard.capabilities),
        JSON.stringify(agentCard.endpoints),
        agentCard.authentication,
        agentCard.protocols,
        'active'
      ]
    );
  }

  /**
   * Get all registered agent capabilities
   * @returns {Array} - List of agent capabilities
   */
  async getAgentCapabilities() {
    const result = await db.query(
      `SELECT * FROM a2a_agent_capabilities WHERE status = 'active'`
    );
    
    return result.rows.map(row => ({
      agentType: row.agent_type,
      version: row.version,
      description: row.description,
      capabilities: row.capabilities,
      endpoints: row.endpoints,
      authentication: row.authentication,
      protocols: row.protocols
    }));
  }

  /**
   * Set up message handlers for agent communication
   */
  setupMessageHandlers() {
    // Handle messages from agents
    this.on('agent:message', async (message) => {
      await this.handleAgentMessage(message);
    });
  }

  /**
   * Handle message from agent
   * @param {Object} message - Message from agent
   */
  async handleAgentMessage(message) {
    // Broadcast via WebSocket for real-time updates
    const task = this.activeTasks.get(message.taskId);
    if (task && task.context.userId) {
      websocketService.emitToUser(task.context.userId, 'task:progress', {
        taskId: message.taskId,
        agentType: message.agentType,
        type: message.type,
        content: message.content,
        metadata: message.metadata
      });
    }
  }

  /**
   * Add message to task
   * @param {string} taskId - Task ID
   * @param {Object} message - Message to add
   */
  async addTaskMessage(taskId, message) {
    const task = this.activeTasks.get(taskId);
    if (task) {
      task.messages.push(message);
      
      // Emit message event for SSE
      this.emit('task:message', {
        taskId,
        agentType: message.agentType,
        type: message.type || 'info',
        content: message.content,
        metadata: message.metadata || {},
        timestamp: new Date().toISOString()
      });
    }
  }
  
  /**
   * Update task progress
   * @param {string} taskId - Task ID
   * @param {number} progress - Progress percentage (0-100)
   * @param {Object} metadata - Additional progress metadata
   */
  async updateTaskProgress(taskId, progress, metadata = {}) {
    const task = this.activeTasks.get(taskId);
    if (!task) return;
    
    task.metadata.progress = progress;
    task.metadata.progressMetadata = {
      ...task.metadata.progressMetadata,
      ...metadata
    };
    
    // Emit progress event
    this.emit('task:progress', {
      taskId,
      progress,
      currentAgent: task.workflow.currentAgent,
      currentStep: task.workflow.currentStep,
      totalSteps: task.workflow.totalSteps,
      metadata
    });
    
    // Also emit via WebSocket
    if (task.context.userId) {
      websocketService.emitToUser(task.context.userId, 'task:progress', {
        taskId,
        progress,
        currentAgent: task.workflow.currentAgent,
        currentStep: task.workflow.currentStep,
        totalSteps: task.workflow.totalSteps,
        metadata
      });
    }
  }

  /**
   * Persist task to database
   * @param {Object} task - Task to persist
   */
  async persistTask(task) {
    await db.query(
      `INSERT INTO a2a_tasks 
       (id, type, status, created, updated, workflow_type, workflow_agents, 
        current_agent, current_step, total_steps, context, user_id, metadata)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)`,
      [
        task.id,
        task.type,
        task.status,
        task.created,
        task.updated,
        task.workflow.type,
        task.workflow.agents,
        task.workflow.currentAgent,
        task.workflow.currentStep,
        task.workflow.totalSteps,
        JSON.stringify(task.context),
        task.context.userId || null,
        JSON.stringify(task.metadata)
      ]
    );
  }

  /**
   * Update task status in database
   * @param {Object} task - Task to update
   * @param {string} errorMessage - Optional error message
   */
  async updateTaskStatus(task, errorMessage = null) {
    await db.query(
      `UPDATE a2a_tasks 
       SET status = $2, updated = $3, current_agent = $4, current_step = $5, 
           error_message = $6, metadata = $7
       WHERE id = $1`,
      [
        task.id,
        task.status,
        task.updated,
        task.workflow.currentAgent,
        task.workflow.currentStep,
        errorMessage,
        JSON.stringify(task.metadata)
      ]
    );
  }

  /**
   * Persist artifacts to database
   * @param {Object} task - Task with artifacts
   */
  async persistArtifacts(task) {
    // Only persist new artifacts
    const existingArtifactIds = new Set();
    const result = await db.query(
      `SELECT id FROM a2a_artifacts WHERE task_id = $1`,
      [task.id]
    );
    result.rows.forEach(row => existingArtifactIds.add(row.id));
    
    for (const artifact of task.artifacts) {
      if (!existingArtifactIds.has(artifact.id)) {
        await db.query(
          `INSERT INTO a2a_artifacts 
           (id, task_id, agent_type, type, mime_type, data, created, immutable, metadata)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
          [
            artifact.id,
            task.id,
            artifact.agentType,
            artifact.type,
            artifact.mimeType,
            JSON.stringify(artifact.data),
            artifact.created,
            artifact.immutable,
            JSON.stringify(artifact.metadata || {})
          ]
        );
      }
    }
  }

  /**
   * Persist messages to database
   * @param {Object} task - Task with messages
   */
  async persistMessages(task) {
    // Only persist new messages
    const existingMessageIds = new Set();
    const result = await db.query(
      `SELECT id FROM a2a_messages WHERE task_id = $1`,
      [task.id]
    );
    result.rows.forEach(row => existingMessageIds.add(row.id));
    
    for (const message of task.messages) {
      if (!existingMessageIds.has(message.id)) {
        await db.query(
          `INSERT INTO a2a_messages 
           (id, task_id, agent_type, type, content, timestamp, metadata)
           VALUES ($1, $2, $3, $4, $5, $6, $7)`,
          [
            message.id,
            task.id,
            message.agentType,
            message.type,
            message.content,
            message.timestamp,
            JSON.stringify(message.metadata || {})
          ]
        );
      }
    }
  }

  /**
   * Load artifacts from database
   * @param {string} taskId - Task ID
   * @returns {Array} - List of artifacts
   */
  async loadArtifacts(taskId) {
    const result = await db.query(
      `SELECT * FROM a2a_artifacts WHERE task_id = $1 ORDER BY created`,
      [taskId]
    );
    
    return result.rows.map(row => ({
      id: row.id,
      taskId: row.task_id,
      agentType: row.agent_type,
      type: row.type,
      mimeType: row.mime_type,
      data: row.data,
      created: row.created,
      immutable: row.immutable,
      metadata: row.metadata
    }));
  }

  /**
   * Load messages from database
   * @param {string} taskId - Task ID
   * @returns {Array} - List of messages
   */
  async loadMessages(taskId) {
    const result = await db.query(
      `SELECT * FROM a2a_messages WHERE task_id = $1 ORDER BY timestamp`,
      [taskId]
    );
    
    return result.rows.map(row => ({
      id: row.id,
      taskId: row.task_id,
      agentType: row.agent_type,
      type: row.type,
      content: row.content,
      timestamp: row.timestamp,
      metadata: row.metadata
    }));
  }

  /**
   * Convert database row to task object
   * @param {Object} row - Database row
   * @returns {Object} - Task object
   */
  dbRowToTask(row) {
    return {
      id: row.id,
      type: row.type,
      status: row.status,
      created: row.created,
      updated: row.updated,
      artifacts: [],
      messages: [],
      workflow: {
        type: row.workflow_type,
        agents: row.workflow_agents,
        currentAgent: row.current_agent,
        currentStep: row.current_step,
        totalSteps: row.total_steps
      },
      context: row.context,
      metadata: row.metadata
    };
  }

  /**
   * Get task statistics
   * @returns {Object} - Task statistics
   */
  async getTaskStats() {
    const result = await db.query(`
      SELECT 
        COUNT(*) as total,
        COUNT(CASE WHEN status = 'pending' THEN 1 END) as pending,
        COUNT(CASE WHEN status = 'running' THEN 1 END) as running,
        COUNT(CASE WHEN status = 'completed' THEN 1 END) as completed,
        COUNT(CASE WHEN status = 'failed' THEN 1 END) as failed
      FROM a2a_tasks
      WHERE created > NOW() - INTERVAL '24 hours'
    `);
    
    return result.rows[0];
  }

  /**
   * Register an agent with the task manager
   * @param {Object} agent - Agent to register
   */
  async registerAgent(agent) {
    if (!agent.agentType) {
      throw new Error('Agent must have agentType property');
    }
    
    this.agents.set(agent.agentType, agent);
    
    unifiedLogger.info('Agent registered with task manager', {
      service: 'a2aTaskManager',
      method: 'registerAgent',
      agentType: agent.agentType,
      capabilities: agent.capabilities ? Object.keys(agent.capabilities.inputs || {}) : []
    });
  }

  /**
   * Get registered agent by type
   * @param {string} agentType - Type of agent
   * @returns {Object|null} - Agent or null
   */
  async getAgent(agentType) {
    return this.agents.get(agentType) || null;
  }

  /**
   * Get all registered agents
   * @returns {Array} - Array of registered agents
   */
  async getRegisteredAgents() {
    return Array.from(this.agents.values());
  }

  /**
   * Reset task manager - clear all data
   */
  async reset() {
    this.activeTasks.clear();
    this.agents.clear();
    
    unifiedLogger.info('Task manager reset', {
      service: 'a2aTaskManager',
      method: 'reset'
    });
  }

  /**
   * Stream task events via Server-Sent Events
   * @param {string} taskId - Task ID to stream
   * @param {Object} res - Express response object
   */
  streamTaskEvents(taskId, res) {
    // Set up SSE headers
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
      'X-Accel-Buffering': 'no' // Disable Nginx buffering
    });

    // Send initial connection event
    res.write(`event: connected\ndata: ${JSON.stringify({ taskId })}\n\n`);

    // Set up event listeners
    const handleProgress = (data) => {
      if (data.taskId === taskId) {
        res.write(`event: progress\ndata: ${JSON.stringify(data)}\n\n`);
      }
    };

    const handleComplete = (task) => {
      if (task.id === taskId) {
        res.write(`event: complete\ndata: ${JSON.stringify({ taskId, status: 'completed' })}\n\n`);
        cleanup();
      }
    };

    const handleFailed = (task) => {
      if (task.id === taskId) {
        res.write(`event: error\ndata: ${JSON.stringify({ taskId, status: 'failed', error: task.metadata.errorMessage })}\n\n`);
        cleanup();
      }
    };

    // Register listeners
    this.on('task:progress', handleProgress);
    this.on('task:completed', handleComplete);
    this.on('task:failed', handleFailed);

    // Cleanup function
    const cleanup = () => {
      this.removeListener('task:progress', handleProgress);
      this.removeListener('task:completed', handleComplete);
      this.removeListener('task:failed', handleFailed);
      res.end();
    };

    // Handle client disconnect
    res.on('close', cleanup);

    // Send heartbeat every 30 seconds
    const heartbeat = setInterval(() => {
      res.write(':heartbeat\n\n');
    }, 30000);

    res.on('close', () => {
      clearInterval(heartbeat);
    });
  }
}

// Export singleton instance
export default new A2ATaskManager();