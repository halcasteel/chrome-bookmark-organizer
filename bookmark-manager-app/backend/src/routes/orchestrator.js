import express from 'express';
import { authenticate } from '../middleware/auth.js';
import orchestratorService from '../services/orchestratorService.js';
import unifiedLogger from '../services/unifiedLogger.js';

const router = express.Router();

/**
 * Get orchestrator dashboard data
 */
router.get('/dashboard', authenticate, async (req, res) => {
  try {
    unifiedLogger.info('Fetching orchestrator dashboard', {
      service: 'api',
      source: 'GET /orchestrator/dashboard',
      userId: req.user.id
    });
    const dashboardData = await orchestratorService.getDashboardData();
    
    unifiedLogger.info('Orchestrator dashboard retrieved', {
      service: 'api',
      source: 'GET /orchestrator/dashboard',
      userId: req.user.id,
      activeWorkflows: dashboardData.activeWorkflows?.length || 0
    });
    
    res.json(dashboardData);
  } catch (error) {
    unifiedLogger.error('Failed to get orchestrator dashboard', error, {
      service: 'api',
      source: 'GET /orchestrator/dashboard',
      userId: req.user.id
    });
    res.status(500).json({ error: 'Failed to retrieve dashboard data' });
  }
});

/**
 * Get orchestrator health status
 */
router.get('/health', authenticate, async (req, res) => {
  try {
    unifiedLogger.debug('Checking orchestrator health', {
      service: 'api',
      source: 'GET /orchestrator/health',
      userId: req.user.id
    });
    const health = await orchestratorService.performHealthCheck();
    
    unifiedLogger.debug('Orchestrator health check completed', {
      service: 'api',
      source: 'GET /orchestrator/health',
      userId: req.user.id,
      healthy: health.healthy,
      agentStatuses: health.agents
    });
    
    res.json(health);
  } catch (error) {
    unifiedLogger.error('Failed to get orchestrator health', error, {
      service: 'api',
      source: 'GET /orchestrator/health',
      userId: req.user.id
    });
    res.status(500).json({ error: 'Failed to retrieve health status' });
  }
});

/**
 * Start a new workflow
 */
router.post('/workflow', authenticate, async (req, res) => {
  try {
    const { type, bookmarkIds, options } = req.body;
    
    unifiedLogger.info('Starting new workflow', {
      service: 'api',
      source: 'POST /orchestrator/workflow',
      userId: req.user.id,
      workflowType: type || 'standard',
      bookmarkCount: bookmarkIds?.length || 0,
      options
    });
    
    if (!bookmarkIds || !Array.isArray(bookmarkIds) || bookmarkIds.length === 0) {
      unifiedLogger.warn('Workflow start failed - invalid bookmarkIds', {
        service: 'api',
        source: 'POST /orchestrator/workflow',
        userId: req.user.id,
        hasBookmarkIds: !!bookmarkIds,
        isArray: Array.isArray(bookmarkIds),
        length: bookmarkIds?.length || 0
      });
      return res.status(400).json({ error: 'bookmarkIds array is required' });
    }
    
    const workflowId = await orchestratorService.startWorkflow(
      type || 'standard',
      bookmarkIds,
      {
        ...options,
        userId: req.user.id,
      }
    );
    
    unifiedLogger.info('Workflow started successfully', {
      service: 'api',
      source: 'POST /orchestrator/workflow',
      userId: req.user.id,
      workflowId,
      type: type || 'standard',
      bookmarkCount: bookmarkIds.length
    });
    
    res.json({
      workflowId,
      type: type || 'standard',
      bookmarkCount: bookmarkIds.length,
      status: 'started',
    });
  } catch (error) {
    unifiedLogger.error('Failed to start workflow', error, {
      service: 'api',
      source: 'POST /orchestrator/workflow',
      userId: req.user.id,
      workflowData: req.body
    });
    res.status(500).json({ error: 'Failed to start workflow' });
  }
});

/**
 * Get workflow status
 */
router.get('/workflow/:workflowId', authenticate, async (req, res) => {
  try {
    const { workflowId } = req.params;
    
    unifiedLogger.debug('Fetching workflow status', {
      service: 'api',
      source: 'GET /orchestrator/workflow/:workflowId',
      userId: req.user.id,
      workflowId
    });
    const workflow = orchestratorService.activeWorkflows.get(workflowId);
    
    if (!workflow) {
      unifiedLogger.warn('Workflow not found', {
        service: 'api',
        source: 'GET /orchestrator/workflow/:workflowId',
        userId: req.user.id,
        workflowId
      });
      return res.status(404).json({ error: 'Workflow not found' });
    }
    
    // Check if user owns the workflow
    if (workflow.options.userId !== req.user.id) {
      unifiedLogger.warn('Workflow access denied', {
        service: 'api',
        source: 'GET /orchestrator/workflow/:workflowId',
        userId: req.user.id,
        workflowId,
        workflowOwnerId: workflow.options.userId
      });
      return res.status(403).json({ error: 'Access denied' });
    }
    
    const progress = orchestratorService.calculateOverallProgress(workflow);
    
    unifiedLogger.debug('Workflow status retrieved', {
      service: 'api',
      source: 'GET /orchestrator/workflow/:workflowId',
      userId: req.user.id,
      workflowId,
      status: workflow.status,
      progress
    });
    
    res.json({
      id: workflow.id,
      type: workflow.type,
      status: workflow.status,
      progress,
      agentProgress: workflow.progress,
      currentAgent: workflow.agents[workflow.currentAgent],
      startTime: workflow.startTime,
      bookmarkCount: workflow.bookmarkIds.length,
    });
  } catch (error) {
    unifiedLogger.error('Failed to get workflow status', error, {
      service: 'api',
      source: 'GET /orchestrator/workflow/:workflowId',
      userId: req.user.id,
      workflowId: req.params.workflowId
    });
    res.status(500).json({ error: 'Failed to retrieve workflow status' });
  }
});

/**
 * Pause an agent
 */
router.post('/agent/:agentType/pause', authenticate, async (req, res) => {
  try {
    const { agentType } = req.params;
    
    unifiedLogger.info('Agent pause requested', {
      service: 'api',
      source: 'POST /orchestrator/agent/:agentType/pause',
      userId: req.user.id,
      agentType,
      userRole: req.user.role
    });
    
    // Only allow admins to pause agents
    if (req.user.role !== 'admin') {
      unifiedLogger.warn('Agent pause denied - admin required', {
        service: 'api',
        source: 'POST /orchestrator/agent/:agentType/pause',
        userId: req.user.id,
        agentType,
        userRole: req.user.role
      });
      return res.status(403).json({ error: 'Admin access required' });
    }
    await orchestratorService.pauseAgent(agentType);
    
    unifiedLogger.info('Agent paused successfully', {
      service: 'api',
      source: 'POST /orchestrator/agent/:agentType/pause',
      userId: req.user.id,
      agentType
    });
    
    res.json({ status: 'paused', agentType });
  } catch (error) {
    unifiedLogger.error('Failed to pause agent', error, {
      service: 'api',
      source: 'POST /orchestrator/agent/:agentType/pause',
      userId: req.user.id,
      agentType: req.params.agentType
    });
    res.status(500).json({ error: 'Failed to pause agent' });
  }
});

/**
 * Resume an agent
 */
router.post('/agent/:agentType/resume', authenticate, async (req, res) => {
  try {
    const { agentType } = req.params;
    
    unifiedLogger.info('Agent resume requested', {
      service: 'api',
      source: 'POST /orchestrator/agent/:agentType/resume',
      userId: req.user.id,
      agentType,
      userRole: req.user.role
    });
    
    // Only allow admins to resume agents
    if (req.user.role !== 'admin') {
      unifiedLogger.warn('Agent resume denied - admin required', {
        service: 'api',
        source: 'POST /orchestrator/agent/:agentType/resume',
        userId: req.user.id,
        agentType,
        userRole: req.user.role
      });
      return res.status(403).json({ error: 'Admin access required' });
    }
    await orchestratorService.resumeAgent(agentType);
    
    unifiedLogger.info('Agent resumed successfully', {
      service: 'api',
      source: 'POST /orchestrator/agent/:agentType/resume',
      userId: req.user.id,
      agentType
    });
    
    res.json({ status: 'resumed', agentType });
  } catch (error) {
    unifiedLogger.error('Failed to resume agent', error, {
      service: 'api',
      source: 'POST /orchestrator/agent/:agentType/resume',
      userId: req.user.id,
      agentType: req.params.agentType
    });
    res.status(500).json({ error: 'Failed to resume agent' });
  }
});

/**
 * Clean up old jobs
 */
router.post('/cleanup', authenticate, async (req, res) => {
  try {
    unifiedLogger.info('Orchestrator cleanup requested', {
      service: 'api',
      source: 'POST /orchestrator/cleanup',
      userId: req.user.id,
      userRole: req.user.role
    });
    
    // Only allow admins to run cleanup
    if (req.user.role !== 'admin') {
      unifiedLogger.warn('Cleanup denied - admin required', {
        service: 'api',
        source: 'POST /orchestrator/cleanup',
        userId: req.user.id,
        userRole: req.user.role
      });
      return res.status(403).json({ error: 'Admin access required' });
    }
    
    await orchestratorService.cleanup();
    
    unifiedLogger.info('Orchestrator cleanup completed', {
      service: 'api',
      source: 'POST /orchestrator/cleanup',
      userId: req.user.id
    });
    
    res.json({ status: 'cleanup completed' });
  } catch (error) {
    unifiedLogger.error('Failed to run cleanup', error, {
      service: 'api',
      source: 'POST /orchestrator/cleanup',
      userId: req.user.id
    });
    res.status(500).json({ error: 'Failed to run cleanup' });
  }
});

export default router;