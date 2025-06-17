import { EventEmitter } from 'events';
import unifiedLogger from '../services/unifiedLogger.js';

/**
 * A2A-Compliant Agent Base Class
 * Implements Google A2A protocol patterns and standards
 * 
 * All agents must extend this base class to ensure consistency
 * and A2A compliance across the entire system.
 */
export class A2AAgent extends EventEmitter {
  constructor(config) {
    super();
    
    // Required configuration
    if (!config.agentType) {
      throw new Error('agentType is required in agent configuration');
    }
    
    if (!config.capabilities) {
      throw new Error('capabilities are required in agent configuration');
    }
    
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
   * Returns agent metadata in A2A-compliant format
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
      // Validate task structure
      this.validateTask(task);
      
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
      if (!task.artifacts) task.artifacts = [];
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
        metadata: { 
          error: error.message, 
          stack: error.stack,
          duration: Date.now() - startTime
        }
      });

      this.handleError(error, task);
      throw error;
    }
  }

  /**
   * Agent-specific implementation - must be overridden in subclasses
   * @param {Object} task - A2A Task entity
   * @returns {Object} - Agent-specific result data
   */
  async executeAction(task) {
    throw new Error(`executeAction must be implemented by ${this.agentType}`);
  }

  /**
   * A2A Standard: Create immutable artifact
   * @param {Object} data - Result data from agent execution
   * @param {string} taskId - Task ID for reference
   * @returns {Object} - A2A-compliant artifact
   */
  createArtifact(data, taskId) {
    return {
      id: `artifact_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      type: this.capabilities.outputs?.type || `${this.agentType}_result`,
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
   * @param {string} taskId - Task ID
   * @param {Object} message - Message content and metadata
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
    // This will be persisted by the task manager
    this.emit('task:message', { taskId, message: standardMessage });
    
    unifiedLogger.debug('Message sent', {
      service: this.agentType,
      method: 'sendMessage',
      taskId: taskId,
      messageType: message.type,
      progress: message.metadata?.progress
    });
  }

  /**
   * A2A Standard: Validate task structure
   * @param {Object} task - Task to validate
   */
  validateTask(task) {
    if (!task.id) {
      throw new Error('Task must have an id');
    }
    
    if (!task.context) {
      throw new Error('Task must have a context');
    }
    
    if (!task.status) {
      throw new Error('Task must have a status');
    }
  }

  /**
   * A2A Standard: Validate inputs against capabilities
   * @param {Object} context - Task context containing inputs
   */
  validateInputs(context) {
    const required = this.capabilities.inputs || {};
    
    for (const [field, spec] of Object.entries(required)) {
      if (spec.required && !(field in context)) {
        throw new Error(`Required input '${field}' missing for ${this.agentType}`);
      }
      
      // Type validation
      if (field in context && spec.type) {
        const value = context[field];
        const valueType = Array.isArray(value) ? 'array' : typeof value;
        
        if (spec.type !== valueType) {
          throw new Error(`Input '${field}' must be of type '${spec.type}', got '${valueType}'`);
        }
      }
    }
  }

  /**
   * Standard error handling
   * @param {Error} error - Error that occurred
   * @param {Object} task - Task that failed
   */
  handleError(error, task) {
    unifiedLogger.error(`${this.agentType} task failed`, {
      service: this.agentType,
      method: 'handleError',
      error: error.message,
      stack: error.stack,
      taskId: task.id,
      workflowId: task.context?.workflowId
    });
  }

  /**
   * A2A Standard: Report progress during long operations
   * @param {string} taskId - Task ID
   * @param {number} progress - Progress percentage (0-100)
   * @param {string} message - Optional progress message
   */
  async reportProgress(taskId, progress, message = null) {
    await this.sendMessage(taskId, {
      type: 'progress',
      content: message || `${this.agentType} progress: ${progress}%`,
      metadata: { 
        progress: Math.min(100, Math.max(0, progress))
      }
    });
  }

  /**
   * A2A Standard: Agent endpoints for HTTP access
   * @returns {Object} - Endpoint definitions
   */
  getEndpoints() {
    return {
      task: `/api/agents/${this.agentType}/task`,
      status: `/api/agents/${this.agentType}/status/{taskId}`,
      stream: `/api/agents/${this.agentType}/stream/{taskId}`,
      capabilities: `/api/agents/${this.agentType}/capabilities`
    };
  }

  /**
   * Helper: Get previous agent's artifact from task
   * @param {Object} task - Current task
   * @param {string} agentType - Previous agent type
   * @returns {Object|null} - Previous agent's artifact or null
   */
  getPreviousArtifact(task, agentType) {
    if (!task.artifacts || !Array.isArray(task.artifacts)) {
      return null;
    }
    
    // Find most recent artifact from specified agent
    const artifacts = task.artifacts.filter(a => a.agentType === agentType);
    return artifacts.length > 0 ? artifacts[artifacts.length - 1] : null;
  }

  /**
   * Helper: Extract data from previous artifacts
   * @param {Object} task - Current task
   * @returns {Object} - Merged data from all previous artifacts
   */
  extractPreviousData(task) {
    if (!task.artifacts || !Array.isArray(task.artifacts)) {
      return {};
    }
    
    const mergedData = {};
    
    for (const artifact of task.artifacts) {
      if (artifact.data) {
        Object.assign(mergedData, artifact.data);
      }
    }
    
    return mergedData;
  }
}

export default A2AAgent;