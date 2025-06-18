import express from 'express';
import a2aTaskManager from '../services/a2aTaskManager.js';
import agentExecutor from '../services/agentExecutor.js';
import agentInitializationService from '../services/agentInitializationService.js';
import unifiedLogger from '../services/unifiedLogger.js';

const router = express.Router();

/**
 * A2A Task Routes
 * 
 * Provides endpoints for task management and monitoring
 * Compatible with existing orchestrator routes for easy migration
 */

/**
 * GET /api/a2a/dashboard
 * Get dashboard data including task stats and agent status
 */
router.get('/dashboard', async (req, res) => {
  try {
    unifiedLogger.debug('Fetching A2A dashboard data', {
      service: 'api',
      source: 'GET /a2a/dashboard',
      userId: req.user.id
    });

    // Get task statistics
    const taskStats = await a2aTaskManager.getTaskStats();
    
    // Get agent health
    const agentHealth = await agentInitializationService.checkHealth();
    
    // Get queue statistics
    const queueStats = await agentExecutor.getAllQueueStats();
    
    // Get active tasks
    const activeTasks = Array.from(a2aTaskManager.activeTasks.values()).map(task => ({
      id: task.id,
      type: task.type,
      status: task.status,
      progress: {
        percentage: Math.round((task.workflow.currentStep / task.workflow.totalSteps) * 100),
        currentStep: task.workflow.currentStep,
        totalSteps: task.workflow.totalSteps,
        currentAgent: task.workflow.currentAgent
      },
      created: task.created,
      bookmarkCount: task.context.bookmarkIds ? task.context.bookmarkIds.length : 0
    }));
    
    const dashboardData = {
      health: {
        agents: agentHealth.agents,
        workflows: {
          active: activeTasks.length,
          details: activeTasks
        },
        timestamp: Date.now(),
        taskStats
      },
      queueStats,
      activeWorkflows: activeTasks
    };
    
    unifiedLogger.info('A2A dashboard data retrieved', {
      service: 'api',
      source: 'GET /a2a/dashboard',
      userId: req.user.id,
      activeTaskCount: activeTasks.length,
      agentHealthy: agentHealth.healthy
    });
    
    res.json(dashboardData);
  } catch (error) {
    unifiedLogger.error('Failed to get A2A dashboard data', error, {
      service: 'api',
      source: 'GET /a2a/dashboard',
      userId: req.user.id
    });
    res.status(500).json({ error: 'Failed to get dashboard data' });
  }
});

/**
 * GET /api/a2a/health
 * Perform health check on all agents and task system
 */
router.get('/health', async (req, res) => {
  try {
    unifiedLogger.debug('Performing A2A health check', {
      service: 'api',
      source: 'GET /a2a/health',
      userId: req.user.id
    });

    const health = await agentInitializationService.checkHealth();
    const taskStats = await a2aTaskManager.getTaskStats();
    const queueStats = await agentExecutor.getAllQueueStats();
    
    const healthData = {
      ...health,
      taskStats,
      queueStats,
      timestamp: Date.now()
    };
    
    unifiedLogger.info('A2A health check completed', {
      service: 'api',
      source: 'GET /a2a/health',
      userId: req.user.id,
      healthy: health.healthy,
      agentCount: Object.keys(health.agents).length
    });
    
    res.json(healthData);
  } catch (error) {
    unifiedLogger.error('Failed to perform A2A health check', error, {
      service: 'api',
      source: 'GET /a2a/health',
      userId: req.user.id
    });
    res.status(500).json({ error: 'Failed to perform health check' });
  }
});

/**
 * POST /api/a2a/workflow
 * Start a new workflow (backward compatible with orchestrator)
 */
router.post('/workflow', async (req, res) => {
  try {
    const { type, bookmarkIds, options = {} } = req.body;
    
    if (!type || !bookmarkIds || !Array.isArray(bookmarkIds)) {
      return res.status(400).json({ error: 'Invalid request body' });
    }
    
    unifiedLogger.info('Starting A2A workflow', {
      service: 'api',
      source: 'POST /a2a/workflow',
      userId: req.user.id,
      workflowType: type,
      bookmarkCount: bookmarkIds.length,
      options
    });
    
    // Map old workflow types to A2A types for compatibility
    const workflowMap = {
      'standard': 'reprocess',
      'quick': 'quick_import',
      'full': 'full_import',
      'validation': 'validation_only',
      'enrichment': 'enrichment_only'
    };
    
    const a2aWorkflowType = workflowMap[type] || type;
    
    const task = await a2aTaskManager.createTask(a2aWorkflowType, {
      bookmarkIds,
      userId: req.user.id,
      ...options
    });
    
    unifiedLogger.info('A2A workflow started', {
      service: 'api',
      source: 'POST /a2a/workflow',
      userId: req.user.id,
      taskId: task.id,
      workflowType: a2aWorkflowType,
      bookmarkCount: bookmarkIds.length
    });
    
    res.json({
      workflowId: task.id, // Use workflowId for backward compatibility
      taskId: task.id,
      type: task.type,
      status: task.status,
      agents: task.workflow.agents
    });
  } catch (error) {
    unifiedLogger.error('Failed to start A2A workflow', error, {
      service: 'api',
      source: 'POST /a2a/workflow',
      userId: req.user.id,
      body: req.body
    });
    res.status(500).json({ error: 'Failed to start workflow' });
  }
});

/**
 * GET /api/a2a/workflow/:workflowId
 * Get workflow status (backward compatible)
 */
router.get('/workflow/:workflowId', async (req, res) => {
  try {
    const { workflowId } = req.params;
    
    unifiedLogger.debug('Fetching A2A workflow status', {
      service: 'api',
      source: 'GET /a2a/workflow/:id',
      userId: req.user.id,
      workflowId
    });
    
    const task = await a2aTaskManager.getTask(workflowId);
    
    if (!task) {
      return res.status(404).json({ error: 'Workflow not found' });
    }
    
    // Calculate overall progress
    const overallProgress = {
      percentage: Math.round((task.workflow.currentStep / task.workflow.totalSteps) * 100),
      completedSteps: task.workflow.currentStep,
      totalSteps: task.workflow.totalSteps
    };
    
    const workflowData = {
      id: task.id,
      type: task.type,
      status: task.status,
      currentAgent: task.workflow.currentAgent,
      agents: task.workflow.agents,
      overallProgress,
      created: task.created,
      updated: task.updated,
      bookmarkCount: task.context.bookmarkIds ? task.context.bookmarkIds.length : 0
    };
    
    unifiedLogger.debug('A2A workflow status retrieved', {
      service: 'api',
      source: 'GET /a2a/workflow/:id',
      userId: req.user.id,
      workflowId,
      status: task.status,
      progress: overallProgress.percentage
    });
    
    res.json(workflowData);
  } catch (error) {
    unifiedLogger.error('Failed to get A2A workflow status', error, {
      service: 'api',
      source: 'GET /a2a/workflow/:id',
      userId: req.user.id,
      workflowId: req.params.workflowId
    });
    res.status(500).json({ error: 'Failed to get workflow status' });
  }
});

/**
 * POST /api/a2a/agent/:agentType/pause
 * Pause an agent type
 */
router.post('/agent/:agentType/pause', async (req, res) => {
  try {
    const { agentType } = req.params;
    
    unifiedLogger.info('Pausing A2A agent', {
      service: 'api',
      source: 'POST /a2a/agent/:type/pause',
      userId: req.user.id,
      agentType
    });
    
    await agentExecutor.pauseAgent(agentType);
    
    res.json({ message: `Agent ${agentType} paused` });
  } catch (error) {
    unifiedLogger.error('Failed to pause A2A agent', error, {
      service: 'api',
      source: 'POST /a2a/agent/:type/pause',
      userId: req.user.id,
      agentType: req.params.agentType
    });
    res.status(500).json({ error: 'Failed to pause agent' });
  }
});

/**
 * POST /api/a2a/agent/:agentType/resume
 * Resume an agent type
 */
router.post('/agent/:agentType/resume', async (req, res) => {
  try {
    const { agentType } = req.params;
    
    unifiedLogger.info('Resuming A2A agent', {
      service: 'api',
      source: 'POST /a2a/agent/:type/resume',
      userId: req.user.id,
      agentType
    });
    
    await agentExecutor.resumeAgent(agentType);
    
    res.json({ message: `Agent ${agentType} resumed` });
  } catch (error) {
    unifiedLogger.error('Failed to resume A2A agent', error, {
      service: 'api',
      source: 'POST /a2a/agent/:type/resume',
      userId: req.user.id,
      agentType: req.params.agentType
    });
    res.status(500).json({ error: 'Failed to resume agent' });
  }
});

/**
 * POST /api/a2a/cleanup
 * Clean up old jobs
 */
router.post('/cleanup', async (req, res) => {
  try {
    unifiedLogger.info('Performing A2A cleanup', {
      service: 'api',
      source: 'POST /a2a/cleanup',
      userId: req.user.id
    });
    
    await agentExecutor.cleanup();
    
    res.json({ message: 'Cleanup completed' });
  } catch (error) {
    unifiedLogger.error('Failed to perform A2A cleanup', error, {
      service: 'api',
      source: 'POST /a2a/cleanup',
      userId: req.user.id
    });
    res.status(500).json({ error: 'Failed to perform cleanup' });
  }
});

/**
 * GET /api/a2a/tasks/:taskId/stream
 * Stream task events via Server-Sent Events
 */
router.get('/tasks/:taskId/stream', async (req, res) => {
  try {
    const { taskId } = req.params;
    
    unifiedLogger.info('Starting A2A task event stream', {
      service: 'api',
      source: 'GET /a2a/tasks/:id/stream',
      userId: req.user.id,
      taskId
    });
    
    // Stream task events
    a2aTaskManager.streamTaskEvents(taskId, res);
    
  } catch (error) {
    unifiedLogger.error('Failed to stream A2A task events', error, {
      service: 'api',
      source: 'GET /a2a/tasks/:id/stream',
      userId: req.user.id,
      taskId: req.params.taskId
    });
    res.status(500).json({ error: 'Failed to stream task events' });
  }
});

export default router;