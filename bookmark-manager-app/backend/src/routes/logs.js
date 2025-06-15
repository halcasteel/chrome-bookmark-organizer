import express from 'express';
import unifiedLogger, { createFrontendLoggerEndpoint } from '../services/unifiedLogger.js';
import { authenticate, requireAdmin } from '../middleware/auth.js';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const router = express.Router();

// ============================================================================
// Frontend Logging Endpoint
// ============================================================================

// Receive logs from frontend
router.post('/frontend', authenticate, createFrontendLoggerEndpoint());

// Batch frontend logs
router.post('/frontend/batch', authenticate, (req, res) => {
  const { logs } = req.body;
  
  if (!Array.isArray(logs)) {
    return res.status(400).json({ error: 'Logs must be an array' });
  }
  
  logs.forEach(log => {
    unifiedLogger.logFrontendEvent(log.type, log.message, {
      ...log.context,
      userId: req.user?.id,
      batchReceived: new Date().toISOString()
    });
  });
  
  res.json({ success: true, processed: logs.length });
});

// ============================================================================
// Log Viewing Endpoints (Admin Only)
// ============================================================================

// Get recent logs
router.get('/recent', authenticate, requireAdmin, async (req, res) => {
  try {
    const { 
      lines = 100, 
      level = 'all',
      service = 'all',
      search = ''
    } = req.query;
    
    const logFile = path.join(__dirname, '../../../logs/unified.log');
    const content = await fs.readFile(logFile, 'utf8');
    const allLines = content.trim().split('\n');
    
    // Parse and filter logs
    let logs = allLines
      .slice(-Number(lines))
      .map(line => {
        try {
          return JSON.parse(line);
        } catch {
          return null;
        }
      })
      .filter(log => log !== null);
    
    // Apply filters
    if (level !== 'all') {
      logs = logs.filter(log => log.level === level);
    }
    
    if (service !== 'all') {
      logs = logs.filter(log => log.service === service);
    }
    
    if (search) {
      const searchLower = search.toLowerCase();
      logs = logs.filter(log => 
        JSON.stringify(log).toLowerCase().includes(searchLower)
      );
    }
    
    res.json({
      logs,
      total: logs.length,
      filters: { lines, level, service, search }
    });
  } catch (error) {
    unifiedLogger.error('Failed to read logs', error, {
      service: 'backend',
      source: 'logs-api'
    });
    res.status(500).json({ error: 'Failed to read logs' });
  }
});

// Get log statistics
router.get('/stats', authenticate, requireAdmin, async (req, res) => {
  try {
    const stats = {
      files: {},
      services: {},
      levels: {},
      recentErrors: []
    };
    
    // Get file stats
    const logDir = path.join(__dirname, '../../../logs');
    const files = await fs.readdir(logDir);
    
    for (const file of files) {
      if (file.endsWith('.log')) {
        const filePath = path.join(logDir, file);
        const stat = await fs.stat(filePath);
        stats.files[file] = {
          size: `${(stat.size / 1024 / 1024).toFixed(2)}MB`,
          modified: stat.mtime,
          lines: await countLines(filePath)
        };
      }
    }
    
    // Parse unified log for statistics
    const unifiedLog = path.join(logDir, 'unified.log');
    const content = await fs.readFile(unifiedLog, 'utf8');
    const logs = content.trim().split('\n')
      .map(line => {
        try {
          return JSON.parse(line);
        } catch {
          return null;
        }
      })
      .filter(Boolean);
    
    // Count by service and level
    logs.forEach(log => {
      stats.services[log.service] = (stats.services[log.service] || 0) + 1;
      stats.levels[log.level] = (stats.levels[log.level] || 0) + 1;
    });
    
    // Get recent errors
    stats.recentErrors = logs
      .filter(log => log.level === 'error')
      .slice(-10)
      .reverse();
    
    res.json(stats);
  } catch (error) {
    unifiedLogger.error('Failed to get log stats', error, {
      service: 'backend',
      source: 'logs-api'
    });
    res.status(500).json({ error: 'Failed to get log statistics' });
  }
});

// Download log file
router.get('/download/:filename', authenticate, requireAdmin, async (req, res) => {
  try {
    const { filename } = req.params;
    
    // Validate filename to prevent directory traversal
    if (!filename.match(/^[\w\-]+\.log$/)) {
      return res.status(400).json({ error: 'Invalid filename' });
    }
    
    const filePath = path.join(__dirname, '../../../logs', filename);
    
    // Check if file exists
    await fs.access(filePath);
    
    res.download(filePath, filename);
  } catch (error) {
    unifiedLogger.error('Failed to download log file', error, {
      service: 'backend',
      source: 'logs-api',
      filename: req.params.filename
    });
    res.status(404).json({ error: 'Log file not found' });
  }
});

// Clear logs (dangerous - admin only)
router.delete('/clear/:filename', authenticate, requireAdmin, async (req, res) => {
  try {
    const { filename } = req.params;
    
    // Only allow clearing non-unified logs
    if (filename === 'unified.log') {
      return res.status(403).json({ error: 'Cannot clear unified log' });
    }
    
    if (!filename.match(/^[\w\-]+\.log$/)) {
      return res.status(400).json({ error: 'Invalid filename' });
    }
    
    const filePath = path.join(__dirname, '../../../logs', filename);
    await fs.writeFile(filePath, '');
    
    unifiedLogger.warn('Log file cleared', {
      service: 'backend',
      source: 'logs-api',
      filename,
      clearedBy: req.user.email
    });
    
    res.json({ success: true });
  } catch (error) {
    unifiedLogger.error('Failed to clear log file', error, {
      service: 'backend',
      source: 'logs-api',
      filename: req.params.filename
    });
    res.status(500).json({ error: 'Failed to clear log file' });
  }
});

// ============================================================================
// Real-time Log Streaming
// ============================================================================

// SSE endpoint for real-time logs
router.get('/stream', authenticate, requireAdmin, (req, res) => {
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive'
  });
  
  const sendLog = (log) => {
    res.write(`data: ${JSON.stringify(log)}\n\n`);
  };
  
  // Send initial ping
  res.write(':ping\n\n');
  
  // Listen for new logs
  unifiedLogger.on('log', sendLog);
  
  // Clean up on disconnect
  req.on('close', () => {
    unifiedLogger.off('log', sendLog);
  });
});

// ============================================================================
// Helper Functions
// ============================================================================

async function countLines(filePath) {
  try {
    const content = await fs.readFile(filePath, 'utf8');
    return content.split('\n').length;
  } catch {
    return 0;
  }
}

export default router;