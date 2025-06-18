import EventEmitter from 'events';
import Bull from 'bull';
import db from '../config/database.js';
import unifiedLogger from './unifiedLogger.js';
import websocketService from './websocketService.js';
import a2aTaskManager from './a2aTaskManager.js';

// Redis configuration
const redisConfig = process.env.REDIS_URL ? 
  process.env.REDIS_URL : 
  {
    port: 6379,
    host: 'localhost',
  };

/**
 * Orchestrator Service - MIGRATION IN PROGRESS TO A2A
 * 
 * This service is being migrated to use A2A Task Manager.
 * It now acts as an adapter layer, delegating to A2A while maintaining
 * backward compatibility with existing routes.
 * 
 * TODO: Once all routes are updated to use A2A directly, this service can be removed.
 * 
 * Migration Status:
 * - startWorkflow: ✅ Delegates to A2A createTask
 * - getDashboardData: ✅ Uses A2A task stats
 * - performHealthCheck: ✅ Uses A2A agent health
 * - Other methods: 🚧 Still using Bull queues
 */
class OrchestratorService extends EventEmitter {
  constructor() {
    super();
    
    // Initialize queues for different agent types
    this.queues = {
      validation: new Bull('bookmark-validation', redisConfig),
      enrichment: new Bull('bookmark-enrichment', redisConfig),
      categorization: new Bull('bookmark-categorization', redisConfig),
      embedding: new Bull('bookmark-embedding', redisConfig),
      screenshot: new Bull('bookmark-screenshot', redisConfig),
    };
    
    // Workflow definitions
    this.workflows = {
      standard: ['validation', 'enrichment', 'categorization', 'embedding'],
      quick: ['validation', 'categorization'],
      full: ['validation', 'enrichment', 'categorization', 'embedding', 'screenshot'],
    };
    
    // Agent status tracking
    this.agentStatus = new Map();
    
    // Workflow tracking
    this.activeWorkflows = new Map();
    
    // Initialize monitoring
    this.initializeMonitoring();

    unifiedLogger.info('OrchestratorService initialized', {
      service: 'orchestratorService',
      source: 'constructor',
      queues: Object.keys(this.queues),
      workflows: Object.keys(this.workflows)
    });
  }

  /**
   * Initialize monitoring for all queues and agents
   */
  initializeMonitoring() {
    unifiedLogger.debug('Initializing monitoring', {
      service: 'orchestratorService',
      source: 'initializeMonitoring',
      agentTypes: Object.keys(this.queues)
    });

    Object.entries(this.queues).forEach(([agentType, queue]) => {
      // Monitor queue events
      queue.on('completed', (job, result) => {
        this.handleAgentCompletion(agentType, job, result);
      });
      
      queue.on('failed', (job, err) => {
        this.handleAgentFailure(agentType, job, err);
      });
      
      queue.on('stalled', (job) => {
        this.handleAgentStalled(agentType, job);
      });
      
      queue.on('progress', (job, progress) => {
        this.handleAgentProgress(agentType, job, progress);
      });
      
      // Track agent health
      this.updateAgentStatus(agentType);
    });
    
    // Periodic health check
    setInterval(() => this.performHealthCheck(), 30000); // Every 30 seconds
  }

  /**
   * Start a workflow for a bookmark or batch of bookmarks
   * MIGRATION: This now delegates to A2A Task Manager
   */
  async startWorkflow(workflowType, bookmarkIds, options = {}) {
    unifiedLogger.info('Starting workflow (delegating to A2A)', {
      service: 'orchestratorService',
      source: 'startWorkflow',
      type: workflowType,
      bookmarkCount: bookmarkIds.length,
      options
    });
    
    // Map old workflow types to A2A workflow types
    const workflowMap = {
      'standard': 'reprocess',
      'quick': 'quick_import',
      'full': 'full_import',
      'validation': 'validation_only',
      'enrichment': 'enrichment_only'
    };
    
    const a2aWorkflowType = workflowMap[workflowType] || 'reprocess';
    
    try {
      // Create A2A task
      const task = await a2aTaskManager.createTask(a2aWorkflowType, {
        bookmarkIds,
        userId: options.userId,
        ...options
      });
      
      // Store task reference for backward compatibility
      const workflowData = {
        id: task.id,
        type: workflowType,
        bookmarkIds,
        agents: task.workflow.agents,
        currentAgent: task.workflow.currentStep,
        startTime: new Date(task.created).getTime(),
        status: task.status,
        progress: {},
        results: {},
        options,
        a2aTaskId: task.id // Reference to A2A task
      };
      
      this.activeWorkflows.set(task.id, workflowData);
      
      // Emit workflow started event for backward compatibility
      this.emit('workflow:started', {
        workflowId: task.id,
        type: workflowType,
        bookmarkCount: bookmarkIds.length,
      });
      
      return task.id;
      
    } catch (error) {
      unifiedLogger.error('Failed to start A2A workflow', {
        service: 'orchestratorService',
        source: 'startWorkflow',
        error: error.message,
        type: workflowType,
        a2aType: a2aWorkflowType
      });
      throw error;
    }
  }

  /**
   * Execute the next agent in the workflow pipeline
   */
  async executeNextAgent(workflowId) {
    const workflow = this.activeWorkflows.get(workflowId);
    if (!workflow) return;
    
    const { agents, currentAgent, bookmarkIds } = workflow;
    
    if (currentAgent >= agents.length) {
      // Workflow completed
      await this.completeWorkflow(workflowId);
      return;
    }
    
    const agentType = agents[currentAgent];
    const queue = this.queues[agentType];
    
    unifiedLogger.info('Executing agent in workflow', {
      service: 'orchestratorService',
      source: 'executeNextAgent',
      workflowId,
      agentType,
      step: currentAgent + 1,
      totalSteps: agents.length,
      bookmarkCount: bookmarkIds.length
    });
    
    // Add jobs for each bookmark
    const jobs = [];
    for (const bookmarkId of bookmarkIds) {
      const job = await queue.add(`${agentType}`, {
        bookmarkId,
        workflowId,
        agentType,
        previousResults: workflow.results,
        options: workflow.options,
      }, {
        attempts: 3,
        backoff: {
          type: 'exponential',
          delay: 2000,
        },
        removeOnComplete: true,
        removeOnFail: false,
      });
      
      jobs.push(job.id);
    }
    
    // Update workflow with job IDs
    workflow.currentJobs = jobs;
    workflow.progress[agentType] = {
      total: bookmarkIds.length,
      completed: 0,
      failed: 0,
      startTime: Date.now(),
    };
  }

  /**
   * Handle agent completion
   */
  async handleAgentCompletion(agentType, job, result) {
    const { workflowId, bookmarkId } = job.data;
    const workflow = this.activeWorkflows.get(workflowId);
    
    if (!workflow) return;

    unifiedLogger.debug('Agent completed', {
      service: 'orchestratorService',
      source: 'handleAgentCompletion',
      agentType,
      workflowId,
      bookmarkId,
      jobId: job.id
    });
    
    // Update progress
    workflow.progress[agentType].completed++;
    
    // Store results
    if (!workflow.results[bookmarkId]) {
      workflow.results[bookmarkId] = {};
    }
    workflow.results[bookmarkId][agentType] = result;
    
    // Check if all jobs for this agent are complete
    const progress = workflow.progress[agentType];
    if (progress.completed + progress.failed >= progress.total) {
      workflow.currentAgent++;
      await this.executeNextAgent(workflowId);
    }
    
    // Update real-time progress
    this.broadcastWorkflowProgress(workflowId);
  }

  /**
   * Handle agent failure
   */
  async handleAgentFailure(agentType, job, error) {
    const { workflowId, bookmarkId } = job.data;
    const workflow = this.activeWorkflows.get(workflowId);
    
    if (!workflow) return;
    
    unifiedLogger.error('Agent failure', {
      service: 'orchestratorService',
      source: 'handleAgentFailure',
      error: error.message,
      stack: error.stack,
      agentType,
      workflowId,
      bookmarkId,
      jobId: job.id
    });
    
    // Update progress
    workflow.progress[agentType].failed++;
    
    // Store failure
    if (!workflow.results[bookmarkId]) {
      workflow.results[bookmarkId] = {};
    }
    workflow.results[bookmarkId][agentType] = { 
      error: error.message, 
      failed: true 
    };
    
    // Check if we should continue or fail the workflow
    const progress = workflow.progress[agentType];
    if (progress.completed + progress.failed >= progress.total) {
      if (workflow.options.continueOnFailure !== false) {
        workflow.currentAgent++;
        await this.executeNextAgent(workflowId);
      } else {
        await this.failWorkflow(workflowId, 'Agent failure threshold exceeded');
      }
    }
    
    this.broadcastWorkflowProgress(workflowId);
  }

  /**
   * Handle agent stalled
   */
  handleAgentStalled(agentType, job) {
    unifiedLogger.warn('Agent stalled', {
      service: 'orchestratorService',
      source: 'handleAgentStalled',
      agentType,
      jobId: job.id,
      workflowId: job.data.workflowId,
      bookmarkId: job.data.bookmarkId
    });
    
    // Could implement recovery logic here
  }

  /**
   * Handle agent progress updates
   */
  handleAgentProgress(agentType, job, progress) {
    const { workflowId } = job.data;
    
    // Broadcast fine-grained progress
    websocketService.emitWorkflowProgress(workflowId, {
      agentType,
      jobId: job.id,
      progress,
    });
  }

  /**
   * Complete a workflow
   */
  async completeWorkflow(workflowId) {
    const workflow = this.activeWorkflows.get(workflowId);
    if (!workflow) return;
    
    workflow.status = 'completed';
    workflow.endTime = Date.now();
    workflow.duration = workflow.endTime - workflow.startTime;
    
    unifiedLogger.info('Workflow completed', {
      service: 'orchestratorService',
      source: 'completeWorkflow',
      workflowId,
      duration: workflow.duration,
      bookmarkCount: workflow.bookmarkIds.length,
      type: workflow.type,
      agentsExecuted: workflow.agents.length
    });
    
    // Emit completion event
    this.emit('workflow:completed', {
      workflowId,
      type: workflow.type,
      duration: workflow.duration,
      results: workflow.results,
    });
    
    // Update database with results
    await this.persistWorkflowResults(workflow);
    
    // Clean up
    this.activeWorkflows.delete(workflowId);
  }

  /**
   * Fail a workflow
   */
  async failWorkflow(workflowId, reason) {
    const workflow = this.activeWorkflows.get(workflowId);
    if (!workflow) return;
    
    workflow.status = 'failed';
    workflow.endTime = Date.now();
    workflow.duration = workflow.endTime - workflow.startTime;
    workflow.failureReason = reason;
    
    unifiedLogger.error('Workflow failed', {
      service: 'orchestratorService',
      source: 'failWorkflow',
      error: reason,
      workflowId,
      type: workflow.type,
      duration: workflow.duration
    });
    
    this.emit('workflow:failed', {
      workflowId,
      reason,
      type: workflow.type,
    });
    
    this.activeWorkflows.delete(workflowId);
  }

  /**
   * Broadcast workflow progress via WebSocket
   */
  broadcastWorkflowProgress(workflowId) {
    const workflow = this.activeWorkflows.get(workflowId);
    if (!workflow) return;
    
    const overallProgress = this.calculateOverallProgress(workflow);
    
    websocketService.emitWorkflowUpdate(workflowId, {
      workflowId,
      type: workflow.type,
      currentAgent: workflow.agents[workflow.currentAgent],
      agentProgress: workflow.progress,
      overallProgress,
      status: workflow.status,
    });
  }

  /**
   * Calculate overall workflow progress
   */
  calculateOverallProgress(workflow) {
    const totalSteps = workflow.agents.length * workflow.bookmarkIds.length;
    let completedSteps = 0;
    
    Object.values(workflow.progress).forEach(agentProgress => {
      completedSteps += agentProgress.completed;
    });
    
    return {
      percentage: Math.round((completedSteps / totalSteps) * 100),
      completedSteps,
      totalSteps,
    };
  }

  /**
   * Update agent status
   */
  async updateAgentStatus(agentType) {
    const queue = this.queues[agentType];
    const counts = await queue.getJobCounts();
    
    this.agentStatus.set(agentType, {
      type: agentType,
      waiting: counts.waiting,
      active: counts.active,
      completed: counts.completed,
      failed: counts.failed,
      delayed: counts.delayed,
      paused: counts.paused,
      lastUpdated: Date.now(),
    });
  }

  /**
   * Perform health check on all agents
   * MIGRATION: Uses A2A agent health data
   */
  async performHealthCheck() {
    const startTime = Date.now();
    unifiedLogger.debug('Performing health check (A2A)', {
      service: 'orchestratorService',
      source: 'performHealthCheck'
    });

    try {
      // Get A2A task stats
      const taskStats = await a2aTaskManager.getTaskStats();
      
      // Get registered agents
      const registeredAgents = await a2aTaskManager.getRegisteredAgents();
      
      // Build agent health status
      const agentHealth = {};
      for (const agent of registeredAgents) {
        agentHealth[agent.agentType] = {
          type: agent.agentType,
          healthy: true,
          status: 'active',
          version: agent.version,
          lastUpdated: Date.now()
        };
      }
      
      // Get active tasks
      const activeTasks = Array.from(a2aTaskManager.activeTasks.values());
      
      const health = {
        agents: agentHealth,
        workflows: {
          active: activeTasks.length,
          details: activeTasks.map(task => ({
            id: task.id,
            type: task.workflow.type,
            status: task.status,
            progress: {
              percentage: Math.round((task.workflow.currentStep / task.workflow.totalSteps) * 100),
              currentStep: task.workflow.currentStep,
              totalSteps: task.workflow.totalSteps
            },
            duration: Date.now() - new Date(task.created).getTime()
          }))
        },
        timestamp: Date.now(),
        taskStats
      };
      
      // Broadcast health status
      websocketService.emitOrchestratorHealth(health);
      
      return health;
      
    } catch (error) {
      unifiedLogger.error('Health check failed', {
        service: 'orchestratorService',
        source: 'performHealthCheck',
        error: error.message
      });
      
      return {
        agents: {},
        workflows: { active: 0, details: [] },
        timestamp: Date.now(),
        error: error.message
      };
    }
  }

  /**
   * Persist workflow results to database
   */
  async persistWorkflowResults(workflow) {
    try {
      // Update bookmark records with workflow results
      for (const [bookmarkId, results] of Object.entries(workflow.results)) {
        const updates = [];
        const values = [bookmarkId];
        let paramCount = 1;
        
        // Build dynamic update query based on results
        if (results.validation && !results.validation.failed) {
          updates.push(`is_valid = $${++paramCount}`);
          values.push(results.validation.isValid);
          
          if (results.validation.metadata) {
            updates.push(`http_status = $${++paramCount}`);
            values.push(results.validation.metadata.statusCode);
          }
        }
        
        if (results.enrichment && !results.enrichment.failed) {
          updates.push(`enriched = $${++paramCount}`);
          values.push(true);
          
          if (results.enrichment.title) {
            updates.push(`title = $${++paramCount}`);
            values.push(results.enrichment.title);
          }
          
          if (results.enrichment.description) {
            updates.push(`description = $${++paramCount}`);
            values.push(results.enrichment.description);
          }
        }
        
        if (results.categorization && !results.categorization.failed) {
          if (results.categorization.category) {
            updates.push(`category = $${++paramCount}`);
            values.push(results.categorization.category);
          }
          
          if (results.categorization.subcategory) {
            updates.push(`subcategory = $${++paramCount}`);
            values.push(results.categorization.subcategory);
          }
        }
        
        if (updates.length > 0) {
          updates.push(`updated_at = $${++paramCount}`);
          values.push(new Date());
          
          await db.query(
            `UPDATE bookmarks SET ${updates.join(', ')} WHERE id = $1`,
            values
          );
        }
      }
      
      unifiedLogger.info('Workflow results persisted', {
        service: 'orchestratorService',
        source: 'persistWorkflowResults',
        workflowId: workflow.id,
        bookmarkCount: Object.keys(workflow.results).length,
        updatedBookmarks: Object.keys(workflow.results).length
      });
      
    } catch (error) {
      unifiedLogger.error('Failed to persist workflow results', {
        service: 'orchestratorService',
        source: 'persistWorkflowResults',
        error: error.message,
        stack: error.stack,
        workflowId: workflow.id
      });
    }
  }

  /**
   * Get orchestrator dashboard data
   * MIGRATION: Now includes A2A task data
   */
  async getDashboardData() {
    try {
      // Get A2A task stats
      const taskStats = await a2aTaskManager.getTaskStats();
      
      // Get registered agents
      const registeredAgents = await a2aTaskManager.getRegisteredAgents();
      
      // Build agent status from A2A agents
      const agentStatus = {};
      for (const agent of registeredAgents) {
        agentStatus[agent.agentType] = {
          type: agent.agentType,
          version: agent.version,
          status: 'active',
          capabilities: agent.capabilities ? Object.keys(agent.capabilities.inputs || {}) : []
        };
      }
      
      // Get active tasks from A2A (convert to workflow format for compatibility)
      const activeTasks = Array.from(a2aTaskManager.activeTasks.values());
      const activeWorkflows = activeTasks.map(task => ({
        id: task.id,
        type: task.workflow.type,
        status: task.status,
        progress: {
          percentage: Math.round((task.workflow.currentStep / task.workflow.totalSteps) * 100),
          currentStep: task.workflow.currentStep,
          totalSteps: task.workflow.totalSteps
        },
        startTime: new Date(task.created).getTime(),
        bookmarkCount: task.context.bookmarkIds ? task.context.bookmarkIds.length : 0
      }));
      
      // Build health data
      const health = {
        agents: agentStatus,
        workflows: {
          active: activeTasks.length,
          details: activeWorkflows
        },
        timestamp: Date.now(),
        taskStats
      };
      
      // Legacy queue stats (empty since we're not using Bull anymore)
      const queueStats = {};
      for (const agentType of Object.keys(agentStatus)) {
        queueStats[agentType] = {
          counts: {
            waiting: 0,
            active: taskStats.running || 0,
            completed: taskStats.completed || 0,
            failed: taskStats.failed || 0
          },
          workers: 1, // A2A agents are singleton workers
          isPaused: false
        };
      }
      
      return {
        health,
        queueStats,
        activeWorkflows
      };
      
    } catch (error) {
      unifiedLogger.error('Failed to get dashboard data', {
        service: 'orchestratorService',
        source: 'getDashboardData',
        error: error.message
      });
      
      // Return empty data on error
      return {
        health: { agents: {}, workflows: { active: 0, details: [] }, timestamp: Date.now() },
        queueStats: {},
        activeWorkflows: []
      };
    }
  }

  /**
   * Pause/resume specific agents
   */
  async pauseAgent(agentType) {
    const queue = this.queues[agentType];
    if (queue) {
      await queue.pause();
      unifiedLogger.info('Agent paused', {
        service: 'orchestratorService',
        source: 'pauseAgent',
        agentType
      });
    }
  }

  async resumeAgent(agentType) {
    const queue = this.queues[agentType];
    if (queue) {
      await queue.resume();
      unifiedLogger.info('Agent resumed', {
        service: 'orchestratorService',
        source: 'resumeAgent',
        agentType
      });
    }
  }

  /**
   * Clean up completed jobs
   */
  async cleanup() {
    const startTime = Date.now();
    unifiedLogger.info('Starting cleanup', {
      service: 'orchestratorService',
      source: 'cleanup',
      queueCount: Object.keys(this.queues).length
    });

    for (const [agentType, queue] of Object.entries(this.queues)) {
      const removed = await queue.clean(3600000); // Clean jobs older than 1 hour
      unifiedLogger.debug('Cleaned up queue', {
        service: 'orchestratorService',
        source: 'cleanup',
        agentType,
        removedCount: removed.length
      });
    }

    unifiedLogger.info('Cleanup completed', {
      service: 'orchestratorService',
      source: 'cleanup',
      duration: Date.now() - startTime
    });
  }
}

// Export singleton instance
export default new OrchestratorService();