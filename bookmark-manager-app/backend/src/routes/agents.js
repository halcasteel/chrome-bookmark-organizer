import express from 'express';
import a2aTaskManager from '../services/a2aTaskManager.js';
import unifiedLogger from '../services/unifiedLogger.js';

const router = express.Router();

/**
 * A2A Agent Discovery and Management Routes
 * Implements Google A2A protocol standards for agent discovery
 */

/**
 * Create discovery endpoint handler separately for mounting at root
 */
export const agentDiscoveryHandler = async (req, res) => {
  try {
    unifiedLogger.info('Agent discovery request', {
      service: 'api',
      source: 'GET /.well-known/agent.json',
      ip: req.ip
    });
    
    const capabilities = await a2aTaskManager.getAgentCapabilities();
    
    // A2A-compliant system agent card
    const systemCard = {
      name: "bookmark-manager-agents",
      version: "1.0.0",
      description: "A2A-compliant bookmark processing agent system",
      agents: capabilities,
      systemCapabilities: {
        workflows: Object.keys(a2aTaskManager.workflows),
        taskManagement: true,
        artifactStorage: true,
        realtimeUpdates: true,
        authentication: ["bearer"],
        protocols: ["a2a", "http", "sse"]
      },
      endpoints: {
        tasks: "/api/agents/tasks",
        agents: "/api/agents",
        discovery: "/.well-known/agent.json"
      }
    };
    
    res.json(systemCard);
    
  } catch (error) {
    unifiedLogger.error('Agent discovery failed', {
      service: 'api',
      source: 'GET /.well-known/agent.json',
      error: error.message,
      stack: error.stack
    });
    res.status(500).json({ error: 'Failed to retrieve agent capabilities' });
  }
};

/**
 * GET /api/agents
 * List all registered agents and their capabilities
 */
router.get('/', async (req, res) => {
  try {
    unifiedLogger.info('List agents request', {
      service: 'api',
      source: 'GET /api/agents',
      userId: req.user?.id
    });
    
    const capabilities = await a2aTaskManager.getAgentCapabilities();
    
    res.json({
      agents: capabilities,
      count: capabilities.length
    });
    
  } catch (error) {
    unifiedLogger.error('Failed to list agents', {
      service: 'api',
      source: 'GET /api/agents',
      error: error.message,
      stack: error.stack
    });
    res.status(500).json({ error: 'Failed to list agents' });
  }
});

/**
 * GET /api/agents/:agentType/capabilities
 * Get specific agent capabilities
 */
router.get('/:agentType/capabilities', async (req, res) => {
  try {
    const { agentType } = req.params;
    
    unifiedLogger.info('Get agent capabilities request', {
      service: 'api',
      source: 'GET /api/agents/:agentType/capabilities',
      agentType,
      userId: req.user?.id
    });
    
    const capabilities = await a2aTaskManager.getAgentCapabilities();
    const agentCard = capabilities.find(cap => cap.agentType === agentType);
    
    if (!agentCard) {
      return res.status(404).json({ error: 'Agent not found' });
    }
    
    res.json(agentCard);
    
  } catch (error) {
    unifiedLogger.error('Failed to get agent capabilities', {
      service: 'api',
      source: 'GET /api/agents/:agentType/capabilities',
      error: error.message,
      stack: error.stack,
      agentType: req.params.agentType
    });
    res.status(500).json({ error: 'Failed to get agent capabilities' });
  }
});

/**
 * POST /api/agents/tasks
 * Create a new A2A task
 */
router.post('/tasks', async (req, res) => {
  try {
    const { workflowType, context, options } = req.body;
    
    // Add user context
    const taskContext = {
      ...context,
      userId: req.user.id,
      userEmail: req.user.email
    };
    
    unifiedLogger.info('Create task request', {
      service: 'api',
      source: 'POST /api/agents/tasks',
      workflowType,
      userId: req.user.id
    });
    
    const task = await a2aTaskManager.createTask(workflowType, taskContext, options);
    
    res.status(201).json({
      taskId: task.id,
      type: task.type,
      status: task.status,
      workflow: task.workflow,
      created: task.created
    });
    
  } catch (error) {
    unifiedLogger.error('Failed to create task', {
      service: 'api',
      source: 'POST /api/agents/tasks',
      error: error.message,
      stack: error.stack,
      workflowType: req.body.workflowType,
      userId: req.user?.id
    });
    res.status(500).json({ error: error.message || 'Failed to create task' });
  }
});

/**
 * GET /api/agents/tasks/:taskId
 * Get task status and details
 */
router.get('/tasks/:taskId', async (req, res) => {
  try {
    const { taskId } = req.params;
    
    unifiedLogger.debug('Get task request', {
      service: 'api',
      source: 'GET /api/agents/tasks/:taskId',
      taskId,
      userId: req.user?.id
    });
    
    const task = await a2aTaskManager.getTask(taskId);
    
    if (!task) {
      return res.status(404).json({ error: 'Task not found' });
    }
    
    // Check user authorization
    if (task.context.userId !== req.user.id && !req.user.isAdmin) {
      return res.status(403).json({ error: 'Access denied' });
    }
    
    res.json(task);
    
  } catch (error) {
    unifiedLogger.error('Failed to get task', {
      service: 'api',
      source: 'GET /api/agents/tasks/:taskId',
      error: error.message,
      stack: error.stack,
      taskId: req.params.taskId
    });
    res.status(500).json({ error: 'Failed to get task' });
  }
});

/**
 * GET /api/agents/tasks/:taskId/artifacts
 * Get task artifacts
 */
router.get('/tasks/:taskId/artifacts', async (req, res) => {
  try {
    const { taskId } = req.params;
    
    unifiedLogger.debug('Get task artifacts request', {
      service: 'api',
      source: 'GET /api/agents/tasks/:taskId/artifacts',
      taskId,
      userId: req.user?.id
    });
    
    const task = await a2aTaskManager.getTask(taskId);
    
    if (!task) {
      return res.status(404).json({ error: 'Task not found' });
    }
    
    // Check user authorization
    if (task.context.userId !== req.user.id && !req.user.isAdmin) {
      return res.status(403).json({ error: 'Access denied' });
    }
    
    res.json({
      taskId: task.id,
      artifacts: task.artifacts,
      count: task.artifacts.length
    });
    
  } catch (error) {
    unifiedLogger.error('Failed to get task artifacts', {
      service: 'api',
      source: 'GET /api/agents/tasks/:taskId/artifacts',
      error: error.message,
      stack: error.stack,
      taskId: req.params.taskId
    });
    res.status(500).json({ error: 'Failed to get task artifacts' });
  }
});

/**
 * GET /api/agents/tasks/:taskId/messages
 * Get task messages (progress updates)
 */
router.get('/tasks/:taskId/messages', async (req, res) => {
  try {
    const { taskId } = req.params;
    const { since } = req.query; // Optional: get messages since timestamp
    
    unifiedLogger.debug('Get task messages request', {
      service: 'api',
      source: 'GET /api/agents/tasks/:taskId/messages',
      taskId,
      since,
      userId: req.user?.id
    });
    
    const task = await a2aTaskManager.getTask(taskId);
    
    if (!task) {
      return res.status(404).json({ error: 'Task not found' });
    }
    
    // Check user authorization
    if (task.context.userId !== req.user.id && !req.user.isAdmin) {
      return res.status(403).json({ error: 'Access denied' });
    }
    
    let messages = task.messages;
    
    // Filter by timestamp if requested
    if (since) {
      const sinceDate = new Date(since);
      messages = messages.filter(msg => new Date(msg.timestamp) > sinceDate);
    }
    
    res.json({
      taskId: task.id,
      messages,
      count: messages.length
    });
    
  } catch (error) {
    unifiedLogger.error('Failed to get task messages', {
      service: 'api',
      source: 'GET /api/agents/tasks/:taskId/messages',
      error: error.message,
      stack: error.stack,
      taskId: req.params.taskId
    });
    res.status(500).json({ error: 'Failed to get task messages' });
  }
});

/**
 * GET /api/agents/tasks/:taskId/stream
 * Server-Sent Events stream for real-time task updates
 */
router.get('/tasks/:taskId/stream', async (req, res) => {
  const { taskId } = req.params;
  
  unifiedLogger.info('SSE stream request', {
    service: 'api',
    source: 'GET /api/agents/tasks/:taskId/stream',
    taskId,
    userId: req.user?.id
  });
  
  // Verify task exists and user has access
  const task = await a2aTaskManager.getTask(taskId);
  
  if (!task) {
    return res.status(404).json({ error: 'Task not found' });
  }
  
  if (task.context.userId !== req.user.id && !req.user.isAdmin) {
    return res.status(403).json({ error: 'Access denied' });
  }
  
  // Set up SSE headers
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive',
    'X-Accel-Buffering': 'no' // Disable Nginx buffering
  });
  
  // Send initial connection event
  res.write(`event: connected\ndata: ${JSON.stringify({ taskId, status: task.status })}\n\n`);
  
  // Listen for task updates
  const handleTaskUpdate = (update) => {
    if (update.taskId === taskId) {
      res.write(`event: ${update.type}\ndata: ${JSON.stringify(update)}\n\n`);
    }
  };
  
  // Subscribe to task events
  a2aTaskManager.on('task:progress', handleTaskUpdate);
  a2aTaskManager.on('task:completed', handleTaskUpdate);
  a2aTaskManager.on('task:failed', handleTaskUpdate);
  
  // Clean up on client disconnect
  req.on('close', () => {
    a2aTaskManager.removeListener('task:progress', handleTaskUpdate);
    a2aTaskManager.removeListener('task:completed', handleTaskUpdate);
    a2aTaskManager.removeListener('task:failed', handleTaskUpdate);
    
    unifiedLogger.info('SSE stream closed', {
      service: 'api',
      source: 'GET /api/agents/tasks/:taskId/stream',
      taskId,
      userId: req.user?.id
    });
  });
});

/**
 * GET /api/agents/stats
 * Get agent system statistics
 */
router.get('/stats', async (req, res) => {
  try {
    unifiedLogger.info('Get agent stats request', {
      service: 'api',
      source: 'GET /api/agents/stats',
      userId: req.user?.id
    });
    
    const taskStats = await a2aTaskManager.getTaskStats();
    const agentCapabilities = await a2aTaskManager.getAgentCapabilities();
    
    res.json({
      tasks: taskStats,
      agents: {
        registered: agentCapabilities.length,
        active: agentCapabilities.filter(a => a.status === 'active').length
      },
      workflows: Object.keys(a2aTaskManager.workflows)
    });
    
  } catch (error) {
    unifiedLogger.error('Failed to get agent stats', {
      service: 'api',
      source: 'GET /api/agents/stats',
      error: error.message,
      stack: error.stack
    });
    res.status(500).json({ error: 'Failed to get agent statistics' });
  }
});

export default router;