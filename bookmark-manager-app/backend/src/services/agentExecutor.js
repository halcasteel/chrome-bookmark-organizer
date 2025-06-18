import Bull from 'bull';
import unifiedLogger from './unifiedLogger.js';
import db from '../db/index.js';

/**
 * AgentExecutor - Hybrid execution layer for A2A agents
 * 
 * Provides Redis/Bull-based distributed execution while maintaining
 * A2A Task Manager as the orchestration layer.
 * 
 * Features:
 * - Distributed job queuing with Redis
 * - Parallel execution with configurable concurrency
 * - Automatic retries with exponential backoff
 * - Rate limiting for external API calls
 * - Job persistence across restarts
 * - Real-time progress tracking
 */
class AgentExecutor {
  constructor() {
    this.queues = new Map();
    this.workers = new Map();
    this.agents = new Map();
    
    // Redis configuration
    this.redisConfig = process.env.REDIS_URL ? 
      process.env.REDIS_URL : 
      {
        port: parseInt(process.env.REDIS_PORT || '6382'),
        host: process.env.REDIS_HOST || 'localhost',
      };
    
    // Default worker configuration
    this.defaultWorkerConfig = {
      removeOnComplete: {
        age: 3600, // Keep completed jobs for 1 hour
        count: 1000 // Keep max 1000 completed jobs
      },
      removeOnFail: {
        age: 24 * 3600 // Keep failed jobs for 24 hours
      }
    };
    
    unifiedLogger.info('AgentExecutor initialized', {
      service: 'agentExecutor',
      method: 'constructor',
      redisConfig: this.redisConfig
    });
  }

  /**
   * Register an A2A agent for execution
   * @param {Object} agent - A2A agent instance
   */
  async registerAgent(agent) {
    const agentType = agent.agentType;
    
    if (!agentType) {
      throw new Error('Agent must have agentType property');
    }
    
    // Store agent reference
    this.agents.set(agentType, agent);
    
    // Create queue for this agent type
    const queueName = `a2a-${agentType}`;
    const queue = new Bull(queueName, this.redisConfig);
    this.queues.set(agentType, queue);
    
    // Set up queue event handlers
    queue.on('completed', (job, result) => {
      this.handleJobCompleted(agentType, job, result);
    });
    
    queue.on('failed', (job, err) => {
      this.handleJobFailed(agentType, job, err);
    });
    
    queue.on('progress', (job, progress) => {
      this.handleJobProgress(agentType, job, progress);
    });
    
    // Create worker for this agent type
    const concurrency = agent.concurrency || 5;
    const workerConfig = {
      ...this.defaultWorkerConfig,
      concurrency
    };
    
    // Process jobs using the agent
    queue.process(concurrency, async (job) => {
      const { task, context } = job.data;
      
      try {
        // Call agent's processTask method
        const updatedTask = await agent.processTask(task, context);
        
        // Report progress
        if (job.progress) {
          await job.progress(100);
        }
        
        return updatedTask;
        
      } catch (error) {
        unifiedLogger.error('Agent execution failed', {
          service: 'agentExecutor',
          method: 'processJob',
          agentType,
          taskId: task.id,
          error: error.message,
          stack: error.stack
        });
        throw error;
      }
    });
    
    unifiedLogger.info('Agent registered for execution', {
      service: 'agentExecutor',
      method: 'registerAgent',
      agentType,
      concurrency,
      queueName
    });
  }

  /**
   * Execute an agent task with queuing
   * @param {string} agentType - Type of agent to execute
   * @param {Object} task - A2A task object
   * @param {Object} options - Execution options
   * @returns {Object} - Bull job instance
   */
  async executeAgent(agentType, task, options = {}) {
    const queue = this.queues.get(agentType);
    
    if (!queue) {
      throw new Error(`No queue registered for agent type: ${agentType}`);
    }
    
    // Prepare job data
    const jobData = {
      task,
      taskId: task.id,
      agentType,
      context: task.context || {}
    };
    
    // Job options with defaults
    const jobOptions = {
      attempts: options.attempts || 3,
      backoff: options.backoff || {
        type: 'exponential',
        delay: 2000
      },
      priority: options.priority || 0,
      delay: options.delay || 0,
      removeOnComplete: true,
      removeOnFail: false
    };
    
    // Add rate limiting if specified
    if (options.rateLimit) {
      jobOptions.limiter = {
        max: options.rateLimit.max,
        duration: options.rateLimit.duration
      };
    }
    
    // Create job
    const job = await queue.add('process', jobData, jobOptions);
    
    unifiedLogger.info('Agent task queued', {
      service: 'agentExecutor',
      method: 'executeAgent',
      agentType,
      taskId: task.id,
      jobId: job.id,
      priority: jobOptions.priority
    });
    
    return job;
  }

  /**
   * Execute multiple tasks for an agent in parallel
   * @param {string} agentType - Type of agent
   * @param {Array} tasks - Array of task objects
   * @param {Object} options - Execution options
   * @returns {Array} - Array of job instances
   */
  async executeBatch(agentType, tasks, options = {}) {
    const jobs = [];
    
    for (const task of tasks) {
      const job = await this.executeAgent(agentType, task, options);
      jobs.push(job);
    }
    
    unifiedLogger.info('Batch execution queued', {
      service: 'agentExecutor',
      method: 'executeBatch',
      agentType,
      taskCount: tasks.length
    });
    
    return jobs;
  }

  /**
   * Handle job completion
   */
  async handleJobCompleted(agentType, job, result) {
    const { taskId } = job.data;
    
    unifiedLogger.info('Job completed', {
      service: 'agentExecutor',
      method: 'handleJobCompleted',
      agentType,
      taskId,
      jobId: job.id,
      duration: Date.now() - job.timestamp
    });
    
    // Update task progress in database
    await this.updateTaskProgress(taskId, agentType, 'completed');
  }

  /**
   * Handle job failure
   */
  async handleJobFailed(agentType, job, error) {
    const { taskId } = job.data;
    
    unifiedLogger.error('Job failed', {
      service: 'agentExecutor',
      method: 'handleJobFailed',
      agentType,
      taskId,
      jobId: job.id,
      attempt: job.attemptsMade,
      maxAttempts: job.opts.attempts,
      error: error.message
    });
    
    // Update task progress in database
    if (job.attemptsMade >= job.opts.attempts) {
      await this.updateTaskProgress(taskId, agentType, 'failed', error.message);
    }
  }

  /**
   * Handle job progress
   */
  handleJobProgress(agentType, job, progress) {
    const { taskId } = job.data;
    
    unifiedLogger.debug('Job progress', {
      service: 'agentExecutor',
      method: 'handleJobProgress',
      agentType,
      taskId,
      jobId: job.id,
      progress
    });
  }

  /**
   * Update task progress in database
   */
  async updateTaskProgress(taskId, agentType, status, error = null) {
    try {
      await db.query(
        `INSERT INTO a2a_task_progress 
         (task_id, agent_type, status, error_message, updated)
         VALUES ($1, $2, $3, $4, NOW())
         ON CONFLICT (task_id, agent_type) DO UPDATE
         SET status = EXCLUDED.status,
             error_message = EXCLUDED.error_message,
             updated = NOW()`,
        [taskId, agentType, status, error]
      );
    } catch (err) {
      unifiedLogger.error('Failed to update task progress', {
        service: 'agentExecutor',
        method: 'updateTaskProgress',
        taskId,
        agentType,
        error: err.message
      });
    }
  }

  /**
   * Get queue statistics
   */
  async getQueueStats(agentType) {
    const queue = this.queues.get(agentType);
    
    if (!queue) {
      return null;
    }
    
    const counts = await queue.getJobCounts();
    
    return {
      agentType,
      waiting: counts.waiting,
      active: counts.active,
      completed: counts.completed,
      failed: counts.failed,
      delayed: counts.delayed,
      paused: counts.paused
    };
  }

  /**
   * Get all queue statistics
   */
  async getAllQueueStats() {
    const stats = {};
    
    for (const [agentType, queue] of this.queues) {
      stats[agentType] = await this.getQueueStats(agentType);
    }
    
    return stats;
  }

  /**
   * Pause processing for an agent type
   */
  async pauseAgent(agentType) {
    const queue = this.queues.get(agentType);
    
    if (queue) {
      await queue.pause();
      unifiedLogger.info('Agent paused', {
        service: 'agentExecutor',
        method: 'pauseAgent',
        agentType
      });
    }
  }

  /**
   * Resume processing for an agent type
   */
  async resumeAgent(agentType) {
    const queue = this.queues.get(agentType);
    
    if (queue) {
      await queue.resume();
      unifiedLogger.info('Agent resumed', {
        service: 'agentExecutor',
        method: 'resumeAgent',
        agentType
      });
    }
  }

  /**
   * Clean up old jobs
   */
  async cleanup() {
    for (const [agentType, queue] of this.queues) {
      const cleaned = await queue.clean(3600000); // Clean jobs older than 1 hour
      unifiedLogger.info('Queue cleaned', {
        service: 'agentExecutor',
        method: 'cleanup',
        agentType,
        removedCount: cleaned.length
      });
    }
  }

  /**
   * Gracefully shutdown all queues and workers
   */
  async shutdown() {
    unifiedLogger.info('Shutting down AgentExecutor', {
      service: 'agentExecutor',
      method: 'shutdown'
    });
    
    // Close all queues
    for (const [agentType, queue] of this.queues) {
      await queue.close();
    }
    
    this.queues.clear();
    this.workers.clear();
    this.agents.clear();
  }
}

// Export singleton instance
export default new AgentExecutor();