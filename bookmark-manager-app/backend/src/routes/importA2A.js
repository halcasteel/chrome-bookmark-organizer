import express from 'express';
import multer from 'multer';
import { promises as fs } from 'fs';
import path from 'path';
import os from 'os';
import { v4 as uuidv4 } from 'uuid';
import jwt from 'jsonwebtoken';
import a2aTaskManager from '../services/a2aTaskManager.js';
import unifiedLogger from '../services/unifiedLogger.js';
import db from '../db/index.js';

const router = express.Router();

// Configure multer for file uploads
const storage = multer.memoryStorage();
const upload = multer({
  storage,
  limits: {
    fileSize: 50 * 1024 * 1024, // 50MB limit for large bookmark files
  },
  fileFilter: (req, file, cb) => {
    // Accept HTML files
    if (file.mimetype === 'text/html' || 
        path.extname(file.originalname).toLowerCase() === '.html') {
      cb(null, true);
    } else {
      cb(new Error('Only HTML files are allowed'));
    }
  },
});

/**
 * POST /api/import/a2a/upload
 * Import bookmarks using A2A Task Manager
 */
router.post('/upload', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      unifiedLogger.warn('Import failed - no file uploaded', {
        service: 'api',
        source: 'POST /import/a2a/upload',
        userId: req.user?.id
      });
      return res.status(400).json({ error: 'No file uploaded' });
    }
    
    unifiedLogger.info('A2A bookmark import started', {
      service: 'api',
      source: 'POST /import/a2a/upload',
      userId: req.user.id,
      fileName: req.file.originalname,
      fileSize: req.file.size,
      fileSizeMB: (req.file.size / 1024 / 1024).toFixed(2)
    });
    
    // Save file temporarily
    const tempDir = os.tmpdir();
    const tempPath = path.join(tempDir, `import-${Date.now()}-${req.file.originalname}`);
    await fs.writeFile(tempPath, req.file.buffer);
    
    // Create import history record
    const importId = uuidv4();
    await db.query(
      `INSERT INTO import_history (id, user_id, filename, status, created_at)
       VALUES ($1, $2, $3, $4, NOW())`,
      [importId, req.user.id, req.file.originalname, 'pending']
    );
    
    // Create A2A task for quick_import workflow
    const task = await a2aTaskManager.createTask('quick_import', {
      filePath: tempPath,
      userId: req.user.id,
      importId: importId
    });
    
    unifiedLogger.info('A2A import task created', {
      service: 'api',
      source: 'POST /import/a2a/upload',
      userId: req.user.id,
      taskId: task.id,
      importId: importId,
      workflow: 'quick_import'
    });
    
    // Return task information
    res.json({
      message: 'Import task created',
      taskId: task.id,
      importId: importId,
      status: task.status,
      workflow: task.workflow
    });
    
  } catch (error) {
    unifiedLogger.error('Failed to create import task', {
      service: 'api',
      source: 'POST /import/a2a/upload',
      userId: req.user?.id,
      fileName: req.file?.originalname,
      error: error.message,
      stack: error.stack
    });
    res.status(500).json({ error: 'Failed to create import task' });
  }
});

/**
 * GET /api/import/a2a/task/:taskId
 * Get A2A task status
 */
router.get('/task/:taskId', async (req, res) => {
  try {
    const { taskId } = req.params;
    
    const task = await a2aTaskManager.getTask(taskId);
    
    if (!task) {
      return res.status(404).json({ error: 'Task not found' });
    }
    
    // Verify user owns this task
    if (task.context.userId !== req.user.id) {
      return res.status(403).json({ error: 'Access denied' });
    }
    
    res.json({
      id: task.id,
      type: task.type,
      status: task.status,
      progress: task.metadata?.progress || 0,
      currentAgent: task.workflow?.currentAgent,
      currentStep: task.workflow?.currentStep,
      totalSteps: task.workflow?.agents?.length || 1,
      artifacts: task.artifacts || [],
      error: task.metadata?.errorMessage,
      created: task.created,
      updated: task.updated,
      context: task.context
    });
    
  } catch (error) {
    unifiedLogger.error('Failed to get task status', {
      service: 'api',
      source: 'GET /import/a2a/task/:taskId',
      taskId: req.params.taskId,
      userId: req.user.id,
      error: error.message
    });
    res.status(500).json({ error: 'Failed to get task status' });
  }
});

/**
 * GET /api/import/a2a/task/:taskId/artifacts
 * Get task artifacts (results)
 */
router.get('/task/:taskId/artifacts', async (req, res) => {
  try {
    const { taskId } = req.params;
    
    const task = await a2aTaskManager.getTask(taskId);
    
    if (!task) {
      return res.status(404).json({ error: 'Task not found' });
    }
    
    // Verify user owns this task
    if (task.context.userId !== req.user.id) {
      return res.status(403).json({ error: 'Access denied' });
    }
    
    // Get artifacts from database
    const result = await db.query(
      `SELECT * FROM a2a_artifacts 
       WHERE task_id = $1 
       ORDER BY created`,
      [taskId]
    );
    
    const artifacts = result.rows.map(row => ({
      id: row.id,
      agentType: row.agent_type,
      type: row.type,
      data: row.data,
      created: row.created
    }));
    
    res.json({
      taskId,
      artifacts,
      count: artifacts.length
    });
    
  } catch (error) {
    unifiedLogger.error('Failed to get task artifacts', {
      service: 'api',
      source: 'GET /import/a2a/task/:taskId/artifacts',
      taskId: req.params.taskId,
      userId: req.user.id,
      error: error.message
    });
    res.status(500).json({ error: 'Failed to get task artifacts' });
  }
});

/**
 * GET /api/import/a2a/task/:taskId/messages
 * Get task messages (progress updates)
 */
router.get('/task/:taskId/messages', async (req, res) => {
  try {
    const { taskId } = req.params;
    const { since } = req.query;
    
    const task = await a2aTaskManager.getTask(taskId);
    
    if (!task) {
      return res.status(404).json({ error: 'Task not found' });
    }
    
    // Verify user owns this task
    if (task.context.userId !== req.user.id) {
      return res.status(403).json({ error: 'Access denied' });
    }
    
    // Build query
    let query = `SELECT * FROM a2a_messages WHERE task_id = $1`;
    const params = [taskId];
    
    if (since) {
      query += ` AND timestamp > $2`;
      params.push(since);
    }
    
    query += ` ORDER BY timestamp`;
    
    const result = await db.query(query, params);
    
    const messages = result.rows.map(row => ({
      id: row.id,
      agentType: row.agent_type,
      type: row.type,
      content: row.content,
      timestamp: row.timestamp,
      metadata: row.metadata
    }));
    
    res.json({
      taskId,
      messages,
      count: messages.length
    });
    
  } catch (error) {
    unifiedLogger.error('Failed to get task messages', {
      service: 'api',
      source: 'GET /import/a2a/task/:taskId/messages',
      taskId: req.params.taskId,
      userId: req.user.id,
      error: error.message
    });
    res.status(500).json({ error: 'Failed to get task messages' });
  }
});

/**
 * GET /api/import/a2a/task/:taskId/stream
 * Server-Sent Events endpoint for real-time updates
 */
router.get('/task/:taskId/stream', async (req, res) => {
  const { taskId } = req.params;
  
  try {
    // For SSE, we need to handle auth differently since EventSource doesn't support headers
    let userId;
    if (req.user) {
      userId = req.user.id;
    } else if (req.query.token) {
      // Verify token from query param
      try {
        const decoded = jwt.verify(req.query.token, process.env.JWT_SECRET);
        userId = decoded.id;
      } catch (error) {
        return res.status(401).json({ error: 'Invalid token' });
      }
    } else {
      return res.status(401).json({ error: 'Authentication required' });
    }
    
    const task = await a2aTaskManager.getTask(taskId);
    
    if (!task) {
      return res.status(404).json({ error: 'Task not found' });
    }
    
    // Verify user owns this task
    if (task.context.userId !== userId) {
      return res.status(403).json({ error: 'Access denied' });
    }
    
    // Set up SSE
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
      'X-Accel-Buffering': 'no' // Disable Nginx buffering
    });
    
    // Send initial status
    res.write(`data: ${JSON.stringify({
      type: 'status',
      task: {
        id: task.id,
        status: task.status,
        progress: task.metadata?.progress || 0
      }
    })}\n\n`);
    
    // Set up message listener
    const messageHandler = (message) => {
      if (message.taskId === taskId) {
        res.write(`data: ${JSON.stringify(message)}\n\n`);
      }
    };
    
    // Listen for task messages
    a2aTaskManager.on('task:message', messageHandler);
    
    // Set up task completion listener
    const completionHandler = (completedTask) => {
      if (completedTask.id === taskId) {
        res.write(`data: ${JSON.stringify({
          type: 'completed',
          task: completedTask
        })}\n\n`);
        cleanup();
      }
    };
    
    a2aTaskManager.on('task:completed', completionHandler);
    
    // Set up task failure listener
    const failureHandler = (failedTask) => {
      if (failedTask.id === taskId) {
        res.write(`data: ${JSON.stringify({
          type: 'failed',
          task: failedTask,
          error: failedTask.metadata?.errorMessage
        })}\n\n`);
        cleanup();
      }
    };
    
    a2aTaskManager.on('task:failed', failureHandler);
    
    // Clean up on client disconnect
    const cleanup = () => {
      a2aTaskManager.off('task:message', messageHandler);
      a2aTaskManager.off('task:completed', completionHandler);
      a2aTaskManager.off('task:failed', failureHandler);
    };
    
    req.on('close', cleanup);
    
  } catch (error) {
    unifiedLogger.error('Failed to set up task stream', {
      service: 'api',
      source: 'GET /import/a2a/task/:taskId/stream',
      taskId,
      userId: req.user.id,
      error: error.message
    });
    res.status(500).json({ error: 'Failed to set up task stream' });
  }
});

/**
 * POST /api/import/a2a/validate
 * Create validation task for existing bookmarks
 */
router.post('/validate', async (req, res) => {
  try {
    const { bookmarkIds } = req.body;
    
    if (!bookmarkIds || !Array.isArray(bookmarkIds) || bookmarkIds.length === 0) {
      return res.status(400).json({ error: 'bookmarkIds array is required' });
    }
    
    // Verify user owns these bookmarks
    const result = await db.query(
      `SELECT id FROM bookmarks 
       WHERE id = ANY($1) AND user_id = $2`,
      [bookmarkIds, req.user.id]
    );
    
    if (result.rows.length !== bookmarkIds.length) {
      return res.status(403).json({ error: 'Access denied to some bookmarks' });
    }
    
    // Create validation-only task
    const task = await a2aTaskManager.createTask('validation_only', {
      bookmarkIds: bookmarkIds,
      userId: req.user.id
    });
    
    unifiedLogger.info('A2A validation task created', {
      service: 'api',
      source: 'POST /import/a2a/validate',
      userId: req.user.id,
      taskId: task.id,
      bookmarkCount: bookmarkIds.length
    });
    
    res.json({
      message: 'Validation task created',
      taskId: task.id,
      status: task.status,
      bookmarkCount: bookmarkIds.length
    });
    
  } catch (error) {
    unifiedLogger.error('Failed to create validation task', {
      service: 'api',
      source: 'POST /import/a2a/validate',
      userId: req.user.id,
      error: error.message
    });
    res.status(500).json({ error: 'Failed to create validation task' });
  }
});

export default router;