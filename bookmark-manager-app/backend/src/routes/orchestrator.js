import express from 'express';
import { authenticate } from '../middleware/auth.js';
import orchestratorService from '../services/orchestratorService.js';
import { logError } from '../utils/logger.js';

const router = express.Router();

/**
 * Get orchestrator dashboard data
 */
router.get('/dashboard', authenticate, async (req, res) => {
  try {
    const dashboardData = await orchestratorService.getDashboardData();
    res.json(dashboardData);
  } catch (error) {
    logError(error, { context: 'Failed to get orchestrator dashboard' });
    res.status(500).json({ error: 'Failed to retrieve dashboard data' });
  }
});

/**
 * Get orchestrator health status
 */
router.get('/health', authenticate, async (req, res) => {
  try {
    const health = await orchestratorService.performHealthCheck();
    res.json(health);
  } catch (error) {
    logError(error, { context: 'Failed to get orchestrator health' });
    res.status(500).json({ error: 'Failed to retrieve health status' });
  }
});

/**
 * Start a new workflow
 */
router.post('/workflow', authenticate, async (req, res) => {
  try {
    const { type, bookmarkIds, options } = req.body;
    
    if (!bookmarkIds || !Array.isArray(bookmarkIds) || bookmarkIds.length === 0) {
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
    
    res.json({
      workflowId,
      type: type || 'standard',
      bookmarkCount: bookmarkIds.length,
      status: 'started',
    });
  } catch (error) {
    logError(error, { context: 'Failed to start workflow' });
    res.status(500).json({ error: 'Failed to start workflow' });
  }
});

/**
 * Get workflow status
 */
router.get('/workflow/:workflowId', authenticate, async (req, res) => {
  try {
    const { workflowId } = req.params;
    const workflow = orchestratorService.activeWorkflows.get(workflowId);
    
    if (!workflow) {
      return res.status(404).json({ error: 'Workflow not found' });
    }
    
    // Check if user owns the workflow
    if (workflow.options.userId !== req.user.id) {
      return res.status(403).json({ error: 'Access denied' });
    }
    
    const progress = orchestratorService.calculateOverallProgress(workflow);
    
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
    logError(error, { context: 'Failed to get workflow status' });
    res.status(500).json({ error: 'Failed to retrieve workflow status' });
  }
});

/**
 * Pause an agent
 */
router.post('/agent/:agentType/pause', authenticate, async (req, res) => {
  try {
    // Only allow admins to pause agents
    if (req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Admin access required' });
    }
    
    const { agentType } = req.params;
    await orchestratorService.pauseAgent(agentType);
    
    res.json({ status: 'paused', agentType });
  } catch (error) {
    logError(error, { context: 'Failed to pause agent' });
    res.status(500).json({ error: 'Failed to pause agent' });
  }
});

/**
 * Resume an agent
 */
router.post('/agent/:agentType/resume', authenticate, async (req, res) => {
  try {
    // Only allow admins to resume agents
    if (req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Admin access required' });
    }
    
    const { agentType } = req.params;
    await orchestratorService.resumeAgent(agentType);
    
    res.json({ status: 'resumed', agentType });
  } catch (error) {
    logError(error, { context: 'Failed to resume agent' });
    res.status(500).json({ error: 'Failed to resume agent' });
  }
});

/**
 * Clean up old jobs
 */
router.post('/cleanup', authenticate, async (req, res) => {
  try {
    // Only allow admins to run cleanup
    if (req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Admin access required' });
    }
    
    await orchestratorService.cleanup();
    
    res.json({ status: 'cleanup completed' });
  } catch (error) {
    logError(error, { context: 'Failed to run cleanup' });
    res.status(500).json({ error: 'Failed to run cleanup' });
  }
});

export default router;